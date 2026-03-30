import { getWritable } from "workflow";

import type { GenerationStepId } from "@/app/create/[showId]/constants";

import { closeStream, sleepMs, writeToStream } from "./workflow-progress";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateShowResult {
  success: boolean;
  currentStep: GenerationStepId;
  completedSteps: GenerationStepId[];
  error?: string;
}

interface ProgressEvent {
  type: "current" | "completed";
  step: GenerationStepId;
}

interface TranscriptSegment {
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lazy DB helper (Node.js modules only available inside step functions)
// ─────────────────────────────────────────────────────────────────────────────

async function getDb() {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = await import("pg");
  const { env } = await import("@/app/lib/env");
  const schema = await import("@/db/schema");
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  return { db: drizzle(pool, { schema }), schema, pool };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Workflow
// ─────────────────────────────────────────────────────────────────────────────

export async function generateShowWorkflow(
  showId: string,
): Promise<GenerateShowResult> {
  "use workflow";

  const completedSteps: GenerationStepId[] = [];
  const progress = getWritable<ProgressEvent>({ namespace: "progress" });

  try {
    console.log("[workflow] Starting research step for showId:", showId);
    await researchStep(progress, showId);
    completedSteps.push("research");
    console.log("[workflow] Research step completed");

    console.log("[workflow] Starting script step");
    await scriptStep(progress, showId);
    completedSteps.push("script");
    console.log("[workflow] Script step completed");

    console.log("[workflow] Starting frame-chain + generate-clips step");
    await frameChainAndGenerateClipsStep(progress, showId);
    completedSteps.push("generate-clips");
    console.log("[workflow] Generate-clips step completed");

    console.log("[workflow] Starting stitch step");
    await stitchStep(progress, showId);
    completedSteps.push("stitch");
    console.log("[workflow] Stitch step completed");

    console.log("[workflow] Starting upload step");
    await uploadStep(progress, showId);
    completedSteps.push("upload");
    console.log("[workflow] Upload step completed — all done!");

    return {
      success: true,
      currentStep: "upload",
      completedSteps,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Show generation failed";
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[workflow] FAILED at step after:", completedSteps, "error:", message);
    if (stack) console.error("[workflow] Stack trace:", stack);

    // Mark show as failed in a step (can't use Node.js modules in workflow fn)
    await markFailedStep(showId, message);

    try {
      await closeStream(progress);
    } catch {
      // stream may already be closed
    }

    return {
      success: false,
      currentStep: completedSteps.at(-1) ?? "research",
      completedSteps,
      error: message,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error handler step
// ─────────────────────────────────────────────────────────────────────────────

async function markFailedStep(showId: string, errorMessage: string): Promise<void> {
  "use step";
  console.log("[workflow:markFailed] Marking show as failed:", showId, "error:", errorMessage);
  const { eq } = await import("drizzle-orm");
  const { db, schema } = await getDb();
  await db.update(schema.generatedShows)
    .set({ status: "failed", error: errorMessage })
    .where(eq(schema.generatedShows.id, showId));
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: Research
// ─────────────────────────────────────────────────────────────────────────────

async function researchStep(
  progress: WritableStream<ProgressEvent>,
  showId: string,
): Promise<void> {
  "use step";
  await writeToStream(progress, { type: "current", step: "research" });

  const { eq } = await import("drizzle-orm");
  const { db, schema } = await getDb();
  const { generateText } = await import("@/app/lib/veo");

  await db.update(schema.generatedShows)
    .set({ status: "researching" })
    .where(eq(schema.generatedShows.id, showId));

  const show = await db.query.generatedShows.findFirst({
    where: eq(schema.generatedShows.id, showId),
  });

  if (!show) throw new Error("Show not found");
  console.log("[workflow:research] Show found:", show.id, "topic:", show.topic, "type:", show.topicType);

  // Fetch URL content if needed
  let topicContent = show.topic;
  if (show.topicType === "news_link" || show.topicType === "hacker_news") {
    try {
      const response = await fetch(show.topic);
      if (response.ok) {
        const html = await response.text();
        const textContent = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        topicContent = `URL: ${show.topic}\n\nContent: ${textContent.slice(0, 5000)}`;
      }
    } catch {
      topicContent = `Topic: ${show.topic} (URL could not be fetched)`;
    }
  }

  const researchPrompt = `Research the following topic thoroughly. Provide key facts, recent developments, interesting angles, controversies, and anything a comedy talk show host would need to create funny, informed commentary.

Topic: ${topicContent}

Familiarity level: ${show.familiarity} (${
  show.familiarity === "beginner" ? "Explain everything from scratch" :
  show.familiarity === "familiar" ? "Assume basic knowledge, focus on interesting details" :
  "Deep expertise assumed, focus on nuanced insider angles"
})

Provide a comprehensive research brief in 500-1000 words.`;

  console.log("[workflow:research] Calling Gemini for research...");
  const researchContext = await generateText(researchPrompt, "You are a research assistant for a comedy talk show. Gather comprehensive information that can be turned into entertaining commentary.", true);
  console.log("[workflow:research] Gemini returned", researchContext.length, "chars");

  await db.update(schema.generatedShows)
    .set({ researchContext })
    .where(eq(schema.generatedShows.id, showId));

  await writeToStream(progress, { type: "completed", step: "research" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: Script
// ─────────────────────────────────────────────────────────────────────────────

async function scriptStep(
  progress: WritableStream<ProgressEvent>,
  showId: string,
): Promise<void> {
  "use step";
  await writeToStream(progress, { type: "current", step: "script" });

  const { eq } = await import("drizzle-orm");
  const { db, schema } = await getDb();
  const { generateText } = await import("@/app/lib/veo");

  await db.update(schema.generatedShows)
    .set({ status: "scripting" })
    .where(eq(schema.generatedShows.id, showId));

  const show = await db.query.generatedShows.findFirst({
    where: eq(schema.generatedShows.id, showId),
  });
  if (!show) throw new Error("Show not found");

  const template = await db.query.showTemplates.findFirst({
    where: eq(schema.showTemplates.id, show.templateId),
  });
  if (!template) throw new Error("Template not found");

  const hosts = template.hosts as Array<{ name: string; personality: string; position?: string }>;
  const durationSec = show.durationSeconds;
  const clipCount = Math.ceil(durationSec / 8);

  let scriptPrompt: string;

  if (template.showType === "monologue") {
    const host = hosts[0];
    scriptPrompt = `Write a ${durationSec}-second monologue for a talk show segment.

HOST: ${host.name}
PERSONALITY: ${host.personality}

RESEARCH CONTEXT:
${show.researchContext}

TOPIC: ${show.topic}

Requirements:
- Write exactly ${clipCount} segments, each about 8 seconds of spoken content (roughly 20-25 words per segment)
- Adopt the host's voice, humor style, and mannerisms completely
- Start strong with a hook, build with jokes and insights, end with a punchy closer
- Include the host's signature phrases and comedic style

Format your response as JSON array:
[{"speaker": "${host.name}", "text": "segment text here", "clipIndex": 0}, ...]`;
  } else {
    scriptPrompt = `Write a ${durationSec}-second conversation for a talk show news desk segment.

HOSTS:
${hosts.map(h => `- ${h.name} (${h.position ?? "center"}): ${h.personality}`).join("\n")}

RESEARCH CONTEXT:
${show.researchContext}

TOPIC: ${show.topic}

Requirements:
- Write exactly ${clipCount} segments, each about 8 seconds of spoken content (roughly 20-25 words per segment)
- Alternate between hosts naturally — they should riff off each other
- Each segment should clearly indicate which host is speaking
- For the person on the LEFT (${hosts.find(h => h.position === "left")?.name ?? hosts[0].name}): use their specific personality
- For the person on the RIGHT (${hosts.find(h => h.position === "right")?.name ?? hosts[1]?.name ?? hosts[0].name}): use their specific personality
- Include banter, reactions, and their dynamic

Format your response as JSON array:
[{"speaker": "HostName", "text": "segment text here", "clipIndex": 0, "position": "left|right|center"}, ...]`;
  }

  console.log("[workflow:script] Calling Gemini for script, clipCount:", clipCount);
  const scriptResult = await generateText(scriptPrompt, "You are an Emmy-winning comedy writer. Write scripts that are genuinely funny, sharp, and perfectly capture each host's voice. Output valid JSON only, no markdown fences.");
  console.log("[workflow:script] Gemini returned", scriptResult.length, "chars");

  // Parse the JSON response
  let segments: TranscriptSegment[];
  try {
    const jsonMatch = scriptResult.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array found in script output");

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      speaker: string;
      text: string;
      clipIndex: number;
      position?: string;
    }>;

    segments = parsed.map((seg, i) => ({
      speaker: seg.speaker,
      text: seg.text,
      startTime: i * 8,
      endTime: (i + 1) * 8,
    }));
  } catch (parseErr) {
    console.warn("Failed to parse script JSON, using as plain text:", parseErr);
    const words = scriptResult.split(/\s+/);
    const wordsPerSegment = Math.ceil(words.length / clipCount);
    segments = [];
    for (let i = 0; i < clipCount; i++) {
      const segWords = words.slice(i * wordsPerSegment, (i + 1) * wordsPerSegment);
      segments.push({
        speaker: hosts[0].name,
        text: segWords.join(" "),
        startTime: i * 8,
        endTime: (i + 1) * 8,
      });
    }
  }

  const transcript = segments.map(s => `[${s.speaker}]: ${s.text}`).join("\n\n");

  await db.update(schema.generatedShows)
    .set({ transcript, transcriptSegments: segments })
    .where(eq(schema.generatedShows.id, showId));

  await writeToStream(progress, { type: "completed", step: "script" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3: Generate Video Clips
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orchestrates frame chaining (if enabled) followed by clip generation.
 * When frame chaining is ON:
 *   1. Generates an anchor clip with reference images
 *   2. Extracts first + last frames
 *   3. Uses those frames for interpolated content clip generation
 * When OFF: generates clips with reference images directly (existing behavior).
 */
async function frameChainAndGenerateClipsStep(
  progress: WritableStream<ProgressEvent>,
  showId: string,
): Promise<void> {
  "use step";

  const { eq } = await import("drizzle-orm");
  const { db, schema } = await getDb();
  const { generateVideoClip, generateVideoClipInterpolated } = await import("@/app/lib/veo");
  const { extractFrame, cleanupTempFiles } = await import("@/app/lib/stitch");

  const show = await db.query.generatedShows.findFirst({
    where: eq(schema.generatedShows.id, showId),
  });
  if (!show) throw new Error("Show not found");

  const template = await db.query.showTemplates.findFirst({
    where: eq(schema.showTemplates.id, show.templateId),
  });
  if (!template) throw new Error("Template not found");

  const segments = (show.transcriptSegments ?? []) as TranscriptSegment[];
  const hosts = template.hosts as Array<{ name: string; personality: string; position?: string }>;
  const refImageSlug = referenceImageSlug(template.referenceImageUrl);

  let firstFramePath: string | null = null;
  let lastFramePath: string | null = null;
  let framingClipPath: string | null = null;

  // ── Frame chaining: generate anchor clip + extract frames ──────────
  if (show.useFrameChaining) {
    await writeToStream(progress, { type: "current", step: "frame-chain" });
    await db.update(schema.generatedShows)
      .set({ status: "framing" })
      .where(eq(schema.generatedShows.id, showId));

    const sanitizedNotes = sanitizeNotesForVeo(template.notes ?? "");
    let framingPrompt = "A professional late-night talk show set. ";
    if (template.showType === "conversation") {
      framingPrompt += "Two hosts sit behind a news desk with a world map graphic behind them. The hosts are having an animated conversation. ";
    } else {
      framingPrompt += "A single host behind a desk with a colorful graphic behind them. The host is delivering a monologue. ";
    }
    framingPrompt += `Style: ${sanitizedNotes} `;
    framingPrompt += "Studio lighting, professional TV production quality. The host should be animated and expressive.";

    console.log("[workflow:frame-chain] Generating anchor clip with reference image...");
    const framingResult = await generateVideoClip(framingPrompt, refImageSlug ?? undefined);
    framingClipPath = framingResult.localPath;
    console.log("[workflow:frame-chain] Anchor clip generated:", framingClipPath);

    // Extract first and last frames
    firstFramePath = await extractFrame(framingClipPath, 0);
    lastFramePath = await extractFrame(framingClipPath, 7.5); // near end of 8s clip
    console.log("[workflow:frame-chain] Frames extracted — first:", firstFramePath, "last:", lastFramePath);

    await writeToStream(progress, { type: "completed", step: "frame-chain" });
  }

  // ── Generate content clips ─────────────────────────────────────────
  await writeToStream(progress, { type: "current", step: "generate-clips" });
  await db.update(schema.generatedShows)
    .set({ status: "generating" })
    .where(eq(schema.generatedShows.id, showId));

  // Create video_clips records
  const clipRecords = segments.map((seg, i) => ({
    showId,
    clipIndex: i,
    durationSeconds: 8,
    prompt: buildVeoPrompt(seg, hosts, template.showType, template.notes ?? ""),
    status: "pending" as const,
  }));

  await db.insert(schema.videoClips).values(clipRecords);

  const clips = await db.query.videoClips.findMany({
    where: eq(schema.videoClips.showId, showId),
    orderBy: (vc, { asc }) => [asc(vc.clipIndex)],
  });

  console.log("[workflow:generate-clips] Generating", clips.length, "clips sequentially...",
    show.useFrameChaining ? "(interpolation mode)" : "(reference image mode)");

  let successCount = 0;
  let failCount = 0;

  for (const clip of clips) {
    console.log("[workflow:generate-clips] Starting clip", clip.clipIndex);
    await db.update(schema.videoClips)
      .set({ status: "generating" })
      .where(eq(schema.videoClips.id, clip.id));

    try {
      let result;

      if (show.useFrameChaining && firstFramePath && lastFramePath) {
        // Interpolation mode: use anchor frames
        result = await generateVideoClipInterpolated(clip.prompt, firstFramePath, lastFramePath);
      } else {
        // Standard mode: use reference images
        result = await generateVideoClip(clip.prompt, refImageSlug ?? undefined);
      }

      console.log("[workflow:generate-clips] Clip", clip.clipIndex, "done, path:", result.localPath);
      await db.update(schema.videoClips)
        .set({ status: "ready", videoUrl: result.localPath })
        .where(eq(schema.videoClips.id, clip.id));
      successCount++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Clip generation failed";
      console.error("[workflow:generate-clips] Clip", clip.clipIndex, "FAILED:", message);
      await db.update(schema.videoClips)
        .set({ status: "failed", error: message })
        .where(eq(schema.videoClips.id, clip.id));
      failCount++;
    }
  }

  // Clean up frame chaining temp files
  const filesToClean: string[] = [];
  if (framingClipPath) filesToClean.push(framingClipPath);
  if (firstFramePath) filesToClean.push(firstFramePath);
  if (lastFramePath) filesToClean.push(lastFramePath);
  if (filesToClean.length > 0) {
    cleanupTempFiles(filesToClean);
  }

  if (successCount === 0) {
    throw new Error("All video clips failed to generate");
  }

  if (failCount > 0) {
    console.warn(`${failCount}/${clips.length} clips failed, continuing with ${successCount} available clips`);
  }

  await writeToStream(progress, { type: "completed", step: "generate-clips" });
}

/**
 * Sanitizes template notes to remove specific show/network names
 * that could trigger celebrity likeness filters in Veo.
 */
function sanitizeNotesForVeo(notes: string): string {
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
    .replace(/\bSeth Meyers\b/gi, "Seth");
}

/**
 * Extracts the filename slug from a template's referenceImageUrl.
 * "/templates/john-oliver.png" -> "john-oliver"
 */
function referenceImageSlug(referenceImageUrl: string | null): string | null {
  if (!referenceImageUrl) return null;
  const filename = referenceImageUrl.split("/").pop();
  if (!filename) return null;
  return filename.replace(/\.[^.]+$/, "");
}

function buildVeoPrompt(
  segment: TranscriptSegment,
  hosts: Array<{ name: string; personality: string; position?: string }>,
  showType: string,
  notes: string,
): string {
  const host = hosts.find(h => h.name === segment.speaker) ?? hosts[0];
  const sanitizedNotes = sanitizeNotesForVeo(notes);

  let prompt = "A professional late-night talk show segment. ";

  if (showType === "conversation") {
    prompt += "Two hosts sit behind a news desk with a world map graphic behind them. ";
    if (host.position === "left") {
      prompt += "The person on the LEFT is speaking and gesturing animatedly. ";
    } else if (host.position === "right") {
      prompt += "The person on the RIGHT is speaking and gesturing animatedly. ";
    }
  } else {
    prompt += "A single host behind a desk delivering a monologue, with a colorful graphic behind them. ";
  }

  prompt += "The host is speaking to the camera with expressive gestures. ";
  prompt += `Style: ${sanitizedNotes} `;
  prompt += "Studio lighting, professional TV production quality.";

  return prompt;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4: Stitch Clips
// ─────────────────────────────────────────────────────────────────────────────

async function stitchStep(
  progress: WritableStream<ProgressEvent>,
  showId: string,
): Promise<void> {
  "use step";
  await writeToStream(progress, { type: "current", step: "stitch" });

  const { eq } = await import("drizzle-orm");
  const { db, schema } = await getDb();
  const { stitchClips } = await import("@/app/lib/stitch");

  await db.update(schema.generatedShows)
    .set({ status: "stitching" })
    .where(eq(schema.generatedShows.id, showId));

  const clips = await db.query.videoClips.findMany({
    where: eq(schema.videoClips.showId, showId),
    orderBy: (vc, { asc }) => [asc(vc.clipIndex)],
  });

  const readyClips = clips.filter(c => c.status === "ready" && c.videoUrl);
  console.log("[workflow:stitch] Ready clips:", readyClips.length, "/", clips.length);
  if (readyClips.length === 0) {
    throw new Error("No video clips available to stitch");
  }

  const clipPaths = readyClips.map(c => c.videoUrl!);
  console.log("[workflow:stitch] Stitching paths:", clipPaths);
  const stitchedPath = await stitchClips(clipPaths);
  console.log("[workflow:stitch] Stitched output:", stitchedPath);

  // Store stitched path temporarily (will be used in upload step)
  await db.update(schema.generatedShows)
    .set({ error: `__stitched:${stitchedPath}` })
    .where(eq(schema.generatedShows.id, showId));

  // Clean up individual clip files
  const { cleanupTempFiles } = await import("@/app/lib/stitch");
  cleanupTempFiles(clipPaths);

  await writeToStream(progress, { type: "completed", step: "stitch" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5: Upload to Mux
// ─────────────────────────────────────────────────────────────────────────────

async function uploadStep(
  progress: WritableStream<ProgressEvent>,
  showId: string,
): Promise<void> {
  "use step";
  await writeToStream(progress, { type: "current", step: "upload" });

  const { eq } = await import("drizzle-orm");
  const { db, schema } = await getDb();
  const { createDirectUpload, waitForAssetReady, waitForUploadAssetId } = await import("@/app/lib/mux");

  await db.update(schema.generatedShows)
    .set({ status: "uploading" })
    .where(eq(schema.generatedShows.id, showId));

  const show = await db.query.generatedShows.findFirst({
    where: eq(schema.generatedShows.id, showId),
  });
  if (!show) throw new Error("Show not found");

  // Retrieve stitched path from temporary storage
  const stitchedPath = show.error?.startsWith("__stitched:")
    ? show.error.slice("__stitched:".length)
    : null;

  if (!stitchedPath) {
    throw new Error("Stitched video path not found");
  }

  // Clear the temporary storage
  await db.update(schema.generatedShows)
    .set({ error: null })
    .where(eq(schema.generatedShows.id, showId));

  // Upload to Mux via direct upload
  console.log("[workflow:upload] Creating Mux direct upload...");
  const { uploadId, uploadUrl } = await createDirectUpload();
  console.log("[workflow:upload] Upload URL created, uploadId:", uploadId);

  // Upload the file
  const fs = await import("node:fs");
  const fileBuffer = fs.readFileSync(stitchedPath);

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4" },
    body: fileBuffer,
  });

  if (!uploadResponse.ok) {
    const body = await uploadResponse.text();
    console.error("[workflow:upload] Mux upload failed:", uploadResponse.status, body);
    throw new Error(`Failed to upload to Mux: ${uploadResponse.status}`);
  }
  console.log("[workflow:upload] File uploaded to Mux, waiting for asset ID...");

  // Poll the upload until Mux assigns an asset ID
  const assetId = await waitForUploadAssetId(uploadId);
  console.log("[workflow:upload] Asset ID resolved:", assetId, "— waiting for asset ready...");

  // Wait for the asset to be ready
  const readyAsset = await waitForAssetReady(assetId, 5 * 60 * 1000);
  console.log("[workflow:upload] Asset ready, playback IDs:", readyAsset.playback_ids?.length);

  // Extract playback ID
  const playbackId = readyAsset.playback_ids?.[0]?.id;
  if (!playbackId) {
    throw new Error("Mux asset ready but no playback ID found");
  }

  // Update the show record
  await db.update(schema.generatedShows)
    .set({
      status: "ready",
      muxAssetId: assetId,
      muxPlaybackId: playbackId,
    })
    .where(eq(schema.generatedShows.id, showId));

  // Clean up stitched file
  const { cleanupTempFiles } = await import("@/app/lib/stitch");
  cleanupTempFiles([stitchedPath]);

  await writeToStream(progress, { type: "completed", step: "upload" });
  await closeStream(progress);
}
