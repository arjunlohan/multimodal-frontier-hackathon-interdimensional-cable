/* eslint-disable no-console */
import { GoogleGenAI } from "@google/genai";

import { env } from "./env";

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

function getClient(): GoogleGenAI {
  const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY is required for TTS");
  }
  return new GoogleGenAI({ apiKey });
}

// ─────────────────────────────────────────────────────────────────────────────
// Voice mapping
// ─────────────────────────────────────────────────────────────────────────────

const VOICE_MAP: Record<string, string> = {
  "John Oliver": "Charon",
  "Seth Meyers": "Orus",
  "Colin Jost": "Charon",
  "Michael Che": "Puck",
};

const FALLBACK_VOICES = ["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Enceladus"];

function voiceForHost(name: string, index: number): string {
  return VOICE_MAP[name] ?? FALLBACK_VOICES[index % FALLBACK_VOICES.length];
}

// ─────────────────────────────────────────────────────────────────────────────
// WAV encoding (24 kHz, 16-bit, mono)
// ─────────────────────────────────────────────────────────────────────────────

function encodePcmToWav(pcm: Buffer): Buffer {
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcm.length;
  const headerSize = 44;

  const header = Buffer.alloc(headerSize);
  header.write("RIFF", 0);
  header.writeUInt32LE(dataSize + headerSize - 8, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

// ─────────────────────────────────────────────────────────────────────────────
// TTS generation
// ─────────────────────────────────────────────────────────────────────────────

export interface TtsHost {
  name: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  ja: "Japanese",
};

/**
 * Translate text to a target language using Gemini Flash.
 * Returns the translated text only, no commentary.
 */
async function translateTranscript(
  transcript: string,
  langName: string,
): Promise<string> {
  const client = getClient();
  console.log("[tts] Translating transcript to", langName);

  const response = await client.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{
      parts: [{
        text: `Translate the following talk show transcript to ${langName}. Return ONLY the translated text, preserving the speaker labels and structure. Do not add any commentary or notes.\n\n${transcript}`,
      }],
    }],
  });

  const translated = response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!translated) {
    throw new Error(`Translation to ${langName} returned no text`);
  }

  console.log("[tts] Translation complete, length:", translated.length);
  return translated;
}

/**
 * Generate speech audio from a transcript using Gemini TTS.
 * When targetLang is provided, translates the transcript first, then speaks it.
 * Returns a WAV buffer (24 kHz, 16-bit, mono).
 */
export async function generateTts(
  transcript: string,
  hosts: TtsHost[],
  targetLang?: string,
): Promise<Buffer> {
  const langName = targetLang ? (LANGUAGE_NAMES[targetLang] ?? targetLang) : "English";
  console.log("[tts] generateTts called, transcript length:", transcript.length, "hosts:", hosts.map(h => h.name), "lang:", langName);

  const textToSpeak = targetLang
    ? await translateTranscript(transcript, langName)
    : transcript;

  const client = getClient();

  const speechConfig = hosts.length > 1
    ? {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: hosts.map((h, i) => ({
            speaker: h.name,
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceForHost(h.name, i) },
            },
          })),
        },
      }
    : {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voiceForHost(hosts[0]?.name ?? "", 0) },
        },
      };

  console.log("[tts] Calling gemini-2.5-flash-preview-tts, lang:", langName);

  const response = await client.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: textToSpeak }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig,
    },
  });

  const pcmBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!pcmBase64) {
    const reason = response.candidates?.[0]?.finishReason;
    console.error("[tts] No audio data. finishReason:", reason);
    throw new Error(`Gemini TTS returned no audio (finishReason: ${reason})`);
  }

  const pcm = Buffer.from(pcmBase64, "base64");
  console.log("[tts] PCM received:", pcm.length, "bytes — encoding to WAV");

  const wav = encodePcmToWav(pcm);
  console.log("[tts] WAV encoded:", wav.length, "bytes");

  return wav;
}
