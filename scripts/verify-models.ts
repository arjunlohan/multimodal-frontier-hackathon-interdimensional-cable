/* eslint-disable no-console */
import { Buffer } from "node:buffer";
import { GoogleGenAI } from "@google/genai";
import { env } from "../app/lib/env";
import { buildGenAIClient } from "../app/lib/genai";

const ai = buildGenAIClient(env.GEMINI_API_KEY!);

const TEXT_MODELS = [
  ["gemini-flash-latest", "Flash (alias)"],
  ["gemini-3.5-flash", "Gemini 3.5 Flash"],
  ["gemini-3.7-flash", "Gemini 3.7 Flash  <- GEMINI_TEXT_MODEL"],
  ["gemini-3-flash-preview", "Gemini 3 Flash preview <- tts.ts:119"],
];

async function main() {
  console.log("=== TEXT MODELS (live generateContent) ===");
  for (const [id, label] of TEXT_MODELS) {
    const t = Date.now();
    try {
      const r = await ai.models.generateContent({
        model: id,
        contents: "Reply with exactly: OK",
      });
      console.log(`  PASS  ${id.padEnd(24)} ${Date.now() - t}ms  "${(r.text ?? "").trim().slice(0, 20)}"  (${label})`);
    } catch (e: any) {
      console.log(`  FAIL  ${id.padEnd(24)} ${String(e.message).slice(0, 120)}`);
    }
  }

  console.log("\n=== TTS MODEL (live audio synthesis) ===");
  const t2 = Date.now();
  try {
    const r = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: "Say cheerfully: Interdimensional Cable audio check complete.",
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } } },
      },
    } as any);
    const b64 = r.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!b64) throw new Error("no audio returned");
    const pcm = Buffer.from(b64, "base64");
    console.log(`  PASS  gemini-3.1-flash-tts-preview  ${Date.now() - t2}ms  ${pcm.length} bytes PCM (~${(pcm.length / 48000).toFixed(2)}s @24kHz)`);
  } catch (e: any) {
    console.log(`  FAIL  gemini-3.1-flash-tts-preview  ${String(e.message).slice(0, 200)}`);
  }

  console.log("\n=== OMNI 1.1 (metadata only - NOT generating, video costs money) ===");
  try {
    const m: any = await ai.models.get({ model: "gemini-omni-1.1-flash" });
    console.log(`  PASS  gemini-omni-1.1-flash  reachable`);
    console.log(`        methods: ${JSON.stringify(m.supportedGenerationMethods ?? m.supportedActions)}`);
  } catch (e: any) {
    console.log(`  FAIL  gemini-omni-1.1-flash  ${String(e.message).slice(0, 200)}`);
  }
}
main();
