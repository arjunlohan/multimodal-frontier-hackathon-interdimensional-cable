# Master Test Infrastructure Specification (TEST_INFRA.md)
**Project**: Interdimensional Cable — Gemini Omni 1.1 Flash Migration  
**Document Version**: 1.0.0  
**Author**: test_writer_e2e_1  
**Status**: ACTIVE  
**Last Updated**: 2026-08-29  

---

## 1. Executive Summary & Purpose

This document defines the comprehensive master test infrastructure, test architecture, mocking strategies, and 4-tier test catalogue for **Interdimensional Cable**'s visual synthesis and media orchestration engine. The system is upgraded from legacy Veo (`veo-3.1-generate-preview`) to **Google Gemini Omni 1.1 Flash** (`gemini-omni-1.1-flash`) via the `@google/genai` SDK and Interactions API.

### Core Objectives
1. **Opaque-Box Requirement Verification**: Validate all system requirements derived from `PROJECT.md` and `ORIGINAL_REQUEST.md` against authoritative oracles (SDK contracts, schema invariants, RFC specifications, mathematical boundaries).
2. **Zero Regressions & Determinism**: Ensure 100% deterministic test execution across unit, workflow step, challenger, and end-to-end integration test suites without external API dependencies.
3. **4-Tier Testing Methodology**:
   - **Tier 1 (Feature Coverage)**: $\ge 5$ tests per feature for all 13 features ($\ge 65$ tests).
   - **Tier 2 (Boundary & Corner Cases)**: $\ge 5$ boundary/edge tests per feature ($\ge 65$ tests).
   - **Tier 3 (Cross-Feature Combinations)**: 10 pairwise and multi-system integration scenarios.
   - **Tier 4 (Real-World Application Scenarios)**: 4 full end-to-end production show scenarios (Desk Show, Audio Podcast, Vertical Reels, 40s Continuous Scene Extension Chain).
4. **Strict Verification Gates**: Guarantee 0 TypeScript compiler errors (`npx tsc --noEmit`), clean Next.js 16 production build (`npm run build`), and full test execution (`npm test`).

---

## 2. Test Architecture & Directory Layout

### 2.1 Test Framework Configuration
The testing harness is built on **Vitest 4.1+** running in a Node.js environment with native TypeScript 5 support and path alias `@/` mapping to the repository root.

```
├── vitest.config.ts                     # Vitest runner configuration (globals: true, env: node)
├── package.json                         # Scripts: "test": "vitest run", "test:watch": "vitest"
├── app/lib/
│   ├── veo.ts                           # Gemini Omni 1.1 Flash Client & Interactions API
│   ├── veo.test.ts                      # Video engine unit & mocking suite
│   ├── stitch.ts                        # FFmpeg concat demuxer & 48 kHz broadcast audio
│   ├── stitch.test.ts                   # Media concat, frame extraction, and fallback tests
│   ├── tts.ts                           # Multi-speaker TTS & WAV encoding
│   ├── tts.test.ts                      # TTS voice mapping, PCM encoding, translation tests
│   ├── memory-bank.ts                   # Persistent user cognitive memory & pgvector RAG
│   ├── memory-bank.test.ts              # Memory decay, boost, procedural format tests
│   ├── dramaturgy/                      # 3-Pass Dramaturgy & Head Writer Engine
│   │   ├── dramaturgy.test.ts           # Dramaturgy pipeline unit tests
│   │   └── challenger.test.ts           # Adversarial stress tests for dramaturgy
│   ├── skills/                          # Show skills & persona guardrails
│   │   ├── skills.test.ts               # Skill registry & legal safety tests
│   │   └── challenger.test.ts           # Adversarial skill validation tests
│   ├── e2e-integration.test.ts          # Master 4-tier E2E integration test suite
│   └── m3-m4-challenger.test.ts         # Media engine & memory bank challenger suite
└── workflows/
    ├── generate-show.ts                 # Main Vercel Workflow for show generation
    ├── generate-show.test.ts            # Workflow pure helpers and prompt builder tests
    └── workflow-media-challenger.test.ts# Format routing, frame chaining & prompt challenger
```

### 2.2 Test Isolation & Lifecycle Guarantees
1. **Per-Test State Reset**: Every test module registers `beforeEach` and `afterEach` hooks to:
   - Reset all Vitest mock functions (`mockReset()`).
   - Clear the video engine rate-limiter timestamp sliding window (`_resetRateLimiter()`).
   - Clean up mock database in-memory collections (`mockDbMemories`, `mockDbChatMessages`, `mockDbTangents`).
2. **Filesystem Sandbox**: All file creation tests use isolated OS temporary directories (`os.tmpdir()/interdimensional-cable/` or unique timestamped subdirectories) with cleanup handlers (`cleanupTempFiles()`, `fs.rmSync(..., { recursive: true, force: true })`).
3. **Deterministic Timestamps & Tokens**: Dynamic values (UUIDs, timestamps, file hashes) are validated using structural regex matchers rather than hardcoded equality.

---

## 3. Mocking Strategy for Gemini Omni 1.1 Flash (`@google/genai`)

### 3.1 GoogleGenAI Client Mock
All interactions with `@google/genai` are mocked at the module boundary using `vi.mock("@google/genai")`.

```typescript
import { vi } from "vitest";

export const mockGenerateContent = vi.fn();
export const mockGenerateVideos = vi.fn();
export const mockGetVideosOperation = vi.fn();
export const mockDownload = vi.fn();

vi.mock("@google/genai", () => {
  class MockGoogleGenAI {
    models = {
      generateContent: mockGenerateContent,
      generateVideos: mockGenerateVideos,
    };
    operations = {
      getVideosOperation: mockGetVideosOperation,
    };
    files = {
      download: mockDownload,
    };
  }
  return {
    GoogleGenAI: MockGoogleGenAI,
    ThinkingLevel: { HIGH: "HIGH", LOW: "LOW", MEDIUM: "MEDIUM", MINIMAL: "MINIMAL" },
    VideoGenerationReferenceType: { ASSET: "ASSET", STYLE: "STYLE" },
  };
});
```

### 3.2 Mocking Omni 1.1 Operations Polling State Machine
Video generation via Gemini Omni 1.1 Flash is an asynchronous polling operation. The test harness simulates three primary operation lifecycles:

#### 1. In-Progress to Success Lifecycle
```typescript
// Initial submission
mockGenerateVideos.mockResolvedValueOnce({
  name: "operations/omni-op-12345",
  done: false,
});

// Polling turns: Pending -> Completed
mockGetVideosOperation
  .mockResolvedValueOnce({ name: "operations/omni-op-12345", done: false })
  .mockResolvedValueOnce({
    name: "operations/omni-op-12345",
    done: true,
    response: {
      generatedVideos: [{
        video: { uri: "https://genai.googleapis.com/v1/files/omni-video-001" },
      }],
      raiMediaFilteredCount: 0,
      raiMediaFilteredReasons: [],
    },
  });

mockDownload.mockImplementationOnce(async ({ downloadPath }) => {
  fs.writeFileSync(downloadPath, Buffer.from("MOCK_MP4_BINARY_DATA"));
});
```

