import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { env } from "./env";

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

function getClient(): GoogleGenAI {
  const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY is required for video generation");
  }
  return new GoogleGenAI({ apiKey });
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiter — Veo 3 is capped at 2 RPM (paid tier 1)
// ─────────────────────────────────────────────────────────────────────────────

const VEO_RPM = 2;
const VEO_WINDOW_MS = 60_000;
const veoCallTimestamps: number[] = [];

async function waitForVeoSlot(): Promise<void> {
  const now = Date.now();
  // Purge timestamps older than the 60s window
  while (veoCallTimestamps.length > 0 && now - veoCallTimestamps[0] > VEO_WINDOW_MS) {
    veoCallTimestamps.shift();
  }

  if (veoCallTimestamps.length >= VEO_RPM) {
    const oldestInWindow = veoCallTimestamps[0];
    const waitMs = oldestInWindow + VEO_WINDOW_MS - now + 1_000; // +1s safety margin
    console.log(`[veo] Rate limit: ${veoCallTimestamps.length}/${VEO_RPM} RPM used, waiting ${(waitMs / 1000).toFixed(0)}s...`);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  veoCallTimestamps.push(Date.now());
}

// ─────────────────────────────────────────────────────────────────────────────
// Video Generation
// ─────────────────────────────────────────────────────────────────────────────

export interface VideoClipResult {
  videoUrl: string;
  localPath: string;
}

/**
 * Core video generation call — sends the request, polls, downloads.
 * Retries on 429 rate-limit errors with exponential backoff.
 */
async function callVeo(
  client: GoogleGenAI,
  prompt: string,
  maxRetries = 3,
): Promise<VideoClipResult> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callVeoOnce(client, prompt);
    } catch (err) {
      const is429 = err instanceof Error
        && (err.message.includes("429") || err.message.includes("RESOURCE_EXHAUSTED"));
      if (!is429 || attempt === maxRetries) throw err;

      const backoffMs = 60_000 * (attempt + 1);
      console.log(`[veo] Rate limited (429), retrying in ${backoffMs / 1000}s (attempt ${attempt + 1}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }

  throw new Error("Unreachable");
}

async function callVeoOnce(
  client: GoogleGenAI,
  prompt: string,
): Promise<VideoClipResult> {
  await waitForVeoSlot();
  console.log("[veo] Calling Veo 3.1 (veo-3.1-generate-preview)...");

  let operation = await client.models.generateVideos({
    model: "veo-3.1-generate-preview",
    prompt,
    config: {
      aspectRatio: "16:9",
      numberOfVideos: 1,
      durationSeconds: 8,
      resolution: "1080p",
    },
  });
  console.log("[veo] Veo 3.1 request sent successfully", label);

  let pollCount = 0;
  while (!operation.done) {
    pollCount++;
    console.log("[veo] Polling for completion... attempt", pollCount);
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await client.operations.getVideosOperation({ operation });
  }
  console.log("[veo] Generation complete after", pollCount, "polls");

  if (operation.error) {
    console.error("[veo] Generation error:", JSON.stringify(operation.error));
    throw new Error(`Video generation failed: ${JSON.stringify(operation.error)}`);
  }

  const generatedVideos = operation.response?.generatedVideos;
  if (!generatedVideos || generatedVideos.length === 0) {
    console.error("[veo] No videos in response:", JSON.stringify(operation.response ?? {}));
    throw new Error("Video generation completed but no videos returned");
  }

  const video = generatedVideos[0];
  const tmpDir = path.join(os.tmpdir(), "interdimensional-cable");
  fs.mkdirSync(tmpDir, { recursive: true });
  const fileName = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
  const localPath = path.join(tmpDir, fileName);

  console.log("[veo] Downloading video to:", localPath);
  await client.files.download({ file: video.video!, downloadPath: localPath });
  console.log("[veo] Download complete, size:", fs.statSync(localPath).size, "bytes");

  return { videoUrl: video.video?.uri ?? localPath, localPath };
}

/**
 * Generates a video clip using Google's Veo 3.1 model.
 * Produces 8-second 1080p clips with natively generated audio.
 */
export async function generateVideoClip(
  prompt: string,
): Promise<VideoClipResult> {
  console.log("[veo] generateVideoClip called, prompt length:", prompt.length);
  const client = getClient();
  return callVeo(client, prompt);
}

/**
 * Generate text using Gemini LLM for research and scripting.
 * When `useGoogleSearch` is true, enables Grounding with Google Search
 * so the model can fetch real-time information to improve accuracy.
 */
export async function generateText(
  prompt: string,
  systemInstruction?: string,
  useGoogleSearch = false,
): Promise<string> {
  console.log("[gemini] generateText called, prompt length:", prompt.length, "| googleSearch:", useGoogleSearch);
  const client = getClient();

  const response = await client.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
      temperature: 0.9,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      ...(useGoogleSearch ? { tools: [{ googleSearch: {} }] } : {}),
    },
  });

  const text = response.text;
  if (!text) {
    console.error("[gemini] Empty response, full response:", JSON.stringify(response));
    throw new Error("Gemini returned empty response");
  }

  if (useGoogleSearch) {
    const metadata = response.candidates?.[0]?.groundingMetadata;
    const searchCount = metadata?.webSearchQueries?.length ?? 0;
    console.log("[gemini] Google Search grounding used:", searchCount, "search queries");
    if (metadata?.webSearchQueries) {
      metadata.webSearchQueries.forEach((q: string, i: number) => console.log(`  [${i + 1}] "${q}"`));
    }
  }

  console.log("[gemini] Response received,", text.length, "chars");
  return text;
}
