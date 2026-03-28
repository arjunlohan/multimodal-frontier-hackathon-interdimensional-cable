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
// Video Generation
// ─────────────────────────────────────────────────────────────────────────────

export interface VideoClipResult {
  videoUrl: string;
  localPath: string;
}

/**
 * Generates a video clip using Google's Veo 3.1 model.
 * Produces 8-second 1080p clips with natively generated audio.
 */
export async function generateVideoClip(
  prompt: string,
  _referenceImageUrl?: string,
): Promise<VideoClipResult> {
  console.log("[veo] generateVideoClip called, prompt length:", prompt.length);
  const client = getClient();

  // Generate video using Veo 3.1 at 1080p (requires 8s duration)
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

  // Poll for completion
  let pollCount = 0;
  while (!operation.done) {
    pollCount++;
    console.log("[veo] Polling for completion... attempt", pollCount);
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await client.operations.getVideosOperation({ operation });
  }
  console.log("[veo] Generation complete after", pollCount, "polls");

  // Check for errors
  if (operation.error) {
    console.error("[veo] Generation error:", JSON.stringify(operation.error));
    throw new Error(`Video generation failed: ${JSON.stringify(operation.error)}`);
  }

  const generatedVideos = operation.response?.generatedVideos;
  if (!generatedVideos || generatedVideos.length === 0) {
    console.error("[veo] No videos in response:", JSON.stringify(operation.response));
    throw new Error("Video generation completed but no videos returned");
  }

  const video = generatedVideos[0];

  // Download using the SDK's files.download method
  const tmpDir = path.join(os.tmpdir(), "interdimensional-cable");
  fs.mkdirSync(tmpDir, { recursive: true });
  const fileName = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
  const localPath = path.join(tmpDir, fileName);

  console.log("[veo] Downloading video to:", localPath);
  await client.files.download({
    file: video.video!,
    downloadPath: localPath,
  });
  console.log("[veo] Download complete, size:", fs.statSync(localPath).size, "bytes");

  return {
    videoUrl: video.video?.uri ?? localPath,
    localPath,
  };
}

/**
 * Generate text using Gemini LLM for research and scripting.
 */
export async function generateText(
  prompt: string,
  systemInstruction?: string,
): Promise<string> {
  console.log("[gemini] generateText called, prompt length:", prompt.length);
  const client = getClient();

  const response = await client.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
      temperature: 0.9,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
    },
  });

  const text = response.text;
  if (!text) {
    console.error("[gemini] Empty response, full response:", JSON.stringify(response));
    throw new Error("Gemini returned empty response");
  }
  console.log("[gemini] Response received,", text.length, "chars");

  return text;
}
