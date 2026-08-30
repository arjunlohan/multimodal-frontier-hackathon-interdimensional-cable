# M3 Dual-Modality Media Engine & Audio Normalization Analysis

**Author**: M3 Explorer 1  
**Date**: 2026-08-29  
**Status**: Comprehensive Investigation Complete  
**Scope**: `app/lib/tts.ts`, `app/lib/veo.ts`, `app/lib/stitch.ts`, `workflows/generate-show.ts`, and test infrastructure.

---

## 1. Executive Summary

This investigation analyzed the Dual-Modality Media Engine (Milestone 3) responsible for executing multimodal comedy show generation across two distinct runtime formats:
1. **Audio Podcasts (Up to 5 minutes / 300s)**: High-craft, multi-speaker conversational dialogue synthesis using Google Cloud Gemini 3.1 Flash TTS (`gemini-3.1-flash-tts-preview`) with acoustic tagging, natural backchannels, and zero video generation overhead.
2. **Video Shows (Capped at 40s)**: High-resolution satirical late-night desk shows composed of 8-second 1080p Google Veo 3.1 (`veo-3.1-generate-preview`) clips with face-anchored reference image conditioning, sliding-window 2 RPM rate limiting, and 48 kHz broadcast audio normalization.

The media engine components exhibit solid architectural isolation and adherence to the system requirements, with clear circuit breakers for duration routing, API timeouts, and RAI filter prompt recovery. Several areas for refinement, type enhancement, and test coverage expansion were identified to ensure rock-solid production reliability.

---

## 2. Audio Podcast Engine Analysis (`app/lib/tts.ts`, `workflows/generate-show.ts`)

### 2.1 Model & Multi-Speaker Configuration
- **Model**: `gemini-3.1-flash-tts-preview` is invoked directly via `@google/genai` client (`client.models.generateContent`) with `responseModalities: ["AUDIO"]` (lines 151–158 of `app/lib/tts.ts`).
- **Multi-Speaker Speech Config**:
  - When `hosts.length > 1`, `generateTts` configures `multiSpeakerVoiceConfig.speakerVoiceConfigs`, dynamically mapping each speaker name to their assigned prebuilt voice.
  - When `hosts.length === 1`, it configures `voiceConfig.prebuiltVoiceConfig` for single-host monologues.

```typescript
// app/lib/tts.ts:132-147
const speechConfig = hosts.length > 1 ?
    {
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: hosts.map((h, i) => ({
          speaker: h.name,
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceForHost(h.name, i) },
          },
        })),
      },
    } :
    {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: voiceForHost(hosts[0]?.name ?? "", 0) },
      },
    };
```

### 2.2 Voice Mappings & Show SKILL Compatibility
- **Registered Licensed Voices**:
  `LICENSED_GEMINI_TTS_VOICES = ["Charon", "Orus", "Puck", "Fenrir", "Aoede", "Kore", "Enceladus"]` (defined in `app/lib/skills/guardrails.ts`).
- **Current `VOICE_MAP` in `app/lib/tts.ts`**:
  ```typescript
  const VOICE_MAP: Record<string, string> = {
    "John Oliver": "Charon",
    "Seth Meyers": "Orus",
    "Colin Jost": "Charon",
    "Michael Che": "Puck",
  };
  const FALLBACK_VOICES = ["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Enceladus"];
  ```
- **Observation & Enhancement Recommendation**:
  Currently, `TtsHost` in `app/lib/tts.ts` is defined as `{ name: string }`. In `app/lib/skills/types.ts`, `HostSkillConfig` specifies `ttsVoice: TtsVoice`.
  If a podcast passes custom host names (e.g., `"The Speculative Inquirer"`, `"Esoteric Polymath"`, `"Joe"`, `"Jamie"`), `voiceForHost` falls back to index modulo `FALLBACK_VOICES`.
  *Recommended Enhancement*: Allow `TtsHost` to accept optional `ttsVoice?: string; voice?: string; position?: string; personality?: string` and have `voiceForHost(host: TtsHost | string, index: number)` check `host.ttsVoice` first, then `VOICE_MAP[name]`, then `FALLBACK_VOICES`.

