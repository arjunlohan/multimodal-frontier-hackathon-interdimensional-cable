# Handoff Report: Milestone M1 — Core Video Engine Migration (`app/lib/veo.ts`)

**Agent**: `explorer_m1_1`  
**Milestone**: M1 (Video Engine Core & SDK / Interactions API Migration)  
**Date**: 2026-08-30  
**Handoff Type**: Hard (Investigation Complete)  

---

## 1. Observation

Direct code inspection of the video synthesis infrastructure across the repository revealed the following concrete implementation details, file locations, line numbers, and API interactions:

### 1.1 Current Implementation in `app/lib/veo.ts`
- **Model Identifier**: Hardcoded to `"veo-3.1-generate-preview"` at line 159 (`callVeoOnce`) and line 312 (`callVeoInterpolatedOnce`).
- **Generation Parameters**: Hardcoded to `aspectRatio: "16:9"`, `durationSeconds: 8`, `resolution: "1080p"`, `numberOfVideos: 1` (lines 161–171, 319–328).
- **SDK Interaction**:
  - Initialized via `getClient()` (lines 16–22) creating `new GoogleGenAI({ apiKey })` with `GEMINI_API_KEY ?? GOOGLE_GENERATIVE_AI_API_KEY`.
  - Dispatches requests with `client.models.generateVideos({ model, prompt, image?, config })` (lines 158, 311).
  - Polls asynchronous operation using `client.operations.getVideosOperation({ operation })` with a 10s sleep interval and `MAX_POLLS = 45` (lines 176–187, 332–339).
  - Downloads completed MP4 via `client.files.download({ file: video.video!, downloadPath })` (lines 214, 366).
- **Rate Limiting**:
  - Sliding-window rate limiter enforcing 2 requests per 60 seconds (`VEO_RPM = 2`, `VEO_WINDOW_MS = 60_000`) using `veoCallTimestamps` (lines 28–52).
  - Retries on HTTP 429 / `RESOURCE_EXHAUSTED` with exponential backoff `60_000 * (attempt + 1)` ms up to 3 retries (lines 125–144, 277–297).
- **Error Handling**:
  - Throws `VeoRAIFilterError` with `reasons: string[]` when `raiMediaFilteredCount > 0` (lines 112–119, 198–202, 350–354).
- **Reference Images**:
  - `loadReferenceImage(slug)` reads from `assets/reference-images/<slug>.[png|jpeg|jpg|webp]` and formats as `VideoGenerationReferenceImage` with `VideoGenerationReferenceType.ASSET` (lines 65–97).
- **Function Signatures**:
  - `generateVideoClip(prompt: string, referenceImageSlug?: string): Promise<VideoClipResult>` (lines 227–243).
  - `generateVideoClipInterpolated(prompt: string, firstFramePath: string, lastFramePath: string): Promise<VideoClipResult>` (lines 257–271).
  - `generateText(prompt: string, systemInstruction?: string, useGoogleSearch = false): Promise<string>` using `gemini-3.7-flash` (lines 377–414).

### 1.2 SDK `@google/genai` v1.47.0 Capabilities
Inspection of `node_modules/@google/genai` confirmed:
- `GoogleGenAI` exposes `client.models.generateVideos`, `client.operations.getVideosOperation`, and `client.interactions` (`client.interactions.create`, `client.interactions.get`, `client.interactions.cancel`).
- `GenerateVideosConfig` (in `dist/node/node.d.ts:4784-4841`) supports:
  - `aspectRatio: string` (`"16:9"`, `"9:16"`)
  - `resolution: string` (`"360p"`, `"720p"`, `"1080p"`, `"4k"`)
  - `durationSeconds: number` (`3` to `10`)
  - `referenceImages: VideoGenerationReferenceImage[]`
  - `personGeneration: string` (`"allow_adult"`)
  - `lastFrame: Image_2`
- `BaseCreateModelInteractionParams` supports `previous_interaction_id?: string`, `background?: boolean`, and `model: "gemini-omni-1.1-flash"`.

### 1.3 Caller & Consumer Dependencies
- **`workflows/generate-show.ts`**:
  - Line 363: `const { generateVideoClip, generateVideoClipInterpolated } = await import("@/app/lib/veo");`
  - Line 404: `await generateVideoClip(framingPrompt, refImageSlug ?? undefined);`
  - Line 460: `await generateVideoClipInterpolated(currentPrompt, firstFramePath, lastFramePath);`
  - Line 472: `import("@/app/lib/veo").VeoRAIFilterError` caught in autonomous RAI feedback rewrite loop.
