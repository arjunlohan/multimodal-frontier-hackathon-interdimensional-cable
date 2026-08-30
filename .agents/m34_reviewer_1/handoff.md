# M3/M4 Reviewer 1: Dual-Modality Media Engine Verification & Review Report

## 1. Observation

Direct inspection and execution verification of Milestone 3 deliverables:

### 1.1 Source Code Verification
- **`app/lib/tts.ts`**:
  - `encodePcmToWav(pcm: Buffer): Buffer`: Generates a standard 44-byte RIFF/WAVE header (Subchunk1Size: 16, AudioFormat: 1 [PCM], NumChannels: 1 [Mono], SampleRate: 24000 Hz, ByteRate: 48000 B/s, BlockAlign: 2, BitsPerSample: 16).
  - `voiceForHost(host, index)`: Prioritizes explicit voice configuration (`host.ttsVoice ?? host.voice`) -> `VOICE_MAP[name]` (`Charon`, `Orus`, `Puck`) -> `FALLBACK_VOICES[index % FALLBACK_VOICES.length]` (`Charon`, `Orus`, `Puck`, `Fenrir`, `Aoede`, `Kore`, `Enceladus`).
  - `generateTts`: Direct multi-speaker synthesis via `gemini-3.1-flash-tts-preview` with `responseModalities: ["AUDIO"]` and `speechConfig` (`multiSpeakerVoiceConfig` or `voiceConfig`).
  - Natural acoustic tags (`[laughs]`, `[chuckles]`, `[snickers]`, `[sighs]`) supported in transcripts.
  - Target language translation via `gemini-3-flash-preview` when `targetLang` is specified.
  - `generateSingleVoiceClip`: Returns base64 Data URI (`data:audio/wav;base64,...`).

- **`app/lib/veo.ts`**:
  - Model: `veo-3.1-generate-preview` producing 8s 1080p 16:9 video clips.
  - Reference image conditioning: `loadReferenceImage(slug)` searches `assets/reference-images/${slug}.{png,jpeg,jpg,webp}`, encodes to base64, passes `VideoGenerationReferenceType.ASSET` with `personGeneration: "allow_adult"`.
  - Frame chaining interpolation: `generateVideoClipInterpolated(prompt, firstFramePath, lastFramePath)` passes start and end frames with `personGeneration: "allow_adult"`.
  - Sliding-window 2 RPM rate limiting: `VEO_RPM = 2`, `VEO_WINDOW_MS = 60_000`, `waitForVeoSlot()` enforces slot reservation with +1s safety buffer.
  - Exponential backoff: `callVeo` and `callVeoInterpolated` retry up to 3 times on `429` or `RESOURCE_EXHAUSTED` errors with `60_000 * (attempt + 1)` ms backoff.
  - Polling timeout: `MAX_POLLS = 45` (450s limit).
  - RAI filter handling: Throws `VeoRAIFilterError(reasons)` on `raiMediaFilteredCount > 0`.

- **`app/lib/stitch.ts`**:
  - Concat demuxer fast-path: `ffmpeg -y -f concat -safe 0 -i listPath -c copy output` with 120s timeout.
  - Broadcast audio normalization fallback: `ffmpeg -y -f concat -safe 0 -i listPath -c:v libx264 -preset fast -crf 23 -c:a aac -ar 48000 -b:a 128k output` with 300s timeout, standardizing all audio to 48 kHz stereo AAC at 128 kbps.
  - Frame extraction: `extractFrame(videoPath, timeSeconds)` extracts single PNG frame at timestamp with 30s timeout and output existence check.
  - `cleanupTempFiles(paths)`: Safe removal of temporary files with error suppression.

- **`workflows/generate-show.ts`**:
  - Format routing: `checkShowFormatStep` checks `(show?.durationSeconds ?? 16) > 40`.
  - Audio podcast branch (> 40s up to 300s / 5 min): Executes `audioPodcastSynthesisStep` via `generateTts` without invoking Veo, marks `generate-clips` and `stitch` complete, uploads `.wav` to Mux.
  - Video show branch (<= 40s): Executes `frameChainAndGenerateClipsStep` (1 to 5 clips of 8s each) and `stitchStep`.
  - RAI filter recovery: Catches `VeoRAIFilterError`, invokes `reviseSegmentText` via Gemini 3.7 Flash to sanitize and rephrase flagged entities while preserving comedic timing, updates DB transcript, and retries up to 2 times.