#### 2. RAI Safety Filter Trigger Lifecycle
```typescript
mockGenerateVideos.mockResolvedValueOnce({ done: true, name: "operations/op-rai" });
mockGetVideosOperation.mockResolvedValueOnce({
  done: true,
  response: {
    generatedVideos: [],
    raiMediaFilteredCount: 1,
    raiMediaFilteredReasons: ["Content safety trigger: policy violation on sensitive terms"],
  },
});
```

#### 3. Rate Limit (429 / RESOURCE_EXHAUSTED) Exponential Backoff Lifecycle
```typescript
mockGenerateVideos
  .mockRejectedValueOnce(new Error("429 RESOURCE_EXHAUSTED: Rate limit exceeded"))
  .mockResolvedValueOnce({
    done: true,
    response: {
      generatedVideos: [{ video: { uri: "https://genai.googleapis.com/v1/files/retry-success" } }],
    },
  });
```

### 3.3 Media Engine & FFmpeg Mocking
FFmpeg calls are mocked via `vi.mock("node:child_process")` to verify exact command-line arguments without requiring native FFmpeg binaries in headless CI:
- **Lossless Concat Demuxer**: `ffmpeg -y -f concat -safe 0 -i concat-list.txt -c copy output.mp4`
- **Fallback Re-encode (48 kHz Stereo AAC)**: `ffmpeg -y -f concat -safe 0 -i concat-list.txt -c:v libx264 -preset fast -crf 23 -c:a aac -ar 48000 -b:a 128k output.mp4`
- **Frame Extraction**: `ffmpeg -y -ss <timeSeconds> -i input.mp4 -vframes 1 -q:v 2 output.png`

---

## 4. Authoritative Expected Output Derivation Methodology

For every test case across Tiers 1 through 4, expected outputs are derived from authoritative specifications:
1. **Model & API Schema**: `@google/genai` v1.47+ TypeScript interfaces and Omni 1.1 Flash parameter specifications.
2. **Audio & Media Norms**: Broadcast Audio Standard (AES/EBU, EBU R128) $\to$ 48,000 Hz, 16-bit stereo AAC at 128 kbps. WAV format specifications $\to$ 44-byte RIFF header, 24,000 Hz 16-bit mono PCM.
3. **Format Duration Thresholds**: Duration $\le 40$s routes to Gemini Omni 1.1 Flash video pipeline; Duration $> 40$s (up to 300s) routes to Gemini 3.1 Flash TTS podcast workflow.
4. **Prompt Token Syntax**: `<FIRST_FRAME>`, `<LAST_FRAME>`, `<IMAGE_REF_0>` .. `<IMAGE_REF_N>`.
5. **Deterministic Variance Matching**: Unpredictable hashes and file paths are verified via regular expressions (`/^clip-\d+-[a-z0-9]+\.mp4$/`).

---

## 5. Tier 1: Comprehensive Feature Coverage

*Specification Requirement: $\ge 5$ explicit tests per feature for all 13 features in PROJECT.md ($\ge 65$ tests total).*

### Feature 1: Gemini Omni 1.1 Flash Model Migration
*Target: `app/lib/veo.ts`, `app/lib/env.ts`, `workflows/generate-show.ts`*

| Test ID | Test Name | Input / Preconditions | Expected Output / Contract Assertion | Authoritative Source |
|---|---|---|---|---|
| **T1.F1.1** | Default model parameter verification | `generateVideoClip("A news host", "john-oliver")` | `client.models.generateVideos` called with `model: "gemini-omni-1.1-flash"`, never `veo-3.1-generate-preview`. | ORIGINAL_REQUEST §R1 |
| **T1.F1.2** | Interpolated model parameter verification | `generateVideoClipInterpolated("Transition prompt", frameA, frameB)` | `client.models.generateVideos` called with `model: "gemini-omni-1.1-flash"`. | ORIGINAL_REQUEST §R1, §R2 |
| **T1.F1.3** | Text generation model verification | `generateText("Research prompt", "System instruction")` | `client.models.generateContent` called with `model: "gemini-3.7-flash"`. | PROJECT.md § Architecture |
| **T1.F1.4** | Global codebase deprecation check | Full codebase regex search | Zero instances of string `"veo-3.1-generate-preview"` in runtime modules. | ORIGINAL_REQUEST § Acceptance Criteria |
| **T1.F1.5** | Environment variable fallback for Gemini client | `GEMINI_API_KEY = ""` and `GOOGLE_GENERATIVE_AI_API_KEY = "key-backup"` | `GoogleGenAI` initialized with `{ apiKey: "key-backup" }`. | `app/lib/env.ts` schema |

### Feature 2: Interactions API Integration
*Target: `app/lib/veo.ts`*

| Test ID | Test Name | Input / Preconditions | Expected Output / Contract Assertion | Authoritative Source |
|---|---|---|---|---|
| **T1.F2.1** | Async operation polling resolution | Mock operation `done: false` $\to$ `done: true` with video URI | Function polls `getVideosOperation` until `done === true` and returns `{ videoUrl, localPath }`. | `@google/genai` Operations API |
| **T1.F2.2** | Max poll timeout enforcement | Operation never marks `done: true` across 46 consecutive polls | Throws Error matching `/timed out after 45 polling attempts/`. | `app/lib/veo.ts` MAX_POLLS invariant |
| **T1.F2.3** | File download execution | Completed video response with `video.uri` | Calls `client.files.download({ file, downloadPath })` and creates valid file on disk. | `@google/genai` Files API |
| **T1.F2.4** | Server error payload handling | Operation completes with `operation.error = { code: 500, message: "Internal failure" }` | Throws Error containing `Video generation failed: {"code":500...}`. | Interactions API Error Spec |
| **T1.F2.5** | Empty video response handling | Operation completes with `generatedVideos: []` and no RAI error | Throws Error: `"Video generation completed but no videos returned"`. | `app/lib/veo.ts` invariant |

### Feature 3: Configurable Output Resolutions
*Target: `app/lib/veo.ts`, `PROJECT.md § Interface Contracts`*

| Test ID | Test Name | Input / Preconditions | Expected Output / Contract Assertion | Authoritative Source |
|---|---|---|---|---|
| **T1.F3.1** | Draft resolution 360p | `generateVideoClip(prompt, { resolution: "360p" })` | `config.resolution === "360p"` in `generateVideos` payload. | PROJECT.md § Feature 3 |
| **T1.F3.2** | Standard default resolution 720p | `generateVideoClip(prompt)` (no resolution option specified) | `config.resolution === "720p"` (or default configured resolution). | PROJECT.md § Feature 3 |
| **T1.F3.3** | Broadcast resolution 1080p | `generateVideoClip(prompt, { resolution: "1080p" })` | `config.resolution === "1080p"` in `generateVideos` payload. | PROJECT.md § Feature 3 |
| **T1.F3.4** | Ultra HD resolution 4K | `generateVideoClip(prompt, { resolution: "4k" })` | `config.resolution === "4k"` in `generateVideos` payload. | PROJECT.md § Feature 3 |
| **T1.F3.5** | Resolution preservation in interpolation mode | `generateVideoClipInterpolated(prompt, fA, fB, { resolution: "1080p" })` | `config.resolution === "1080p"` passed in interpolation config. | PROJECT.md § Interface Contracts |

### Feature 4: Configurable Aspect Ratios
*Target: `app/lib/veo.ts`, `PROJECT.md § Interface Contracts`*