- **`PROJECT.md` Interface Contracts**:
  - `OmniResolution`: `"360p" | "720p" | "1080p" | "4k"`
  - `OmniAspectRatio`: `"16:9" | "9:16"`
  - `VideoClipOptions`: `{ durationSeconds?, aspectRatio?, resolution?, referenceImages?, previousInteractionId?, extend? }`
  - `VideoClipInterpolatedOptions`: `VideoClipOptions & { firstFramePath?, lastFramePath? }`
  - `VideoClipResult`: `{ filePath: string; durationSeconds: number; interactionId?: string; operationName?: string; }`
  - `buildVeoPrompt(beat, visualNotes, options?)`
- **Diagnostic Scripts**:
  - `scripts/test-veo.ts` (lines 7, 59, 67): targets `"veo-3.1-generate-preview"`.
  - `scripts/test-reference-image.ts` (lines 9, 64): targets `"veo-3.1-generate-preview"`.
- **UI & Environment**:
  - `app/create/create-form.tsx` (line 199): "Powered by Google Veo 3.1 video generation".
  - `app/lib/env.ts` (line 35): description mentions "for VEO video generation".

---

## 2. Logic Chain

1. *Model Migration Necessity*: `PROJECT.md` and `ORIGINAL_REQUEST §R1` mandate replacing all legacy Veo references with `gemini-omni-1.1-flash`. In `app/lib/veo.ts`, changing the primary model constant to `GEMINI_OMNI_VIDEO_MODEL = "gemini-omni-1.1-flash"` redirects all video generation calls to Gemini Omni 1.1 Flash.
2. *Flexible Parameter Support*:
   - Default resolution must be `"720p"` (with configurable `"360p"`, `"720p"`, `"1080p"`, `"4k"`).
   - Default aspect ratio must be `"16:9"` (with configurable `"16:9"`, `"9:16"`).
   - Default clip duration must be `8` seconds (configurable between `3` and `10` seconds).
3. *Error Handling & RAI Safety*:
   - Omni 1.1 Flash continues to return RAI filtered counts/reasons via operation response metadata.
   - To maintain 100% backward compatibility with existing tests and workflow catch blocks (`err instanceof VeoRAIFilterError`) while introducing modern typing, export both `OmniRAIFilterError` and `VeoRAIFilterError = OmniRAIFilterError`.
4. *Polymorphic Function Signatures*:
   - The contract in `PROJECT.md` defines `generateVideoClip(prompt, outputPath, options?)` and `generateVideoClipInterpolated(prompt, outputPath, options)`.
   - Existing code/tests call `generateVideoClip(prompt, refSlug)` and `generateVideoClipInterpolated(prompt, firstFramePath, lastFramePath)`.
   - By implementing argument sniffing / overloads:
     - If `outputPath` is omitted or passed as a slug/options, generate a default temp path in `os.tmpdir()/interdimensional-cable/`.
     - Return `{ filePath, durationSeconds, interactionId, operationName, videoUrl: filePath, localPath: filePath }`.
   - This satisfies the PROJECT.md contract while preventing regression across all 271 existing tests and workflows.
5. *First/Last Frame & Reference Conditioning Preparation*:
   - `buildVeoPrompt` will support inserting `<FIRST_FRAME>`, `<LAST_FRAME>`, and `<IMAGE_REF_0>` tags into prompt strings when requested.
   - First/last frame byte buffers and reference image arrays will be mapped directly into the generation payload.

---

## 3. Implementation Blueprint for Milestone M1

### 3.1 Type Definitions (`app/lib/veo.ts`)

```typescript
export type OmniResolution = "360p" | "720p" | "1080p" | "4k";
export type OmniAspectRatio = "16:9" | "9:16";

export interface VideoClipOptions {
  durationSeconds?: number; // 3 to 10, default 8
  aspectRatio?: OmniAspectRatio; // default "16:9"
  resolution?: OmniResolution; // default "720p"
  referenceImages?: string[]; // paths, base64 data, or reference image slugs
  previousInteractionId?: string; // for scene extension
  extend?: boolean;
}

export interface VideoClipInterpolatedOptions extends VideoClipOptions {
  firstFramePath?: string; // Path/data for <FIRST_FRAME>
  lastFramePath?: string; // Path/data for <LAST_FRAME>
}

export interface VideoClipResult {
  filePath: string;
  durationSeconds: number;
  interactionId?: string;
  operationName?: string;
  /** Backwards compatibility alias for filePath */
  localPath: string;
  /** Backwards compatibility alias for remote uri or local filePath */
  videoUrl: string;
}
```

### 3.2 Error Classes (`app/lib/veo.ts`)

```typescript
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
```

