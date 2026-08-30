# Architecture & Codebase Audit Report: Interdimensional Cable (Requirement R1)

## 1. Observation

### A. Google Cloud / Gemini AI Ecosystem Verification
Direct observations across the codebase verify the integration of Google Cloud & Gemini AI services in primary application paths:

1. **Reasoning, Scripting & Search Grounding (`gemini-3-flash-preview` / `@google/genai`)**:
   - `app/lib/veo.ts` (lines 380-390): Calls `client.models.generateContent` with `model: "gemini-3-flash-preview"`, `thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }`, and optional Google Search Grounding (`tools: [{ googleSearch: {} }]`).
   - `app/lib/memory-bank.ts` (lines 178-184): Uses `gemini-3-flash-preview` with `responseMimeType: "application/json"` for autonomous memory extraction from user interactions.
   - `app/watch/[showId]/chat/actions.ts` (lines 127-138): Interactive host Q&A uses `google("gemini-3-flash-preview")` via `@ai-sdk/google` with `thinkingConfig: { thinkingLevel: "high" }`.
   - `scripts/autonomous-trend-agent.ts` (lines 126-132): The Taskmaster autonomous coordinator evaluates Hacker News stories against the user memory profile using `gemini-3-flash-preview` with `responseMimeType: "application/json"`.

2. **Video Generation (`veo-3.1-generate-preview` / `@google/genai`)**:
   - `app/lib/veo.ts` (lines 157-172): Invokes `client.models.generateVideos` with `model: "veo-3.1-generate-preview"`, 1080p resolution, 8-second duration, and reference image support (`referenceImages`, `personGeneration: "allow_adult"`).
   - `app/lib/veo.ts` (lines 307-324): Interpolation / frame chaining mode with start frame (`image`) and end frame (`lastFrame`).

3. **Multi-Speaker Speech Synthesis (`gemini-3.1-flash-tts-preview` / `gemini-2.5-flash-preview-tts`)**:
   - `app/lib/tts.ts` (lines 152-169): Primary TTS synthesis targets `gemini-3.1-flash-tts-preview` with `responseModalities: ["AUDIO"]` and `speechConfig` (`multiSpeakerVoiceConfig` mapping hosts to prebuilt voices: Charon, Orus, Puck, Kore, Fenrir, Aoede, Enceladus). Includes automated try/catch fallback to `gemini-2.5-flash-preview-tts`.
   - `app/lib/tts.ts` (lines 39-64): Custom PCM-to-WAV encoder (24 kHz, 16-bit, mono) converts raw audio buffers for player and Remotion compositing.

4. **Vector Embeddings & Semantic Search (`text-embedding-004` + `pgvector`)**:
   - `db/schema.ts` (line 45): `embedding: vector("embedding", { dimensions: 768 })`.
   - `db/schema.ts` (line 49): `index("video_chunks_embedding_idx").using("hnsw", table.embedding.op("vector_cosine_ops"))`.
   - `db/search.ts` (lines 24-27): `client.models.embedContent({ model: "text-embedding-004", contents: [{ parts: [{ text }] }] })`.
   - `db/search.ts` (line 107): Cosine similarity search using `sql<number>\`1 - (${cosineDistance(videoChunks.embedding, embedding)})\``.

---

### B. Lingering Non-Google AI SDKs and Legacy Dependencies
Grep searches across the codebase identified non-Google AI SDK references and active imports in legacy/reference paths:

1. **`@ai-sdk/openai` in Active Code**:
   - `package.json` (line 26): `"@ai-sdk/openai": "^2.0.86"` is listed under `"dependencies"`.
   - `app/media/[slug]/social-clips/actions.ts`:
     - Line 3: `import { openai } from "@ai-sdk/openai";`
     - Line 299: `model: openai("gpt-5.2"),` in `suggestSocialClipRangeAction`
     - Line 368: `model: openai("gpt-5.2"),` in `getPreviewClipAction`
   - `workflows/translate-captions.ts` (line 98): Hardcoded `provider: "openai"` passed to `@mux/ai`.

2. **`ElevenLabs` in Active Code**:
   - `app/lib/env.ts` (line 38): `ELEVENLABS_API_KEY: optionalString("ElevenLabs API key for translateAudio workflow.")`.
   - `workflows/translate-audio.ts` (lines 141-143): Throws `ElevenLabs env key required` if `!env.ELEVENLABS_API_KEY`.
   - `app/api/workflows/translate-audio/route.ts` (lines 19-22): Returns 400 error requiring `ElevenLabs env key`.
   - `app/media/[slug]/localization/actions.ts` (lines 185-187): Requires `env.ELEVENLABS_API_KEY`.