### 2.3 Conversational Dynamics & Acoustic Cues
- Pass 2 (`pass2-head-writer.ts`) and Pass 3 (`pass3-voice-prune.ts`) embed natural acoustic tags into the dialogue text:
  - `[laughs]`, `[chuckles]`, `[snickers]`, `[sighs]`, `[gasps]`, `[whispering]`, `[incredulous]`, `[wheezes]`
- For conversational podcasts, the transcript is serialized as `Speaker: [acoustic_tag] Dialogue text...` which Gemini 3.1 Flash TTS parses to produce expressive multi-speaker audio with realistic comedic timing.

### 2.4 Up to 5-Minute (300s) Long-Form Synthesis & Zero Veo Invocations
- In `workflows/generate-show.ts`, `checkShowFormatStep` checks `(show?.durationSeconds ?? 16) > 40`.
- When duration > 40s (e.g., 60s, 120s, 180s, 240s, 300s):
  1. `audioPodcastSynthesisStep` executes in a single workflow step.
  2. The full multi-speaker transcript is compiled and sent to `generateTts`.
  3. The resulting WAV buffer is written to temporary storage (`podcast-${showId}-${Date.now()}.wav`).
  4. Both `generate-clips` and `stitch` progress events are marked as completed.
  5. `frameChainAndGenerateClipsStep` and `stitchStep` are completely bypassed.
  6. **Veo 3.1 is NEVER invoked** for audio podcasts (0 Veo API calls).

---

## 3. Video Show Engine Analysis (`app/lib/veo.ts`, `workflows/generate-show.ts`)

### 3.1 Model & 8-Second Clip Generation
- **Model**: `veo-3.1-generate-preview` via `@google/genai` `client.models.generateVideos`.
- **Clip Parameters**:
  - `durationSeconds: 8`
  - `resolution: "1080p"`
  - `aspectRatio: "16:9"`
  - `numberOfVideos: 1`
  - `personGeneration: "allow_adult"`
- **Hard 40s Cap**:
  - 8s per clip allows exactly 1 to 5 clips (8s, 16s, 24s, 32s, 40s).
  - Desk show scripts are divided into exact 8s beats with strict word budgets (17–23 words per clip at ~2.5 WPS).

### 3.2 Face-Anchored Reference Conditioning
- `loadReferenceImage(slug)` in `app/lib/veo.ts`:
  - Scans `assets/reference-images/${slug}.[png|jpeg|jpg|webp]`.
  - Reads image into base64 buffer.
  - Passes formatted `VideoGenerationReferenceImage` with `referenceType: VideoGenerationReferenceType.ASSET`.
  - Available reference assets verified in repo: `john-oliver.jpeg`, `seth-meyers.jpeg`, `snl-weekend-update.jpeg`.

### 3.3 Sliding-Window 2 RPM Rate Limiter
- **Configuration**:
  - `VEO_RPM = 2`
  - `VEO_WINDOW_MS = 60_000` (1 minute sliding window)
- **Algorithm**:
  - `waitForVeoSlot()` purges call timestamps older than 60 seconds (`Date.now() - timestamp > 60000`).
  - If the active timestamps in the window equal or exceed 2:
    `waitMs = oldestInWindow + 60000 - now + 1000` (includes a 1s safety margin).
  - Sleeps for `waitMs` before executing the next Veo call and recording the new timestamp.
  - `_resetRateLimiter()` exported for test isolation to prevent cross-test interference.

### 3.4 Exponential Backoff on 429 Errors
- If Veo returns a 429 rate limit or `RESOURCE_EXHAUSTED` error:
  - Catches error in `callVeo` and `callVeoInterpolated`.
  - Retries up to `maxRetries = 3`.
  - Backoff delay formula: `60_000 * (attempt + 1)` ms (60s on attempt 1, 120s on attempt 2, 180s on attempt 3).

### 3.5 Frame Chaining & Visual Continuity
- When `show.useFrameChaining` is enabled:
  1. Generates an anchor framing clip (desk master shot with reference image).
  2. Extracts `firstFramePath` (t=0s) and `lastFramePath` (t=7.5s) using `extractFrame` from `app/lib/stitch.ts`.
  3. Generates subsequent content clips via `generateVideoClipInterpolated` using start/end frame visual anchors.
  4. Automatically cleans up framing clip and extracted PNG frame files via `cleanupTempFiles`.

---

## 4. Broadcast Audio Normalization & Stitching (`app/lib/stitch.ts`, `app/lib/tts.ts`)