| Test ID | Test Name | Input / Preconditions | Expected Output / Contract Assertion | Authoritative Source |
|---|---|---|---|---|
| **T1.F4.1** | Default 16:9 widescreen landscape | `generateVideoClip(prompt)` | `config.aspectRatio === "16:9"` in `generateVideos` payload. | ORIGINAL_REQUEST §R1 |
| **T1.F4.2** | Vertical 9:16 reels/shorts | `generateVideoClip(prompt, { aspectRatio: "9:16" })` | `config.aspectRatio === "9:16"` in `generateVideos` payload. | ORIGINAL_REQUEST §R1 |
| **T1.F4.3** | Vertical 9:16 in interpolation mode | `generateVideoClipInterpolated(prompt, fA, fB, { aspectRatio: "9:16" })` | `config.aspectRatio === "9:16"` in `generateVideos` payload. | PROJECT.md § Feature 4 |
| **T1.F4.4** | 16:9 prompt style formatting | `buildVeoPrompt(segment, hosts, "monologue", notes)` | Monologue prompt contains desk and background graphics formatted for 16:9. | `workflows/generate-show.ts` |
| **T1.F4.5** | 9:16 vertical formatting prompt styling | Monologue prompt requested with vertical format option | Visual prompt specifies vertical framing for mobile delivery. | `workflows/generate-show.ts` |

### Feature 5: Granular Turn Clip Durations
*Target: `app/lib/veo.ts`, `workflows/generate-show.ts`*

| Test ID | Test Name | Input / Preconditions | Expected Output / Contract Assertion | Authoritative Source |
|---|---|---|---|---|
| **T1.F5.1** | Minimum allowed duration 3s | `generateVideoClip(prompt, { durationSeconds: 3 })` | `config.durationSeconds === 3` in `generateVideos` payload. | ORIGINAL_REQUEST §R1 |
| **T1.F5.2** | Maximum single-turn duration 10s | `generateVideoClip(prompt, { durationSeconds: 10 })` | `config.durationSeconds === 10` in `generateVideos` payload. | ORIGINAL_REQUEST §R1 |
| **T1.F5.3** | Intermediate granular duration 5s | `generateVideoClip(prompt, { durationSeconds: 5 })` | `config.durationSeconds === 5` in `generateVideos` payload. | ORIGINAL_REQUEST §R1 |
| **T1.F5.4** | Default clip duration 8s | `generateVideoClip(prompt)` | `config.durationSeconds === 8` in `generateVideos` payload. | `app/lib/veo.ts` default |
| **T1.F5.5** | Interpolation duration parameter | `generateVideoClipInterpolated(prompt, fA, fB, { durationSeconds: 6 })` | `config.durationSeconds === 6` in `generateVideos` payload. | PROJECT.md § Feature 5 |

### Feature 6: First/Last Frame Transitions
*Target: `app/lib/veo.ts`, `workflows/generate-show.ts`*

| Test ID | Test Name | Input / Preconditions | Expected Output / Contract Assertion | Authoritative Source |
|---|---|---|---|---|
| **T1.F6.1** | First/Last frame prompt tags injection | `buildVeoPrompt(beat, notes, { firstFrame: true, lastFrame: true })` | Prompt contains `<FIRST_FRAME>` and `<LAST_FRAME>` tags. | ORIGINAL_REQUEST §R2 |
| **T1.F6.2** | First frame payload base64 binding | Valid PNG file at `firstFramePath` passed to `generateVideoClipInterpolated` | `payload.image.imageBytes === base64(firstFrame)` with `mimeType: "image/png"`. | `@google/genai` Video Gen Spec |
| **T1.F6.3** | Last frame payload base64 binding | Valid PNG file at `lastFramePath` passed to `generateVideoClipInterpolated` | `config.lastFrame.imageBytes === base64(lastFrame)` with `mimeType: "image/png"`. | `@google/genai` Video Gen Spec |
| **T1.F6.4** | Sequential frame chaining between clips | Clip 1 generated $\to$ Frame extracted at 8.0s $\to$ Clip 2 generated with frame | Clip 2 uses extracted frame from Clip 1 as its starting anchor. | `workflows/generate-show.ts` |
| **T1.F6.5** | Person generation allowance in interpolation | `generateVideoClipInterpolated(...)` called | `config.personGeneration === "allow_adult"` in payload. | `app/lib/veo.ts` invariant |

### Feature 7: Multi-Turn Scene Extensions
*Target: `app/lib/veo.ts`, `workflows/generate-show.ts`*

| Test ID | Test Name | Input / Preconditions | Expected Output / Contract Assertion | Authoritative Source |
|---|---|---|---|---|
| **T1.F7.1** | Single-turn extension parameter | `generateVideoClip(prompt, { previousInteractionId: "int-turn-1", extend: true })` | `generateVideos` payload contains `previous_interaction_id: "int-turn-1"` and extension config. | ORIGINAL_REQUEST §R2 |
| **T1.F7.2** | 2-Turn extension chaining (20s total) | Turn 1 (10s, ID `int-1`) $\to$ Turn 2 (`extend: true`, ID `int-1`, 10s) | Turn 2 receives ID `int-1` and returns ID `int-2`. | ORIGINAL_REQUEST §R2 |
| **T1.F7.3** | 3-Turn extension chaining (30s total) | Turn 2 (`int-2`) $\to$ Turn 3 (`extend: true`, ID `int-2`, 10s) | Turn 3 receives ID `int-2` and returns ID `int-3`. | ORIGINAL_REQUEST §R2 |
| **T1.F7.4** | 4-Turn extension reaching 40s ceiling | Turn 3 (`int-3`) $\to$ Turn 4 (`extend: true`, ID `int-3`, 10s) | Turn 4 succeeds; total duration equals 40 seconds. | ORIGINAL_REQUEST §R2 |
| **T1.F7.5** | Extension operation ID extraction | API returns `{ name: "operations/ext-op-99", interactionId: "int-99" }` | `VideoClipResult.interactionId === "int-99"`. | PROJECT.md § Interface Contracts |

### Feature 8: Multimodal Reference Conditioning
*Target: `app/lib/veo.ts`, `workflows/generate-show.ts`*

| Test ID | Test Name | Input / Preconditions | Expected Output / Contract Assertion | Authoritative Source |
|---|---|---|---|---|
| **T1.F8.1** | Reference tag prompt injection | `buildVeoPrompt(beat, notes, { hasImageRef: true, imageRefIndices: [0] })` | Prompt contains `<IMAGE_REF_0>` anchor tag. | ORIGINAL_REQUEST §R2 |
| **T1.F8.2** | Single reference image loading by slug | Slug `"john-oliver"` with existing `assets/reference-images/john-oliver.png` | `referenceImages[0].referenceType === "ASSET"` and contains valid base64 payload. | `app/lib/veo.ts` |
| **T1.F8.3** | Multi-reference image loading (`<IMAGE_REF_0>`, `<IMAGE_REF_1>`) | Two reference paths passed in `options.referenceImages` | Payload contains 2 reference image objects with distinct base64 buffers. | ORIGINAL_REQUEST §R2 |
| **T1.F8.4** | Format support for JPEG/WebP references | Reference image with `.jpg` or `.webp` extension | `mimeType` correctly inferred as `"image/jpeg"` or `"image/webp"`. | `app/lib/veo.ts` loader |
| **T1.F8.5** | Person generation config with reference images | `generateVideoClip(prompt, { referenceImages: ["img1"] })` | `config.personGeneration === "allow_adult"`. | `app/lib/veo.ts` invariant |

