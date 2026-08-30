# M3 Dual-Modality Media Engine Handoff Report

**Author**: M3 Explorer 1  
**Target Recipient**: Parent Orchestrator / M3 Worker  
**Date**: 2026-08-29  
**Type**: Hard Handoff (Investigation Complete)

---

## 1. Observation

### 1.1 Audio Podcast Synthesis (`app/lib/tts.ts`, `workflows/generate-show.ts`)
- **TTS Model & Invocation**: In `app/lib/tts.ts:151-158`, speech generation calls `client.models.generateContent` with `model: "gemini-3.1-flash-tts-preview"`, `responseModalities: ["AUDIO"]`, and `speechConfig`.
- **Multi-Speaker Speech Config**: In `app/lib/tts.ts:132-147`, when `hosts.length > 1`, `generateTts` configures `multiSpeakerVoiceConfig.speakerVoiceConfigs` with `{ speaker: h.name, voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceForHost(h.name, i) } } }`.
- **WAV Header Encoding**: In `app/lib/tts.ts:41-66`, `encodePcmToWav(pcm)` attaches a 44-byte RIFF/WAVE header formatted for 24,000 Hz, 16-bit, 1-channel linear PCM (`byteRate = 48000`, `blockAlign = 2`).
- **Format Branching & Zero Veo Calls**: In `workflows/generate-show.ts:74-93` & `143-154`:
  - `checkShowFormatStep` evaluates `isAudioPodcast: (show?.durationSeconds ?? 16) > 40`.
  - When `isAudioPodcast === true`, `generateShowWorkflow` executes `audioPodcastSynthesisStep(progress, showId)` and directly marks `generate-clips` and `stitch` complete, bypassing `frameChainAndGenerateClipsStep` and `stitchStep`. Zero calls to `generateVideoClip` or Veo 3.1 are made.
  - In `uploadStep` (`workflows/generate-show.ts:729-735`), when the file ends with `.wav`, `Content-Type` is set to `"audio/wav"` and uploaded directly to Mux.

### 1.2 Video Show Generation & Rate Limiting (`app/lib/veo.ts`, `workflows/generate-show.ts`)
- **Veo Model & Parameters**: In `app/lib/veo.ts:157-172`, calls `client.models.generateVideos` with `model: "veo-3.1-generate-preview"`, `aspectRatio: "16:9"`, `durationSeconds: 8`, `resolution: "1080p"`, `personGeneration: "allow_adult"`.
- **Duration Cap Enforcement**: In `app/create/constants.ts:1-7`, `VIDEO_DURATION_OPTIONS` defines `[8, 16, 24, 32, 40]` seconds (1 to 5 clips). In `app/create/actions.ts:65-68`, valid durations are validated against `[8, 16, 24, 32, 40, 60, 120, 180, 240, 300]`.
- **Reference Images**: In `app/lib/veo.ts:64-96`, `loadReferenceImage(slug)` searches `assets/reference-images/${slug}.[png|jpeg|jpg|webp]` and injects `{ image: { imageBytes, mimeType }, referenceType: VideoGenerationReferenceType.ASSET }`. Verified assets exist: `john-oliver.jpeg`, `seth-meyers.jpeg`, `snl-weekend-update.jpeg`.
- **2 RPM Sliding-Window Rate Limiter**: In `app/lib/veo.ts:27-51`:
  - `VEO_RPM = 2`, `VEO_WINDOW_MS = 60_000`.
  - `waitForVeoSlot()` evicts timestamps older than 60s, computes `waitMs = oldestInWindow + 60_000 - now + 1_000`, and delays if `>= 2` requests are active in the window.
- **Exponential Backoff**: In `app/lib/veo.ts:124-143` & `276-299`, catches 429/`RESOURCE_EXHAUSTED` errors and retries up to 3 times with `60_000 * (attempt + 1)` ms delay.
- **Frame Chaining**: In `app/lib/veo.ts:256-369` & `workflows/generate-show.ts:387-414`, when `useFrameChaining` is active, generates an anchor clip, extracts frames at t=0s and t=7.5s with `extractFrame`, and invokes `generateVideoClipInterpolated`.

### 1.3 Broadcast Audio Normalization (`app/lib/stitch.ts`)
- In `app/lib/stitch.ts:48-85`:
  - Lossless concat: `ffmpeg -y -f concat -safe 0 -i listPath -c copy output` (timeout 120,000 ms).
  - Re-encoding fallback: When codecs differ or concatenation fails, executes `ffmpeg -y -f concat -safe 0 -i listPath -c:v libx264 -preset fast -crf 23 -c:a aac -ar 48000 -b:a 128k output` (timeout 300,000 ms), enforcing the 48 kHz broadcast audio standard (`-ar 48000`).

### 1.4 Circuit Breakers & Robustness
- **Veo Polling Limit**: `MAX_POLLS = 45` with 10s sleep intervals (450s total timeout) in `app/lib/veo.ts:175-181`.
- **RAI Content Filter Recovery**: In `workflows/generate-show.ts:471-495`, catches `VeoRAIFilterError`, invokes `reviseSegmentText` via Gemini 3.7 Flash to sanitize names/entities, updates transcript in DB, and retries up to `maxRAIRetries = 2`.
- **Workflow Error Handling**: Catches step failures and calls `markFailedStep(showId, message)` in `workflows/generate-show.ts:133-141`.

