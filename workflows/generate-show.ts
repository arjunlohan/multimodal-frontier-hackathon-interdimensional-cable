import { getWritable } from "workflow";

import type { GenerationStepId } from "@/app/create/[showId]/constants";
import {
  buildVeoPrompt,

  OmniRAIFilterError,

  VeoRAIFilterError,

} from "@/app/lib/veo";
import type { OmniAspectRatio, OmniResolution, VideoClipInterpolatedOptions, VideoClipOptions, VideoClipResult } from "@/app/lib/veo";

import { closeStream, writeToStream } from "./workflow-progress";

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
  startTime?: number;
  endTime?: number;
  startTimeSeconds?: number;
  endTimeSeconds?: number;
  clipIndex?: number;
  visualPrompt?: string;
  actingDirection?: string;
  durationSeconds?: number;
  acousticTags?: string[];
  wordCount?: number;
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

    const formatInfo = await checkShowFormatStep(showId);

    // Storage preflight. Generation costs real money and minutes of wall clock,
    // so refuse before spending it if Mux has no room for the finished asset.
    await checkStorageCapacityStep(showId);

    if (formatInfo.isAudioPodcast) {
      console.log("[workflow] Audio podcast format selected (duration:", formatInfo.durationSeconds, "s) — synthesizing with Gemini 3.1 Flash TTS");
      await audioPodcastSynthesisStep(progress, showId);
      completedSteps.push("generate-clips");
      completedSteps.push("stitch");
      console.log("[workflow] Audio podcast synthesis completed");
    } else {
      console.log("[workflow] Video show format selected (duration:", formatInfo.durationSeconds, "s) — generating clips with Gemini Omni 1.1 Flash");
      await frameChainAndGenerateClipsStep(progress, showId);
      completedSteps.push("generate-clips");
      console.log("[workflow] Generate-clips step completed");

      console.log("[workflow] Starting stitch step");
      await stitchStep(progress, showId);
      completedSteps.push("stitch");
      console.log("[workflow] Stitch step completed");
    }

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
    if (stack)
      console.error("[workflow] Stack trace:", stack);

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

  // Step errors can lose their message crossing the workflow boundary, which is
  // why failures used to surface as a bare "Show generation failed". Steps that
  // already recorded a specific, user-actionable reason keep it.
  const existing = await db.query.generatedShows.findFirst({
    where: eq(schema.generatedShows.id, showId),
  });
  const stored = existing?.error ?? "";
  const isSpecific = stored.length > 0 && stored !== "Show generation failed";

  await db.update(schema.generatedShows)
    // Terminal state: the visitor's API keys have no further use, so they stop
    // being stored at all.
    .set({ status: "failed", error: isSpecific ? stored : errorMessage, encryptedApiKeys: null })
    .where(eq(schema.generatedShows.id, showId));
}

/**
 * Verifies Mux has room for the finished asset before any generation happens.
 *
 * Without this the pipeline would render every clip, stitch them, and only then
 * hit "Free plan is limited to 10 assets" at upload — throwing away the entire
 * generation spend.
 */
async function checkStorageCapacityStep(showId: string): Promise<void> {
  "use step";
  const { eq } = await import("drizzle-orm");
  const { db, schema } = await getDb();
  const { getMuxCapacity } = await import("@/app/lib/mux");

  const capacity = await getMuxCapacity();
  console.log(`[workflow:preflight] Mux storage ${capacity.used}/${capacity.limit} used, ${capacity.available} free`);

  if (capacity.hasRoom) {
    return;
  }

  const message = `Mux storage is full (${capacity.used}/${capacity.limit} assets). ` +
    "Delete a show from the library to free a slot, then try again. " +
    "Generation was stopped before starting so no render time was spent.";

  await db.update(schema.generatedShows)
    .set({ status: "failed", error: message })
    .where(eq(schema.generatedShows.id, showId));

  throw new StorageFullError(message);
}

/** Thrown when Mux has no capacity; surfaced to the user verbatim. */
class StorageFullError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageFullError";
  }
}