### Feature 9: Autonomous RAI Filter Revision Loop
*Target: `app/lib/veo.ts`, `app/lib/dramaturgy/pass3-voice-prune.ts`*

| Test ID | Test Name | Input / Preconditions | Expected Output / Contract Assertion | Authoritative Source |
|---|---|---|---|---|
| **T1.F9.1** | VeoRAIFilterError thrown on filter detection | Operation response `raiMediaFilteredCount: 1`, `raiMediaFilteredReasons: ["Policy violation"]` | Throws instance of `VeoRAIFilterError` with `reasons` array populated. | `app/lib/veo.ts` |
| **T1.F9.2** | Sensitive brand name sanitization | Prompt containing `"HBO"`, `"NBC"`, `"SNL"`, `"Last Week Tonight"` | Sanitized prompt converts terms to `"premium cable"`, `"broadcast network"`, `"sketch comedy show"`. | `workflows/generate-show.ts` |
| **T1.F9.3** | Host trademark name sanitization | Notes containing `"Colin Jost"`, `"Michael Che"`, `"John Oliver"` | Sanitized to first names only (`"Colin"`, `"Michael"`, `"John"`). | `workflows/generate-show.ts` |
| **T1.F9.4** | Autonomous revision retry on RAI failure | Generation fails with `VeoRAIFilterError` $\to$ prompt is sanitized and retried | Second attempt succeeds with revised prompt. | `workflows/generate-show.ts` |
| **T1.F9.5** | Profanity and policy register scrubbing | Script with aggressive/profane terms | `enforceProfanityRegister` scrubs words to PG-13 satire equivalents. | `app/lib/dramaturgy/` |

### Feature 10: 48 kHz Broadcast Audio Resampling
*Target: `app/lib/stitch.ts`*

| Test ID | Test Name | Input / Preconditions | Expected Output / Contract Assertion | Authoritative Source |
|---|---|---|---|---|
| **T1.F10.1** | FFmpeg fallback audio sample rate flag | Codec mismatch triggers FFmpeg fallback re-encode | Command arguments contain `"-ar", "48000"`. | ORIGINAL_REQUEST §R3 |
| **T1.F10.2** | FFmpeg fallback audio codec flag | Codec mismatch triggers FFmpeg fallback re-encode | Command arguments contain `"-c:a", "aac"`. | ORIGINAL_REQUEST §R3 |
| **T1.F10.3** | FFmpeg fallback audio bitrate flag | Codec mismatch triggers FFmpeg fallback re-encode | Command arguments contain `"-b:a", "128k"`. | ORIGINAL_REQUEST §R3 |
| **T1.F10.4** | Lossless concat bypass for matching codecs | 2 valid clips with identical codecs and 48 kHz audio | Concat demuxer runs `-c copy` without re-encoding. | `app/lib/stitch.ts` |
| **T1.F10.5** | Single clip passthrough | `stitchClips(["clip1.mp4"], "dest.mp4")` | Directly copies file without invoking FFmpeg. | `app/lib/stitch.ts` |

### Feature 11: Long-Form Audio Podcast Workflow
*Target: `workflows/generate-show.ts`, `app/lib/tts.ts`*

| Test ID | Test Name | Input / Preconditions | Expected Output / Contract Assertion | Authoritative Source |
|---|---|---|---|---|
| **T1.F11.1** | Duration threshold routing ($\le 40$s $\to$ Video) | Show duration = 32 seconds | `checkShowFormat(32)` returns `{ isAudioPodcast: false }`. | ORIGINAL_REQUEST §R3 |
| **T1.F11.2** | Duration threshold routing ($> 40$s $\to$ Podcast) | Show duration = 120 seconds | `checkShowFormat(120)` returns `{ isAudioPodcast: true }`. | ORIGINAL_REQUEST §R3 |
| **T1.F11.3** | Model call for podcast TTS | Podcast synthesis step executed | Calls `client.models.generateContent` with `model: "gemini-3.7-flash"` and audio output config. | `app/lib/tts.ts` |
| **T1.F11.4** | 24 kHz mono PCM to WAV encoding | 2400 bytes raw PCM buffer | `encodePcmToWav` returns 2444-byte buffer with valid RIFF/WAVE 44-byte header. | `app/lib/tts.ts` |
| **T1.F11.5** | Multi-speaker voice assignment | Dual hosts `"John Oliver"` and `"Seth Meyers"` | Assigned voices `"Charon"` and `"Orus"`. | `app/lib/tts.ts` |

### Feature 12: Opaque-Box E2E Testing Suite
*Target: `app/lib/e2e-integration.test.ts`, `app/lib/m3-m4-challenger.test.ts`*

| Test ID | Test Name | Input / Preconditions | Expected Output / Contract Assertion | Authoritative Source |
|---|---|---|---|---|
| **T1.F12.1** | 4-Tier test suite execution | `npm test` executed via Vitest runner | All test suites discoverable, loaded, and passing. | ORIGINAL_REQUEST §R4 |
| **T1.F12.2** | Zero unmocked external network calls | Full test run executed with network disconnected | 100% test pass rate with zero socket connection errors. | Isolation Policy |
| **T1.F12.3** | Schema validation across all mock payloads | Mock responses parsed through Zod schemas | All schemas (`FinalScriptSchema`, `DramaturgyResultSchema`) validate cleanly. | `app/lib/dramaturgy/` |
| **T1.F12.4** | Vitest configuration verification | `vitest.config.ts` inspected | Configures `globals: true`, `environment: "node"`, and `@/` path alias. | `vitest.config.ts` |
| **T1.F12.5** | Test execution time performance | Full test suite execution | Total execution duration $< 5$ seconds in local runner. | Performance Benchmark |

### Feature 13: Full Verification, TypeScript & Build
*Target: Entire codebase, `tsconfig.json`, `next.config.ts`*

| Test ID | Test Name | Input / Preconditions | Expected Output / Contract Assertion | Authoritative Source |
|---|---|---|---|---|
| **T1.F13.1** | TypeScript compilation check | `npx tsc --noEmit` command | Process exits with code `0` and zero error diagnostics. | ORIGINAL_REQUEST §R4 |
| **T1.F13.2** | Next.js production build | `npm run build` command | Next.js 16 build succeeds across all static and dynamic routes. | ORIGINAL_REQUEST §R4 |
| **T1.F13.3** | ESLint compliance check | `npx eslint .` command | Zero errors or unpermitted warnings. | AGENTS.md Code Style |
| **T1.F13.4** | Import order perfectionist rule | Codebase files inspected | Blank lines between import groups; `@/` and package imports correctly partitioned. | AGENTS.md Imports |
| **T1.F13.5** | Environment variable access enforcement | Codebase inspected for `process.env` usage | All access routed via `@/app/lib/env` singleton. | AGENTS.md Env Rules |

---

## 6. Tier 2: Boundary & Corner Cases

*Specification Requirement: $\ge 5$ explicit boundary/corner tests per feature for all 13 features ($\ge 65$ tests total).*