3. **`@ai-sdk/anthropic` references**:
   - `app/lib/env.ts` (line 31): `ANTHROPIC_API_KEY: optionalString("Anthropic API key for Claude-backed workflows.")`.
   - `app/media/[slug]/summarize-and-tag/actions.ts` (lines 44-50): Fallback order checks `env.ANTHROPIC_API_KEY`, then `env.OPENAI_API_KEY`, then `env.GOOGLE_GENERATIVE_AI_API_KEY`.

4. **Documentation Inconsistencies**:
   - `CLAUDE.md` (line 157): States `Embeddings: OpenAI text-embedding-3-small (1536 dimensions)` (contrasting with actual 768-dim `text-embedding-004` in `db/schema.ts`).
   - `AGENTS.md` (lines 83-87): Lists `OPENAI_API_KEY` and `ELEVENLABS_API_KEY` under required variables.

---

### C. Workflow Patterns, Streaming, and Reliability
1. **Vercel Workflows Pattern**:
   - `workflows/generate-show.ts`: Adheres to `"use workflow"` at line 50 and `"use step"` at lines 116, 134, 201, 345, 624, 672.
   - Dynamic imports (`await import(...)`) are consistently used inside step functions to ensure Node.js modules (`pg`, `fs`, `node:os`, `drizzle-orm`) are only loaded in step execution workers and excluded from the workflow orchestrator AST.
   - Web Streams `getWritable<ProgressEvent>({ namespace: "progress" })` writes real-time progress events (`research`, `script`, `frame-chain`, `generate-clips`, `stitch`, `upload`).
   - Workflow dispatch is non-blocking via `start(generateShowWorkflow, [showId])` from `app/api/workflows/generate-show/route.ts` (line 44) and `scripts/autonomous-trend-agent.ts` (line 172).

2. **Video Composition & Frame Chaining Pipeline**:
   - `app/lib/stitch.ts`: FFmpeg concat demuxer (`-f concat -c copy`) performs lossless concatenation of 8-second MP4 clips. If codec mismatch occurs, gracefully falls back to re-encoding (`libx264`, `crf 23`, `aac 128k`).
   - `app/lib/stitch.ts` (`extractFrame`): Extracts anchor PNG frames at `timeSeconds` (0s and 7.5s) for visual continuity across chained segments.
   - `app/lib/mux.ts`: Full direct upload pipeline (`createDirectUpload` -> `fetch(PUT)` -> `waitForUploadAssetId` -> `waitForAssetReady`).

3. **Autonomous Taskmaster Pipeline**:
   - `scripts/autonomous-trend-agent.ts`: Monitors Hacker News top stories via Firebase API, pulls user memory profiles from PostgreSQL, prompts Gemini 3 Flash for show persona selection and duration, inserts `generatedShows` records, and starts workflow execution asynchronously.

---

### D. Error Handling, Fallbacks, and Rate Limiting
1. **Veo 3.1 RAI Filter Recovery Loop**:
   - `workflows/generate-show.ts` (lines 456-480): Catches `VeoRAIFilterError`. If an 8-second clip triggers content filters, `reviseSegmentText()` prompts Gemini 3 Flash to rephrase the spoken dialogue to replace flagged entity references while maintaining comedic timing and length. The rewritten line updates the database transcript before retrying video generation.

2. **Veo Rate Limiting (2 RPM Enforcement)**:
   - `app/lib/veo.ts` (lines 27-51): Sliding window queue (`veoCallTimestamps`) restricts calls to 2 requests per 60 seconds with automatic waiting.
   - Exponential backoff retry loop catches HTTP 429 / `RESOURCE_EXHAUSTED` up to 3 retries with a 60-second backoff per attempt.

3. **TTS Resiliency**:
   - `app/lib/tts.ts` (lines 159-168): Automatic fallback from `gemini-3.1-flash-tts-preview` to `gemini-2.5-flash-preview-tts` on failure.
   - `app/watch/[showId]/chat/actions.ts` (lines 153-157): Chat TTS failure is safely logged as a warning without failing the text response.