async function checkShowFormatStep(showId: string): Promise<{ isAudioPodcast: boolean; durationSeconds: number }> {
  "use step";
  const { eq } = await import("drizzle-orm");
  const { db, schema } = await getDb();
  const show = await db.query.generatedShows.findFirst({
    where: eq(schema.generatedShows.id, showId),
  });
  return {
    isAudioPodcast: (show?.durationSeconds ?? 16) > 40,
    durationSeconds: show?.durationSeconds ?? 16,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: Research
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// API key scope
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs `fn` with the show's own Google API keys in scope.
 *
 * A durable run spans multiple invocations, so AsyncLocalStorage set when the
 * run was created is long gone by the time a later step executes. Each
 * model-calling step therefore reloads and decrypts the keys itself. Falls
 * through to the server's own key when the show carries none, which is what
 * local development does.
 */
async function runWithShowKeys<T>(showId: string, fn: () => Promise<T>): Promise<T> {
  const { eq } = await import("drizzle-orm");
  const { db, schema } = await getDb();
  const { decryptApiKeys, withUserApiKeys } = await import("@/app/lib/api-keys");

  const row = await db.query.generatedShows.findFirst({
    where: eq(schema.generatedShows.id, showId),
    columns: { encryptedApiKeys: true },
  });

  const keys = decryptApiKeys(row?.encryptedApiKeys);

  try {
    return await (keys ? withUserApiKeys(keys, fn) : fn());
  } catch (err) {
    // A step error loses its message crossing the workflow boundary, which is
    // why failures surfaced as a bare "Show generation failed" with no way to
    // tell a TTS speaker-limit rejection from a quota error. Record the real
    // reason here, where every model-calling step already passes through.
    const message = err instanceof Error ? err.message : String(err);
    try {
      await db.update(schema.generatedShows)
        .set({ error: message.slice(0, 1000) })
        .where(eq(schema.generatedShows.id, showId));
    } catch {
      // Never let error reporting mask the original failure.
    }
    throw err;
  }
}

/**
 * Step boundary. Re-establishes the run's API-key context, which does not
 *  survive across separate step invocations, then delegates.
 */
async function researchStep(
  progress: WritableStream<ProgressEvent>,
  showId: string,
): Promise<void> {
  "use step";
  return runWithShowKeys(showId, () => researchStepImpl(progress, showId));
}

async function researchStepImpl(
  progress: WritableStream<ProgressEvent>,
  showId: string,
): Promise<void> {
  await writeToStream(progress, { type: "current", step: "research" });

  const { eq } = await import("drizzle-orm");
  const { db, schema } = await getDb();
  const { runPass1Research } = await import("@/app/lib/dramaturgy/pass1-research");
  const { resolveSkillForShow } = await import("@/app/lib/skills/registry");

  await db.update(schema.generatedShows)
    .set({ status: "researching" })
    .where(eq(schema.generatedShows.id, showId));

  const show = await db.query.generatedShows.findFirst({
    where: eq(schema.generatedShows.id, showId),
  });

  if (!show)
    throw new Error("Show not found");
  console.log("[workflow:research] Show found:", show.id, "topic:", show.topic, "type:", show.topicType);

  const template = show.templateId ?
      await db.query.showTemplates.findFirst({
        where: eq(schema.showTemplates.id, show.templateId),
      }) :
    null;

  const skill = resolveSkillForShow(template?.name);

  // Fetch URL content if needed
  let topicContent = show.topic;
  if (show.topicType === "news_link" || show.topicType === "hacker_news") {
    let extracted = "";
    let failure = "";

    try {
      const response = await fetch(show.topic, {
        signal: AbortSignal.timeout(15_000),
        headers: { "User-Agent": "InterdimensionalCable/1.0 (+show-research)" },
      });

      if (!response.ok) {
        failure = `the site returned HTTP ${response.status}`;
      } else {
        const html = await response.text();
        extracted = html
          // Drop script/style bodies before stripping tags. Tag-stripping alone
          // leaves their contents behind, so minified JS reaches the research
          // prompt as if it were article prose.
          .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
          .replace(/<[^>]*>/g, " ")
          .replace(/&(nbsp|amp|quot|#39|lt|gt);/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        if (extracted.length < 400) {
          failure = `only ${extracted.length} characters of readable text came back, which usually means a paywall or a JavaScript-rendered page`;
        }
      }
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err);
    }

    if (failure) {
      // Fail loudly. Handing the model a bare URL it cannot read makes it invent
      // an entire episode and present the fabrication as grounded research,
      // which is far worse than refusing the run.
      throw new Error(
        `Could not read ${show.topic} — ${failure}. Paste the article text directly, or try a different link.`,
      );
    }

    console.log(`[workflow:research] Extracted ${extracted.length} chars from ${show.topic}`);
    topicContent = `URL: ${show.topic}\n\nContent: ${extracted.slice(0, 5000)}`;
  }

  console.log("[workflow:research] Running Pass 1 Grounded Research with Gemini 3.7 Flash...");
  const pass1Output = await runPass1Research({
    topic: topicContent,
    topicType: show.topicType as "custom" | "news_link" | "hacker_news" | "trend" | "freetext",
    familiarity: (show.familiarity as "beginner" | "familiar" | "expert") || "familiar",
    showSkill: skill,
  });

  console.log("[workflow:research] Pass 1 completed, grounded facts:", pass1Output.brief.groundedFacts.length, "angles:", pass1Output.brief.premiseAngles.length);

  await db.update(schema.generatedShows)
    .set({ researchContext: JSON.stringify(pass1Output.brief) })
    .where(eq(schema.generatedShows.id, showId));

  await writeToStream(progress, { type: "completed", step: "research" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: Script
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Step boundary. Re-establishes the run's API-key context, which does not
 *  survive across separate step invocations, then delegates.
 */
async function scriptStep(
  progress: WritableStream<ProgressEvent>,
  showId: string,
): Promise<void> {
  "use step";
  return runWithShowKeys(showId, () => scriptStepImpl(progress, showId));
}

async function scriptStepImpl(
  progress: WritableStream<ProgressEvent>,
  showId: string,
): Promise<void> {
  await writeToStream(progress, { type: "current", step: "script" });

  const { eq } = await import("drizzle-orm");
  const { db, schema } = await getDb();
  const { runDramaturgyPipeline } = await import("@/app/lib/dramaturgy/orchestrator");

  await db.update(schema.generatedShows)
    .set({ status: "scripting" })
    .where(eq(schema.generatedShows.id, showId));

  const show = await db.query.generatedShows.findFirst({
    where: eq(schema.generatedShows.id, showId),
  });
  if (!show)
    throw new Error("Show not found");

  const template = show.templateId ?
      await db.query.showTemplates.findFirst({
        where: eq(schema.showTemplates.id, show.templateId),
      }) :
    null;

  console.log("[workflow:script] Running 3-Pass Dramaturgy Pipeline for show:", showId);
  const dramaturgyResult = await runDramaturgyPipeline({
    showId: show.id,
    topic: show.topic,
    topicType: show.topicType as "custom" | "news_link" | "hacker_news" | "trend" | "freetext",
    templateId: show.templateId,
    skillIdOrSlug: template?.name,
    durationSeconds: show.durationSeconds,
    familiarity: show.familiarity as "beginner" | "familiar" | "expert",
    userId: show.userId ?? undefined,
    language: show.language ?? "en",
  });

  const { finalScript, researchBrief, executionMetrics } = dramaturgyResult;
  console.log("[workflow:script] Dramaturgy completed in", executionMetrics.totalDurationMs, "ms. Segments:", finalScript.segments.length, "Table-read score:", executionMetrics.tableReadAvgScore);

  await db.update(schema.generatedShows)
    .set({
      researchContext: JSON.stringify(researchBrief),
      transcript: finalScript.transcriptPlainText,
      transcriptSegments: finalScript.segments,
    })
    .where(eq(schema.generatedShows.id, showId));

  await writeToStream(progress, { type: "completed", step: "script" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio Podcast Synthesis (Long-form up to 5 min with Gemini 3.1 Flash TTS)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Step boundary. Re-establishes the run's API-key context, which does not
 *  survive across separate step invocations, then delegates.
 */
async function audioPodcastSynthesisStep(
  progress: WritableStream<ProgressEvent>,
  showId: string,
): Promise<void> {
  "use step";
  return runWithShowKeys(showId, () => audioPodcastSynthesisStepImpl(progress, showId));
}

async function audioPodcastSynthesisStepImpl(
  progress: WritableStream<ProgressEvent>,
  showId: string,
): Promise<void> {
  await writeToStream(progress, { type: "current", step: "generate-clips" });

  const { eq } = await import("drizzle-orm");
  const { db, schema } = await getDb();
  const { generateTts } = await import("@/app/lib/tts");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");

  await db.update(schema.generatedShows)
    .set({ status: "generating" })
    .where(eq(schema.generatedShows.id, showId));

  const show = await db.query.generatedShows.findFirst({
    where: eq(schema.generatedShows.id, showId),
  });
  if (!show)
    throw new Error("Show not found");

  const template = await db.query.showTemplates.findFirst({
    where: eq(schema.showTemplates.id, show.templateId),
  });
  if (!template)
    throw new Error("Template not found");

  const segments = (show.transcriptSegments ?? []) as TranscriptSegment[];
  const hosts = template.hosts as Array<{ name: string; personality: string; position?: string }>;

  console.log(`[workflow:podcast] Synthesizing ${segments.length} segments with Gemini 3.1 Flash TTS...`);

  // Gemini multi-speaker TTS accepts exactly two speakers; three or more is a
  // 400. Anything wider has to be synthesized a turn at a time, which is also
  // the only way each panellist keeps a distinct voice.
  const needsPerTurn = hosts.length > 2;

  let wavBuffer: Buffer;
  let exactDurations: number[] | null = null;

  if (needsPerTurn) {
    console.log(`[workflow:podcast] ${hosts.length} hosts exceeds the 2-speaker TTS limit; synthesizing per turn.`);
    const { generateTtsPerTurn } = await import("@/app/lib/tts");
    const turns = segments.map(seg => ({ speaker: seg.speaker, text: seg.text }));
    const result = await generateTtsPerTurn(turns, hosts, show.language ?? "en");
    wavBuffer = result.wav;
    exactDurations = result.durations;
  } else {
    const fullTextToSpeak = segments
      .map(s => (template.showType === "conversation" ? `${s.speaker}: ${s.text}` : s.text))
      .join("\n\n");
    wavBuffer = await generateTts(fullTextToSpeak, hosts, show.language ?? "en");
  }

  const tmpDir = path.join(os.tmpdir(), "interdimensional-cable");
  fs.mkdirSync(tmpDir, { recursive: true });
  const audioPath = path.join(tmpDir, `podcast-${showId}-${Date.now()}.wav`);
  fs.writeFileSync(audioPath, wavBuffer);

  console.log(`[workflow:podcast] Audio podcast written to: ${audioPath} (${wavBuffer.length} bytes)`);

  // The script assigns each segment a uniform planned slot (8s, 8s, ...), but the
  // whole podcast is synthesized in ONE TTS call, so real speech never lands on
  // those boundaries. Left uncorrected the error accumulates and the transcript
  // highlight runs ahead of the audio by several segments by the end.
  //
  // Re-derive the boundaries from the audio that actually exists, distributing
  // it across segments by word count, which tracks speaking time closely.
  const { wavDurationSeconds } = await import("@/app/lib/stitch");
  const actualDuration = wavDurationSeconds(wavBuffer);

  let timedSegments = segments;
  if (exactDurations && exactDurations.length === segments.length) {
    // Measured per turn, so no apportioning is needed.
    let cursor = 0;
    timedSegments = segments.map((seg, i) => {
      const startTimeSeconds = cursor;
      const endTimeSeconds = cursor + exactDurations![i];
      cursor = endTimeSeconds;
      return {
        ...seg,
        startTimeSeconds: Number(startTimeSeconds.toFixed(3)),
        endTimeSeconds: Number(endTimeSeconds.toFixed(3)),
        durationSeconds: Number(exactDurations![i].toFixed(3)),
      };
    });
    console.log(`[workflow:podcast] Transcript timed from measured per-turn audio (${cursor.toFixed(1)}s total)`);
  } else if (actualDuration && actualDuration > 0) {
    const weights = segments.map(s => Math.max(1, (s.text ?? "").trim().split(/\s+/).filter(Boolean).length));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let cursor = 0;
    timedSegments = segments.map((seg, i) => {
      const share = (weights[i] / totalWeight) * actualDuration;
      const startTimeSeconds = cursor;
      // Pin the final boundary to the true end so rounding cannot leave a gap.
      const endTimeSeconds = i === segments.length - 1 ? actualDuration : cursor + share;
      cursor = endTimeSeconds;
      return {
        ...seg,
        startTimeSeconds: Number(startTimeSeconds.toFixed(3)),
        endTimeSeconds: Number(endTimeSeconds.toFixed(3)),
        durationSeconds: Number((endTimeSeconds - startTimeSeconds).toFixed(3)),
      };
    });

    const planned = segments.reduce((a, s) => a + (s.durationSeconds ?? 0), 0);
    console.log(
      `[workflow:podcast] Retimed transcript against real audio: planned ${planned.toFixed(1)}s -> actual ${actualDuration.toFixed(1)}s`,
    );
  } else {
    console.warn("[workflow:podcast] Could not read WAV duration; keeping planned segment timings.");
  }

  // Store path for upload step
  await db.update(schema.generatedShows)
    .set({ localRenderPath: audioPath, transcriptSegments: timedSegments })
    .where(eq(schema.generatedShows.id, showId));

  await writeToStream(progress, { type: "completed", step: "generate-clips" });
  await writeToStream(progress, { type: "completed", step: "stitch" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3: Generate Video Clips
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orchestrates dynamic rolling tail-frame chaining and reference conditioning for content clips.
 * When frame chaining is ON:
 *   1. Generates an anchor framing clip with <IMAGE_REF_0>
 *   2. Extracts initial frame (0s) and anchor last frame (7.5s)
 *   3. Sequentially generates clips with rolling tail-frame chaining (FirstFrame(Clip_i) = LastFrame(Clip_{i-1}))
 *   4. Employs multi-turn scene extension by propagating previousInteractionId across turns
 * When OFF: generates clips with reference images and interactionId scene extensions.
 */
/**
 * Step boundary. Re-establishes the run's API-key context, which does not
 *  survive across separate step invocations, then delegates.
 */
async function frameChainAndGenerateClipsStep(
  progress: WritableStream<ProgressEvent>,
  showId: string,
): Promise<void> {
  "use step";
  return runWithShowKeys(showId, () => frameChainAndGenerateClipsStepImpl(progress, showId));
}

async function frameChainAndGenerateClipsStepImpl(
  progress: WritableStream<ProgressEvent>,
  showId: string,
): Promise<void> {
  const { eq } = await import("drizzle-orm");
  const { db, schema } = await getDb();
  const { generateVideoClip, generateVideoClipInterpolated } = await import("@/app/lib/veo");
  const { extractFrame, cleanupTempFiles } = await import("@/app/lib/stitch");

  const show = await db.query.generatedShows.findFirst({
    where: eq(schema.generatedShows.id, showId),
  });
  if (!show)
    throw new Error("Show not found");

  const template = await db.query.showTemplates.findFirst({
    where: eq(schema.showTemplates.id, show.templateId),
  });
  if (!template)
    throw new Error("Template not found");

  const segments = (show.transcriptSegments ?? []) as TranscriptSegment[];
  const hosts = (template.hosts ?? []) as Array<{ name: string; personality: string; position?: string }>;
  const refImageSlug = referenceImageSlug(template.referenceImageUrl);

  let currentFirstFramePath: string | null = null;
  let anchorLastFramePath: string | null = null;
  const tempFilesToClean: string[] = [];

  try {
    // ── Frame chaining: generate anchor clip + extract boundary frames ──
    if (show.useFrameChaining) {
      await writeToStream(progress, { type: "current", step: "frame-chain" });
      await db.update(schema.generatedShows)
        .set({ status: "framing" })
        .where(eq(schema.generatedShows.id, showId));

      let framingBeat = "A professional late-night talk show set. ";
      if (template.showType === "conversation") {
        framingBeat += "Two hosts sit behind a news desk with a world map graphic behind them. The hosts are having an animated conversation. ";
      } else {
        framingBeat += "A single host behind a desk with a colorful graphic behind them. The host is delivering a monologue. ";
      }
      const framingNotes = template.notes ?
        `Style: ${template.notes}. Studio lighting, professional TV production quality. The host should be animated and expressive.` :
        "Studio lighting, professional TV production quality. The host should be animated and expressive.";

      const framingPrompt = buildVeoPrompt(framingBeat, framingNotes, {
        hasImageRef: Boolean(refImageSlug),
        imageRefIndices: [0],
      });

      console.log("[workflow:frame-chain] Generating anchor framing clip with Gemini Omni 1.1 Flash...");
      const framingResult = await generateVideoClip(framingPrompt, {
        referenceImages: refImageSlug ? [refImageSlug] : undefined,
        durationSeconds: 8,
      });
      tempFilesToClean.push(framingResult.localPath);
      console.log("[workflow:frame-chain] Anchor clip generated:", framingResult.localPath);

      // Extract initial frame (t=0s) and anchor last frame (t=7.5s)
      currentFirstFramePath = await extractFrame(framingResult.localPath, 0);
      anchorLastFramePath = await extractFrame(framingResult.localPath, 7.5);
      tempFilesToClean.push(currentFirstFramePath, anchorLastFramePath);
      console.log("[workflow:frame-chain] Frames extracted — first:", currentFirstFramePath, "last:", anchorLastFramePath);

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
      durationSeconds: seg.durationSeconds ?? 8,
      prompt: formatSegmentPrompt(seg, hosts, template, {
        firstFrame: Boolean(show.useFrameChaining && currentFirstFramePath && i === 0),
        hasImageRef: Boolean(refImageSlug),
        imageRefIndices: [0],
        lastFrame: Boolean(show.useFrameChaining && anchorLastFramePath && i === segments.length - 1),
      }),
      status: "pending" as const,
    }));

    await db.insert(schema.videoClips).values(clipRecords);

    const clips = await db.query.videoClips.findMany({
      where: eq(schema.videoClips.showId, showId),
      orderBy: (vc, { asc }) => [asc(vc.clipIndex)],
    });

    console.log(
      "[workflow:generate-clips] Generating",
      clips.length,
      "clips sequentially...",
      show.useFrameChaining ? "(dynamic rolling frame chaining mode)" : "(reference image / extension mode)",
    );

    let lastInteractionId: string | undefined;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const isLastClip = i === clips.length - 1;
      const segment = segments[clip.clipIndex];

      console.log(
        `[workflow:generate-clips] Starting clip ${clip.clipIndex} (${i + 1}/${clips.length})`,
        lastInteractionId ? `(extending interaction: ${lastInteractionId})` : "(initial turn)",
      );

      await db.update(schema.videoClips)
        .set({ status: "generating" })
        .where(eq(schema.videoClips.id, clip.id));

      const hasFirstFrame = Boolean(show.useFrameChaining && currentFirstFramePath);
      const hasLastFrame = Boolean(show.useFrameChaining && isLastClip && anchorLastFramePath);

      let currentPrompt = formatSegmentPrompt(segment, hosts, template, {
        firstFrame: hasFirstFrame,
        hasImageRef: Boolean(refImageSlug),
        imageRefIndices: [0],
        lastFrame: hasLastFrame,
      });

      let attempts = 0;
      const maxRAIRetries = 2;
      let succeeded = false;

      while (attempts <= maxRAIRetries && !succeeded) {
        try {
          let result: VideoClipResult;
          const clipDuration = segment?.durationSeconds ?? clip.durationSeconds ?? 8;
          const aspectRatio: OmniAspectRatio = "16:9";
          const resolution: OmniResolution = "720p";

          const clipOptions: VideoClipOptions = {
            aspectRatio,
            durationSeconds: clipDuration,
            extend: Boolean(lastInteractionId),
            previousInteractionId: lastInteractionId,
            referenceImages: refImageSlug ? [refImageSlug] : undefined,
            resolution,
          };

          if (hasFirstFrame || hasLastFrame) {
            const interpolatedOptions: VideoClipInterpolatedOptions = {
              ...clipOptions,
              firstFramePath: currentFirstFramePath ?? undefined,
              lastFramePath: hasLastFrame ? anchorLastFramePath ?? undefined : undefined,
            };
            result = await generateVideoClipInterpolated(currentPrompt, interpolatedOptions);
          } else {
            result = await generateVideoClip(currentPrompt, clipOptions);
          }

          tempFilesToClean.push(result.localPath);
          console.log(
            `[workflow:generate-clips] Clip ${clip.clipIndex} ready: ${result.localPath}`,
            result.interactionId ? `(interactionId: ${result.interactionId})` : "",
          );

          // Capture interaction ID for next clip turn extension
          if (result.interactionId) {
            lastInteractionId = result.interactionId;
          }

          // Extract rolling tail frame for next clip i+1
          if (show.useFrameChaining && !isLastClip) {
            const tailTime = Math.max(0, clipDuration - 0.5);
            const nextStartFrame = await extractFrame(result.localPath, tailTime);
            tempFilesToClean.push(nextStartFrame);
            currentFirstFramePath = nextStartFrame;
          }

          await db.update(schema.videoClips)
            .set({ prompt: currentPrompt, status: "ready", videoUrl: result.localPath })
            .where(eq(schema.videoClips.id, clip.id));

          succeeded = true;
          successCount++;
        } catch (err) {
          const isRAI =
            err instanceof OmniRAIFilterError ||
            err instanceof VeoRAIFilterError ||
            (err as any)?.name === "OmniRAIFilterError" ||
            (err as any)?.name === "VeoRAIFilterError";

          if (isRAI && attempts < maxRAIRetries && segment) {
            attempts++;
            const filterReasons = (err as OmniRAIFilterError).reasons ?? [];
            console.warn(
              `[workflow:generate-clips] Clip ${clip.clipIndex} RAI filtered, revising text via Gemini (attempt ${attempts}/${maxRAIRetries})`,
              filterReasons,
            );

            // Autonomous RAI revision using gemini-3.7-flash
            const revisedText = await reviseSegmentText(segment.text, filterReasons);
            console.log(`[workflow:generate-clips] Revised text: ${revisedText}`);

            // Update segment text and sanitize visualPrompt so revised dialogue takes effect
            const updatedSegment: TranscriptSegment = {
              ...segment,
              text: revisedText,
              visualPrompt: segment.visualPrompt ? sanitizeNotesForVeo(segment.visualPrompt) : undefined,
            };
            segments[clip.clipIndex] = updatedSegment;

            // Rebuild prompt with active frame and reference tags
            currentPrompt = formatSegmentPrompt(updatedSegment, hosts, template, {
              firstFrame: hasFirstFrame,
              hasImageRef: Boolean(refImageSlug),
              imageRefIndices: [0],
              lastFrame: hasLastFrame,
            });

            // Update Postgres transcriptSegments
            await db.update(schema.generatedShows)
              .set({ transcriptSegments: segments })
              .where(eq(schema.generatedShows.id, showId));
          } else {
            const message = err instanceof Error ? err.message : "Clip generation failed";
            console.error(`[workflow:generate-clips] Clip ${clip.clipIndex} FAILED:`, message);
            await db.update(schema.videoClips)
              .set({ error: message, status: "failed" })
              .where(eq(schema.videoClips.id, clip.id));
            failCount++;
            break;
          }
        }
      }
    }

    // Update the display transcript if any segments were revised
    const updatedTranscript = segments.map(s => `[${s.speaker}]: ${s.text}`).join("\n\n");
    await db.update(schema.generatedShows)
      .set({ transcript: updatedTranscript, transcriptSegments: segments })
      .where(eq(schema.generatedShows.id, showId));

    if (successCount === 0) {
      throw new Error("All video clips failed to generate");
    }

    if (failCount > 0) {
      console.warn(`${failCount}/${clips.length} clips failed, continuing with ${successCount} available clips`);
    }

    await writeToStream(progress, { step: "generate-clips", type: "completed" });
  } finally {
    // Purge temporary frame PNGs and anchor clip
    const intermediateFiles = tempFilesToClean.filter(p => p.endsWith(".png") || p.includes("framing"));
    if (intermediateFiles.length > 0) {
      try {
        cleanupTempFiles(intermediateFiles);
      } catch (cleanErr) {
        console.warn("[workflow:frame-chain] Error during temp frame cleanup:", cleanErr);
      }
    }
  }
}

/**
 * Uses Gemini 3.7 Flash to revise a segment's spoken text so it avoids
 * triggering Responsible AI (RAI) content filters, while keeping the comedic intent.
 */
async function reviseSegmentText(
  originalText: string,
  filterReasons: string[],
): Promise<string> {
  const { generateText, sanitizeNotesForOmni } = await import("@/app/lib/veo");

  try {
    const prompt = `You are revising a line of dialogue for a talk show script. The line was rejected by a video generation AI because it contained words or references that triggered a content filter.

ORIGINAL LINE:
"${originalText}"

FILTER REASON:
${filterReasons.join("\n")}

Rewrite this line to avoid triggering the filter. Rules:
- Keep the same comedic intent, tone, and approximate length
- Remove or rephrase any celebrity names, real people's names, real institution names, or specific references that could be flagged
- Replace specific names with generic equivalents (e.g., "Harvard" → "an Ivy League school", "Colin" → "the anchor")
- Do NOT add any explanation — output ONLY the revised line, nothing else
- Keep it to roughly the same number of words (20-25 words)`;

    const result = await generateText(prompt, "You are a comedy writer. Output only the revised line.");
    const cleaned = result.replace(/^["']|["']$/g, "").trim();
    return sanitizeNotesForOmni(cleaned);
  } catch (err) {
    console.warn("[workflow:reviseSegmentText] LLM revision failed, falling back to deterministic regex sanitization:", err);
    const { sanitizeForVeoRai } = await import("@/app/lib/dramaturgy/pass3-voice-prune");
    const { sanitizedText } = sanitizeForVeoRai(originalText);
    return sanitizeNotesForOmni(sanitizedText);
  }
}

/**
 * Sanitizes template notes to remove specific show/network names
 * that could trigger celebrity likeness filters in Veo / Gemini Omni.
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
    .replace(/\bSeth Meyers\b/gi, "Seth")
    .replace(/\bphotorealistic identical clone\b/gi, "face-consistent stylized character");
}

/**
 * Extracts the filename slug from a template's referenceImageUrl.
 * "/templates/john-oliver.png" -> "john-oliver"
 */
function referenceImageSlug(referenceImageUrl: string | null): string | null {
  if (!referenceImageUrl)
    return null;
  const filename = referenceImageUrl.split("/").pop();
  if (!filename)
    return null;
  return filename.replace(/\.[^.]+$/, "");
}

/**
 * Formats a video generation prompt for a transcript segment,
 * wrapping the shared buildVeoPrompt engine with frame tags and character conditioning.
 */
function formatSegmentPrompt(
  segment: TranscriptSegment,
  hosts: Array<{ name: string; personality: string; position?: string }>,
  template: { showType?: string | null; notes?: string | null },
  options: {
    firstFrame?: boolean;
    lastFrame?: boolean;
    hasImageRef?: boolean;
    imageRefIndices?: number[];
  },
): string {
  if (segment.visualPrompt && segment.visualPrompt.length >= 10) {
    return buildVeoPrompt(segment.visualPrompt, template.notes ?? "", options);
  }

  const host = hosts.find(h => h.name === segment.speaker) ?? hosts[0] ?? { name: "Host" };
  const showType = template.showType ?? "monologue";

  let beat = "A professional late-night talk show segment. ";
  if (showType === "conversation") {
    beat += "Two hosts sit behind a news desk with a world map graphic behind them. ";
    if (host.position === "left") {
      beat += "The person on the LEFT is speaking and gesturing. ";
    } else if (host.position === "right") {
      beat += "The person on the RIGHT is speaking and gesturing. ";
    }
  } else {
    beat += "A single host behind a desk delivering a monologue, with a colorful graphic behind them. ";
  }

  beat += `The host is saying: "${segment.text ?? ""}"`;
  const styleNotes = template.notes ?
    `Style: ${template.notes}. The host should be animated, expressive, and natural. Studio lighting, professional TV production quality.` :
    "The host should be animated, expressive, and natural. Studio lighting, professional TV production quality.";

  return buildVeoPrompt(beat, styleNotes, options);
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
    .set({ localRenderPath: stitchedPath })
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
  if (!show)
    throw new Error("Show not found");

  // Retrieve stitched path from temporary storage
  const stitchedPath = show.localRenderPath ?? null;

  if (!stitchedPath) {
    throw new Error("Stitched video path not found");
  }

  // NOTE: the stitched path is stashed in `error` and must survive until the
  // upload actually succeeds. Clearing it here meant any retry (e.g. a Mux 400)
  // lost the path and failed permanently with "Stitched video path not found".

  // Upload to Mux via direct upload. If Mux has filled up between the preflight
  // check and now, keep the rendered file on disk and tell the user where it is
  // rather than discarding a completed (and paid-for) render.
  console.log("[workflow:upload] Creating Mux direct upload...");
  let uploadId: string;
  let uploadUrl: string;
  try {
    ({ uploadId, uploadUrl } = await createDirectUpload());
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (/limited to \d+ assets|exceeding this limit/i.test(detail)) {
      const msg = `Mux storage filled up before upload. Your rendered show was kept at: ${stitchedPath} ` +
        "— delete a show from the library to free a slot, then use Retry upload. " +
        "The render is complete, so retrying costs nothing to regenerate.";
      console.error("[workflow:upload] Mux full; preserving local render at", stitchedPath);
      await db.update(schema.generatedShows)
        .set({ status: "failed", error: msg })
        .where(eq(schema.generatedShows.id, showId));
      throw new Error(msg);
    }
    throw error;
  }
  console.log("[workflow:upload] Upload URL created, uploadId:", uploadId);

  // Upload the file
  const fs = await import("node:fs");
  const fileBuffer = fs.readFileSync(stitchedPath);

  const contentType = stitchedPath.endsWith(".wav") ? "audio/wav" : "video/mp4";
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
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

  // Update the show record, clearing the stashed path now that upload succeeded.
  await db.update(schema.generatedShows)
    .set({
      status: "ready",
      // Terminal state: stop storing the visitor's keys.
      encryptedApiKeys: null,
      muxAssetId: assetId,
      muxPlaybackId: playbackId,
      error: null,
      localRenderPath: null,
    })
    .where(eq(schema.generatedShows.id, showId));

  // Clean up stitched file
  const { cleanupTempFiles } = await import("@/app/lib/stitch");
  cleanupTempFiles([stitchedPath]);

  await writeToStream(progress, { type: "completed", step: "upload" });
  await closeStream(progress);
}