### 4.1 48 kHz Audio Normalization Fallback
In `app/lib/stitch.ts`:
1. **Lossless Fast Path**: Attempts ffmpeg concat demuxer (`-f concat -safe 0 -i listPath -c copy output`) with 120s timeout.
2. **48 kHz Broadcast Re-encoding Fallback**:
   If the clips have mismatched audio sample rates, video codecs, or timebase drift, the lossless concat fails and immediately catches to the re-encoding pipeline:
   ```bash
   ffmpeg -y -f concat -safe 0 -i listPath \
     -c:v libx264 -preset fast -crf 23 \
     -c:a aac -ar 48000 -b:a 128k \
     output
   ```
   - `-ar 48000`: Explicitly resamples audio to the 48 kHz broadcast standard.
   - `-c:a aac -b:a 128k`: Encodes clean stereo AAC audio at 128 kbps.
   - `-c:v libx264 -preset fast -crf 23`: Re-encodes H.264 video with consistent GOP structure and no audio drift.

### 4.2 PCM WAV Header Encoding (`app/lib/tts.ts`)
- Raw audio from `gemini-3.1-flash-tts-preview` arrives as base64-encoded 24 kHz 16-bit mono linear PCM.
- `encodePcmToWav(pcm: Buffer): Buffer` constructs a 44-byte RIFF/WAVE header:
  - Chunk ID: `RIFF` (bytes 0–3)
  - Chunk Size: `dataSize + 36` (bytes 4–7)
  - Format: `WAVE` (bytes 8–11)
  - Subchunk1 ID: `fmt ` (bytes 12–15)
  - Subchunk1 Size: `16` (PCM) (bytes 16–19)
  - Audio Format: `1` (PCM linear) (bytes 20–21)
  - Num Channels: `1` (mono) (bytes 22–23)
  - Sample Rate: `24000` Hz (bytes 24–27)
  - Byte Rate: `48000` (24000 * 1 * 2) (bytes 28–31)
  - Block Align: `2` (1 * 2) (bytes 32–33)
  - Bits Per Sample: `16` (bytes 34–35)
  - Subchunk2 ID: `data` (bytes 36–39)
  - Subchunk2 Size: `dataSize` (bytes 40–43)

### 4.3 Silence & Track Concatenation
- In podcasts: Natural conversational pauses are controlled by punctuation and acoustic tags in the transcript, avoiding audio dropouts.
- In video shows: Individual 8s Veo clips carry synchronized generated audio, which is stitched seamlessly by ffmpeg without track desync.

---

## 5. Circuit Breakers & Robustness

| Circuit Breaker | Implementation Location | Mechanism | Safe Fallback / Action |
|---|---|---|---|
| **Hard 40s Video Cap** | `checkShowFormatStep` in `generate-show.ts` & `createShowAction` | Inspects `durationSeconds`. Durations > 40s are strictly routed to TTS podcast pipeline. | Audio podcast mode activated (no Veo calls). Durations constrained to `[8, 16, 24, 32, 40, 60, 120, 180, 240, 300]`. |
| **Veo Polling Timeout** | `callVeoOnce` & `callVeoInterpolatedOnce` in `veo.ts` | `MAX_POLLS = 45` with 10s poll intervals (450 seconds / 7.5 min). | Throws descriptive timeout error: `Veo video generation timed out after 45 polling attempts (450s)`. |
| **FFmpeg Execution Timeout** | `stitchClips` & `extractFrame` in `stitch.ts` | Concat: 120s timeout; Re-encode: 300s timeout; Frame extraction: 30s timeout. | Process aborted, temp list unlinked, error raised with contextual details. |
| **RAI Prompt Recovery** | `frameChainAndGenerateClipsStep` in `generate-show.ts` | Catches `VeoRAIFilterError` (when `raiMediaFilteredCount > 0`). | Prompts Gemini 3.7 Flash via `reviseSegmentText` to rephrase sensitive terms while preserving comedic intent. Re-generates clip up to 2 retries. |
| **Clip Generation Failure** | `frameChainAndGenerateClipsStep` in `generate-show.ts` | Tracks `successCount` and `failCount`. | If `successCount === 0`, throws `All video clips failed to generate`. If some succeed, continues with available clips. |
| **Workflow Failure Persistence** | `generateShowWorkflow` & `markFailedStep` in `generate-show.ts` | Catch block in workflow fn calls `markFailedStep(showId, message)`. | Updates `generatedShows.status = 'failed'` and sets `error` message in database. Closes progress stream cleanly. |

