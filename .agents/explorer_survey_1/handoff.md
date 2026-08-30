# Survey Report: Video Generation Pipeline Migration to Gemini Omni 1.1 Flash

## 1. Observation

Direct codebase inspection and pattern matching across the repository reveal the following components, files, functions, and endpoints involved in video generation and visual synthesis:

### 1.1 File & Function Inventory

| File Path | Key Functions / Entities | Current Implementation / Role | Lines |
| :--- | :--- | :--- | :--- |
| `app/lib/veo.ts` | `getClient()`, `waitForVeoSlot()`, `_resetRateLimiter()`, `loadReferenceImage()`, `VideoClipResult`, `VeoRAIFilterError`, `callVeo()`, `callVeoOnce()`, `generateVideoClip()`, `generateVideoClipInterpolated()`, `callVeoInterpolated()`, `callVeoInterpolatedOnce()`, `generateText()` | Core Google GenAI video generation client; uses model `"veo-3.1-generate-preview"`, 2 RPM rate limiting sliding window (`VEO_RPM = 2`, `VEO_WINDOW_MS = 60_000`), long-polling up to 45 attempts (`getVideosOperation`), `VideoGenerationReferenceType.ASSET`, base64 image encoding, `generateText` with `gemini-3.7-flash` and Google Search Grounding. | 1–415 |
| `workflows/generate-show.ts` | `generateShowWorkflow()`, `checkShowFormatStep()`, `researchStep()`, `scriptStep()`, `audioPodcastSynthesisStep()`, `frameChainAndGenerateClipsStep()`, `reviseSegmentText()`, `sanitizeNotesForVeo()`, `referenceImageSlug()`, `buildVeoPrompt()`, `stitchStep()`, `uploadStep()` | Vercel durable workflow orchestrating 5-step show production. Routes duration $\le 40$s to video pipeline and $> 40$s to audio podcast (`gemini-3.1-flash-tts-preview`). Manages anchor clip generation, frame extraction, clip generation loop with `VeoRAIFilterError` catch and Gemini dialogue rewrite (`reviseSegmentText`), stitching, and Mux direct upload. | 1–773 |
| `app/lib/stitch.ts` | `stitchClips()`, `generateOutputPath()`, `extractFrame()`, `cleanupTempFiles()` | FFmpeg media utility. Provides lossless concat demuxer with fallback re-encoding (`-c:v libx264 -preset fast -crf 23 -c:a aac -ar 48000 -b:a 128k`) maintaining 48 kHz broadcast audio, frame extraction at arbitrary timestamps (`-ss <time> -frames:v 1 -f image2`), and temp file cleanup. | 1–155 |
| `db/schema.ts` | `generatedShows`, `videoClips`, `showTemplates`, `videos`, `videoChunks`, `userMemories`, `showTangents` | Postgres schema via Drizzle. `generatedShows` holds `durationSeconds`, `useFrameChaining`, `status`, `transcriptSegments`. `videoClips` holds `clipIndex`, `durationSeconds`, `prompt`, `videoUrl`, `status`. `showTemplates` holds `referenceImageUrl`, `hosts`, `notes`, `showType`. | 1–237 |
| `app/api/workflows/generate-show/route.ts` | `POST(request)`, `GET(request)` | Next.js API route. Checks IP rate limits (`checkRateLimit`), initiates `start(generateShowWorkflow, [showId])`, returns `runId`, and polls workflow run status via `getRun(runId)`. | 1–109 |
| `app/create/actions.ts` | `getTemplatesAction()`, `createShowAction()` | Server actions. Validates show inputs (`templateId`, `topic`, `topicType`, `durationSeconds`, `familiarity`), creates DB record in `generatedShows`, and triggers background workflow POST. | 1–123 |
| `app/create/[showId]/actions.ts` | `getShowWithTemplateAction()`, `pollShowStatusAction()` | Server actions for client-side show status polling and playback resolution. | 1–74 |
| `app/create/create-form.tsx` | `CreateForm` component | Multi-step client form (Template -> Topic -> Configure -> Review). Contains video vs audio format toggle, duration selector, familiarity selector, and frame chaining toggle. Mentions "Powered by Google Veo 3.1 video generation". | 1–436 |
| `app/create/duration-selector.tsx` & `constants.ts` | `DurationSelector`, `VIDEO_DURATION_OPTIONS`, `AUDIO_PODCAST_DURATION_OPTIONS` | Duration choices: Video `[8, 16, 24, 32, 40]` seconds vs Audio `[60, 120, 180, 240, 300]` seconds. | 1–30 |
| `app/create/[showId]/generation-progress.tsx` & `constants.ts` | `GenerationProgress`, `GENERATION_STEPS`, `TVLoading` | Client UI polling pipeline progress through `research` -> `script` -> `frame-chain` -> `generate-clips` -> `stitch` -> `upload`. | 1–170 |
| `app/lib/dramaturgy/pass2-head-writer.ts` | `runPass2HeadWriter()`, `synthesizeDeterministicDeskDraft()`, `synthesizeDeterministicPodcastDraft()` | Generates comedic beats and visual prompts for video conditioning. Mentions Veo visual prompts. | 1–518 |
| `app/lib/dramaturgy/pass3-voice-prune.ts` | `sanitizeForVeoRai()`, `enforceProfanityRegister()`, `evaluateAndPunchUpJokes()`, `runPass3VoiceAndPrune()` | Pre-flight safety sanitizer replacing studio trademarks (HBO, NBC, SNL, Last Week Tonight), celebrity names, and biometric clone prompts. Generates `VeoRaiSanitizationReport`. | 1–432 |
| `app/lib/dramaturgy/schemas.ts` & `types.ts` | `VeoRaiSanitizationReportSchema`, `FinalScriptSchema`, `VeoRaiSanitizationReport`, `FinalScript` | Type definitions and Zod schemas for sanitization report and final script segments. | — |
| `app/lib/env.ts` | `EnvSchema`, `env` | Validates environment variables (`GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `DATABASE_URL`, `MUX_TOKEN_ID`, etc.). | 1–91 |
| `scripts/test-veo.ts` | `testApiKey()`, `testGeminiText()`, `testVeoVideo()`, `testVeoWithReferenceImage()`, `testGoogleSearchGrounding()` | Diagnostic connectivity test script verifying API keys, text generation (`gemini-3-flash-preview`), video generation (`veo-3.1-generate-preview`), reference images, and search grounding. | 1–286 |
| `scripts/test-reference-image.ts` | `main()` | Reference image loading and video generation test script with `veo-3.1-generate-preview`. | 1–133 |
| `scripts/autonomous-trend-agent.ts` | `fetchHackerNewsTopStories()`, `runAutonomousIngestionAgent()` | Autonomous ingestion agent creating shows with `durationSeconds: 16` and triggering `generateShowWorkflow`. | 1–189 |
| `README.md`, `CLAUDE.md`, `PROJECT.md` | Architecture docs, tables, and scripts | Project documentation referencing Google Veo 3.1, `@google/genai`, and Mux integration. | — |
| `package.json` | Dependencies and scripts | Includes `@google/genai: ^1.47.0`, `"test:veo": "tsx scripts/test-veo.ts"`. | 1–72 |

---

### 1.2 Test Suite Inventory

| Test File | Total Tests | Video Engine Interaction Points |
| :--- | :--- | :--- |
| `app/lib/veo.test.ts` | 9 | Mocks `@google/genai` (`generateVideos`, `getVideosOperation`, `download`); tests standard clip generation, polling timeouts (MAX_POLLS 45), RAI error handling (`VeoRAIFilterError`), reference image loading (`VideoGenerationReferenceType.ASSET`), 429 exponential backoff, interpolated generation (`lastFrame`), and 2 RPM sliding window rate limiter. |
| `workflows/generate-show.test.ts` | 11 | Tests `buildVeoPrompt`, `sanitizeNotesForVeo`, and `parseScriptJson`. |
| `workflows/workflow-media-challenger.test.ts` | 17 | Tests duration branching ($\le 40$s vs $> 40$s), 3-pass progress emission, Gemini TTS transcript formatting, Veo 3.1 media interface compatibility (8s clips, prompt length, sanitization, word budget 14–30), and skill resolution. |
| `app/lib/stitch.test.ts` | 4 | Tests single clip direct copy, multi-clip lossless concat, 48 kHz broadcast audio fallback re-encoding (`-ar 48000`), frame extraction at boundary timestamps (`extractFrame` at 0s and 7.5s), and temp file cleanup. |
| `app/lib/e2e-integration.test.ts` | 27 | Comprehensive E2E test verifying 40s duration cap, `buildVeoPrompt`, `VeoRAIFilterError`, `sanitizeForVeoRai`, rate limiter reset, and full dramaturgy pipeline. |
| `app/lib/m3-m4-challenger.test.ts` | 32 | Stress tests 48 kHz normalization flags, frame extraction, rate limits, and memory bank. |
| `app/lib/dramaturgy/dramaturgy.test.ts` | 23 | Tests 3-pass pipeline, `sanitizeForVeoRai`, and visual prompt generation. |
| `app/lib/dramaturgy/challenger.test.ts` | 57 | Tests desk vs podcast budgets, 40s clip counts (5 clips), and Veo RAI sanitization suite. |

All 271 current tests pass (`npm test`) and TypeScript compiles with 0 errors (`npx tsc --noEmit`).

---

## 2. Logic Chain

1. **Model Identifier Migration**:
   - **Observation**: The codebase currently targets `"veo-3.1-generate-preview"` in `app/lib/veo.ts` (lines 159, 312), `scripts/test-veo.ts` (line 7), `scripts/test-reference-image.ts` (line 9), and tests (`app/lib/veo.test.ts`).
   - **Inference**: All video generation calls must be updated to target **`gemini-omni-1.1-flash`** via the `@google/genai` Interactions API / video generation interfaces.

2. **Resolution & Aspect Ratio Configuration**:
   - **Observation**: `app/lib/veo.ts` hardcodes `aspectRatio: "16:9"` and `resolution: "1080p"`.
   - **Requirement**: Native support is needed for:
     - Resolutions: `360p` (draft), `720p` (default), `1080p` (broadcast), `4k` / `4K` (UHD).
     - Aspect ratios: `16:9` (landscape default) and `9:16` (shorts/reels).
     - Target clip durations: configurable between `3s` and `10s` (default 8s).
   - **Inference**: Video generation interfaces and options should accept resolution, aspect ratio, and duration parameters, defaulting to `720p`, `16:9`, and 8s respectively.

3. **First & Last Frame Transitions (`<FIRST_FRAME>`, `<LAST_FRAME>`)**:
   - **Observation**: `app/lib/veo.ts` currently uses Veo's image and `lastFrame` config parameters.
   - **Requirement**: Gemini Omni 1.1 Flash utilizes native `<FIRST_FRAME>` and `<LAST_FRAME>` tags within the prompt combined with image references to condition transitions seamlessly without jump cuts.
   - **Inference**: Prompt construction and payload preparation must format `<FIRST_FRAME>` and `<LAST_FRAME>` tokens and bind the corresponding image payloads.

4. **Multi-Turn Scene Extensions (up to 40s)**:
   - **Observation**: `workflows/generate-show.ts` currently generates clips independently or via frame chaining anchor extraction.
   - **Requirement**: Omni 1.1 Flash supports a 10-second prior context window for continuous scene extensions (`extend` / `previous_interaction_id` / multi-turn interaction chaining) up to 40 seconds.
   - **Inference**: The engine should support scene extension calls linking subsequent turns to prior interaction IDs/contexts while respecting the 40s duration ceiling.

5. **Reference Asset Binding (`<IMAGE_REF_N>`)**:
   - **Observation**: `app/lib/veo.ts` uses `VideoGenerationReferenceType.ASSET` array with raw base64 images.
   - **Requirement**: Omni 1.1 Flash supports multimodal reference conditioning via `<IMAGE_REF_0>` (and `<IMAGE_REF_N>`) prompt tags and reference image inputs.
   - **Inference**: Reference images (e.g., from `assets/reference-images/` or template URLs) should be bound as `<IMAGE_REF_0>` to guarantee character appearance consistency.

6. **Broadcast Audio & FFmpeg Stitching**:
   - **Observation**: `app/lib/stitch.ts` already enforces `-ar 48000` broadcast audio resampling and stereo AAC (`-c:a aac -b:a 128k`) during fallback re-encoding.
   - **Inference**: This must be preserved, and stitch operations must support all output resolutions (`360p`, `720p`, `1080p`, `4k`) and aspect ratios (`16:9`, `9:16`).

---

## 3. Caveats

1. **Module Architecture & Naming**:
   - `app/lib/veo.ts` is the centralized video client. Upstream workflows (`workflows/generate-show.ts`) and tests import from `@/app/lib/veo`. To prevent breakage across existing imports while modernizing, `app/lib/veo.ts` can either be retained as the engine implementation or aliased/re-exported with full backwards compatibility for imported symbols (`generateVideoClip`, `generateVideoClipInterpolated`, `VeoRAIFilterError`, etc.) while powering the underlying engine with `gemini-omni-1.1-flash`.
2. **Mocking in Vitest**:
   - Test suites (`app/lib/veo.test.ts`, `workflows/generate-show.test.ts`, `workflows/workflow-media-challenger.test.ts`, `app/lib/e2e-integration.test.ts`) mock `@google/genai` or internal helper functions. Updating model IDs and parameters requires matching updates across test fixtures and mocks to maintain 100% test pass rate.
3. **Database Schema Flexibility**:
   - `db/schema.ts` has `generatedShows` with `useFrameChaining` and `durationSeconds`. New parameters (such as `resolution` and `aspectRatio`) can be passed via generation options or persisted in `generatedShows` metadata without breaking existing DB schema contracts.

---

## 4. Conclusion & Actionable Mapping

The migration from legacy Veo to Google Gemini Omni 1.1 Flash spans four clear operational areas:

### 4.1 Core Video Generation Engine (`app/lib/veo.ts`)
- **Model**: Replace `"veo-3.1-generate-preview"` with `"gemini-omni-1.1-flash"`.
- **Interactions API & Parameters**:
  - Support `resolution`: `"360p" | "720p" | "1080p" | "4k"`, default `"720p"`.
  - Support `aspectRatio`: `"16:9" | "9:16"`, default `"16:9"`.
  - Support `durationSeconds`: configurable `3` to `10` seconds, default `8`.
  - Prompt conditioning: Add support for `<FIRST_FRAME>`, `<LAST_FRAME>`, and `<IMAGE_REF_0>`.
  - Scene extension support: Add multi-turn / interaction continuation (`previousInteractionId` / `extend`).
  - Retain exponential backoff for 429 rate limiting and robust polling/completion logic.

### 4.2 Workflow Orchestration (`workflows/generate-show.ts`)
- Update prompt builder `buildVeoPrompt` to support `<FIRST_FRAME>`, `<LAST_FRAME>`, and `<IMAGE_REF_0>` prompt formatting tags.
- Update `frameChainAndGenerateClipsStep` to utilize Gemini Omni 1.1 Flash first/last frame transition tags and scene extensions up to 40s.
- Maintain dual-branch routing ($\le 40$s video show vs $> 40$s audio podcast via Gemini 3.1 Flash TTS).
- Retain RAI feedback revision loop (`reviseSegmentText`).

### 4.3 FFmpeg Stitching & Media Pipeline (`app/lib/stitch.ts`)
- Maintain 48 kHz broadcast audio resampling (`-ar 48000`) and stereo AAC normalization.
- Ensure seamless concat across clips produced at varying resolutions (`360p`, `720p`, `1080p`, `4k`) and aspect ratios.

### 4.4 Diagnostics, UI, Docs & Test Suites
- Update scripts: `scripts/test-veo.ts` and `scripts/test-reference-image.ts` to test `gemini-omni-1.1-flash`.
- Update `package.json` test scripts and environment descriptions in `app/lib/env.ts`.
- Update `app/create/create-form.tsx` UI copy from Veo 3.1 to Gemini Omni 1.1 Flash.
- Update all test suites (`app/lib/veo.test.ts`, `workflows/generate-show.test.ts`, `workflows/workflow-media-challenger.test.ts`, `app/lib/e2e-integration.test.ts`, `app/lib/m3-m4-challenger.test.ts`, `app/lib/dramaturgy/*.test.ts`) to validate Omni 1.1 Flash model calls, parameter payloads, mock responses, and error handling.
- Update `README.md` and documentation tables.

---

## 5. Verification Method

To independently verify this survey and future migration implementation:

1. **Unit & Integration Test Suite**:
   ```bash
   npm test
   ```
   Must pass all test files (including `veo.test.ts`, `generate-show.test.ts`, `workflow-media-challenger.test.ts`, `stitch.test.ts`, `e2e-integration.test.ts`).

2. **TypeScript Compilation Check**:
   ```bash
   npx tsc --noEmit
   ```
   Must exit with code 0 and 0 type errors.

3. **Next.js Production Build**:
   ```bash
   npm run build
   ```
   Must compile all routes successfully.

4. **Invalidation Conditions**:
   - Any residual reference to `veo-3.1-generate-preview` in runtime SDK calls.
   - Any failure in frame transition interpolation using `<FIRST_FRAME>` and `<LAST_FRAME>`.
   - Any failure to support scene extensions up to 40s or resolutions `360p`/`720p`/`1080p`/`4k`.
   - Audio resampling deviating from 48 kHz broadcast standard (`-ar 48000`).