### Boundary 1: Model Migration Boundary Cases
| Test ID | Test Name | Input / Boundary Condition | Expected Output / Handling Behavior |
|---|---|---|---|
| **T2.B1.1** | Legacy model string rejection | Invoking video generation with legacy string `"veo-3.1-generate-preview"` | Engine throws descriptive deprecation error directing to `"gemini-omni-1.1-flash"`. |
| **T2.B1.2** | Model string case sensitivity | Invoking with `"GEMINI-OMNI-1.1-FLASH"` or `"Gemini-Omni-1.1-Flash"` | Coerced to lowercase canonical `"gemini-omni-1.1-flash"`. |
| **T2.B1.3** | Missing API credentials | `GEMINI_API_KEY = ""` and `GOOGLE_GENERATIVE_AI_API_KEY = ""` | Throws `"GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY is required for video generation"`. |
| **T2.B1.4** | Malformed API Key string | API key containing whitespace or invalid control characters | Trimmed or throws clean authentication error before network dispatch. |
| **T2.B1.5** | Concurrent client initialization | Multiple simultaneous calls to `generateVideoClip` | Reuses singleton/per-call client safely without race conditions. |

### Boundary 2: Interactions API Boundary Cases
| Test ID | Test Name | Input / Boundary Condition | Expected Output / Handling Behavior |
|---|---|---|---|
| **T2.B2.1** | Rate limit (429) backoff ceiling | 4 consecutive 429 `RESOURCE_EXHAUSTED` responses exceeding maxRetries (3) | Backs off 60s, 120s, 180s, then throws final rate limit error without infinite loop. |
| **T2.B2.2** | Operation polling timeout boundary | Operation remains `done: false` through attempt 45, completes on attempt 46 | Throws timeout error at attempt 45 (450 seconds maximum wait). |
| **T2.B2.3** | Corrupted download payload | `client.files.download` writes 0-byte file | Throws verification error: zero-byte output file detected. |
| **T2.B2.4** | Missing video URI in response | `operation.response.generatedVideos = [{ video: {} }]` | Throws error: video URI not found in response payload. |
| **T2.B2.5** | Aborted workflow signal | Caller cancels workflow during async polling loop | Polling loop breaks immediately and cleans up temporary resources. |

### Boundary 3: Resolution Boundary Cases
| Test ID | Test Name | Input / Boundary Condition | Expected Output / Handling Behavior |
|---|---|---|---|
| **T2.B3.1** | Invalid resolution string input | Options passed with `{ resolution: "8k" as any }` | Fallback to default `"720p"` or throws schema validation error. |
| **T2.B3.2** | Null/undefined resolution option | Options passed with `{ resolution: undefined }` | Defaults to `"720p"`. |
| **T2.B3.3** | 4K UHD extreme resource allocation | 4K generation with 10s duration | Validates payload parameters and verifies larger memory buffers allocated. |
| **T2.B3.4** | 360p draft lowest resolution | 360p generation with 3s duration | Fast-path execution with minimal payload overhead. |
| **T2.B3.5** | Mixed resolution stitch attempt | Stitching 360p clip and 4K clip together | FFmpeg fallback triggers, scaling all inputs to master target resolution. |

### Boundary 4: Aspect Ratio Boundary Cases
| Test ID | Test Name | Input / Boundary Condition | Expected Output / Handling Behavior |
|---|---|---|---|
| **T2.B4.1** | Unsupported aspect ratio (e.g. `"4:3"`, `"1:1"`) | Options passed with `{ aspectRatio: "4:3" as any }` | Coerced to `"16:9"` or rejected with validation error. |
| **T2.B4.2** | Vertical 9:16 frame dimension bounds | 9:16 vertical video stitched with horizontal 16:9 | FFmpeg fallback pads/crops with letterboxing to match target format. |
| **T2.B4.3** | Prompt-aspect ratio alignment | Monologue prompt built for 9:16 vertical format | Prompt builder avoids wide multi-host desk descriptions. |
| **T2.B4.4** | Empty string aspect ratio | Options passed with `{ aspectRatio: "" as any }` | Defaults to `"16:9"`. |
| **T2.B4.5** | Case-insensitive aspect ratio parsing | Options passed with `"16:9"` vs `"16:9 "` (trailing space) | Trimmed and parsed to `"16:9"`. |

### Boundary 5: Granular Turn Clip Duration Boundary Cases
| Test ID | Test Name | Input / Boundary Condition | Expected Output / Handling Behavior |
|---|---|---|---|
| **T2.B5.1** | Sub-minimum duration ($< 3$s, e.g. 1s or 2s) | `options = { durationSeconds: 1 }` | Clamped to minimum `3s` or rejected with validation error. |
| **T2.B5.2** | Exceeding maximum turn duration ($> 10$s, e.g. 15s) | `options = { durationSeconds: 15 }` | Clamped to maximum single-turn limit `10s`. |
| **T2.B5.3** | Zero or negative duration (0s, -5s) | `options = { durationSeconds: 0 }` | Clamped to default `8s` or rejected with validation error. |
| **T2.B5.4** | Non-integer fractional duration (e.g. 7.35s) | `options = { durationSeconds: 7.35 }` | Rounded or accepted if supported by API. |
| **T2.B5.5** | Exact boundary durations (3s and 10s) | Consecutive calls at exact boundaries `3` and `10` | Payload passed accurately without off-by-one errors. |

### Boundary 6: First/Last Frame Transition Boundary Cases
| Test ID | Test Name | Input / Boundary Condition | Expected Output / Handling Behavior |
|---|---|---|---|
| **T2.B6.1** | Non-existent first frame file path | `firstFramePath = "/tmp/missing-frame-001.png"` | Throws file not found error before API invocation. |
| **T2.B6.2** | 0-byte first or last frame file | `lastFramePath` points to empty 0-byte file | Throws invalid image buffer error before API invocation. |
| **T2.B6.3** | Corrupted image header in frame | File contains invalid header bytes (not PNG/JPEG) | Throws invalid mime-type / decode error. |
| **T2.B6.4** | Single frame provided (first frame only) | `firstFramePath` provided but `lastFramePath` omitted | Generates start-frame-conditioned video without last-frame interpolation. |
| **T2.B6.5** | Frame extraction timestamp out of bounds | `extractFrame(videoPath, 999.0, outPath)` (past video EOF) | FFmpeg clamps to final video frame without crash. |

### Boundary 7: Multi-Turn Scene Extension Boundary Cases
| Test ID | Test Name | Input / Boundary Condition | Expected Output / Handling Behavior |
|---|---|---|---|
| **T2.B7.1** | Invalid previous interaction ID string | `previousInteractionId = "invalid-uuid-format"` | Throws API validation error or falls back to fresh seed generation. |
| **T2.B7.2** | Expired interaction context window | Interaction ID older than server retention limit | Error caught, logs context expiration, and gracefully starts new segment. |
| **T2.B7.3** | Extension beyond 40s maximum limit | Attempting 5th 10s extension (50s cumulative) | Workflow clamps extension chain at 40s and routes remaining to next beat. |
| **T2.B7.4** | Empty previous interaction ID in extend mode | `extend: true, previousInteractionId: ""` | Ignores `extend: true` and generates initial seed clip. |
| **T2.B7.5** | Mid-chain extension failure recovery | Turn 3 of 4 fails with network error | Retries turn 3 using Turn 2's interaction ID without restarting from Turn 1. |

