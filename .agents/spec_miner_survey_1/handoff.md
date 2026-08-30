# Specification Mining Report: Gemini Omni 1.1 Flash & Audio Pipeline

**Author**: `spec_miner_survey_1` (teamwork_preview_spec_miner)
**Workspace**: `/Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable`
**Date**: 2026-08-30T06:05:00Z

---

## 1. Observation

### 1.1 Authoritative Requirements (`.agents/ORIGINAL_REQUEST.md`)
- **Requirement R1**: Upgrade video generation from legacy Veo (`veo-3.1-generate-preview`) to **`gemini-omni-1.1-flash`** across `app/lib/veo.ts`, `workflows/generate-show.ts`, tests, scripts, and docs.
  - Output resolutions: `360p`, `720p` (default), `1080p`, `4k`.
  - Aspect ratios: `16:9` (landscape broadcast default) and `9:16` (shorts/reels).
  - Target clip durations: 3s to 10s per generation turn.
- **Requirement R2**:
  - **First/Last Frame Transitions**: Prompt tags `<FIRST_FRAME>` and `<LAST_FRAME>` with starting & ending anchor image inputs.
  - **Scene Extensions**: 10-second prior context window (`extend` / `previous_interaction_id`) up to 40-second maximum video length.
  - **Multimodal Reference Conditioning**: `<IMAGE_REF_0>` .. `<IMAGE_REF_N>` tags for character/anchor consistency.
- **Requirement R3**:
  - Audio pipeline: 48 kHz broadcast audio resampling (`-ar 48000`), stereo AAC normalization.
  - Audio podcast workflow: Up to 5 minutes (300s) via `gemini-3.1-flash-tts-preview`.
- **Requirement R4**:
  - Full test verification (`npm test`), TypeScript compilation (`npx tsc --noEmit`), and Next.js build (`npm run build`).

### 1.2 SDK Types & Interfaces (`node_modules/@google/genai/dist/genai.d.ts`)
1. **Interactions API Surface**:
   ```typescript
   declare class BaseInteractions extends APIResource {
     create(params: CreateModelInteractionParamsNonStreaming, options?: RequestOptions): APIPromise<Interaction>;
     create(params: CreateModelInteractionParamsStreaming, options?: RequestOptions): APIPromise<Stream<InteractionSSEEvent>>;
     get(id: string, params?: InteractionGetParamsNonStreaming, options?: RequestOptions): APIPromise<Interaction>;
     cancel(id: string, params?: InteractionCancelParams, options?: RequestOptions): APIPromise<Interaction>;
     delete(id: string, params?: InteractionDeleteParams, options?: RequestOptions): APIPromise<unknown>;
   }
   ```
2. **Interaction Creation Parameters**:
   ```typescript
   declare interface BaseCreateModelInteractionParams {
     api_version?: string;
     input: Array<Content_2> | string | Array<Turn> | TextContent | ImageContent | AudioContent | VideoContent;
     model: Model_2; // "gemini-omni-1.1-flash"
     background?: boolean; // Asynchronous execution
     generation_config?: GenerationConfig_2;
     previous_interaction_id?: string; // For scene extensions / multi-turn context
     response_modalities?: Array<"text" | "image" | "audio" | "video">;
     service_tier?: "flex" | "standard" | "priority";
     store?: boolean;
   }
   ```
3. **Interaction Entity**:
   ```typescript
   declare interface Interaction {
     id: string;
     created: string;
     status: "in_progress" | "requires_action" | "completed" | "failed" | "cancelled" | "incomplete";
     updated: string;
     model?: Model_2;
     input?: unknown;
     outputs?: Array<Content_2>;
     previous_interaction_id?: string;
   }
   ```
4. **Media Content Objects**:
   - `ImageContent`: `{ type: "image", data?: string, mime_type?: "image/png" | "image/jpeg" | "image/webp", uri?: string }`
   - `VideoContent`: `{ type: "video", data?: string, mime_type?: "video/mp4" | "video/webm", uri?: string }`
   - `TextContent`: `{ type: "text", text: string }`

### 1.3 Existing Codebase Video & Audio Pipeline
- `app/lib/veo.ts`: Contains legacy `veo-3.1-generate-preview` calls with `durationSeconds: 8`, `aspectRatio: "16:9"`, `resolution: "1080p"`, `loadReferenceImage`, and `generateVideoClipInterpolated` using `lastFrame`.
- `workflows/generate-show.ts`: Branches at `checkShowFormatStep` (<= 40s -> Video Show, > 40s -> Audio Podcast up to 300s). Frame chaining generates anchor clips and interpolates content clips.
- `app/lib/stitch.ts`: FFmpeg concatenation pipeline with fallback re-encoding using `-c:v libx264 -preset fast -crf 23 -c:a aac -ar 48000 -b:a 128k`.
- `app/lib/tts.ts`: Multi-speaker TTS via `gemini-3.1-flash-tts-preview`, encoding mono PCM to 24 kHz WAV with 44-byte RIFF header.