4. **PostgreSQL-Backed Rate Limiting**:
   - `app/lib/rate-limit.ts`: Rate limits configured for `generate-show` (5/day), `summary` (10/day), `search` (50/hr), `translate-captions` (10/day), `translate-audio` (3/day), and `render` (6/day). Returns HTTP 429 with standard headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`).

---

### E. Build and Test Suite Execution
1. **Test Suite Execution (`npm run test`)**:
   - Output: `Test Files 4 passed (4)`, `Tests 26 passed (26)`.
   - Covered suites: `workflows/generate-show.test.ts` (11 tests), `app/lib/stitch.test.ts` (4 tests), `app/lib/veo.test.ts` (9 tests), `app/lib/memory-bank.test.ts` (2 tests).
2. **Production Build (`npm run build`)**:
   - Output: Turbopack compilation succeeded in 6.8s. All 19 routes compiled (15 dynamic routes, 4 static prerendered routes). Exit code 0.
3. **Linter Status (`npm run lint`)**:
   - Output: 13 errors, 75 warnings. The errors are stylistic (JSX indentation in `tts-panel.tsx`, `node/prefer-global/buffer` in `tts.ts`, and `ts/no-require-imports` in test files).

---

## 2. Logic Chain

1. *Premise*: Requirement R1 requires verifying strict Google Cloud / Gemini AI ecosystem adherence and checking if any non-Google AI SDKs remain in active execution paths.
2. *Observation*: The core "Interdimensional Cable" features (show generation, live in-character chat, persistent memory bank, multi-speaker voice synthesis, semantic search, and autonomous trend ingestion) are 100% powered by `@google/genai` and `@ai-sdk/google` (`gemini-3-flash-preview`, `veo-3.1-generate-preview`, `gemini-3.1-flash-tts-preview`, `text-embedding-004`, `pgvector`).
3. *Observation*: However, legacy routes inherited from the Mux demo codebase (`app/media/[slug]/social-clips/actions.ts`, `workflows/translate-captions.ts`, `workflows/translate-audio.ts`) still contain imports of `@ai-sdk/openai`, hardcoded `"openai"` provider strings, and ElevenLabs API key guards.
4. *Inference*: While the newly built Interdimensional Cable engine is completely aligned with Google AI, legacy demo components still retain dependencies on non-Google providers.
5. *Premise*: Requirement R1 requires auditing architectural discipline, reliability, streaming, and background workflows.
6. *Observation*: `workflows/generate-show.ts` and `scripts/autonomous-trend-agent.ts` strictly follow Vercel Workflows best practices with dynamic module isolation, persistent database state transitions, Web Streams progress delivery, and automated RAI content filter recovery.
7. *Observation*: Production build (`npm run build`) and automated test suites (`npm run test`) pass completely without failures.

---

## 3. Caveats

1. **Mux Demo Legacy Modules**: The repository is a dual-purpose codebase: it retains the original "Demuxed Library / Try Workflows" Mux reference implementation under `app/media/` alongside the new "Interdimensional Cable" multimodal generative network under `app/create/`, `app/watch/`, `app/templates/`, and `workflows/generate-show.ts`.
2. **Environment Variables During Build**: `app/lib/env.ts` explicitly bypasses runtime environment validation during `NEXT_PHASE === "phase-production-build"`, ensuring that build artifacts compile cleanly in CI/CD without live Google API keys.
3. **Veo Rate Limiter Concurrency**: The in-memory sliding window rate limiter in `app/lib/veo.ts` is process-local. In a multi-instance serverless deployment, concurrent instances would rely on API-level 429 retries rather than shared state.

---

## 4. Conclusion

1. **Google AI Stack Status**: **APPROVED & FULLY INTEGRATED** in all Interdimensional Cable workflows (`gemini-3-flash-preview`, `veo-3.1-generate-preview`, `gemini-3.1-flash-tts-preview`, `text-embedding-004`, `pgvector`).
2. **Actionable Recommendations for Non-Google Dependencies**:
   - **Recommendation 1 (High)**: Migrate `app/media/[slug]/social-clips/actions.ts` from `openai("gpt-5.2")` to `google("gemini-3-flash-preview")` via `@ai-sdk/google` to achieve 100% Google AI SDK purity across all sub-features.
   - **Recommendation 2 (Medium)**: Remove `@ai-sdk/openai` from `package.json`.
   - **Recommendation 3 (Low)**: Update `CLAUDE.md` and `AGENTS.md` to reflect `text-embedding-004` (768 dimensions) instead of legacy OpenAI embeddings.
3. **Architecture & Reliability**: **EXCELLENT**. Resilient workflow design with RAI content filter re-scripting, multi-speaker TTS fallback, FFmpeg concat fallback, database-backed rate limiting, and fully verified tests (`26/26 passed`) and build (`Next.js 16 App Router exit 0`).

---

## 5. Verification Method

To independently verify these findings, run the following commands:

1. **Verify Google Model References**:
   ```bash
   grep -rn "gemini-3-flash-preview\|veo-3.1-generate-preview\|gemini-3.1-flash-tts-preview\|text-embedding-004" app/ workflows/ db/ scripts/
   ```

2. **Verify Lingering Non-Google AI References**:
   ```bash
   grep -rn "@ai-sdk/openai\|openai(\"gpt-5.2\")\|ELEVENLABS_API_KEY\|ANTHROPIC_API_KEY" app/ workflows/ package.json
   ```

3. **Execute Automated Test Suite**:
   ```bash
   npm run test
   ```
   *Expected result*: 4 test suites passed, 26 tests passed.

4. **Execute Next.js Production Build**:
   ```bash
   npm run build
   ```
   *Expected result*: Production compilation finishes with exit code 0.
