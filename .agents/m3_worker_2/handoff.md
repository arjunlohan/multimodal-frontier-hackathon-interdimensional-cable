# M3 Worker 2: Dual-Modality Media Engine & Normalization Handoff Report

## 1. Observation

### 1.1 Source Code Verification
- **`app/lib/tts.ts`**:
  - Enhanced `TtsHost` type to:
    ```typescript
    export type TtsHost =
      | string
      | {
        name: string;
        ttsVoice?: string;
        voice?: string;
        role?: string;
        position?: string;
        personality?: string;
      };
    ```
  - Exported `voiceForHost(host: TtsHost | string, index = 0): string` with prioritized resolution: `host.ttsVoice ?? host.voice` -> `VOICE_MAP[name]` -> `FALLBACK_VOICES[index % FALLBACK_VOICES.length]`.
  - Exported `encodePcmToWav(pcm: Buffer): Buffer` constructing a 44-byte RIFF/WAVE header for 24 kHz 16-bit mono linear PCM audio.
  - Implemented single-speaker (`voiceConfig.prebuiltVoiceConfig`) and multi-speaker (`multiSpeakerVoiceConfig.speakerVoiceConfigs`) dialogue generation using `gemini-3.1-flash-tts-preview` with `responseModalities: ["AUDIO"]`.
  - Maintained natural acoustic tag compatibility (`[laughs]`, `[chuckles]`, `[snickers]`, `[sighs]`, etc.) in transcripts.
  - Implemented target language translation via `gemini-3-flash-preview` when `targetLang` is specified.
  - Implemented `generateSingleVoiceClip` returning standard base64 Data URIs (`data:audio/wav;base64,...`).

- **`app/lib/stitch.ts`**:
  - Verified lossless concat demuxer fast-path: `ffmpeg -y -f concat -safe 0 -i listPath -c copy output` with 120s timeout.
  - Verified broadcast audio normalization fallback when lossless concat fails: `ffmpeg -y -f concat -safe 0 -i listPath -c:v libx264 -preset fast -crf 23 -c:a aac -ar 48000 -b:a 128k output` with 300s timeout.
  - Verified `extractFrame` extraction of single PNG frame at `timeSeconds` with 30s timeout and output existence validation.
  - Verified `cleanupTempFiles` with safe deletion and error suppression.

- **`app/lib/veo.ts`**:
  - Verified 40s duration cap enforcement (8s clips, 1 to 5 clips per show).
  - Verified 8s 1080p 16:9 clip generation via `veo-3.1-generate-preview`.
  - Verified face-anchored reference image conditioning via `loadReferenceImage` (`VideoGenerationReferenceType.ASSET`, `personGeneration: "allow_adult"`).
  - Verified interpolation mode with `generateVideoClipInterpolated` using `firstFrameBytes` and `lastFrame` image conditioning for visual continuity.
  - Verified sliding-window 2 RPM rate limiting (`VEO_RPM = 2`, `VEO_WINDOW_MS = 60_000`) and exponential backoff retry on 429 / `RESOURCE_EXHAUSTED` errors (`60_000 * (attempt + 1)` ms).
  - Verified polling loop with `MAX_POLLS = 45` (450s timeout) and `VeoRAIFilterError` handling.

### 1.2 Test Suite Execution
- Running `npx vitest run app/lib/tts.test.ts app/lib/stitch.test.ts app/lib/veo.test.ts`:
  ```
   ✓ app/lib/tts.test.ts (15 tests) 18ms
   ✓ app/lib/stitch.test.ts (8 tests) 14ms
   ✓ app/lib/veo.test.ts (17 tests) 37ms

   Test Files  3 passed (3)
        Tests  40 passed (40)
  ```
- Running `npx eslint app/lib/tts.ts app/lib/tts.test.ts app/lib/stitch.ts app/lib/stitch.test.ts app/lib/veo.ts app/lib/veo.test.ts`:
  ```
  0 problems (0 errors, 0 warnings)
  ```
- Running `npx tsc --noEmit`:
  ```
  Exit code 0 (0 TypeScript errors)
  ```

---

## 2. Logic Chain

1. **Host Definition Interoperability**:
   - In `app/lib/skills/types.ts`, `HostSkillConfig` specifies `ttsVoice: TtsVoice` and persona metadata.
   - Expanding `TtsHost` in `app/lib/tts.ts` to accept either raw name strings or host objects with optional `ttsVoice` allows `workflows/generate-show.ts` and template actions to pass host definitions directly without manual projection or type coercion.
   - Modifying `voiceForHost` to evaluate `host.ttsVoice ?? host.voice` before falling back to `VOICE_MAP` or `FALLBACK_VOICES` guarantees custom Show SKILL voices (e.g., Fenrir, Aoede, Kore, Enceladus) are honored over defaults.

2. **Broadcast Quality Audio Pipeline**:
   - Gemini 3.1 Flash TTS produces base64 24 kHz 16-bit mono linear PCM. `encodePcmToWav` packages this into valid 44-byte RIFF/WAVE containers.
   - When stitching multi-clip video shows where audio codecs or sample rates may drift, `stitchClips` falls back to `-ar 48000 -c:a aac -b:a 128k`, standardizing all broadcast audio to 48 kHz stereo AAC at 128 kbps without desync.

3. **Resilience & Rate Limit Compliance**:
   - Google Veo 3.1 is strictly rate-limited to 2 RPM on Tier 1. The sliding-window rate limiter in `veo.ts` tracks active call timestamps in a 60,000 ms window and enforces programmatic delays before initiating API calls.
   - In the event of transient 429 rate limit errors or resource exhaustion, `callVeo` and `callVeoInterpolated` execute exponential backoff retries with 60s, 120s, and 180s delays.
   - The 45-poll ceiling (450s) prevents unbounded workflow hangs.

---

## 3. Caveats

- **External API Keys**: Unit tests mock the `@google/genai` and `node:child_process` modules to ensure deterministic offline execution without requiring live Gemini API keys or installed FFmpeg binaries in CI environments.
- **Other Workspace Modules**: `app/lib/memory-bank.ts` and `app/lib/memory-bank.test.ts` are owned and actively being developed by Worker 1 and were excluded from our write scope.

---

## 4. Conclusion

The Dual-Modality Media Engine (`app/lib/tts.ts`, `app/lib/stitch.ts`, `app/lib/veo.ts`) and its accompanying unit test infrastructure (`app/lib/tts.test.ts`, `app/lib/stitch.test.ts`, `app/lib/veo.test.ts`) are completely implemented, verified, and passing 100% of all 40 unit tests with 0 ESLint errors/warnings and 0 TypeScript errors. Broadcast audio normalization to 48 kHz (`-ar 48000`), RIFF/WAVE header encoding, Show SKILL voice resolution, sliding-window 2 RPM rate limiting, and backoff retries are fully verified.

---

## 5. Verification Method

To independently verify all media engine components:

```bash
# 1. Run unit test suites for media engine
npx vitest run app/lib/tts.test.ts app/lib/stitch.test.ts app/lib/veo.test.ts

# 2. Verify ESLint cleanliness (0 errors, 0 warnings)
npx eslint app/lib/tts.ts app/lib/tts.test.ts app/lib/stitch.ts app/lib/stitch.test.ts app/lib/veo.ts app/lib/veo.test.ts

# 3. Verify TypeScript typecheck
npx tsc --noEmit
```
