import { GoogleGenAI } from "@google/genai";
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
  const client = getClient();

  // Generate video using Veo 3.1 at 1080p (requires 8s duration)
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
  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await client.operations.getVideosOperation({ operation });
  }

  // Check for errors
  if (operation.error) {
    throw new Error(`Video generation failed: ${JSON.stringify(operation.error)}`);
  }

  const generatedVideos = operation.response?.generatedVideos;
  if (!generatedVideos || generatedVideos.length === 0) {
    throw new Error("Video generation completed but no videos returned");
  }

  const video = generatedVideos[0];

  // Download using the SDK's files.download method
  const tmpDir = path.join(os.tmpdir(), "interdimensional-cable");
  fs.mkdirSync(tmpDir, { recursive: true });
  const fileName = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
  const localPath = path.join(tmpDir, fileName);

  await client.files.download({
    file: video.video!,
    downloadPath: localPath,
  });

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
  const client = getClient();

  const response = await client.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
      temperature: 0.9,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingLevel: "high" },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  return text;
}
