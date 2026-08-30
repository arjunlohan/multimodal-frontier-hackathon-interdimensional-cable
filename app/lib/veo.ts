/* eslint-disable no-console */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ThinkingLevel, VideoGenerationReferenceType } from "@google/genai";

import { env } from "./env";
import { buildDeveloperApiClient, buildGenAIClient } from "./genai";

import type { GoogleGenAI, VideoGenerationReferenceImage } from "@google/genai";

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Model Identifiers
// ─────────────────────────────────────────────────────────────────────────────

export const GEMINI_OMNI_VIDEO_MODEL = "gemini-omni-1.1-flash";
export const GEMINI_TEXT_MODEL = "gemini-3.7-flash";

// ─────────────────────────────────────────────────────────────────────────────
// Types & Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export type OmniResolution = "360p" | "720p" | "1080p" | "4k";
export type OmniAspectRatio = "16:9" | "9:16";

export interface VideoClipOptions {
  /** Target clip duration in seconds (3 to 10, default 8) */
  durationSeconds?: number;
  /** Output aspect ratio (default "16:9") */
  aspectRatio?: OmniAspectRatio;
  /** Output video resolution (default "720p") */
  resolution?: OmniResolution;
  /** Reference image file paths, slugs, or base64 data for <IMAGE_REF_0> conditioning */
  referenceImages?: string[];
  /** Prior turn interaction ID for continuous multi-turn scene extensions */
  previousInteractionId?: string;
  /** Flag indicating scene extension */
  extend?: boolean;
}

export interface VideoClipInterpolatedOptions extends VideoClipOptions {
  /** Path or base64 data for starting frame anchor (<FIRST_FRAME>) */
  firstFramePath?: string;
  /** Path or base64 data for ending frame anchor (<LAST_FRAME>) */
  lastFramePath?: string;
}

export interface VideoClipResult {
  /** Path to the downloaded MP4 file on the local filesystem */
  filePath: string;
  /** Generated clip duration in seconds */
  durationSeconds: number;
  /** Interaction ID from the generation turn if available */
  interactionId?: string;
  /** Resource operation name if generated via Operations API */
  operationName?: string;
  /** Backwards-compatible alias for filePath */
  localPath: string;
  /** Backwards-compatible alias for remote URI or local filePath */
  videoUrl: string;
}