---

## 6. Test Suite Review & Gap Catalog

### 6.1 Current Test Suite Status
Running `npm test` executes 9 test suites with **162 passing tests**:
1. `app/lib/veo.test.ts` (9 tests)
2. `app/lib/skills/skills.test.ts` (29 tests)
3. `app/lib/skills/challenger.test.ts` (25 tests)
4. `workflows/workflow-media-challenger.test.ts` (11 tests)
5. `app/lib/dramaturgy/dramaturgy.test.ts` (14 tests)
6. `app/lib/memory-bank.test.ts` (2 tests)
7. `app/lib/dramaturgy/challenger.test.ts` (57 tests)
8. `app/lib/stitch.test.ts` (4 tests)
9. `workflows/generate-show.test.ts` (11 tests)

### 6.2 Test Gaps & Concrete Refinements Identified

#### Gap 1: Missing `app/lib/tts.test.ts`
`tts.ts` currently has 0 dedicated unit tests. A comprehensive unit test suite should verify:
- `encodePcmToWav`:
  - Validates 44-byte WAV header structure, RIFF magic bytes, WAVE format, 24000 sample rate, 16-bit depth, mono channel count, and correct file length calculations.
- `generateTts`:
  - Single host voice configuration (model: `gemini-3.1-flash-tts-preview`, `voiceConfig`).
  - Multi-speaker voice configuration (`multiSpeakerVoiceConfig`, mapping each speaker to licensed voice).
  - Target language translation integration (`translateTranscript` with `gemini-3-flash-preview`).
  - Error handling when Gemini returns no audio or empty candidate parts.
- `generateSingleVoiceClip`:
  - Returns properly formatted Data URI (`data:audio/wav;base64,...`).

#### Gap 2: Coverage Gaps in `app/lib/stitch.test.ts`
Currently only tests empty array throw, single file copy, and `cleanupTempFiles`. Missing:
- Multi-clip stitching using `execFileAsync` mock.
- Fallback from lossless concat (`-c copy`) to 48 kHz broadcast audio re-encoding (`-ar 48000`, `-c:v libx264`, `-c:a aac`) upon concat demuxer failure.
- `extractFrame` success verification and failure when output file is not created.

#### Gap 3: Coverage Gaps in `app/lib/veo.test.ts`
- Missing test for `generateVideoClipInterpolated` (validating `firstFrameBytes`, `lastFrameBytes`, `personGeneration: allow_adult`, and `lastFrame` config).
- Missing test for `VeoRAIFilterError` throwing when `raiMediaFilteredCount > 0` or `raiMediaFilteredReasons` contains filter messages.
- Missing test for sliding-window 2 RPM rate limiting and 429 exponential backoff retries.

#### Gap 4: Workflow Step Integration Testing in `workflows/generate-show.test.ts`
- Pure function tests exist for `buildVeoPrompt` and `parseScriptJson`, but tests should also verify the step orchestration logic:
  - Audio podcast mode bypasses Veo completely and outputs WAV path.
  - Video show mode validates 8s clip generation and 40s duration bounds.
  - RAI filter recovery loop (`reviseSegmentText`) correctly updates transcript segments.

---

## 7. Concrete Implementation Recommendations for M3 Worker

1. **Update `TtsHost` in `app/lib/tts.ts`**:
   Expand interface to support optional `ttsVoice?: string; voice?: string; position?: string; personality?: string` and update `voiceForHost` to prioritize `host.ttsVoice` when provided by Show SKILL definitions.
2. **Create `app/lib/tts.test.ts`**:
   Write a dedicated unit test suite with 100% coverage of PCM encoding, voice config generation, translation branching, and single voice clip generation.
3. **Enhance `app/lib/stitch.test.ts`**:
   Add mocks for child_process `execFile` to verify lossless concat, 48 kHz fallback re-encoding (`-ar 48000`), and frame extraction.
4. **Enhance `app/lib/veo.test.ts`**:
   Add test cases for `generateVideoClipInterpolated`, `VeoRAIFilterError`, rate limiting, and 429 retry backoff.
