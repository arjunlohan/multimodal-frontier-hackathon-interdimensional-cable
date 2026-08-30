# Project: Interdimensional Cable — Gemini Omni 1.1 Flash Migration

## Architecture
Interdimensional Cable is a broadcast visual synthesis platform upgrading from legacy Veo (`veo-3.1-generate-preview`) to **Google Gemini Omni 1.1 Flash** (`gemini-omni-1.1-flash`) via the `@google/genai` SDK and Interactions API.

The architecture comprises 4 core subsystems:
1. **Video Generation Engine (`app/lib/veo.ts`)**: Manages `@google/genai` client, Interactions API, configurable resolutions (`360p`, `720p`, `1080p`, `4k`), aspect ratios (`16:9`, `9:16`), durations (3s–10s), `<FIRST_FRAME>` / `<LAST_FRAME>` transitions, `<IMAGE_REF_0>` multimodal references, scene extensions (up to 40s), and rate-limit backoff.
2. **Dramaturgy & Workflow Orchestration (`workflows/generate-show.ts`, `app/lib/dramaturgy/`)**: Orchestrates research, scriptwriting, format routing ($\le 40$s video vs $> 40$s audio podcast), prompt generation with `<FIRST_FRAME>` / `<LAST_FRAME>` tags, multi-turn clip generation with RAI revision, stitching, and upload.
3. **FFmpeg & Audio Pipeline (`app/lib/stitch.ts`, `app/lib/tts.ts`)**: Lossless concat demuxer with broadcast fallback (`-ar 48000 -c:a aac -b:a 128k`), frame extraction, and multi-speaker TTS (`gemini-3.1-flash-tts-preview`) for podcasts up to 5m (300s).
4. **Testing, Build & Verification Harness (`tests/`, `vitest.config.ts`, `app/lib/*.test.ts`)**: 4-Tier test suite covering all features, zero TypeScript compilation errors (`npx tsc --noEmit`), and clean Next.js 16 production build (`npm run build`).

---

## Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Gemini Omni 1.1 Flash Model Migration | Replace `veo-3.1-generate-preview` with `gemini-omni-1.1-flash` across all runtime calls, helpers, scripts, and docs | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Interactions API Integration | Integrate `@google/genai` Interactions API (`client.interactions.create` / `client.models.generateVideos`) with async polling & background execution | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Configurable Output Resolutions | Support `360p` (draft), `720p` (default standard), `1080p` (broadcast), and `4k` (UHD) | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Configurable Aspect Ratios | Support `16:9` (horizontal broadcast default) and `9:16` (vertical reels/shorts) | M1 | ORIGINAL_REQUEST §R1 |
| 5 | Granular Turn Clip Durations | Support configurable clip durations from 3s to 10s per generation turn (default 8s) | M1 | ORIGINAL_REQUEST §R1 |
| 6 | First/Last Frame Transitions | Implement `<FIRST_FRAME>` and `<LAST_FRAME>` prompt tokens with starting & ending anchor image byte payloads | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Multi-Turn Scene Extensions | Utilize Omni 1.1 10s prior context window (`extend` / `previous_interaction_id`) for continuous extensions up to 40s total video length | M2 | ORIGINAL_REQUEST §R2 |
| 8 | Multimodal Reference Conditioning | Implement `<IMAGE_REF_0>` .. `<IMAGE_REF_N>` prompt tags coupled with `referenceImages` for consistent host character appearance | M2 | ORIGINAL_REQUEST §R2 |
| 9 | Autonomous RAI Filter Revision Loop | Preserve and enhance prompt sanitization & retry loop (`reviseSegmentText` / `sanitizeForOmniRai`) on content safety triggers | M2 | ORIGINAL_REQUEST §R2, survey |
| 10 | 48 kHz Broadcast Audio Resampling | Enforce 48 kHz stereo AAC normalization (`-ar 48000 -c:a aac -b:a 128k`) in FFmpeg concat fallback | M3 | ORIGINAL_REQUEST §R3 |
| 11 | Long-Form Audio Podcast Workflow | Multi-speaker audio synthesis up to 5 minutes (300s) via `gemini-3.1-flash-tts-preview` for shows > 40s | M3 | ORIGINAL_REQUEST §R3 |
| 12 | Opaque-Box E2E Testing Suite | 4-tier requirement-driven test suite with mocks covering all features & boundary conditions (`TEST_READY.md`) | M-E2E | ORIGINAL_REQUEST §R4 |
| 13 | Full Verification, TypeScript & Build | Pass 100% test suite (`npm test`), 0 TypeScript errors (`npx tsc --noEmit`), and successful Next.js build (`npm run build`) | M-FINAL | ORIGINAL_REQUEST §R4 |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Video Engine Core & SDK / Interactions API Migration | Migrate `app/lib/veo.ts`, `app/lib/env.ts`, `scripts/test-veo.ts`, `scripts/test-reference-image.ts`, UI (`app/create/create-form.tsx`), and docs to `gemini-omni-1.1-flash` with resolution, aspect ratio, and turn duration options | None | DONE |
| M2 | Transitions, Extensions & Reference Conditioning | Implement `<FIRST_FRAME>` & `<LAST_FRAME>` prompt tag transitions, multi-turn scene extensions (`previous_interaction_id` up to 40s), and `<IMAGE_REF_0>` reference binding in `workflows/generate-show.ts` and prompt builders | M1 | IN_PROGRESS |
| M3 | Audio Pipeline & FFmpeg Broadcast Normalization | Maintain and verify 48 kHz stereo AAC normalization (`-ar 48000`) in `app/lib/stitch.ts`, `app/lib/tts.ts`, and 5m podcast workflow | M1 | PLANNED |
| M-E2E | E2E Testing Track & Test Infrastructure | Design `TEST_INFRA.md`, publish `TEST_READY.md`, update all test mocks/fixtures in `app/lib/veo.test.ts`, `workflows/generate-show.test.ts`, `workflows/workflow-media-challenger.test.ts`, `app/lib/stitch.test.ts`, `app/lib/e2e-integration.test.ts`, `app/lib/m3-m4-challenger.test.ts` | None (parallel) | IN_PROGRESS |
| M-FINAL | 100% Test Pass, TypeScript & Next.js Production Build | Phase 1: Verify 100% test pass (`npm test`), 0 TypeScript errors (`npx tsc --noEmit`), and clean Next.js build (`npm run build`). Phase 2: Adversarial coverage hardening | M1, M2, M3, M-E2E | PLANNED |

