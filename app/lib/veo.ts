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

type ReferenceImage = {
  image: { imageBytes: string; mimeType: string };
  referenceType: "ASSET";
};

/**
 * Core video generation call — sends the request, polls, downloads.
 * Returns null with a reason string if the content was filtered,
 * so callers can decide whether to retry.
 */
async function callVeo(
  client: GoogleGenAI,
  prompt: string,
  referenceImages: ReferenceImage[],
): Promise<{ result: VideoClipResult } | { filtered: string }> {
  const label = referenceImages.length > 0 ? "(with reference image)" : "(no reference image)";
  console.log("[veo] Calling Veo 3.1 (veo-3.1-generate-preview)...", label);

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
    const responseStr = JSON.stringify(operation.response ?? {});
    const isCelebrityFilter = responseStr.includes("celebrity")
      || responseStr.includes("likenesses")
      || (operation.response as Record<string, unknown>)?.raiMediaFilteredCount;
    if (isCelebrityFilter) {
      const reasons = (operation.response as Record<string, unknown>)?.raiMediaFilteredReasons as string[] | undefined;
      const reason = reasons?.[0] ?? "Reference image blocked by content filter";
      console.warn("[veo] Content filter triggered:", reason);
      return { filtered: reason };
    }
    console.error("[veo] No videos in response:", responseStr);
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

  return { result: { videoUrl: video.video?.uri ?? localPath, localPath } };
}

/**
 * Generates a video clip using Google's Veo 3.1 model.
 * Produces 8-second 1080p clips with natively generated audio.
 * If a reference image is provided but blocked by the celebrity/content filter,
 * automatically retries without the reference image.
 */
export async function generateVideoClip(
  prompt: string,
  referenceImagePath?: string,
): Promise<VideoClipResult> {
  console.log("[veo] generateVideoClip called, prompt length:", prompt.length);
  const client = getClient();

  const referenceImages = referenceImagePath
    ? [loadReferenceImage(referenceImagePath)].filter(Boolean) as ReferenceImage[]
    : [];

  if (referenceImages.length > 0) {
    console.log("[veo] Reference image included in request:", referenceImagePath, "| mimeType:", referenceImages[0].image.mimeType, "| base64 length:", referenceImages[0].image.imageBytes.length);

    const attempt = await callVeo(client, prompt, referenceImages);
    if ("result" in attempt) return attempt.result;

    console.log("[veo] Retrying WITHOUT reference image due to filter:", attempt.filtered);
  } else {
    console.log("[veo] No reference image provided, generating without style guidance");
  }

  const attempt = await callVeo(client, prompt, []);
  if ("result" in attempt) return attempt.result;

  throw new Error(`Video generation filtered: ${attempt.filtered}`);
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