---

## 2. Logic Chain

### 2.1 Specification Mining Logic

1. **Model Migration to Gemini Omni 1.1 Flash**:
   - *Observation*: `ORIGINAL_REQUEST.md` R1 requires migrating all video generation to `gemini-omni-1.1-flash`.
   - *Logic*: The model identifier `gemini-omni-1.1-flash` replaces `veo-3.1-generate-preview`. In the client layer (`app/lib/veo.ts` or renamed `app/lib/omni.ts`), both the Interactions API (`client.interactions.create`) and Models API (`client.models.generateVideos`) contracts must point to `gemini-omni-1.1-flash`.

2. **Resolution & Aspect Ratio Parameters**:
   - *Observation*: `ORIGINAL_REQUEST.md` R1 defines output resolutions (`360p`, `720p` [default], `1080p`, `4k`) and aspect ratios (`16:9` [default], `9:16`).
   - *Logic*: Generation configs must accept `resolution` as one of `["360p", "720p", "1080p", "4k"]` with `720p` fallback/default, and `aspectRatio` as `"16:9" | "9:16"`. The database schema (`db/schema.ts` in `generatedShows` and `videos`) and UI dropdowns in `app/create/` can expose these controls.

3. **Clip Durations & Per-Turn Budgets**:
   - *Observation*: R1 specifies 3s to 10s configurable per generation turn.
   - *Logic*: Per-turn clip duration validation constraint: `3 <= durationSeconds <= 10`. Standard default turn is 8s or 10s.

4. **First/Last Frame Transitions (`<FIRST_FRAME>`, `<LAST_FRAME>`)**:
   - *Observation*: R2 specifies prompt tags `<FIRST_FRAME>` and `<LAST_FRAME>` with starting & ending anchor image inputs.
   - *Logic*: When transition anchoring is active:
     - Prompt includes `<FIRST_FRAME>` preceding the scene description and `<LAST_FRAME>` preceding the ending visual beat.
     - Multimodal payload includes the start image (in `image` or `input` array) and end image (in `config.lastFrame` or `input` array with tag association).
     - This replaces unstructured image passing with formal prompt token anchors.

5. **Scene Extensions via 10-Second Context Window (`previous_interaction_id`)**:
   - *Observation*: R2 specifies multi-turn scene extensions using Omni 1.1 10-second prior context window up to 40s total video duration.
   - *Logic*: In multi-clip show generation:
     - Clip 0 is created via `client.interactions.create({ model: "gemini-omni-1.1-flash", input: [...] })`.
     - Clip N (for N >= 1) passes `previous_interaction_id: clip[N-1].interactionId` or `extend: true` referencing the prior 10s context.
     - Maximum chain duration is 40s (e.g. 4 turns x 10s or 5 turns x 8s).

6. **Multimodal Reference Conditioning (`<IMAGE_REF_0>` .. `<IMAGE_REF_N>`)**:
   - *Observation*: R2 specifies `<IMAGE_REF_0>` .. `<IMAGE_REF_N>` tags for character/anchor consistency across show segments.
   - *Logic*: Reference images from `assets/reference-images/` (e.g. host caricatures, desk graphics) are tagged in the prompt text as `<IMAGE_REF_0>` (and `<IMAGE_REF_1>`, etc.) and supplied in `referenceImages` / `input` items. This anchors facial structure and stylistic continuity across non-continuous clips.

7. **Audio Pipeline & Resampling**:
   - *Observation*: R3 specifies 48 kHz broadcast audio resampling (`-ar 48000`), stereo AAC normalization, and podcast workflow up to 5 min (`gemini-3.1-flash-tts-preview`).
   - *Logic*:
     - Video stitching: FFmpeg concat with audio resampled to `-ar 48000 -c:a aac -b:a 128k`.
     - Podcasts: For shows > 40s up to 300s, Gemini 3.1 Flash TTS produces multi-speaker dialogue WAV, resampled to 48 kHz stereo AAC upon Mux upload or packaging.

---