### 3.3 Rate Limiter & Polling Setup

```typescript
export const GEMINI_OMNI_VIDEO_MODEL = "gemini-omni-1.1-flash";
export const GEMINI_TEXT_MODEL = "gemini-3.7-flash";

const OMNI_RPM = 2;
const OMNI_WINDOW_MS = 60_000;
const omniCallTimestamps: number[] = [];

export function _resetRateLimiter(): void {
  omniCallTimestamps.length = 0;
}

async function waitForOmniSlot(): Promise<void> {
  const now = Date.now();
  while (omniCallTimestamps.length > 0 && now - omniCallTimestamps[0] > OMNI_WINDOW_MS) {
    omniCallTimestamps.shift();
  }

  if (omniCallTimestamps.length >= OMNI_RPM) {
    const oldestInWindow = omniCallTimestamps[0];
    const waitMs = oldestInWindow + OMNI_WINDOW_MS - now + 1_000;
    console.log(`[omni] Rate limit: ${omniCallTimestamps.length}/${OMNI_RPM} RPM used, waiting ${(waitMs / 1000).toFixed(0)}s...`);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  omniCallTimestamps.push(Date.now());
}
```

### 3.4 Core Function Implementations

#### `generateVideoClip`
```typescript
export async function generateVideoClip(
  prompt: string,
  outputPathOrSlug?: string | VideoClipOptions,
  options?: VideoClipOptions,
): Promise<VideoClipResult> {
  let targetOutputPath: string | undefined;
  let resolvedOptions: VideoClipOptions = {};

  if (typeof outputPathOrSlug === "string") {
    if (outputPathOrSlug.endsWith(".mp4") || outputPathOrSlug.includes("/") || outputPathOrSlug.includes("\\")) {
      targetOutputPath = outputPathOrSlug;
      resolvedOptions = options ?? {};
    } else {
      // Legacy slug invocation: generateVideoClip(prompt, "john-oliver")
      resolvedOptions = {
        referenceImages: [outputPathOrSlug],
        ...(options ?? {}),
      };
    }
  } else if (typeof outputPathOrSlug === "object" && outputPathOrSlug !== null) {
    resolvedOptions = outputPathOrSlug;
  }

  const durationSeconds = Math.min(10, Math.max(3, resolvedOptions.durationSeconds ?? 8));
  const resolution: OmniResolution = resolvedOptions.resolution ?? "720p";
  const aspectRatio: OmniAspectRatio = resolvedOptions.aspectRatio ?? "16:9";

  const client = getClient();
  const refImages = resolveReferenceImages(resolvedOptions.referenceImages);

  const result = await callOmniVideo(client, {
    prompt,
    durationSeconds,
    resolution,
    aspectRatio,
    referenceImages: refImages,
    previousInteractionId: resolvedOptions.previousInteractionId,
    outputPath: targetOutputPath,
  });

  return result;
}
```

#### `generateVideoClipInterpolated`
```typescript
export async function generateVideoClipInterpolated(
  prompt: string,
  outputPathOrFirstFrame: string,
  lastFrameOrOptions: string | VideoClipInterpolatedOptions,
  maybeOptions?: VideoClipInterpolatedOptions,
): Promise<VideoClipResult> {
  let targetOutputPath: string | undefined;
  let firstFramePath: string | undefined;
  let lastFramePath: string | undefined;
  let resolvedOptions: VideoClipInterpolatedOptions = {};

  if (typeof lastFrameOrOptions === "string") {
    // Legacy invocation: generateVideoClipInterpolated(prompt, firstFramePath, lastFramePath)
    firstFramePath = outputPathOrFirstFrame;
    lastFramePath = lastFrameOrOptions;
    resolvedOptions = maybeOptions ?? {};
  } else {
    // Modern contract: generateVideoClipInterpolated(prompt, outputPath, options)
    targetOutputPath = outputPathOrFirstFrame;
    resolvedOptions = lastFrameOrOptions ?? {};
    firstFramePath = resolvedOptions.firstFramePath;
    lastFramePath = resolvedOptions.lastFramePath;
  }

  const durationSeconds = Math.min(10, Math.max(3, resolvedOptions.durationSeconds ?? 8));
  const resolution: OmniResolution = resolvedOptions.resolution ?? "720p";
  const aspectRatio: OmniAspectRatio = resolvedOptions.aspectRatio ?? "16:9";

  const client = getClient();
  const refImages = resolveReferenceImages(resolvedOptions.referenceImages);

  return callOmniVideoInterpolated(client, {
    prompt,
    durationSeconds,
    resolution,
    aspectRatio,
    firstFramePath,
    lastFramePath,
    referenceImages: refImages,
    previousInteractionId: resolvedOptions.previousInteractionId,
    outputPath: targetOutputPath,
  });
}
```

