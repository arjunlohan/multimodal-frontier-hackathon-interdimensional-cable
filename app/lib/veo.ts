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
 * Loads a reference image from the public directory and returns
 * it as a Veo 3.1 reference image config entry.
 */
function loadReferenceImage(imagePath: string): {
  image: { imageBytes: string; mimeType: string };
  referenceType: "ASSET";
} | null {
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
  const absPath = path.join(process.cwd(), "public", imagePath);

  if (!fs.existsSync(absPath)) {
    console.warn("[veo] Reference image not found:", absPath);
    return null;
  }

  const imageBytes = fs.readFileSync(absPath).toString("base64");
  console.log("[veo] Loaded reference image:", absPath, `(${(imageBytes.length * 0.75 / 1024).toFixed(0)} KB)`);
  return { image: { imageBytes, mimeType }, referenceType: "ASSET" };
}

/**
 * Generates a video clip using Google's Veo 3.1 model.
 * Produces 8-second 1080p clips with natively generated audio.
 * Optionally uses a reference image to guide the visual style.
 */
export async function generateVideoClip(
  prompt: string,
  referenceImagePath?: string,
): Promise<VideoClipResult> {
  console.log("[veo] generateVideoClip called, prompt length:", prompt.length);
  const client = getClient();

  const referenceImages = referenceImagePath
    ? [loadReferenceImage(referenceImagePath)].filter(Boolean) as Array<{
        image: { imageBytes: string; mimeType: string };
        referenceType: "ASSET";
      }>
    : [];

  if (referenceImages.length > 0) {
    console.log("[veo] Reference image included in request:", referenceImagePath, "| mimeType:", referenceImages[0].image.mimeType, "| base64 length:", referenceImages[0].image.imageBytes.length);
  } else {
    console.log("[veo] No reference image provided, generating without style guidance");
  }

  console.log("[veo] Calling Veo 3.1 (veo-3.1-generate-preview)...");
  let operation = await client.models.generateVideos({
    model: "veo-3.1-generate-preview",
    prompt,
    config: {
      aspectRatio: "16:9",
      numberOfVideos: 1,
      durationSeconds: 8,
      resolution: "1080p",
      ...(referenceImages.length > 0 ? { referenceImages } : {}),
    },
  });
  console.log("[veo] Veo 3.1 request sent successfully", referenceImages.length > 0 ? "(with reference image)" : "(no reference image)");

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