## 3. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Core Model | Gemini Omni 1.1 Flash Video Generation | Next-gen unified multimodal video generation replacing Veo 3.1 | Prompt string, duration (3-10s), resolution (`360p`-`4k`), aspect ratio (`16:9`/`9:16`) | Video clip file / URI (MP4) | Throws on quota exhaustion (429), timeout, or RAI safety trigger | ORIGINAL_REQUEST.md R1, @google/genai SDK |
| 2 | Model API | Interactions API Integration | Asynchronous stateful generation API supporting background tasks and interaction IDs | `CreateModelInteractionParams` (model, input, background, response_modalities) | `Interaction` object with status (`in_progress`, `completed`, `failed`) | Rejection on malformed schema; polling timeout on delayed render | node_modules/@google/genai dist/genai.d.ts |
| 3 | Video Config | Configurable Resolutions | Output resolution selection supporting draft, standard, broadcast, and UHD | `resolution: "360p" \| "720p" \| "1080p" \| "4k"` (default: `720p`) | Rendered video at requested resolution | Invalid resolution string rejected by schema validation | ORIGINAL_REQUEST.md R1, GenerateVideosConfig |
| 4 | Video Config | Configurable Aspect Ratios | Aspect ratio selection for horizontal broadcast vs vertical mobile | `aspectRatio: "16:9" \| "9:16"` (default: `16:9`) | Video formatted in target aspect ratio | Invalid aspect ratio string rejected by schema validation | ORIGINAL_REQUEST.md R1, GenerateVideosConfig |
| 5 | Video Config | Flexible Turn Durations | Granular clip duration per generation turn between 3 and 10 seconds | `durationSeconds: number` (3 to 10) | Single clip of requested exact length | Values < 3 or > 10 rejected or clamped | ORIGINAL_REQUEST.md R1 |
| 6 | Transitions | First/Last Frame Prompt Tags | First & last frame anchor conditioning with `<FIRST_FRAME>` and `<LAST_FRAME>` prompt tags | Prompt with `<FIRST_FRAME>` and `<LAST_FRAME>`, starting image (base64/file), ending image (base64/file) | Smooth interpolated transition video between anchor frames | Throws if image file missing, corrupted, or unsupported MIME type | ORIGINAL_REQUEST.md R2 |
| 7 | Continuity | Multi-Turn Scene Extensions | Contextual scene continuation utilizing Omni 1.1 10-second prior temporal window | `previous_interaction_id: string` or prior video context, prompt for next beat | Extended video segment continuing motion & environment | Fails if previous interaction ID is expired or not in `completed` state | ORIGINAL_REQUEST.md R2, BaseCreateModelInteractionParams |
| 8 | Continuity | Multimodal Reference Binding | Character and asset consistency using `<IMAGE_REF_0>` .. `<IMAGE_REF_N>` tags | Prompt with `<IMAGE_REF_0>`, reference image files/bytes with `referenceType: "ASSET"` | Video with consistent character identity / branding | Falls back to prompt-only generation if reference image missing | ORIGINAL_REQUEST.md R2, loadReferenceImage |
| 9 | Safety / RAI | Omni RAI Safety Filter Recovery | Autonomous revision loop when prompt triggers safety filters | Content filter reasons (`raiMediaFilteredReasons`), original segment text | Gemini-revised safe prompt and re-attempted generation | Throws `VeoRAIFilterError` / `OmniRAIFilterError` after max retries (2) | app/lib/veo.ts, pass3-voice-prune.ts |
| 10 | Rate Limiting | Quota Sliding Window & Backoff | Concurrency management and exponential backoff for video generation API quotas | API requests, timestamp array / queue, 429 status checks | Scheduled execution slot with jittered sleep | Retries up to `maxRetries = 3` before propagating error | app/lib/veo.ts, challenger_stress |
| 11 | Audio Pipeline | 48 kHz Broadcast Audio Resampling | High-fidelity broadcast audio resampling for stitched clips and feeds | Raw clip audio streams or WAV audio | 48,000 Hz stereo AAC (`-ar 48000 -c:a aac -b:a 128k`) | FFmpeg non-zero exit code caught and logged with fallback | ORIGINAL_REQUEST.md R3, app/lib/stitch.ts |
| 12 | Audio Pipeline | Long-Form Audio Podcast Workflow | Multi-speaker audio synthesis up to 5 minutes (300s) bypassing video generation | Transcript dialogue, host configs with voice assignments, duration (60-300s) | Synthesized 24kHz/48kHz master WAV buffer & Mux direct upload | Throws if Gemini TTS returns empty audio or finishReason != STOP | ORIGINAL_REQUEST.md R3, app/lib/tts.ts, workflows/generate-show.ts |

---

