import { Buffer } from "node:buffer";

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock env before importing tts
vi.mock("./env", () => ({
  env: {
    GEMINI_API_KEY: "test-tts-key",
    GOOGLE_GENERATIVE_AI_API_KEY: undefined,
  },
}));

// Mock @google/genai
const mockGenerateContent = vi.fn();

vi.mock("@google/genai", () => {
  class MockGoogleGenAI {
    models = {
      generateContent: mockGenerateContent,
    };
  }
  return {
    GoogleGenAI: MockGoogleGenAI,
  };
});

describe("tts", () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  describe("encodePcmToWav", () => {
    it("encodes PCM buffer into standard 44-byte RIFF/WAVE header", async () => {
      const { encodePcmToWav } = await import("./tts");

      const fakePcm = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
      const wav = encodePcmToWav(fakePcm);

      // Check total size
      expect(wav.length).toBe(44 + fakePcm.length);

      // Check RIFF header
      expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
      expect(wav.readUInt32LE(4)).toBe(fakePcm.length + 44 - 8);
      expect(wav.toString("ascii", 8, 12)).toBe("WAVE");

      // Check fmt subchunk
      expect(wav.toString("ascii", 12, 16)).toBe("fmt ");
      expect(wav.readUInt32LE(16)).toBe(16); // Subchunk1Size = 16 for PCM
      expect(wav.readUInt16LE(20)).toBe(1); // AudioFormat = 1 (PCM linear)
      expect(wav.readUInt16LE(22)).toBe(1); // NumChannels = 1 (Mono)
      expect(wav.readUInt32LE(24)).toBe(24000); // SampleRate = 24000 Hz
      expect(wav.readUInt32LE(28)).toBe(48000); // ByteRate = 24000 * 1 * (16/8) = 48000
      expect(wav.readUInt16LE(32)).toBe(2); // BlockAlign = 1 * (16/8) = 2
      expect(wav.readUInt16LE(34)).toBe(16); // BitsPerSample = 16

      // Check data subchunk
      expect(wav.toString("ascii", 36, 40)).toBe("data");
      expect(wav.readUInt32LE(40)).toBe(fakePcm.length);

      // Check audio payload
      expect(wav.subarray(44)).toEqual(fakePcm);
    });

    it("handles empty PCM buffer", async () => {
      const { encodePcmToWav } = await import("./tts");

      const emptyPcm = Buffer.alloc(0);
      const wav = encodePcmToWav(emptyPcm);

      expect(wav.length).toBe(44);
      expect(wav.readUInt32LE(4)).toBe(36);
      expect(wav.readUInt32LE(40)).toBe(0);
    });
  });

  describe("voiceForHost", () => {
    it("maps recognized host names to assigned voices", async () => {
      const { voiceForHost } = await import("./tts");

      expect(voiceForHost("John Oliver")).toBe("Charon");
      expect(voiceForHost("Seth Meyers")).toBe("Orus");
      expect(voiceForHost("Colin Jost")).toBe("Charon");
      expect(voiceForHost("Michael Che")).toBe("Puck");
    });

    it("cycles through fallback voices for unknown host strings", async () => {
      const { voiceForHost } = await import("./tts");

      const v0 = voiceForHost("Unknown Host A", 0);
      const v1 = voiceForHost("Unknown Host B", 1);
      const v2 = voiceForHost("Unknown Host C", 2);

      expect(v0).toBe("Charon");
      expect(v1).toBe("Orus");
      expect(v2).toBe("Puck");
    });

    it("prioritizes explicit ttsVoice on host object", async () => {
      const { voiceForHost } = await import("./tts");

      const hostA = { name: "John Oliver", ttsVoice: "Enceladus" };
      expect(voiceForHost(hostA)).toBe("Enceladus");

      const hostB = { name: "Custom Theorist", ttsVoice: "Fenrir" };
      expect(voiceForHost(hostB)).toBe("Fenrir");
    });

    it("supports voice alias property on host object", async () => {
      const { voiceForHost } = await import("./tts");

      const host = { name: "Custom Host", voice: "Aoede" };
      expect(voiceForHost(host)).toBe("Aoede");
    });

    it("falls back to name map or fallback voices for host object without explicit voice", async () => {
      const { voiceForHost } = await import("./tts");

      const hostMapped = { name: "Seth Meyers" };
      expect(voiceForHost(hostMapped)).toBe("Orus");

      const hostUnmapped = { name: "Special Guest" };
      expect(voiceForHost(hostUnmapped, 3)).toBe("Fenrir");
    });
  });

  describe("generateTts", () => {
    it("configures single speaker voiceConfig and returns WAV buffer", async () => {
      const fakePcmBase64 = Buffer.from([0x10, 0x20, 0x30, 0x40]).toString("base64");
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [{
          content: {
            parts: [{
              inlineData: {
                data: fakePcmBase64,
                mimeType: "audio/pcm",
              },
            }],
          },
        }],
      });

      const { generateTts } = await import("./tts");
      const wav = await generateTts("Hello audience! [laughs]", [{ name: "John Oliver" }]);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: "Charon" },
              },
            },
          }),
          contents: [{ parts: [{ text: "Hello audience! [laughs]" }] }],
          model: "gemini-3.1-flash-tts-preview",
        }),
      );

      expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
      expect(wav.readUInt32LE(24)).toBe(24000);
      expect(wav.subarray(44)).toEqual(Buffer.from([0x10, 0x20, 0x30, 0x40]));
    });

    it("configures multiSpeakerVoiceConfig for multiple hosts with natural acoustic tags", async () => {
      const fakePcmBase64 = Buffer.from([0xAA, 0xBB, 0xCC, 0xDD]).toString("base64");
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [{
          content: {
            parts: [{
              inlineData: {
                data: fakePcmBase64,
                mimeType: "audio/pcm",
              },
            }],
          },
        }],
      });

      const { generateTts } = await import("./tts");
      const hosts = [
        { name: "Colin Jost", ttsVoice: "Charon" },
        { name: "Michael Che", ttsVoice: "Puck" },
      ];
      const transcript = "Colin: Welcome to Weekend Update. [chuckles]\n\nMichael: Thanks Colin. [snickers]";

      const wav = await generateTts(transcript, hosts);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            responseModalities: ["AUDIO"],
            speechConfig: {
              multiSpeakerVoiceConfig: {
                speakerVoiceConfigs: [
                  { speaker: "Colin Jost", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } } },
                  { speaker: "Michael Che", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } },
                ],
              },
            },
          }),
          contents: [{ parts: [{ text: transcript }] }],
          model: "gemini-3.1-flash-tts-preview",
        }),
      );

      expect(wav.length).toBe(48);
    });

    it("supports string host list in multi-speaker dialogue", async () => {
      const fakePcmBase64 = Buffer.from([0x01, 0x02]).toString("base64");
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [{
          content: {
            parts: [{
              inlineData: {
                data: fakePcmBase64,
              },
            }],
          },
        }],
      });

      const { generateTts } = await import("./tts");
      const wav = await generateTts("Host1: Hey\nHost2: Hi", ["John Oliver", "Seth Meyers"]);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            speechConfig: {
              multiSpeakerVoiceConfig: {
                speakerVoiceConfigs: [
                  { speaker: "John Oliver", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } } },
                  { speaker: "Seth Meyers", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Orus" } } },
                ],
              },
            },
          }),
        }),
      );
      expect(wav.length).toBe(46);
    });

    it("translates transcript first when targetLang is provided", async () => {
      // 1. Translation call
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [{
          content: {
            parts: [{ text: "¡Hola a todos! [risas]" }],
          },
        }],
      });

      // 2. TTS call
      const fakePcmBase64 = Buffer.from([0x05, 0x06]).toString("base64");
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [{
          content: {
            parts: [{
              inlineData: {
                data: fakePcmBase64,
              },
            }],
          },
        }],
      });

      const { generateTts } = await import("./tts");
      const wav = await generateTts("Hello everyone! [laughs]", [{ name: "John Oliver" }], "es");

      // Verify translation call
      expect(mockGenerateContent).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          contents: [{ parts: [{ text: expect.stringContaining("Translate the following talk show transcript to Spanish") }] }],
          model: "gemini-3-flash-preview",
        }),
      );

      // Verify TTS call with translated text
      expect(mockGenerateContent).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          contents: [{ parts: [{ text: "¡Hola a todos! [risas]" }] }],
          model: "gemini-3.1-flash-tts-preview",
        }),
      );

      expect(wav.length).toBe(46);
    });

    it("throws when Gemini TTS returns no audio data", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [{
          finishReason: "SAFETY",
          content: { parts: [] },
        }],
      });

      const { generateTts } = await import("./tts");
      await expect(generateTts("test", [{ name: "John Oliver" }])).rejects.toThrow(
        "Gemini TTS returned no audio (finishReason: SAFETY)",
      );
    });

    it("throws when translation returns empty response", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [{
          content: { parts: [] },
        }],
      });

      const { generateTts } = await import("./tts");
      await expect(generateTts("test", [{ name: "John Oliver" }], "fr")).rejects.toThrow(
        "Translation to French returned no text",
      );
    });
  });

  describe("generateSingleVoiceClip", () => {
    it("generates a data URI containing the base64 WAV", async () => {
      const fakePcmBase64 = Buffer.from([0x12, 0x34, 0x56, 0x78]).toString("base64");
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [{
          content: {
            parts: [{
              inlineData: {
                data: fakePcmBase64,
              },
            }],
          },
        }],
      });

      const { generateSingleVoiceClip } = await import("./tts");
      const dataUri = await generateSingleVoiceClip("Quick tangent!", "Seth Meyers");

      expect(dataUri.startsWith("data:audio/wav;base64,")).toBe(true);
      const rawBase64 = dataUri.replace("data:audio/wav;base64,", "");
      const wav = Buffer.from(rawBase64, "base64");
      expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
      expect(wav.readUInt32LE(24)).toBe(24000);
    });

    it("accepts a TtsHost object", async () => {
      const fakePcmBase64 = Buffer.from([0x12, 0x34]).toString("base64");
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [{
          content: {
            parts: [{
              inlineData: {
                data: fakePcmBase64,
              },
            }],
          },
        }],
      });

      const { generateSingleVoiceClip } = await import("./tts");
      const dataUri = await generateSingleVoiceClip("Podcast tangent!", { name: "Custom Host", ttsVoice: "Aoede" });

      expect(dataUri.startsWith("data:audio/wav;base64,")).toBe(true);
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: "Aoede" },
              },
            },
          }),
        }),
      );
    });
  });
});
