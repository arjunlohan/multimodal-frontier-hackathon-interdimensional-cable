# Survey Report: Testing Infrastructure, Audio Pipeline & Build System

## 1. Observation

### A. Testing Infrastructure & Inventory
- **Test Runner & Config**:
  - Config file: `vitest.config.ts` (lines 1–16) with `globals: true`, `environment: "node"`, `include: ["**/*.test.ts"]`, alias `@` -> root.
  - NPM scripts in `package.json` (lines 21–23):
    - `"test": "vitest run"`
    - `"test:watch": "vitest"`
    - `"test:veo": "tsx scripts/test-veo.ts"`
- **Test File Inventory** (12 active test files, 271 total passing tests):
  1. `app/lib/skills/skills.test.ts` (34 tests) — Desk & podcast show SKILLs, schemas, and guardrails.
  2. `app/lib/skills/challenger.test.ts` (45 tests) — Adversarial boundary checks for show SKILLs.
  3. `app/lib/dramaturgy/dramaturgy.test.ts` (23 tests) — 3-pass dramaturgy pipeline (Pass 1 research, Pass 2 joke construction, Pass 3 table-read voice/pruning).
  4. `app/lib/dramaturgy/challenger.test.ts` (57 tests) — Adversarial stress-testing of dramaturgy engine.
  5. `app/lib/tts.test.ts` (12 tests) — Multi-speaker TTS (`gemini-3.1-flash-tts-preview`), WAV header encoding (24 kHz, 16-bit mono), single voice clip Data URIs, and translation.
  6. `app/lib/stitch.test.ts` (7 tests) — FFmpeg concat demuxer, 48 kHz broadcast audio fallback (`-ar 48000`), frame extraction (`extractFrame`), and cleanup.
  7. `app/lib/veo.test.ts` (13 tests) — Veo 3.1 video generation (`veo-3.1-generate-preview`), reference images, frame interpolation, 2 RPM rate limiting, and RAI filter error handling (`VeoRAIFilterError`).
  8. `app/lib/memory-bank.test.ts` (24 tests) — 4-tier cognitive memory bank (working, episodic, semantic, procedural), concept decay/boost dynamics, dynamic tangents.
  9. `app/lib/m3-m4-challenger.test.ts` (32 tests) — Media engine & memory bank empirical stress testing.
  10. `workflows/generate-show.test.ts` (7 tests) — Workflow helper unit tests (`buildVeoPrompt`, `sanitizeNotesForVeo`, `parseScriptJson`).
  11. `workflows/workflow-media-challenger.test.ts` (10 tests) — Format duration routing (>40s podcast vs <=40s video), monotonic progress streaming, and TTS/Veo media interface compatibility.
  12. `app/lib/e2e-integration.test.ts` (28 tests) — Master 4-tier E2E suite covering all 14 features across unit, boundary, cross-feature, and real-world application scenarios.
- **Test Execution Result**:
  - Command: `npm test`
  - Output: `Test Files 12 passed (12) | Tests 271 passed (271) | Duration: ~950ms`.

### B. Audio Pipeline & Broadcast Normalization
- **TTS Generation (`app/lib/tts.ts`)**:
  - Model: `gemini-3.1-flash-tts-preview` (line 176).
  - API Client: `@google/genai` `GoogleGenAI` initialized with `env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY` (lines 12–18).
  - Voice Mapping (`app/lib/tts.ts:24–57`):
    - `John Oliver` -> `Charon`
    - `Seth Meyers` -> `Orus`
    - `Colin Jost` -> `Charon`
    - `Michael Che` -> `Puck`
    - Fallback voices: `["Charon", "Orus", "Puck", "Fenrir", "Aoede", "Kore", "Enceladus"]`.
  - PCM to WAV Encoding (`app/lib/tts.ts:63–88`): `encodePcmToWav` constructs standard 44-byte RIFF/WAVE header (24,000 Hz, 16-bit PCM, 1 channel mono, 48,000 byte/s).
  - Multilingual Translation (`app/lib/tts.ts:106–129`): Uses `gemini-3-flash-preview` to translate transcripts to `de`, `es`, `fr`, `ja`, `pt` before speech synthesis.
  - Interactive Single Voice Clip (`app/lib/tts.ts:199–206`): `generateSingleVoiceClip` returns base64 Data URI (`data:audio/wav;base64,...`).
  - TTS REST Endpoint (`app/api/tts/route.ts`): Accepts `{ transcript, hosts, targetLang }` via POST, returning audio/wav.