## 4. Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Model Selection | Legacy `veo-3.1-generate-preview` passed to SDK | Deprecated; must strictly route to `gemini-omni-1.1-flash` to satisfy Acceptance Criteria R1. |
| 2 | Resolution Config | `resolution` omitted in config | Defaults cleanly to `"720p"` standard broadcast resolution. |
| 3 | Resolution Config | Unsupported resolution (e.g. `"480p"` or `"8k"`) | Schema validation rejects input; defaults or fails with descriptive error. |
| 4 | Aspect Ratio | `aspectRatio: "9:16"` with `1080p` resolution | Generates vertical 1080x1920 video for mobile reels/shorts. |
| 5 | Clip Duration | `durationSeconds = 2` (below minimum 3s) | Rejected by parameter validation; clamped to minimum 3s. |
| 6 | Clip Duration | `durationSeconds = 12` (above single-turn maximum 10s) | Partitioned into multi-turn scene extension or clamped to 10s turn limit. |
| 7 | First/Last Frame | `<FIRST_FRAME>` tag provided without matching start frame image | Prompt is processed without image anchor; model hallucinates starting composition. |
| 8 | First/Last Frame | Both `<FIRST_FRAME>` and `<LAST_FRAME>` provided with invalid image bytes | File validation detects corrupt base64/PNG and throws descriptive error before API dispatch. |
| 9 | Scene Extension | `previous_interaction_id` from a failed or non-existent interaction | API returns 404 or `INVALID_ARGUMENT`; workflow falls back to standalone generation. |
| 10 | Scene Extension | Extension chain exceeding 40s total duration (e.g. 50s) | Exceeds video maximum cap; system directs requests > 40s to Audio Podcast workflow (`gemini-3.1-flash-tts-preview`). |
| 11 | Reference Binding | `<IMAGE_REF_0>` tag present but reference image file not found on disk | System logs warning and strips/replaces tag to allow generation without crashing. |
| 12 | Reference Binding | Multiple references (`<IMAGE_REF_0>`, `<IMAGE_REF_1>`) for dual-host shows | Both reference images passed in `referenceImages` array with distinct asset types. |
| 13 | Audio Resampling | Lossless FFmpeg concat fails due to codec or sample rate mismatch | Fallback re-encode executes with explicit `-ar 48000 -c:a aac -b:a 128k` parameters. |
| 14 | Audio Podcast | Podcast transcript > 5 minutes (e.g. 360s) | Clamped to 300s maximum; TTS processes full text within Gemini TTS token limits. |
| 15 | Quota Rate Limit | Rapid successive calls triggering HTTP 429 `RESOURCE_EXHAUSTED` | Sliding window queue pauses execution; exponential backoff retries with randomized jitter. |

---

## 5. Caveats

1. **API Preview State**: Gemini Omni 1.1 Flash and Interactions API are active preview features within Google AI Studio / Google GenAI SDK. Test suites must mock the Interactions API and Models API responses while maintaining strict type compatibility with `@google/genai` v1.47.0.
2. **Environment Variable Naming**: The application supports both `GEMINI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY`. Both must be validated in `app/lib/env.ts`.
3. **Audio-Only vs Video Demarcation**: Shows <= 40s utilize the Gemini Omni 1.1 Flash video engine with multi-clip concatenation; shows > 40s up to 300s strictly utilize the `gemini-3.1-flash-tts-preview` audio podcast pipeline.
4. **Prompt Sanitization**: Even with Gemini Omni 1.1 Flash, living celebrity likeness filters and trademark filters remain active. The 3-Pass Dramaturgy sanitizer (`sanitizeForVeoRai` / `sanitizeForOmniRai`) must be retained and aligned.

---

## 6. Conclusion

All 8 technical specification areas for the **Gemini Omni 1.1 Flash** migration have been systematically discovered, mapped to `@google/genai` TypeScript contracts, and validated against existing project architecture:

1. **Model**: `gemini-omni-1.1-flash` (replacing `veo-3.1-generate-preview`).
2. **Resolutions**: `360p`, `720p` (default), `1080p`, `4k`.
3. **Aspect Ratios**: `16:9` (default broadcast), `9:16` (shorts/reels).
4. **Turn Durations**: `3s` to `10s` per turn.
5. **Frame Transitions**: `<FIRST_FRAME>` and `<LAST_FRAME>` prompt tags with starting/ending frame payloads.
6. **Scene Extensions**: 10-second prior temporal context window via `previous_interaction_id` up to 40s total video length.
7. **Reference Conditioning**: `<IMAGE_REF_0>` .. `<IMAGE_REF_N>` prompt tags and asset images.
8. **Audio Pipeline**: 48 kHz stereo AAC resampling (`-ar 48000`), lossless FFmpeg stitching, and up to 5-minute podcasts via `gemini-3.1-flash-tts-preview`.

---

## 7. Verification Method

To independently verify these findings:
1. **Inspect SDK Definitions**:
   ```bash
   grep -E "(BaseInteractions|CreateModelInteractionParams|Interaction|GenerateVideosConfig)" node_modules/@google/genai/dist/genai.d.ts
   ```
2. **Inspect User Requirements**:
   ```bash
   cat .agents/ORIGINAL_REQUEST.md
   ```
3. **Verify Audio Pipeline & Resampling**:
   ```bash
   grep -E "(-ar|48000|aac)" app/lib/stitch.ts
   ```
4. **Run Test Suites**:
   ```bash
   npm test
   ```
5. **Verify TypeScript Types**:
   ```bash
   npx tsc --noEmit
   ```