### 1.2 Automated Verification Execution Results
- `npm test`: **10 test files passed, 211 tests passed (0 failures)**.
  - `app/lib/tts.test.ts`: 15 tests passed.
  - `app/lib/veo.test.ts`: 17 tests passed.
  - `app/lib/stitch.test.ts`: 8 tests passed.
  - `workflows/generate-show.test.ts`: 11 tests passed.
  - `workflows/workflow-media-challenger.test.ts`: 11 tests passed.
  - `app/lib/skills/skills.test.ts`: 29 tests passed.
  - `app/lib/skills/challenger.test.ts`: 25 tests passed.
  - `app/lib/dramaturgy/dramaturgy.test.ts`: 14 tests passed.
  - `app/lib/dramaturgy/challenger.test.ts`: 57 tests passed.
  - `app/lib/memory-bank.test.ts`: 24 tests passed.
- `npx tsc --noEmit`: **0 TypeScript errors (exit code 0)**.
- `npm run build`: **Next.js 16 build succeeded (exit code 0, all static and dynamic routes compiled)**.

---

## 2. Logic Chain

1. **Dual-Modality Media Engine Architecture**:
   - Audio podcasts require rapid, expressive multi-speaker turn-taking across longer durations (up to 300s / 5 minutes) without the latency and compute cost of video diffusion models. Routing shows with duration > 40s directly to Gemini 3.1 Flash TTS (`gemini-3.1-flash-tts-preview`) fulfills R3 with zero Veo calls.
   - Video shows are hard-capped at 40s (1 to 5 clips at 8s each). Veo 3.1 generates 1080p clips with reference image conditioning (`assets/reference-images/`) or start/end frame chaining.

2. **Acoustic and Container Normalization**:
   - Gemini TTS outputs 24 kHz 16-bit mono linear PCM. `encodePcmToWav` provides valid 44-byte RIFF/WAVE header packaging with exact byte rate (48000 B/s) and block alignment (2 bytes).
   - In video stitching, codec or sample rate drift across clips is resolved by `stitchClips` falling back to `-c:a aac -ar 48000 -b:a 128k`, delivering 48 kHz broadcast audio compliance.

3. **Circuit Breakers & Adversarial Robustness**:
   - Google Veo 3.1 Tier 1 rate limits (2 RPM) are guarded by a sliding-window limiter (`VEO_RPM = 2`, `VEO_WINDOW_MS = 60_000`).
   - Transient 429 rate limit errors or resource exhaustion trigger exponential backoff retries with 60s, 120s, and 180s delays.
   - Veo RAI filter triggers are handled gracefully via `VeoRAIFilterError` and automated script revision via Gemini 3.7 Flash (`reviseSegmentText`).

4. **Integrity & Authenticity**:
   - Zero hardcoded responses, facade mocks, or cheating mechanisms detected in production code paths.
   - Unit tests use standard Vitest mocking of external Google GenAI and child_process APIs while exercising full internal logic and state machines.

---

## 3. Caveats

- **External API Dependency in Production**: Live execution requires valid `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` and installed `ffmpeg` binary on the host runtime.

---

## 4. Conclusion

**Verdict: APPROVE**

The Milestone 3 (Dual-Modality Media Engine) implementation meets all authoritative requirements from `ORIGINAL_REQUEST.md`, `PROJECT.md`, and the worker handoff:
1. Multi-speaker dialogue synthesis in `app/lib/tts.ts` via `gemini-3.1-flash-tts-preview`, custom Show SKILL voice resolution, acoustic tags, and 24 kHz mono RIFF/WAVE encoding.
2. 40s duration cap enforcement with automated branching (<= 40s video vs. > 40s up to 300s audio podcast).
3. Google Veo 3.1 (`veo-3.1-generate-preview`) 8s clip generation with face-anchored reference image conditioning and interpolation.
4. Broadcast audio normalization fallback to 48 kHz (`-ar 48000`) in `app/lib/stitch.ts`.
5. Full circuit breaker suite: sliding-window 2 RPM rate limiting, exponential backoff retries, polling timeout, and RAI filter recovery.
6. 100% test pass rate across 211 tests, 0 TypeScript errors, and clean Next.js 16 production build.

---

## 5. Verification Method

```bash
# 1. Execute Vitest test suite across all modules
npm test

# 2. Run TypeScript compilation check
npx tsc --noEmit

# 3. Run production Next.js build
npm run build
```