### 1.5 Unit Test Status
- `npm test` executed: 9 test files, 162 tests passed in 676ms.
- Observed test files:
  - `workflows/generate-show.test.ts` (11 tests: prompt building, notes sanitization, JSON parsing)
  - `workflows/workflow-media-challenger.test.ts` (11 tests: duration branching <=40s vs >40s, progress emission, TTS dialogue format, Veo prompt format)
  - `app/lib/stitch.test.ts` (4 tests: empty array throw, single clip copy, temp file cleanup)
  - `app/lib/veo.test.ts` (9 tests: generateText, generateVideoClip config, polling, operation error, reference images)
- **Observed Gap**: `app/lib/tts.test.ts` does not exist yet. `stitch.test.ts` and `veo.test.ts` have coverage gaps around fallback re-encoding, interpolation, and RAI error recovery.

---

## 2. Logic Chain

1. **Audio Podcast Verification**:
   - `checkShowFormatStep` in `generate-show.ts:151` checks `durationSeconds > 40`.
   - `audioPodcastSynthesisStep` in `generate-show.ts:325` passes full multi-speaker text to `generateTts`.
   - `generateTts` in `tts.ts:151` uses `gemini-3.1-flash-tts-preview` and `multiSpeakerVoiceConfig`.
   - `encodePcmToWav` formats the audio into a standard 24 kHz WAV buffer.
   - The workflow marks clip generation and stitch complete without calling Veo.
   - *Inference*: Audio podcasts up to 300s (5 min) synthesize multi-speaker dialogue with 0 Veo invocations.

2. **Video Show Cap & Veo Engine Verification**:
   - `createShowAction` restricts video show duration to 8, 16, 24, 32, 40s (1 to 5 clips).
   - `frameChainAndGenerateClipsStep` generates 8s clips with `veo-3.1-generate-preview` and 1080p resolution.
   - `loadReferenceImage` correctly injects face-anchored reference images from `assets/reference-images/`.
   - `waitForVeoSlot` guarantees maximum 2 requests per 60,000 ms sliding window.
   - 429 errors trigger exponential backoff with 60s, 120s, 180s delays up to 3 retries.
   - *Inference*: Video show pipeline strictly complies with the 40s cap, 8s clip granularity, 2 RPM rate limiting, and face-anchored conditioning.

3. **Audio Normalization Verification**:
   - `stitchClips` in `stitch.ts:79` specifies `-ar 48000` during the re-encoding fallback.
   - `-c:a aac -b:a 128k` ensures standardized high-fidelity audio stream.
   - Single clip copies directly without transcoding overhead.
   - *Inference*: Broadcast audio normalization to 48 kHz is properly handled in the video stitching pipeline.

4. **Circuit Breakers & Fault Tolerance Verification**:
   - Polling is capped at 45 iterations (450s).
   - RAI filtering triggers prompt revision and retry up to 2 attempts before failing gracefully.
   - Workflow failures persist `status: "failed"` and clean up temporary streams and files.
   - *Inference*: System contains robust circuit breakers for timeouts, content safety, rate limits, and failure states.

---

## 3. Caveats

- **Host Voice Mapping Generality**: In `app/lib/tts.ts`, `TtsHost` only defines `{ name: string }`. If a Show SKILL passes a custom host name not in `VOICE_MAP`, it falls back to modulo indexing on `FALLBACK_VOICES`. Updating `TtsHost` to accept `ttsVoice?: string` will ensure direct pass-through from `HostSkillConfig.ttsVoice`.
- **FFmpeg Binary Requirement**: `stitch.ts` relies on system `ffmpeg` being present in the execution PATH. In serverless environments, ffmpeg must be packaged or provided via a layer.
- No other caveats.

---

## 4. Conclusion

The Dual-Modality Media Engine (`app/lib/tts.ts`, `app/lib/veo.ts`, `app/lib/stitch.ts`, `workflows/generate-show.ts`) is architecturally sound, fulfills all core functional requirements of R3 in `.agents/ORIGINAL_REQUEST.md`, and enforces all rate limits, duration bounds, and circuit breakers.

### Next Steps for M3 Worker / Parent:
1. Enhance `TtsHost` in `app/lib/tts.ts` to support optional `ttsVoice?: string; voice?: string; position?: string; personality?: string` and update `voiceForHost` to check `host.ttsVoice` first.
2. Add `app/lib/tts.test.ts` to provide 100% unit test coverage for `encodePcmToWav`, `generateTts` (single & multi-speaker), and `generateSingleVoiceClip`.
3. Expand `app/lib/stitch.test.ts` to test multi-clip stitching, 48 kHz fallback re-encoding, and `extractFrame`.
4. Expand `app/lib/veo.test.ts` to test `generateVideoClipInterpolated`, `VeoRAIFilterError`, and rate limiting.

---

## 5. Verification Method

To independently verify all findings and test suite integrity:

1. **Run Full Test Suite**:
   ```bash
   npm test
   ```
   *Expected Result*: All test suites pass with 0 errors.

2. **Verify Media Engine Code Locations**:
   - TTS synthesis: `app/lib/tts.ts` (lines 118–174)
   - Veo 3.1 video clip generation: `app/lib/veo.ts` (lines 148–242)
   - Veo interpolation mode: `app/lib/veo.ts` (lines 256–369)
   - Sliding-window rate limiter: `app/lib/veo.ts` (lines 27–51)
   - 48 kHz broadcast audio stitch: `app/lib/stitch.ts` (lines 63–85)
   - Format routing & duration branch: `workflows/generate-show.ts` (lines 74–93, 143–154)
   - RAI recovery loop: `workflows/generate-show.ts` (lines 471–495)

3. **Invalidation Conditions**:
   - If audio podcasts (>40s) invoke `generateVideoClip`, this conclusion is invalidated.
   - If video shows exceed 40s or bypass the 2 RPM rate limiter, this conclusion is invalidated.
