/* eslint-disable no-console */
import { Buffer } from "node:buffer";

import { MissingApiKeyError, resolveVertexKey } from "./api-keys";
import { buildGenAIClient } from "./genai";

import type { GoogleGenAI } from "@google/genai";

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

function getClient(): GoogleGenAI {
  const apiKey = resolveVertexKey();
  if (!apiKey) {
    throw new MissingApiKeyError();
  }
  return buildGenAIClient(apiKey);
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

const FALLBACK_VOICES = ["Charon", "Orus", "Puck", "Fenrir", "Aoede", "Kore", "Enceladus"];

// Prebuilt Gemini voices are not accent-locked, so accent and cadence have to be
// steered with a natural-language instruction. Rather than hardcoding one line per
// known host, derive it from the template's own host description so any template
// the user adds gets an appropriate voice automatically.

/**
 * Voices that commonly read as masculine / feminine, used when a template does
 *  not pin an explicit ttsVoice.
 */
const MASC_VOICES = ["Charon", "Orus", "Puck", "Fenrir", "Enceladus", "Iapetus", "Algieba", "Rasalgethi", "Achird"];
const FEM_VOICES = ["Aoede", "Kore", "Leda", "Zephyr", "Callirrhoe", "Autonoe", "Despina", "Erinome", "Sulafat"];

const ACCENT_PATTERNS: Array<{ match: RegExp; accent: string }> = [
  { match: /\b(british|english|uk|london|england|welsh)\b/i, accent: "British English" },
  { match: /\b(irish|ireland|dublin)\b/i, accent: "Irish English" },
  { match: /\b(scottish|scotland|glasgow)\b/i, accent: "Scottish English" },
  { match: /\b(australian|australia|aussie)\b/i, accent: "Australian English" },
  { match: /\b(canadian|canada)\b/i, accent: "Canadian English" },
  { match: /\b(indian|india|mumbai|delhi)\b/i, accent: "Indian English" },
  { match: /\b(south african)\b/i, accent: "South African English" },
];

// Pronouns are the only reliable signal. Role nouns like "comedian", "host", or
// "journalist" are gender-neutral and previously mis-sexed hosts described with
// "she" simply because the noun appeared earlier in the sentence.
const FEMININE_PRONOUNS = /\b(?:she|her|hers)\b/i;
const MASCULINE_PRONOUNS = /\b(?:he|him|his)\b/i;
const FEMININE_NOUNS = /\b(?:woman|female|actress|comedienne|hostess)\b/i;
const MASCULINE_NOUNS = /\b(?:man|male|actor)\b/i;

function hostProfileText(host: TtsHost): string {
  if (typeof host === "string") {
    return host;
  }
  return [host.name, host.role, host.position, host.personality].filter(Boolean).join(" ");
}

/** Infers the perceived gender of a host from the template's description. */
export function inferHostGender(host: TtsHost): "feminine" | "masculine" | "unknown" {
  const text = hostProfileText(host);

  // Pronouns win outright when only one set is present.
  const femPro = FEMININE_PRONOUNS.test(text);
  const mascPro = MASCULINE_PRONOUNS.test(text);
  if (femPro !== mascPro) {
    return femPro ? "feminine" : "masculine";
  }

  // No pronouns (or genuinely mixed): fall back to explicitly gendered nouns.
  const femNoun = FEMININE_NOUNS.test(text);
  const mascNoun = MASCULINE_NOUNS.test(text);
  if (femNoun !== mascNoun) {
    return femNoun ? "feminine" : "masculine";
  }

  return "unknown";
}

/** Infers the host's accent from the template description; defaults to American. */
export function inferHostAccent(host: TtsHost): string {
  const text = hostProfileText(host);
  for (const { match, accent } of ACCENT_PATTERNS) {
    if (match.test(text)) {
      return accent;
    }
  }
  return "American English";
}

/**
 * Builds the delivery instruction for a host from the template's own description,
 * so accent and register follow whatever template the user picked.
 */
export function deliveryStyleForHost(host: TtsHost): string | undefined {
  const accent = inferHostAccent(host);
  const name = typeof host === "string" ? host : host.name ?? "";
  const personality = typeof host === "string" ? "" : (host.personality ?? "");

  // Compress the persona prose into a short delivery cue; the full personality
  // is already baked into the script itself.
  const cue = personality
    .split(/[.!?]/)
    .map(t => t.trim())
    .filter(t => t.length > 12)
    .slice(0, 2)
    .join(". ");

  const who = name ? `as ${name}` : "as the host";
  return cue ?
    `Read in a ${accent} accent, ${who}. Delivery notes: ${cue}` :
    `Read in a ${accent} accent, ${who}, with natural late-night comedic timing`;
}

export type TtsHost =
  | string |
  {
    name: string;
    ttsVoice?: string;
    voice?: string;
    role?: string;
    position?: string;
    personality?: string;
  };

export function voiceForHost(host: TtsHost | string, index = 0): string {
  if (typeof host === "string") {
    return VOICE_MAP[host] ?? FALLBACK_VOICES[index % FALLBACK_VOICES.length];
  }

  // Check explicit voice on host object first
  const explicitVoice = host.ttsVoice || host.voice;
  if (explicitVoice) {
    return explicitVoice;
  }

  const name = host.name ?? "";
  const known = VOICE_MAP[name];
  if (known) {
    return known;
  }

  // Unknown host (e.g. a user-added template): pick from the pool that matches
  // the perceived gender in the template description instead of a flat fallback.
  const gender = inferHostGender(host);
  if (gender === "feminine") {
    return FEM_VOICES[index % FEM_VOICES.length];
  }
  if (gender === "masculine") {
    return MASC_VOICES[index % MASC_VOICES.length];
  }
  return FALLBACK_VOICES[index % FALLBACK_VOICES.length];
}

/** Test seam: the resolver is internal, but its behaviour is worth asserting. */
export function voiceForHostPublic(host: TtsHost, index: number): string {
  return voiceForHost(host, index);
}

// ─────────────────────────────────────────────────────────────────────────────
// WAV encoding (24 kHz, 16-bit, mono)
// ─────────────────────────────────────────────────────────────────────────────

export function encodePcmToWav(pcm: Buffer): Buffer {
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

const LANGUAGE_NAMES: Record<string, string> = {
  de: "German",
  es: "Spanish",
  fr: "French",
  ja: "Japanese",
  pt: "Portuguese",
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
    contents: [{
      role: "user",
      parts: [{
        text: `Translate the following talk show transcript to ${langName}. Return ONLY the translated text, preserving the speaker labels and structure. Do not add any commentary or notes.\n\n${transcript}`,
      }],
    }],
    model: "gemini-3-flash-preview",
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
  const hostNames = hosts.map(h => (typeof h === "string" ? h : h.name));
  console.log("[tts] generateTts called, transcript length:", transcript.length, "hosts:", hostNames, "lang:", langName);

  // Only translate when actually changing language; en -> en is a wasted call
  // and an unnecessary failure point on the generation critical path.
  const needsTranslation = Boolean(targetLang) && langName !== "English";
  const textToSpeak = needsTranslation ?
      await translateTranscript(transcript, langName) :
    transcript;

  const client = getClient();

  const speechConfig = hosts.length > 1 ?
      {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: hosts.map((h, i) => ({
            speaker: typeof h === "string" ? h : h.name,
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceForHost(h, i) },
            },
          })),
        },
      } :
      {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voiceForHost(hosts[0] ?? "", 0) },
        },
      };

  // Steer accent/cadence per host. Only applies to single-host shows; multi-speaker
  // dialogue carries its own speaker labels and is left untouched.
  const style = hosts.length === 1 ? deliveryStyleForHost(hosts[0] ?? "") : undefined;
  const promptText = style ? `${style}.\n\n${textToSpeak}` : textToSpeak;

  console.log("[tts] Calling gemini-3.1-flash-tts-preview, lang:", langName, "style:", style ? "yes" : "none");

  const response = await client.models.generateContent({
    config: {
      responseModalities: ["AUDIO"],
      speechConfig,
    },
    contents: [{ role: "user", parts: [{ text: promptText }] }],
    model: "gemini-3.1-flash-tts-preview",
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

/**
 * Generates a short spoken voice clip for a host (e.g., chat reply or on-demand tangent)
 * and returns it as a base64 Data URI ('data:audio/wav;base64,...').
 */
export async function generateSingleVoiceClip(
  text: string,
  hostOrName: string | TtsHost = "John Oliver",
): Promise<string> {
  const host: TtsHost = typeof hostOrName === "string" ? { name: hostOrName } : hostOrName;
  const wavBuffer = await generateTts(text, [host]);
  return `data:audio/wav;base64,${wavBuffer.toString("base64")}`;
}