---

## Interface Contracts

### 1. Video Engine (`app/lib/veo.ts`) ↔ Workflows (`workflows/generate-show.ts`)
```typescript
export type OmniResolution = "360p" | "720p" | "1080p" | "4k";
export type OmniAspectRatio = "16:9" | "9:16";

export interface VideoClipOptions {
  durationSeconds?: number; // 3 to 10, default 8
  aspectRatio?: OmniAspectRatio; // default "16:9"
  resolution?: OmniResolution; // default "720p"
  referenceImages?: string[]; // paths or base64 data for <IMAGE_REF_0>..
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
}

export function generateVideoClip(
  prompt: string,
  outputPath: string,
  options?: VideoClipOptions
): Promise<VideoClipResult>;

export function generateVideoClipInterpolated(
  prompt: string,
  outputPath: string,
  options: VideoClipInterpolatedOptions
): Promise<VideoClipResult>;

export function buildVeoPrompt(
  beat: string,
  visualNotes: string,
  options?: {
    firstFrame?: boolean;
    lastFrame?: boolean;
    hasImageRef?: boolean;
    imageRefIndices?: number[];
  }
): string;
```

### 2. Audio & Media Pipeline (`app/lib/stitch.ts`, `app/lib/tts.ts`)
```typescript
export interface StitchOptions {
  targetAudioSampleRate?: number; // 48000 (default)
  targetAudioCodec?: string; // "aac"
  targetAudioBitrate?: string; // "128k"
  aspectRatio?: OmniAspectRatio;
  resolution?: OmniResolution;
}

export function stitchClips(
  clipPaths: string[],
  outputPath: string,
  options?: StitchOptions
): Promise<string>;

export function extractFrame(
  videoPath: string,
  timeSeconds: number,
  outputPath: string
): Promise<string>;
```

---

## Code Layout

- `app/lib/veo.ts` — Core Gemini Omni 1.1 Flash client, Interactions API, rate limiting, and clip generation.
- `app/lib/stitch.ts` — FFmpeg media concatenation demuxer, 48 kHz broadcast audio resampling, and frame extraction.
- `app/lib/tts.ts` — Multi-speaker TTS (`gemini-3.1-flash-tts-preview`), 24 kHz WAV encoding, and translation.
- `workflows/generate-show.ts` — Vercel Workflow: format routing ($\le 40$s video vs $> 40$s podcast), frame chaining, prompt construction (`<FIRST_FRAME>`, `<LAST_FRAME>`, `<IMAGE_REF_0>`), scene extensions, stitching, and upload.
- `app/create/create-form.tsx` — UI form updated with Gemini Omni 1.1 Flash branding, resolution & aspect ratio selectors.
- `scripts/test-veo.ts`, `scripts/test-reference-image.ts` — Diagnostic CLI scripts for Gemini Omni 1.1 Flash.
- `tests/` & `app/lib/*.test.ts` — Test suites and Vitest configuration.