#### `buildVeoPrompt`
```typescript
export function buildVeoPrompt(
  beatOrSegment: string | { speaker?: string; text?: string; visualPrompt?: string },
  visualNotesOrHosts: string | Array<{ name: string; personality: string; position?: string }>,
  optionsOrShowType?: {
    firstFrame?: boolean;
    lastFrame?: boolean;
    hasImageRef?: boolean;
    imageRefIndices?: number[];
  } | string,
  extraNotes = "",
): string {
  // 1. If called with TranscriptSegment & host array (workflows/generate-show.ts mode)
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

  // 2. If called with beat string & visual notes (PROJECT.md contract mode)
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
  let prompt = `${prefix}${beat}. ${visualNotes}`.trim();
  prompt = sanitizeNotesForOmni(prompt);
  return prompt;
}
```

---

## 4. Line-by-Line Migration Plan Across Impacted Files

| File | Target Lines / Entities | Exact Actions |
|---|---|---|
| `app/lib/veo.ts` | Complete file (lines 1–415) | 1. Change model constant to `"gemini-omni-1.1-flash"`.<br>2. Export `OmniResolution`, `OmniAspectRatio`, `VideoClipOptions`, `VideoClipInterpolatedOptions`, `VideoClipResult`.<br>3. Export `OmniRAIFilterError` and `VeoRAIFilterError`.<br>4. Implement resolution (`360p`, `720p`, `1080p`, `4k`), aspect ratio (`16:9`, `9:16`), duration (3s–10s, default 8s).<br>5. Add `buildVeoPrompt` export supporting `<FIRST_FRAME>`, `<LAST_FRAME>`, and `<IMAGE_REF_0>` tags.<br>6. Ensure rate limiter reset and backoff retries remain robust. |
| `app/lib/env.ts` | Line 35 | Update `GEMINI_API_KEY` description: `"Gemini API key for Gemini Omni 1.1 Flash video generation and research/scripting."`. |
| `scripts/test-veo.ts` | Lines 7, 59, 67, 139, 246, 266 | 1. Replace `VEO_VIDEO_MODEL = "veo-3.1-generate-preview"` with `OMNI_VIDEO_MODEL = "gemini-omni-1.1-flash"`.<br>2. Update test logs and headers to "Gemini Omni 1.1 Flash".<br>3. Add resolution (`720p`), duration (`8s`), and aspect ratio (`16:9`) verification. |
| `scripts/test-reference-image.ts` | Lines 9, 64 | Replace model with `"gemini-omni-1.1-flash"` and test reference image conditioning. |
| `app/create/create-form.tsx` | Line 199 | Replace `"Powered by Google Veo 3.1 video generation"` with `"Powered by Google Gemini Omni 1.1 Flash video generation"`. |
| `app/lib/veo.test.ts` | Lines 143, 378, + new tests | 1. Update mock model assertion to `"gemini-omni-1.1-flash"`.<br>2. Update default resolution assertion to `"720p"` (or configurable).<br>3. Add test cases for `OmniResolution` (`360p`, `720p`, `1080p`, `4k`), `OmniAspectRatio` (`16:9`, `9:16`), and duration range (3s–10s).<br>4. Validate `buildVeoPrompt` tag formatting and `OmniRAIFilterError`. |

---

## 5. Verification Method

To independently verify the Milestone M1 strategy and execution:

1. **Run Vitest Test Suite**:
   ```bash
   npm test
   ```
   *Expected Result*: 100% test pass across all suites including `app/lib/veo.test.ts`, `workflows/generate-show.test.ts`, `app/lib/stitch.test.ts`, `app/lib/skills/skills.test.ts`, and `app/lib/e2e-integration.test.ts`.

2. **Run TypeScript Compilation**:
   ```bash
   npx tsc --noEmit
   ```
   *Expected Result*: Exits with code 0 and 0 type errors.

3. **Verify Model Strings in Codebase**:
   ```bash
   grep -rn "gemini-omni-1.1-flash" app/lib/veo.ts scripts/test-veo.ts scripts/test-reference-image.ts
   ```
   *Expected Result*: Matches found in all target files.

4. **Verify No Lingering `veo-3.1-generate-preview` in Runtime Calls**:
   ```bash
   grep -rn "veo-3.1-generate-preview" app/lib/veo.ts scripts/
   ```
   *Expected Result*: 0 matches.

5. **Production Build Validation**:
   ```bash
   npm run build
   ```
   *Expected Result*: Successful compilation with exit code 0.
