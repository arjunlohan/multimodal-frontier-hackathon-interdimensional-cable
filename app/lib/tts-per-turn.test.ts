import { Buffer } from "node:buffer";

import { describe, expect, it, vi } from "vitest";

vi.mock("./env", () => ({ env: { GEMINI_API_KEY: "AQ.test", DATABASE_URL: "postgresql://localhost:5432/test" } }));
vi.mock("@/app/lib/env", () => ({ env: { GEMINI_API_KEY: "AQ.test", DATABASE_URL: "postgresql://localhost:5432/test" } }));

// One second of silence per call, so durations are trivially checkable.
const SECONDS = 1;
const calls: Array<{ text: string; voice: string }> = [];
vi.mock("@google/genai", () => {
  class MockGoogleGenAI {
    models = {
      generateContent: (req: any) => {
        const voice = req.config.speechConfig.voiceConfig?.prebuiltVoiceConfig?.voiceName ??
          req.config.speechConfig.multiSpeakerVoiceConfig?.speakerVoiceConfigs?.[0]?.voiceConfig?.prebuiltVoiceConfig?.voiceName;
        calls.push({ text: req.contents[0].parts[0].text, voice });
        return Promise.resolve({ candidates: [{ content: { parts: [{
          inlineData: { data: Buffer.alloc(24000 * 2 * SECONDS).toString("base64") },
        }] } }] });
      },
    };
  }
  return { GoogleGenAI: MockGoogleGenAI, ThinkingLevel: {} };
});

const { generateTtsPerTurn } = await import("./tts");

describe("per-turn synthesis for panels wider than two speakers", () => {
  const HOSTS = [
    { name: "Chamath Capitalia", ttsVoice: "Charon" },
    { name: "Jason Calamaris", ttsVoice: "Puck" },
    { name: "David Stacks", ttsVoice: "Orus" },
    { name: "David Friedegg", ttsVoice: "Fenrir" },
  ];
  const TURNS = [
    { speaker: "Chamath Capitalia", text: "Structurally inevitable." },
    { speaker: "Jason Calamaris", text: "Can I finish?" },
    { speaker: "David Stacks", text: "That is not what the data says." },
    { speaker: "David Friedegg", text: "Zoom out for a second." },
    { speaker: "Chamath Capitalia", text: "As I said two years ago." },
  ];

  it("uses each speaker's own voice, never a shared one", async () => {
    calls.length = 0;
    await generateTtsPerTurn(TURNS, HOSTS);
    expect(calls).toHaveLength(5);
    expect(calls.map(c => c.voice)).toEqual(["Charon", "Puck", "Orus", "Fenrir", "Charon"]);
  });

  it("returns one measured duration per turn", async () => {
    calls.length = 0;
    const { durations } = await generateTtsPerTurn(TURNS, HOSTS);
    expect(durations).toHaveLength(TURNS.length);
    durations.forEach(d => expect(d).toBeCloseTo(SECONDS, 3));
  });

  it("concatenates into one WAV of the summed length", async () => {
    calls.length = 0;
    const { wav, durations } = await generateTtsPerTurn(TURNS, HOSTS);
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    const total = durations.reduce((a, b) => a + b, 0);
    // 44-byte header + PCM at 48000 bytes/sec
    expect(wav.length).toBe(44 + Math.round(total * 24000 * 2));
  });

  it("falls back to the first host when a turn names an unknown speaker", async () => {
    calls.length = 0;
    await generateTtsPerTurn([{ speaker: "Nobody", text: "Hello." }], HOSTS);
    expect(calls[0].voice).toBe("Charon");
  });
});