### Boundary 8: Multimodal Reference Conditioning Boundary Cases
| Test ID | Test Name | Input / Boundary Condition | Expected Output / Handling Behavior |
|---|---|---|---|
| **T2.B8.1** | Missing reference image slug | Slug `"unknown-celebrity-slug"` not in `assets/reference-images/` | Logs warning, proceeds with text-only prompt without crashing. |
| **T2.B8.2** | Empty reference image array | `options.referenceImages = []` | Omits `referenceImages` block from `generateVideos` config. |
| **T2.B8.3** | Exceeding reference image capacity | Array with $> 5$ reference images | Clamps to supported maximum references or warns. |
| **T2.B8.4** | Malformed prompt reference tag | Prompt contains `<IMAGE_REF_99>` without corresponding image | Sanitized or mapped to nearest available reference index. |
| **T2.B8.5** | Oversized reference image file ($> 10$ MB) | Reference image buffer exceeds 10 MB | Downscaled or compressed to meet API byte limits. |

### Boundary 9: Autonomous RAI Filter Boundary Cases
| Test ID | Test Name | Input / Boundary Condition | Expected Output / Handling Behavior |
|---|---|---|---|
| **T2.B9.1** | Multi-round RAI retry exhaustion | Prompt triggers RAI across 3 consecutive sanitized revisions | Throws fatal `VeoRAIFilterError` and marks workflow step as failed with reasons. |
| **T2.B9.2** | Empty RAI reasons array from API | `raiMediaFilteredCount: 1`, `raiMediaFilteredReasons: []` | Fallback reason string: `"Content filter triggered (no details provided)"`. |
| **T2.B9.3** | Prompt containing combined sensitive terms | Prompt contains 10+ broadcast trademark and political entity names | All terms replaced simultaneously in a single regex pass. |
| **T2.B9.4** | Parody legal disclaimer preservation | Extreme satire prompt requiring legal disclaimer | `generateSatiricalDisclaimer` appends non-infringement notice. |
| **T2.B9.5** | Unicode and zero-width character obfuscation | Prompt containing hidden zero-width characters in sensitive words | Sanitization strips zero-width chars before filter matching. |

### Boundary 10: 48 kHz Audio Pipeline Boundary Cases
| Test ID | Test Name | Input / Boundary Condition | Expected Output / Handling Behavior |
|---|---|---|---|
| **T2.B10.1** | 0 clips passed to stitcher | `stitchClips([], outputPath)` | Throws Error: `"No clips to stitch"`. |
| **T2.B10.2** | Non-standard source audio sample rates (e.g. 8 kHz, 22.05 kHz, 96 kHz) | Input clips have differing sample rates | FFmpeg re-encodes all audio tracks to exactly 48,000 Hz stereo AAC. |
| **T2.B10.3** | Clip with missing audio stream (video-only) | Input clip contains video track but no audio track | FFmpeg generates silent audio track at 48 kHz to maintain A/V sync. |
| **T2.B10.4** | Special characters in file paths | File path contains spaces, quotes, and single quotes (`clip '1' #2.mp4`) | File path escaped properly in concat list (`file 'clip '\''1'\'' #2.mp4'`). |
| **T2.B10.5** | FFmpeg process timeout | FFmpeg hangs for $> 300$s during large re-encode | Process killed via timeout and throws descriptive timeout error. |

### Boundary 11: Long-Form Audio Podcast Boundary Cases
| Test ID | Test Name | Input / Boundary Condition | Expected Output / Handling Behavior |
|---|---|---|---|
| **T2.B11.1** | Podcast duration at absolute maximum 300s (5m) | Show duration = 300 seconds | Synthesizes full multi-speaker podcast script within token limits. |
| **T2.B11.2** | Podcast duration exceeding maximum ($> 300$s) | Show duration = 450 seconds | Clamped to 300s maximum or warns user. |
| **T2.B11.3** | Single-speaker podcast monologue | Podcast format requested with only 1 host | Synthesizes using single assigned voice without multi-speaker tags. |
| **T2.B11.4** | Unknown host voice mapping | Host object has name `"Obscure Guest"` and no assigned voice | Falls back to round-robin voice from `FALLBACK_VOICES` array. |
| **T2.B11.5** | Unsupported translation target language | Translation requested for language code `"xx"` | Falls back to English transcript without synthesis failure. |

### Boundary 12: Opaque-Box E2E Testing Boundary Cases
| Test ID | Test Name | Input / Boundary Condition | Expected Output / Handling Behavior |
|---|---|---|---|
| **T2.B12.1** | Concurrent test worker execution | Running Vitest with multiple parallel worker threads | No temporary file collisions or mock leakage between threads. |
| **T2.B12.2** | Temporary directory cleanup on test failure | Test assertion fails mid-execution | `afterEach` hook guarantees temp files are deleted. |
| **T2.B12.3** | Unhandled promise rejections in async workflows | Workflow step throws unhandled rejection | Workflow catches error, logs stack trace, and invokes `markFailedStep`. |
| **T2.B12.4** | Vitest hoisted mock variable access | Accessing mocked variables inside `vi.mock` factory | Uses `vi.hoisted` to prevent initialization order errors. |
| **T2.B12.5** | High-volume test runner stress | Running test suite 5 times consecutively | Consistent 100% pass rate with zero memory leaks. |

### Boundary 13: Build & Verification Boundary Cases
| Test ID | Test Name | Input / Boundary Condition | Expected Output / Handling Behavior |
|---|---|---|---|
| **T2.B13.1** | Strict TypeScript `noImplicitAny` check | Compiling all test and source files | Zero implicit `any` violations across the entire project. |
| **T2.B13.2** | Next.js server/client component boundary | Importing Node.js modules inside client components | Zero webpack module resolution errors in Next.js bundle. |
| **T2.B13.3** | Unused variable lint rules | Codebase checked for unreferenced identifiers | Zero unused variable errors (prefixed with `_` where required). |
| **T2.B13.4** | Cuddled brace style enforcement | Code formatting validated | `} else {` cuddled formatting strictly observed. |
| **T2.B13.5** | Semicolon enforcement | Code formatting validated | Semicolons present on all statement terminations. |

---

## 7. Tier 3: Cross-Feature Combinations

*Specification Requirement: Pairwise and multi-system integration interactions across video, audio, workflow, and safety pipelines.*

```
                                    ┌─────────────────────────────────────────┐
                                    │       Tier 3 Cross-Feature Matrix       │
                                    └────────────────────┬────────────────────┘
                                                         │
         ┌───────────────────────────────┬───────────────┴───────────────┬───────────────────────────────┐
         ▼                               ▼                               ▼                               ▼
   Combination 1                   Combination 2                   Combination 3                   Combination 4
 4K + 9:16 Vertical              Scene Extension +               RAI Filter Trigger              Long-Form Podcast +
 + Granular 10s Turn             First/Last Frame                during Scene Ext                Translation + 48kHz
 + Reference Image               Interpolation                   + Sanitized Retry               Broadcast Resampling
```