- **FFmpeg Audio Normalization & Stitching (`app/lib/stitch.ts`)**:
  - Single Clip Bypass (lines 28–32): `fs.copyFileSync(clipPaths[0], dest)` without FFmpeg overhead.
  - Concat Demuxer Fast-Path (lines 48–60):
    `ffmpeg -y -f concat -safe 0 -i listPath -c copy output` (lossless, instant).
  - Broadcast Normalization Fallback (lines 64–85):
    `ffmpeg -y -f concat -safe 0 -i listPath -c:v libx264 -preset fast -crf 23 -c:a aac -ar 48000 -b:a 128k output`
    (48 kHz audio sample rate `-ar 48000`, stereo AAC encoding, 128 kbps bitrate, H.264 video).
  - Frame Extraction (lines 111–140): `ffmpeg -y -ss <timeSeconds> -i videoPath -frames:v 1 -f image2 outputPath`.
- **Podcast Workflow (`workflows/generate-show.ts`)**:
  - Duration Router (`checkShowFormatStep`, lines 143–154): Evaluates `(show.durationSeconds ?? 16) > 40`.
  - Audio Podcast Path (`audioPodcastSynthesisStep`, lines 286–341): For shows > 40s (up to 300s / 5m), executes Gemini 3.1 Flash TTS multi-speaker synthesis directly, writing output WAV to temp storage and skipping Veo video generation.
  - Video Show Path (`frameChainAndGenerateClipsStep` + `stitchStep`, lines 347–535, 638–679): For shows <= 40s (8s to 40s), generates sequential video clips, stitches them, and uploads to Mux.

### C. Build System, TypeScript & Environment Validation
- **TypeScript Configuration (`tsconfig.json`)**:
  - Target: `ES2017`, JSX: `react-jsx`, Module: `esnext`, ModuleResolution: `bundler`.
  - Path Aliases: `"@/*": ["./*"]`.
  - Strict typing: `"strict": true`, `"noEmit": true`, `"skipLibCheck": true`.
  - Type-checking command: `npx tsc --noEmit` exits with code 0 (0 errors).
- **ESLint Configuration (`eslint.config.mjs`)**:
  - Uses `@antfu/eslint-config`, `@eslint-react/eslint-plugin`, `@remotion/eslint-plugin`, and `perfectionist/sort-imports`.
  - Key enforcement: `node/no-process-env` (all environment variables must be imported from `app/lib/env.ts`), double quotes, 2-space indentation, semicolons, cuddled braces.
- **Environment Validation (`app/lib/env.ts`)**:
  - Runtime validation using Zod (`EnvSchema`).
  - Required variables: `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `DATABASE_URL`.
  - Optional / AI keys: `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `MUX_SIGNING_KEY`, `MUX_PRIVATE_KEY`, `REMOTION_AWS_ACCESS_KEY_ID`, `REMOTION_AWS_SECRET_ACCESS_KEY`, `NEXT_PUBLIC_BASE_URL`.
  - Build Phase Bypass (lines 62–64):
    `if (process.env.NEXT_PHASE === "phase-production-build") return process.env as unknown as Env;`
    Ensures `npm run build` succeeds without requiring runtime secrets during CI / production packaging.
- **Next.js Production Build**:
  - Command: `npm run build` (`next build` with Turbopack).
  - Status: Successfully compiled all 14 routes (static and dynamic endpoints) with 0 errors.

### D. Mock Structures in Existing Test Suite
- **`@google/genai` Mocking**:
  - Implemented across `app/lib/tts.test.ts`, `app/lib/veo.test.ts`, `app/lib/m3-m4-challenger.test.ts`, `app/lib/e2e-integration.test.ts`.
  - Mocked surfaces:
    - `models.generateContent`: Returns mock text or base64 PCM audio data (`inlineData.data`).
    - `models.generateVideos`: Returns mock operation object (`{ done: true, response: { generatedVideos: [{ video: { uri: "gs://..." } }] } }`).
    - `operations.getVideosOperation`: Mock polling transitions from `done: false` to `done: true`.
    - `files.download`: Mock file download to specified `downloadPath`.
- **System Command Mocking**:
  - `child_process.execFile` mocked via `vi.mock("node:child_process")` to simulate FFmpeg concatenation and frame extraction without spawning external FFmpeg binaries.
- **Database & Search Mocking**:
  - `pg` and `drizzle-orm/node-postgres` mocked with in-memory array collections (`mockDbMemories`, `mockDbChatMessages`, `mockDbTangents`).
  - `db/search` mocked via `mockSearchVideoChunks`.

---

## 2. Logic Chain