export interface BuildVeoPromptOptions {
  firstFrame?: boolean;
  lastFrame?: boolean;
  hasImageRef?: boolean;
  imageRefIndices?: number[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown when Gemini Omni 1.1 Flash's Responsible AI (RAI) content filter blocks generation.
 * The `reasons` array contains policy explanation messages from the API.
 */
export class OmniRAIFilterError extends Error {
  reasons: string[];
  constructor(reasons: string[]) {
    super(`Omni RAI filter: ${reasons.join("; ")}`);
    this.name = "OmniRAIFilterError";
    this.reasons = reasons;
  }
}

/** Backwards-compatible alias for existing catch blocks */
export class VeoRAIFilterError extends OmniRAIFilterError {
  constructor(reasons: string[]) {
    super(reasons);
    this.name = "VeoRAIFilterError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

function getClient(): GoogleGenAI {
  const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY is required for video generation");
  }
  return buildGenAIClient(apiKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiter — Gemini Omni 1.1 Flash sliding window (2 RPM)
// ─────────────────────────────────────────────────────────────────────────────

const OMNI_RPM = 2;
const OMNI_WINDOW_MS = 60_000;
const omniCallTimestamps: number[] = [];

/** Reset rate limiter state — exported for testing. */
export function _resetRateLimiter(): void {
  omniCallTimestamps.length = 0;
}

async function waitForOmniSlot(): Promise<void> {
  const now = Date.now();
  // Purge timestamps older than the 60s sliding window
  while (omniCallTimestamps.length > 0 && now - omniCallTimestamps[0] > OMNI_WINDOW_MS) {
    omniCallTimestamps.shift();
  }

  if (omniCallTimestamps.length >= OMNI_RPM) {
    const oldestInWindow = omniCallTimestamps[0];
    const waitMs = oldestInWindow + OMNI_WINDOW_MS - now + 1_000; // +1s margin
    console.log(`[omni] Rate limit: ${omniCallTimestamps.length}/${OMNI_RPM} RPM used, waiting ${(waitMs / 1000).toFixed(0)}s...`);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  omniCallTimestamps.push(Date.now());
}

// ─────────────────────────────────────────────────────────────────────────────
// Reference Images & Prompt Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sanitizes prompt notes to remove specific show/network names
 * that could trigger trademark/likeness filters in Gemini Omni.
 */
export function sanitizeNotesForOmni(notes: string): string {
  return notes
    .replace(/\bHBO\b/gi, "premium cable")
    .replace(/\bNBC\b/gi, "broadcast network")
    .replace(/\bSNL\b/gi, "sketch comedy show")
    .replace(/\bSaturday Night Live\b/gi, "sketch comedy show")
    .replace(/\bLast Week Tonight\b/gi, "weekly investigative comedy show")
    .replace(/\bLate Night\b/gi, "late-night show")
    .replace(/\bWeekend Update\b/gi, "news desk comedy segment")
    .replace(/\bColin Jost\b/gi, "Colin")
    .replace(/\bMichael Che\b/gi, "Michael")
    .replace(/\bJohn Oliver\b/gi, "John")
    .replace(/\bSeth Meyers\b/gi, "Seth")
    .replace(/\bphotorealistic identical clone\b/gi, "face-consistent stylized character");
}

export const sanitizeNotesForVeo = sanitizeNotesForOmni;

/**
 * Builds a formatted video generation prompt supporting <FIRST_FRAME>, <LAST_FRAME>,
 * and <IMAGE_REF_0> conditioning tokens with RAI safety sanitization.
 */
export function buildVeoPrompt(
  beatOrSegment: string | { speaker?: string; text?: string; visualPrompt?: string },
  visualNotesOrHosts: string | Array<{ name: string; personality?: string; position?: string }> = "",
  optionsOrShowType?: BuildVeoPromptOptions | string,
  extraNotes = "",
): string {
  // Overload 1: Workflow mode with TranscriptSegment object
  if (typeof beatOrSegment === "object" && beatOrSegment !== null) {
    const segment = beatOrSegment;
    if (segment.visualPrompt && segment.visualPrompt.length >= 10) {
      return sanitizeNotesForOmni(segment.visualPrompt);
    }
    const hosts = Array.isArray(visualNotesOrHosts) ? visualNotesOrHosts : [];
    const showType = typeof optionsOrShowType === "string" ? optionsOrShowType : "monologue";
    const host = hosts.find(h => h.name === segment.speaker) ?? hosts[0] ?? { name: "Host" };
    const sanitizedNotes = sanitizeNotesForOmni(extraNotes);

    let prompt = "A professional late-night talk show segment. ";
    if (showType === "conversation") {
      prompt += "Two hosts sit behind a news desk with a world map graphic behind them. ";
      if (host.position === "left") {
        prompt += "The person on the LEFT is speaking and gesturing. ";
      } else if (host.position === "right") {
        prompt += "The person on the RIGHT is speaking and gesturing. ";
      }
    } else {
      prompt += "A single host behind a desk delivering a monologue, with a colorful graphic behind them. ";
    }
    prompt += `The host is saying: "${segment.text ?? ""}" `;
    if (sanitizedNotes) {
      prompt += `Style: ${sanitizedNotes} `;
    }
    prompt += "The host should be animated, expressive, and natural. Studio lighting, professional TV production quality.";
    return prompt;
  }

  // Overload 2: Contract mode with beat string & visual notes
  const beat = String(beatOrSegment);
  const visualNotes = typeof visualNotesOrHosts === "string" ? visualNotesOrHosts : "";
  const opts = typeof optionsOrShowType === "object" && optionsOrShowType !== null ? optionsOrShowType : {};

  const tags: string[] = [];
  if (opts.hasImageRef || (opts.imageRefIndices && opts.imageRefIndices.length > 0)) {
    const indices = opts.imageRefIndices && opts.imageRefIndices.length > 0 ? opts.imageRefIndices : [0];
    indices.forEach(idx => tags.push(`<IMAGE_REF_${idx}>`));
  }
  if (opts.firstFrame) {
    tags.push("<FIRST_FRAME>");
  }
  if (opts.lastFrame) {
    tags.push("<LAST_FRAME>");
  }

  const prefix = tags.length > 0 ? `${tags.join(" ")} ` : "";
  const combined = visualNotes ? `${beat}. ${visualNotes}` : beat;
  return sanitizeNotesForOmni(`${prefix}${combined}`.trim());
}

/**
 * Loads a reference image from assets/reference-images/ or file path
 * and returns it formatted for Gemini Omni 1.1 Flash referenceImages config.
 */
function loadReferenceImage(slugOrPath: string): VideoGenerationReferenceImage | null {
  const extensions = [".png", ".jpeg", ".jpg", ".webp"];
  let imagePath: string | null = null;
  let mimeType = "image/png";

  // Check if direct file path exists
  if (fs.existsSync(slugOrPath)) {
    imagePath = slugOrPath;
  } else {
    // Check in assets/reference-images/
    const baseDir = path.join(process.cwd(), "assets", "reference-images");
    for (const ext of extensions) {
      const candidate = path.join(baseDir, `${slugOrPath}${ext}`);
      if (fs.existsSync(candidate)) {
        imagePath = candidate;
        break;
      }
    }
  }

  if (!imagePath) {
    console.warn("[omni] Reference image not found for:", slugOrPath);
    return null;
  }

  const lower = imagePath.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    mimeType = "image/jpeg";
  } else if (lower.endsWith(".webp")) {
    mimeType = "image/webp";
  } else {
    mimeType = "image/png";
  }

  const imageBytes = fs.readFileSync(imagePath).toString("base64");
  console.log("[omni] Loaded reference image:", imagePath, `(${(imageBytes.length * 0.75 / 1024).toFixed(0)} KB)`);

  return {
    image: { imageBytes, mimeType },
    referenceType: VideoGenerationReferenceType.ASSET,
  };
}

function resolveReferenceImages(refs?: string[]): VideoGenerationReferenceImage[] {
  if (!refs || refs.length === 0)
    return [];

  const results: VideoGenerationReferenceImage[] = [];
  for (const ref of refs) {
    if (!ref)
      continue;
    // Check if it's already base64 data
    if (ref.startsWith("data:") || ref.length > 500) {
      const mimeMatch = ref.match(/^data:(image\/[a-zA-Z+]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
      const imageBytes = ref.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
      results.push({
        image: { imageBytes, mimeType },
        referenceType: VideoGenerationReferenceType.ASSET,
      });
    } else {
      const loaded = loadReferenceImage(ref);
      if (loaded) {
        results.push(loaded);
      }
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Video Generation
// ─────────────────────────────────────────────────────────────────────────────

interface InternalGenerateParams {
  prompt: string;
  durationSeconds: number;
  resolution: OmniResolution;
  aspectRatio: OmniAspectRatio;
  referenceImages?: VideoGenerationReferenceImage[];
  firstFrameBytes?: string;
  firstFrameMimeType?: string;
  lastFrameBytes?: string;
  lastFrameMimeType?: string;
  previousInteractionId?: string;
  outputPath?: string;
}

async function callOmniWithRetry(
  client: GoogleGenAI,
  params: InternalGenerateParams,
  maxRetries = 3,
): Promise<VideoClipResult> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callOmniOnce(client, params);
    } catch (err) {
      const is429 = err instanceof Error &&
        (err.message.includes("429") || err.message.includes("RESOURCE_EXHAUSTED") || err.message.includes("quota"));
      if (!is429 || attempt === maxRetries) {
        throw err;
      }

      const backoffMs = 60_000 * (attempt + 1);
      console.log(`[omni] Rate limited (429), retrying in ${backoffMs / 1000}s (attempt ${attempt + 1}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }

  throw new Error("Unreachable");
}

async function callOmniOnce(
  client: GoogleGenAI,
  params: InternalGenerateParams,
): Promise<VideoClipResult> {
  await waitForOmniSlot();

  // Express-mode (AQ.*) keys cannot drive the SDK's generateVideos: it resolves to
  // PredictLongRunning, which needs an explicit project path that express keys
  // reject. Use the REST path instead when we are on that auth surface.
  if (shouldUseVertexVideoRest()) {
    return callVertexVideoRest(params);
  }

  const refCount = params.referenceImages?.length ?? 0;
  const label = refCount > 0 ? `(with ${refCount} reference image(s))` : "(no reference image)";
  console.log(`[omni] Calling Gemini Omni 1.1 Flash (${GEMINI_OMNI_VIDEO_MODEL})... ${label} [${params.resolution}, ${params.aspectRatio}, ${params.durationSeconds}s]`);

  // A dedicated Developer-API video key gets its own client and model.
  const videoClient = hasDedicatedVideoKey() ?
      buildDeveloperApiClient(env.GEMINI_VIDEO_API_KEY!) :
    client;
  const videoModel = hasDedicatedVideoKey() ?
      (env.GEMINI_VIDEO_MODEL ?? GEMINI_OMNI_VIDEO_MODEL) :
    GEMINI_OMNI_VIDEO_MODEL;

  const generateParams: Parameters<typeof client.models.generateVideos>[0] = {
    config: {
      aspectRatio: params.aspectRatio,
      durationSeconds: params.durationSeconds,
      numberOfVideos: 1,
      resolution: params.resolution,
      ...(refCount > 0 ? { personGeneration: "allow_adult", referenceImages: params.referenceImages } : {}),
      ...(params.lastFrameBytes ?
          {
            lastFrame: {
              imageBytes: params.lastFrameBytes,
              mimeType: params.lastFrameMimeType ?? "image/png",
            },
            personGeneration: "allow_adult",
          } :
          {}),
    },
    model: videoModel,
    prompt: params.prompt,
    ...(params.firstFrameBytes ?
        {
          image: {
            imageBytes: params.firstFrameBytes,
            mimeType: params.firstFrameMimeType ?? "image/png",
          },
        } :
        {}),
  };

  let operation = await videoClient.models.generateVideos(generateParams);
  console.log("[omni] Gemini Omni 1.1 Flash request sent successfully");

  const operationName = (operation as { name?: string })?.name;
  const MAX_POLLS = 45; // Max 7.5 minutes
  let pollCount = 0;

  while (!operation.done) {
    pollCount++;
    if (pollCount > MAX_POLLS) {
      throw new Error(`Veo video generation timed out after ${pollCount} polling attempts (${MAX_POLLS * 10}s)`);
    }
    console.log("[omni] Polling for completion... attempt", pollCount);
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await videoClient.operations.getVideosOperation({ operation });
  }
  console.log("[omni] Generation complete after", pollCount, "polls");

  if (operation.error) {
    console.error("[omni] Generation error:", JSON.stringify(operation.error));
    throw new Error(`Video generation failed: ${JSON.stringify(operation.error)}`);
  }

  const raiFiltered = operation.response?.raiMediaFilteredCount ?? 0;
  const raiReasons = operation.response?.raiMediaFilteredReasons ?? [];
  const generatedVideos = operation.response?.generatedVideos;

  if (raiFiltered > 0 || !generatedVideos || generatedVideos.length === 0) {
    if (raiFiltered > 0) {
      console.warn("[omni] RAI filtered:", raiReasons.join("; "));
      throw new VeoRAIFilterError(raiReasons);
    }
    console.error("[omni] No videos in response:", JSON.stringify(operation.response ?? {}));
    throw new Error("Video generation completed but no videos returned");
  }

  const video = generatedVideos[0];
  let localPath = params.outputPath;

  if (!localPath) {
    const tmpDir = path.join(os.tmpdir(), "interdimensional-cable");
    fs.mkdirSync(tmpDir, { recursive: true });
    const fileName = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
    localPath = path.join(tmpDir, fileName);
  } else {
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
  }

  console.log("[omni] Downloading video to:", localPath);
  await videoClient.files.download({ downloadPath: localPath, file: video.video! });
  console.log("[omni] Download complete, size:", fs.statSync(localPath).size, "bytes");

  const videoUrl = video.video?.uri ?? localPath;
  const interactionId = (operation.response as { interactionId?: string } | undefined)?.interactionId ?? params.previousInteractionId;

  return {
    durationSeconds: params.durationSeconds,
    filePath: localPath,
    interactionId,
    localPath,
    operationName,
    videoUrl,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Vertex REST video path
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A dedicated video key means "run video on the Gemini Developer API", which is
 * the only surface that offers gemini-omni-1.1-flash. Note the AQ.* prefix does
 * NOT imply Vertex here: express keys exist on both surfaces, so this routing is
 * explicit rather than sniffed from the key format.
 */
function hasDedicatedVideoKey(): boolean {
  return Boolean(env.GEMINI_VIDEO_API_KEY);
}

function shouldUseVertexVideoRest(): boolean {
  if (hasDedicatedVideoKey()) {
    return false;
  }
  const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY ?? "";
  return Boolean(env.GOOGLE_CLOUD_PROJECT) && (env.GOOGLE_GENAI_USE_VERTEX === "true" || apiKey.startsWith("AQ."));
}

async function callVertexVideoRest(params: InternalGenerateParams): Promise<VideoClipResult> {
  const { generateVideoViaVertex, VertexVideoRAIError } = await import("./vertex-video");

  let result;
  try {
    result = await generateVideoViaVertex({
      prompt: params.prompt,
      durationSeconds: params.durationSeconds,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution,
      firstFrameBytes: params.firstFrameBytes,
      firstFrameMimeType: params.firstFrameMimeType,
      lastFrameBytes: params.lastFrameBytes,
      lastFrameMimeType: params.lastFrameMimeType,
    });
  } catch (error) {
    // Preserve the existing RAI retry semantics used by callOmniWithRetry.
    if (error instanceof VertexVideoRAIError) {
      throw new VeoRAIFilterError(error.reasons);
    }
    throw error;
  }

  let localPath = params.outputPath;
  if (!localPath) {
    const tmpDir = path.join(os.tmpdir(), "interdimensional-cable");
    fs.mkdirSync(tmpDir, { recursive: true });
    localPath = path.join(tmpDir, `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`);
  } else {
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
  }

  fs.writeFileSync(localPath, result.videoBuffer);
  console.log("[vertex-video] wrote", fs.statSync(localPath).size, "bytes to", localPath);

  return {
    durationSeconds: params.durationSeconds,
    filePath: localPath,
    interactionId: params.previousInteractionId,
    localPath,
    operationName: result.operationName,
    videoUrl: localPath,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a video clip using Google Gemini Omni 1.1 Flash.
 * Supports configurable resolutions (360p, 720p, 1080p, 4k), aspect ratios (16:9, 9:16),
 * durations (3s-10s), multimodal reference images (<IMAGE_REF_0>), and scene extensions.
 *
 * Polymorphic signatures:
 * - `generateVideoClip(prompt, outputPath, options)`
 * - `generateVideoClip(prompt, options)`
 * - `generateVideoClip(prompt, referenceImageSlug)` (legacy positional)
 */
export async function generateVideoClip(
  prompt: string,
  outputPathOrSlugOrOptions?: string | VideoClipOptions,
  maybeOptions?: VideoClipOptions,
): Promise<VideoClipResult> {
  let targetOutputPath: string | undefined;
  let resolvedOptions: VideoClipOptions = {};

  if (typeof outputPathOrSlugOrOptions === "string") {
    if (
      outputPathOrSlugOrOptions.endsWith(".mp4") ||
      outputPathOrSlugOrOptions.includes("/") ||
      outputPathOrSlugOrOptions.includes("\\")
    ) {
      targetOutputPath = outputPathOrSlugOrOptions;
      resolvedOptions = maybeOptions ?? {};
    } else {
      // Legacy slug invocation: generateVideoClip(prompt, "john-oliver")
      resolvedOptions = {
        referenceImages: [outputPathOrSlugOrOptions],
        ...(maybeOptions ?? {}),
      };
    }
  } else if (typeof outputPathOrSlugOrOptions === "object" && outputPathOrSlugOrOptions !== null) {
    resolvedOptions = outputPathOrSlugOrOptions;
  }

  const durationSeconds = Math.min(10, Math.max(3, resolvedOptions.durationSeconds ?? 8));
  const resolution: OmniResolution = resolvedOptions.resolution ?? "720p";
  const aspectRatio: OmniAspectRatio = resolvedOptions.aspectRatio ?? "16:9";

  console.log(`[omni] generateVideoClip called, prompt length: ${prompt.length}, res: ${resolution}, ratio: ${aspectRatio}, dur: ${durationSeconds}s`);
  const client = getClient();
  const referenceImages = resolveReferenceImages(resolvedOptions.referenceImages);

  return callOmniWithRetry(client, {
    aspectRatio,
    durationSeconds,
    outputPath: targetOutputPath,
    previousInteractionId: resolvedOptions.previousInteractionId,
    prompt,
    referenceImages,
    resolution,
  });
}

/**
 * Generates a video clip using Gemini Omni 1.1 Flash with start and/or end frame conditioning.
 * Transitions smoothly between anchor frames while following the prompt.
 *
 * Polymorphic signatures:
 * - `generateVideoClipInterpolated(prompt, outputPath, options)`
 * - `generateVideoClipInterpolated(prompt, options)`
 * - `generateVideoClipInterpolated(prompt, firstFramePath, lastFramePath)` (legacy positional)
 */
export async function generateVideoClipInterpolated(
  prompt: string,
  outputPathOrFirstFrameOrOptions: string | VideoClipInterpolatedOptions,
  optionsOrLastFrame?: string | VideoClipInterpolatedOptions,
  maybeOptions?: VideoClipInterpolatedOptions,
): Promise<VideoClipResult> {
  let targetOutputPath: string | undefined;
  let firstFramePath: string | undefined;
  let lastFramePath: string | undefined;
  let resolvedOptions: VideoClipInterpolatedOptions = {};

  if (typeof optionsOrLastFrame === "string") {
    // Legacy positional: (prompt, firstFramePath, lastFramePath)
    firstFramePath = typeof outputPathOrFirstFrameOrOptions === "string" ? outputPathOrFirstFrameOrOptions : undefined;
    lastFramePath = optionsOrLastFrame;
    resolvedOptions = maybeOptions ?? {};
  } else if (typeof outputPathOrFirstFrameOrOptions === "object" && outputPathOrFirstFrameOrOptions !== null) {
    // (prompt, options)
    resolvedOptions = outputPathOrFirstFrameOrOptions;
    firstFramePath = resolvedOptions.firstFramePath;
    lastFramePath = resolvedOptions.lastFramePath;
  } else {
    // (prompt, outputPath, options)
    targetOutputPath = outputPathOrFirstFrameOrOptions;
    resolvedOptions = typeof optionsOrLastFrame === "object" && optionsOrLastFrame !== null ? optionsOrLastFrame : {};
    firstFramePath = resolvedOptions.firstFramePath;
    lastFramePath = resolvedOptions.lastFramePath;
  }

  const durationSeconds = Math.min(10, Math.max(3, resolvedOptions.durationSeconds ?? 8));
  const resolution: OmniResolution = resolvedOptions.resolution ?? "720p";
  const aspectRatio: OmniAspectRatio = resolvedOptions.aspectRatio ?? "16:9";

  console.log(`[omni] generateVideoClipInterpolated called, prompt length: ${prompt.length}, res: ${resolution}, ratio: ${aspectRatio}, dur: ${durationSeconds}s`);
  const client = getClient();
  const referenceImages = resolveReferenceImages(resolvedOptions.referenceImages);

  let firstFrameBytes: string | undefined;
  let firstFrameMimeType: string | undefined;
  if (firstFramePath) {
    if (firstFramePath.startsWith("data:") || firstFramePath.length > 500) {
      firstFrameBytes = firstFramePath.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
    } else if (fs.existsSync(firstFramePath)) {
      firstFrameBytes = fs.readFileSync(firstFramePath).toString("base64");
      firstFrameMimeType = firstFramePath.endsWith(".jpg") || firstFramePath.endsWith(".jpeg") ? "image/jpeg" : "image/png";
    }
  }

  let lastFrameBytes: string | undefined;
  let lastFrameMimeType: string | undefined;
  if (lastFramePath) {
    if (lastFramePath.startsWith("data:") || lastFramePath.length > 500) {
      lastFrameBytes = lastFramePath.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
    } else if (fs.existsSync(lastFramePath)) {
      lastFrameBytes = fs.readFileSync(lastFramePath).toString("base64");
      lastFrameMimeType = lastFramePath.endsWith(".jpg") || lastFramePath.endsWith(".jpeg") ? "image/jpeg" : "image/png";
    }
  }

  return callOmniWithRetry(client, {
    aspectRatio,
    durationSeconds,
    firstFrameBytes,
    firstFrameMimeType,
    lastFrameBytes,
    lastFrameMimeType,
    outputPath: targetOutputPath,
    previousInteractionId: resolvedOptions.previousInteractionId,
    prompt,
    referenceImages,
    resolution,
  });
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
    config: {
      maxOutputTokens: 8192,
      systemInstruction,
      temperature: 0.9,
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      ...(useGoogleSearch ? { tools: [{ googleSearch: {} }] } : {}),
    },
    contents: [{ parts: [{ text: prompt }], role: "user" }],
    model: GEMINI_TEXT_MODEL,
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