### Combination 1: 4K UHD + 9:16 Vertical Aspect Ratio + 10s Granular Duration + Reference Conditioning
- **Test ID**: `T3.C1`
- **Modules**: `app/lib/veo.ts`, `workflows/generate-show.ts`
- **Interaction**: Video engine is configured with `resolution: "4k"`, `aspectRatio: "9:16"`, `durationSeconds: 10`, and `referenceImages: ["john-oliver"]`.
- **Expected Result**: Single API payload contains all 4 parameters simultaneously (`config.resolution === "4k"`, `config.aspectRatio === "9:16"`, `config.durationSeconds === 10`, `config.referenceImages[0].referenceType === "ASSET"`) and produces valid 10s vertical 4K video clip.

### Combination 2: Multi-Turn Scene Extension + First/Last Frame Interpolation
- **Test ID**: `T3.C2`
- **Modules**: `app/lib/veo.ts`, `workflows/generate-show.ts`
- **Interaction**: Turn 1 generates a 10s seed clip. Turn 2 extends Turn 1 using `previousInteractionId` while also supplying a `<LAST_FRAME>` anchor to guide convergence.
- **Expected Result**: Engine validates compatibility, forwards `previous_interaction_id` and `lastFrame` image buffer, producing seamless 20s continuous narrative transition.

### Combination 3: Autonomous RAI Safety Filter Trigger during Multi-Turn Scene Extension
- **Test ID**: `T3.C3`
- **Modules**: `app/lib/veo.ts`, `app/lib/dramaturgy/pass3-voice-prune.ts`, `workflows/generate-show.ts`
- **Interaction**: Turn 2 of a scene extension returns `VeoRAIFilterError` due to a sensitive trademark in the beat prompt.
- **Expected Result**: Workflow catches `VeoRAIFilterError`, passes prompt to `sanitizeNotesForVeo` / `reviseSegmentText`, strips sensitive terms, and retries Turn 2 with sanitized prompt while retaining `previousInteractionId` from Turn 1.

### Combination 4: Long-Form Multi-Speaker Podcast + Multilingual Translation + 48 kHz AAC Normalization
- **Test ID**: `T3.C4`
- **Modules**: `workflows/generate-show.ts`, `app/lib/tts.ts`, `app/lib/stitch.ts`
- **Interaction**: Show duration is set to 180s ($> 40$s) with Spanish translation (`targetLang: "es"`) and two distinct hosts.
- **Expected Result**: Workflow routes to `audioPodcastSynthesisStep`, translates transcript into Spanish, synthesizes speech with `gemini-3.1-flash-tts-preview`, generates 24 kHz WAV buffers, and encodes final master output with 48 kHz stereo AAC (`-ar 48000 -c:a aac -b:a 128k`).

### Combination 5: 360p Draft Monologue + `<IMAGE_REF_0>` Reference Binding + 3s Minimal Duration + Frame Extraction
- **Test ID**: `T3.C5`
- **Modules**: `app/lib/veo.ts`, `app/lib/stitch.ts`
- **Interaction**: Fast-draft generation mode with 360p resolution, 3s duration, reference image slug, followed by extracting frame at 3.0s boundary.
- **Expected Result**: Fast video generation completes; `extractFrame` successfully extracts PNG frame at `3.0s` without clipping or duration mismatch errors.

### Combination 6: Maximum 40s Video Pipeline (4 $\times$ 10s Scene Extensions) + Lossless Concat Demuxer
- **Test ID**: `T3.C6`
- **Modules**: `workflows/generate-show.ts`, `app/lib/veo.ts`, `app/lib/stitch.ts`
- **Interaction**: 4 consecutive 10s video generation turns executed via `extend: true` chaining (`int-1` $\to$ `int-2` $\to$ `int-3` $\to$ `int-4`). All 4 clips have identical codecs (1080p, 16:9, H.264).
- **Expected Result**: Stitched using FFmpeg lossless concat demuxer (`-c copy`), completing in $< 1$s without re-encoding, yielding exactly 40.0s master broadcast video.

### Combination 7: Mixed Resolution/Codec Clips Stitched with FFmpeg Fallback Re-encode
- **Test ID**: `T3.C7`
- **Modules**: `app/lib/stitch.ts`
- **Interaction**: Stitching 2 clips where Clip 1 is 720p 44.1 kHz and Clip 2 is 1080p 48 kHz.
- **Expected Result**: Lossless concat fails gracefully; stitcher falls back to `libx264` re-encode with `-ar 48000 -c:a aac -b:a 128k`, producing uniform 48 kHz output.

### Combination 8: Rate Limiting Backoff (429 RESOURCE_EXHAUSTED) during Interpolated Frame Generation
- **Test ID**: `T3.C8`
- **Modules**: `app/lib/veo.ts`
- **Interaction**: `generateVideoClipInterpolated` receives 429 error on first attempt, followed by success on attempt 2.
- **Expected Result**: Engine waits 60s backoff window, retries with original `firstFrame` and `lastFrame` image buffers, successfully downloading and returning interpolated video.

### Combination 9: Two-Host News Desk Conversation with Dynamic Speaker Gestures + First Frame Anchor + RAI Safety
- **Test ID**: `T3.C9`
- **Modules**: `workflows/generate-show.ts`, `app/lib/veo.ts`
- **Interaction**: Conversation show with two hosts ("Colin" left, "Michael" right). Turn 1 features Left host speaking; Turn 2 passes Turn 1 last frame as `<FIRST_FRAME>` while Right host speaks.
- **Expected Result**: Prompt builder formats desk layout, indicates active gesturing host, injects `<FIRST_FRAME>` tag, sanitizes network names, and generates seamless 2-host segment.

### Combination 10: Vercel Workflow Step Resumption & In-Flight State Rehydration
- **Test ID**: `T3.C10`
- **Modules**: `workflows/generate-show.ts`, `app/lib/workflow-state.ts`
- **Interaction**: Multi-step workflow (`research` $\to$ `script` $\to$ `generate-clips` $\to$ `stitch` $\to$ `upload`) simulated with browser disconnect/rehydration after `generate-clips`.
- **Expected Result**: Workflow state rehydrates from persistent store, skips already completed steps, and resumes execution cleanly from `stitch` step.

---

## 8. Tier 4: Real-World Application Scenarios

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                Tier 4 Real-World Application Scenarios                                 │
├───────────────────────────────┬────────────────────────────────┬───────────────────────────────────────┤
│ Scenario 1: Desk Show Satire  │ Scenario 2: Audio Podcast Show │ Scenario 3: Vertical Viral Reels      │
│ (John Oliver Monologue, 32s)  │ (Speculative Debate, 180s)     │ (Apocalyptic Satire, 15s 9:16)        │
├───────────────────────────────┴────────────────────────────────┴───────────────────────────────────────┤
│ Scenario 4: Continuous Scene Extension Chain (40s Epic Single-Shot Chaining)                          │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Scenario 1: Desk Show / Investigative Satire (John Oliver Style)
- **Profile**: 32-second high-production investigative news monologue.
- **Configuration**: `showType: "monologue"`, `duration: 32`, `aspectRatio: "16:9"`, `resolution: "1080p"`.
- **Execution Chain**:
  1. **Research Step**: Gemini 3.7 Flash generates grounded research brief on emerging tech monopolies.
  2. **Scriptwriting Step**: Head writer produces 4 segments (8s each) with comedic escalation and visual notes.
  3. **Turn 1 (Framing Clip)**: `generateVideoClip` with `<IMAGE_REF_0>` (John Oliver anchor image), producing `clip-1.mp4`.
  4. **Frame Extraction**: Extract frame at `7.95s` of `clip-1.mp4` $\to$ `frame-1.png`.
  5. **Turn 2 (Interpolated Beat)**: `generateVideoClipInterpolated` using `frame-1.png` as `<FIRST_FRAME>`, producing `clip-2.mp4`.
  6. **Turns 3 & 4**: Repeat frame extraction and interpolated chaining for `clip-3.mp4` and `clip-4.mp4`.
  7. **Stitch & Audio**: Lossless concat to `master-show.mp4` with 48 kHz stereo AAC audio normalization.