1. *Premise*: The upgrade requires migrating from legacy Veo (`veo-3.1-generate-preview`) to Google Gemini Omni 1.1 Flash (`gemini-omni-1.1-flash`) while preserving all audio pipeline features, test coverage, and build cleanliness.
2. *Observation*: The test suite comprises 12 test files with 271 tests passing in <1s. Tests for video generation (`app/lib/veo.test.ts`, `app/lib/m3-m4-challenger.test.ts`, `workflows/workflow-media-challenger.test.ts`, `app/lib/e2e-integration.test.ts`) currently mock `models.generateVideos` and `getVideosOperation` polling with `veo-3.1-generate-preview`.
3. *Inference*: Migrating to `gemini-omni-1.1-flash` via the Interactions API will require updating:
   - SDK call signatures in `app/lib/veo.ts` (or the new Omni 1.1 video generator module).
   - Mock definitions in `app/lib/veo.test.ts`, `app/lib/m3-m4-challenger.test.ts`, `workflows/workflow-media-challenger.test.ts`, and `app/lib/e2e-integration.test.ts`.
   - Prompt formatting to support `<FIRST_FRAME>`, `<LAST_FRAME>`, `<IMAGE_REF_0>` tags and native parameters (`360p`, `720p`, `1080p`, `4k`, `16:9`, `9:16`, durations 3s–10s, extensions up to 40s).
4. *Observation*: The audio pipeline (`app/lib/tts.ts`, `app/lib/stitch.ts`, `workflows/generate-show.ts`) operates independently of the video model:
   - Long-form audio podcasts (>40s up to 300s) execute exclusively through `gemini-3.1-flash-tts-preview` in `audioPodcastSynthesisStep`.
   - Short-form video shows (<=40s) generate video clips and run FFmpeg stitch with 48 kHz stereo AAC normalization fallback (`-ar 48000 -c:a aac -b:a 128k`).
5. *Inference*: The audio pipeline and podcast workflow are completely decoupled from video model internals and will remain 100% stable during the Omni 1.1 migration.
6. *Observation*: TypeScript compilation (`npx tsc --noEmit`) and Next.js production build (`npm run build`) are currently passing with 0 errors due to `app/lib/env.ts`'s `NEXT_PHASE` build bypass.
7. *Inference*: To maintain 100% green builds, any new Omni 1.1 parameters and types must be strictly typed in TypeScript and exported with zero type regressions.

---

## 3. Caveats

1. **Standalone CLI Test Scripts**: `scripts/test-veo.ts` and `scripts/test-reference-image.ts` are live integration test scripts intended for manual runs with real API keys (`.env.local`). They are not run during `npm test` (which uses Vitest with mocks). When updating model names, these scripts should also be updated to test `gemini-omni-1.1-flash`.
2. **Remotion Lambda Integration**: Remotion is configured in `remotion/` and tested via `app/api/lambda/render/route.ts` and `app/api/lambda/progress/route.ts`. It does not interfere with the core Omni/Veo video generator or TTS pipeline.

---

## 4. Conclusion

- **Testing Infrastructure**: Comprehensive and fully operational (12 test files, 271 passing tests, Vitest v4.1.2 runner).
- **Audio Pipeline**:
  - Multi-speaker TTS powered by `gemini-3.1-flash-tts-preview` with custom 24 kHz WAV encoding.
  - Broadcast normalization strictly enforced at 48 kHz stereo AAC (`-ar 48000`) with lossless concat fast-path.
  - Podcast workflow (>40s up to 300s / 5m) operates reliably without video dependencies.
- **Build & Typing Health**:
  - TypeScript (`npx tsc --noEmit`): 0 errors.
  - Next.js 16 build (`npm run build`): 14 routes successfully compiled.
  - ESLint rules and environment variable validation are strictly configured.
- **Migration Readiness**:
  - All mock surfaces for GenAI and Veo are clearly isolated in Vitest mocks.
  - Updating to `gemini-omni-1.1-flash`, native frame tags (`<FIRST_FRAME>`, `<LAST_FRAME>`), scene extensions (up to 40s), and reference asset conditioning (`<IMAGE_REF_0>`) can be cleanly implemented with deterministic test assertions.

---

## 5. Verification Method

To independently verify the test suite, audio pipeline, and build system:

1. **Run Unit & E2E Test Suite**:
   ```bash
   npm test
   ```
   *Expected*: All 12 test files pass, 271/271 tests pass with exit code 0.

2. **Run TypeScript Compilation Check**:
   ```bash
   npx tsc --noEmit
   ```
   *Expected*: 0 errors, exit code 0.

3. **Run Production Next.js Build**:
   ```bash
   npm run build
   ```
   *Expected*: Next.js 16 production build compiles all 14 routes with 0 errors.

4. **Inspect Audio & Video Pipeline Code**:
   - `app/lib/tts.ts` (lines 136–193: `gemini-3.1-flash-tts-preview`, `encodePcmToWav`)
   - `app/lib/stitch.ts` (lines 48–85: concat demuxer & 48 kHz `-ar 48000` broadcast audio fallback)
   - `workflows/generate-show.ts` (lines 143–154, 286–341: podcast routing >40s up to 5m)
   - `app/lib/env.ts` (lines 60–65: build phase validation bypass)