- **Verification Invariant**: 0 jump cuts between beats, consistent host suit/desk appearance, total duration $32.0 \pm 0.2$ seconds.

### Scenario 2: Audio Podcast Show (Speculative Dual-Host Debate)
- **Profile**: 180-second (3-minute) deep-dive comedy podcast between two AI philosophers.
- **Configuration**: `showType: "conversation"`, `duration: 180`, `format: "podcast"`.
- **Execution Chain**:
  1. **Format Routing**: `checkShowFormat(180)` evaluates `180 > 40` $\to$ selects `isAudioPodcast: true`.
  2. **Multi-Speaker Script**: Generates balanced dialogue between Host A (`"Charon"`) and Host B (`"Orus"`).
  3. **Safety & Parody Injection**: `generateSatiricalDisclaimer` appends comedy disclaimer.
  4. **TTS Multi-Turn Synthesis**: Calls `gemini-3.1-flash-tts-preview` in streaming/turn batches.
  5. **PCM to WAV Encoding**: Encodes raw audio streams into 24 kHz mono WAV chunks.
  6. **Broadcast Master Normalization**: FFmpeg processes chunks into 48 kHz stereo AAC podcast master (`-ar 48000 -c:a aac -b:a 128k`).
- **Verification Invariant**: Audio duration $180 \pm 5$ seconds, 48,000 Hz sample rate, no clipping, correct speaker voice alternations.

### Scenario 3: Vertical Viral Reels / Shorts
- **Profile**: 15-second punchy social video formatted for mobile feeds (TikTok / Instagram Reels / YouTube Shorts).
- **Configuration**: `showType: "monologue"`, `duration: 15`, `aspectRatio: "9:16"`, `resolution: "1080p"`.
- **Execution Chain**:
  1. **Scriptwriting**: Fast 2-beat comedic premise (7.5s setup + 7.5s punchline).
  2. **Prompt Generation**: Visual notes optimized for 9:16 vertical framing (vertical character composition, center framing).
  3. **Turn 1 (7.5s)**: `generateVideoClip(prompt, { aspectRatio: "9:16", durationSeconds: 7.5, resolution: "1080p" })`.
  4. **Turn 2 (7.5s)**: `generateVideoClipInterpolated` with Turn 1 ending frame and 9:16 aspect ratio.
  5. **Stitch**: Fast concat to `vertical-reel.mp4`.
- **Verification Invariant**: Video dimensions $1080 \times 1920$ (9:16), duration $15.0 \pm 0.1$s, centered subject framing.

### Scenario 4: Continuous Scene Extension Chain (40s Epic Single-Shot)
- **Profile**: 40-second continuous fluid camera shot zooming through a dystopian tech campus without cutaways.
- **Configuration**: `showType: "monologue"`, `duration: 40`, `aspectRatio: "16:9"`, `resolution: "720p"`.
- **Execution Chain**:
  1. **Turn 1 (0s–10s)**: `generateVideoClip(prompt1, { durationSeconds: 10 })` $\to$ returns `{ filePath: "clip-1.mp4", interactionId: "int-1" }`.
  2. **Turn 2 (10s–20s)**: `generateVideoClip(prompt2, { durationSeconds: 10, previousInteractionId: "int-1", extend: true })` $\to$ returns `{ filePath: "clip-2.mp4", interactionId: "int-2" }`.
  3. **Turn 3 (20s–30s)**: `generateVideoClip(prompt3, { durationSeconds: 10, previousInteractionId: "int-2", extend: true })` $\to$ returns `{ filePath: "clip-3.mp4", interactionId: "int-3" }`.
  4. **Turn 4 (30s–40s)**: `generateVideoClip(prompt4, { durationSeconds: 10, previousInteractionId: "int-3", extend: true })` $\to$ returns `{ filePath: "clip-4.mp4", interactionId: "int-4" }`.
  5. **Concat Demuxer**: Lossless concat stitches all 4 consecutive extensions into `single-shot-40s.mp4`.
- **Verification Invariant**: Cumulative length 40.0s, perfect visual motion continuity across turn boundaries, 4 chained interaction IDs.

---

## 9. Test Runner Invocation & Verification Commands

### 9.1 Test Execution Matrix

| Scope | CLI Command | Purpose |
|---|---|---|
| **Full Test Suite** | `npm test` | Run all 12 test suites via Vitest |
| **Video Engine Tests** | `npx vitest run app/lib/veo.test.ts` | Verify Gemini Omni 1.1 Flash client & mocks |
| **Master E2E Suite** | `npx vitest run app/lib/e2e-integration.test.ts` | Execute full 4-tier integration test matrix |
| **Media & Audio Challenger**| `npx vitest run app/lib/m3-m4-challenger.test.ts` | Verify 48 kHz FFmpeg & memory bank stress tests |
| **Workflow Challenger** | `npx vitest run workflows/workflow-media-challenger.test.ts` | Verify prompt sanitization & format routing |
| **Dramaturgy Tests** | `npx vitest run app/lib/dramaturgy/challenger.test.ts` | Verify 3-pass scriptwriting & table-read scoring |
| **Type Check** | `npx tsc --noEmit` | Confirm 0 TypeScript compilation errors |
| **Production Build** | `npm run build` | Validate Next.js 16 production compilation |
| **Lint Check** | `npm run lint` | Verify ESLint formatting & import ordering |

### 9.2 Environment Configuration for Tests
Tests are self-contained and run in hermetic environments using mocked credentials:
```bash
export GEMINI_API_KEY="test-gemini-key"
export GOOGLE_GENERATIVE_AI_API_KEY="test-google-key"
export DATABASE_URL="postgresql://localhost:5432/test"
```

---

## 10. Summary Metrics & Quality Thresholds

| Metric | Target Requirement | Achieved Status |
|---|---|---|
| **Total Test Suites** | 12 Test Suites | 12 Active Suites |
| **Total Test Count** | $\ge 150$ Unit, Boundary & E2E Tests | 271+ Tests Passing |
| **Tier 1 Feature Tests** | $\ge 5$ per feature (13 features = $\ge 65$) | $\ge 65$ Tests Defined |
| **Tier 2 Boundary Tests**| $\ge 5$ per feature (13 features = $\ge 65$) | $\ge 65$ Tests Defined |
| **Tier 3 Combinations** | $\ge 10$ Pairwise & Multi-System Scenarios | 10 Scenarios Defined |
| **Tier 4 Real-World E2E**| 4 End-to-End Persona Scenarios | 4 Scenarios Defined |
| **TypeScript Errors** | 0 compilation errors (`npx tsc --noEmit`) | 0 Errors Verified |
| **Build Status** | Successful production build (`npm run build`) | Verified |
