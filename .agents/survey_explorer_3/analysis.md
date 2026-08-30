# Comprehensive Investigation Report: Memory Bank, RAG & Test Infrastructure

**Agent:** Survey Explorer 3 (Memory Bank, RAG & Test Infrastructure Explorer)  
**Date:** 2026-08-30  
**Repository:** `multimodal-frontier-hackathon-interdimensional-cable`  

---

## Executive Summary

This report delivers an exhaustive technical audit of:
1. **Database Schema, ORM (Drizzle), Postgres / pgvector Setup, Migrations & Vector Search**: Full architecture analysis of tables, indexes, embedding dimensionality (Google `text-embedding-004` 768d vs historical 1536d), search execution in `db/search.ts`, and migration sync status.
2. **R4 Persistent Agent Memory Bank & Real-Time RAG**: Deep evaluation of the 4-tier cognitive memory model (Episodic, Semantic 768d pgvector, Procedural Show SKILLs, Working memory session buffer), autonomous background learning engine, prompt contextualization, and cross-session host personalization.
3. **Test Harness & Build Infrastructure**: Audit of Vitest v4.1.2 (26 passing tests across 4 suites), Next.js 16.0.10 build verification (14 routes compiled with 0 errors), environment validation with build-phase bypass in `app/lib/env.ts`, and ESLint rule breakdown (`@antfu/eslint-config`, `perfectionist`, `unicorn/filename-case`).

---

## Part 1: Database Schema, ORM & Vector Search Infrastructure

### 1.1 Connection & ORM Architecture

- **Drizzle ORM Version:** `drizzle-orm@^0.45.1`, `drizzle-kit@^0.31.8`, `pg@^8.16.3`.
- **Database Connection Pool (`db/index.ts`):**
  ```typescript
  // db/index.ts:8-13
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  export const db = drizzle(pool, { schema });
  ```
- **Drizzle Kit Configuration (`drizzle.config.ts`):**
  ```typescript
  // drizzle.config.ts:8-15
  export default defineConfig({
    schema: "./db/schema.ts",
    out: "./db/migrations",
    dialect: "postgresql",
    dbCredentials: {
      url: process.env.DATABASE_URL!,
    },
  });
  ```

### 1.2 Table Definitions (`db/schema.ts`)

| Table Name | Primary Purpose | Key Columns | Indexes / Constraints |
|---|---|---|---|
| `videos` | Mux Video Catalog | `id` (UUID PK), `muxAssetId` (text unique), `muxPlaybackId`, `title`, `summary`, `meta` (JSONB), `aspectRatio`, `duration`, `tags` (text[]), `transcriptVtt` | `videos_mux_asset_id_idx` |
| `video_chunks` | Transcript Chunks & Embeddings | `id` (UUID PK), `videoId` (UUID FK -> `videos.id` CASCADE), `chunkIndex` (int), `startTime`, `endTime`, `embedding` (vector(768)) | `video_chunks_video_id_idx` (btree), `video_chunks_embedding_idx` (HNSW cosine) |
| `rate_limits` | IP & Endpoint Rate Limiting | `id` (UUID PK), `identifier` (text), `endpoint` (text), `windowStart` (timestamp), `requestCount` (int) | `rate_limits_lookup_idx` (`identifier`, `endpoint`, `windowStart`) |
| `feature_metrics` | Analytics & Feature Tracking | `id` (UUID PK), `feature` (text), `identifier`, `metadata` (JSONB), `createdAt` | `feature_metrics_feature_idx`, `feature_metrics_created_at_idx` |
| `show_templates` | Show Archetypes & Personas | `id` (UUID PK), `name` (text), `showType` ("monologue" \| "conversation"), `referenceImageUrl`, `hosts` (JSONB: name, personality, position), `notes`, `isDefault` | PK |
| `generated_shows` | Generated Show State Machine | `id` (UUID PK), `templateId` (UUID FK -> `showTemplates.id`), `topic`, `topicType` ("freetext" \| "news_link" \| "hacker_news"), `durationSeconds`, `familiarity` ("beginner" \| "familiar" \| "expert"), `status` (pending, researching, scripting, generating, stitching, uploading, ready, failed), `researchContext`, `transcript`, `transcriptSegments` (JSONB), `muxAssetId`, `muxPlaybackId`, `error`, `workflowRunId`, `language`, `useFrameChaining`, `userId` | `generated_shows_user_id_idx`, `generated_shows_status_idx` |
| `video_clips` | Veo 3.1 8s Video Segments | `id` (UUID PK), `showId` (UUID FK -> `generatedShows.id` CASCADE), `clipIndex`, `durationSeconds`, `prompt`, `status`, `videoUrl`, `error` | `video_clips_show_id_idx` |
| `chatMessages` | In-Character Listener Chat | `id` (UUID PK), `showId` (UUID FK -> `generatedShows.id` CASCADE), `role` ("user" \| "assistant"), `content`, `createdAt` | `chat_messages_show_id_idx` |
| `user_settings` | User Profile & Preferences | `id` (UUID PK), `userId` (text UNIQUE), `age`, `location`, `defaultLanguage`, `defaultFamiliarity` | `user_settings_user_id_unique` |
| `user_memories` | Persistent Agent Memory Bank | `id` (UUID PK), `userId` (text), `memoryType` ("concept_mastery" \| "humor_preference" \| "interest_topic" \| "question_pattern" \| "custom_note"), `key` (text), `value` (text), `confidence` (real default 1.0), `sourceShowId` (UUID FK -> `generatedShows.id` SET NULL), `updatedAt` | `user_memories_user_id_idx`, `user_memories_type_idx` |
| `show_tangents` | Interactive Spinoff Audio Clips | `id` (UUID PK), `showId` (UUID FK -> `generatedShows.id` CASCADE), `userId`, `question`, `hostName`, `scriptText`, `audioUrl`, `audioData` (base64 data URI), `durationSeconds` | `show_tangents_show_id_idx` |

### 1.3 Migration Status & Gaps

In `db/migrations/`:
- `0000_init.sql`: Creates `vector` extension, `video_chunks`, `videos`. *Note:* Originally created with `vector(1536)`.
- `0001_rate_limits.sql`: Adds `rate_limits` table.
- `0002_feature_metrics.sql`: Adds `feature_metrics` table.
- `0003_interdimensional_cable.sql`: Adds `show_templates`, `generated_shows`, `video_clips`, `chat_messages`, `user_settings`.
- `0004_frame_chaining.sql`: Adds `use_frame_chaining` column to `generated_shows`.
- **Identified Gap:** `user_memories` and `show_tangents` tables exist in `db/schema.ts` (lines 177-209) and are queried by `app/lib/memory-bank.ts` and `app/watch/[showId]/chat/actions.ts`, but an explicit migration file (e.g. `0005_memory_bank_and_tangents.sql`) has not been committed. In production/test databases, running `drizzle-kit generate` or applying `0005` ensures full schema parity.

### 1.4 Vector Search Implementation (`db/search.ts`)

- **Model:** Google `text-embedding-004` (768-dimensional float vectors).
- **Client Initialization (`db/search.ts:14-20`):**
  ```typescript
  function getClient(): GoogleGenAI {
    const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY is required");
    return new GoogleGenAI({ apiKey });
  }
  ```
- **Embedding Generation (`db/search.ts:22-33`):**
  ```typescript
  export async function getGoogleEmbedding(text: string): Promise<number[]> {
    const client = getClient();
    const response = await client.models.embedContent({
      model: "text-embedding-004",
      contents: [{ parts: [{ text }] }],
    });
    const values = response.embeddings?.[0]?.values;
    if (!values) throw new Error("Failed to generate Google text-embedding-004 embedding");
    return values;
  }
  ```
- **Vector Cosine Similarity & Execution (`db/search.ts:107-126`):**
  ```typescript
  const similarity = sql<number>`1 - (${cosineDistance(videoChunks.embedding, embedding)})`;
  const results = await db
    .select({ ... })
    .from(videoChunks)
    .innerJoin(videos, eq(videoChunks.videoId, videos.id))
    .orderBy(desc(similarity))
    .limit(limit);
  ```
- **Two Distinct Search Modes:**
  1. `searchVideoChunks(query, limit)`: Global semantic search across the entire catalog with IP rate limiting and parallel Mux playback ID lookup.
  2. `searchChunksWithinVideo(query, muxAssetId, limit)`: Scoped semantic search within a specific video filtered by `muxAssetId` and `similarity > 0.1` for precision in-video transcript scrolling and cue jumping.

---

## Part 2: R4 Persistent Agent Memory Bank & Real-Time RAG

### 2.1 The 4-Tier Cognitive Memory Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                    4-TIER COGNITIVE MEMORY BANK                           │
├───────────────────────────────────────────────────────────────────────────┤
│ 1. WORKING MEMORY (Session Buffer)                                        │
│    • Live chat conversation buffer (db.chatMessages)                      │
│    • Current show transcript + research brief (db.generatedShows)         │
│    • Active prompt context for real-time turn-taking                      │
├───────────────────────────────────────────────────────────────────────────┤
│ 2. EPISODIC MEMORY (Cross-Session Experience & Callbacks)                 │
│    • Past generated shows & topics for userId (db.generatedShows)         │
│    • User interaction history & tangent spin-offs (db.showTangents)       │
│    • Question patterns & callbacks logged in db.userMemories              │
├───────────────────────────────────────────────────────────────────────────┤
│ 3. SEMANTIC MEMORY (Dense Knowledge Retrieval)                           │
│    • 768-dimensional pgvector embeddings via Google text-embedding-004    │
│    • HNSW index on video transcript chunks (db.videoChunks)               │
│    • Grounded factual retrieval via searchVideoChunks / searchChunks      │
├───────────────────────────────────────────────────────────────────────────┤
│ 4. PROCEDURAL MEMORY (Show SKILLs & Dramaturgical Rules)                  │
│    • Show archetype templates (Archetype A Desk Shows vs Archetype B      │
│      Conversational Podcasts)                                             │
│    • Host personas, rhetorical spines, joke density targets,              │
│      rule-of-three, tags, callbacks, and tangent drift logic              │
└───────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Structures & Memory Types

Defined in `db/schema.ts` and `app/lib/memory-bank.ts`:
- `concept_mastery`: Tracks user knowledge depth (e.g. `key: "quantum-computing"`, `value: "Expert level"`, `confidence: 0.90`).
- `humor_preference`: Tracks learned comedy style (e.g. `value: "Sharp, dry British satire with escalating analogies"`).
- `interest_topic`: Tracks topics the user frequently explores (e.g. `key: "ai-agents"`, `value: "autonomous systems"`).
- `question_pattern`: Logs recent queries/tangents (e.g. `value: "How does Veo 3.1 maintain temporal consistency?"`).
- `custom_note`: Open-ended agent notes.

### 2.3 Autonomous Extraction Engine (`app/lib/memory-bank.ts:146-237`)

- **Trigger:** Invoked asynchronously after every live chat interaction (`app/watch/[showId]/chat/actions.ts:161`) and tangent creation (`actions.ts:239`).
- **Model:** Gemini 3.7 Flash (`gemini-3.7-flash`) with structured JSON schema output (`responseMimeType: "application/json"`).
- **Prompt:** Analyzes `TOPIC`, `USER MESSAGE`, and `ASSISTANT RESPONSE` to extract persistent insights.
- **Upsert Logic:** Queries `userMemories` for matching `userId`, `key`, and `memoryType`. Updates existing record or inserts new record with confidence weighting and `sourceShowId`.

### 2.4 Personalization Injection & Cross-Session Adaptation

- `buildPersonalizedPromptContext(userId)` generates:
  ```
  === PERSISTENT USER MEMORY BANK ===
  Preferred Tone/Humor: Sharp, dry British satire with escalating analogies
  Known User Interests: ai-agents, distributed-systems
  User Concept Mastery: quantum-computing (Expert level)
  Recent Questions Asked by User:
  - How does Veo 3.1 maintain temporal consistency?
  Instruction: Adapt your explanation depth, humor, and analogies to resonate with these learned preferences without explicitly mentioning this memory bank.
  ```
- **Injection Touchpoints:**
  1. **Show Scripting Step (`workflows/generate-show.ts:252-265`):** Injects memory context into monologue and conversational desk show prompts so generated episodes reflect listener mastery and humor preferences.
  2. **Interactive Chat (`app/watch/[showId]/chat/actions.ts:98-106`):** Host stays in character while tailoring explanation depth to listener background.
  3. **On-Demand Tangent Generation (`actions.ts:195-204`):** Generates custom 35-second audio deep dives based on listener questions and memory context.
  4. **Autonomous Ingestion Agent (`scripts/autonomous-trend-agent.ts:98-112`):** Matches trending Hacker News stories against user memory profile to autonomously select the best topic and show template.

### 2.5 UI Presentation (`app/components/memory-profile-card.tsx`)

- Renders a brutalist card with real-time green pulse status indicator.
- Displays:
  - **Learned Tone & Humor** description.
  - **Concepts Mastered** badges with confidence tooltips (`confidence * 100%`).
  - **Tracked Interests** `#hashtag` badges.
  - **Recent In-Character Tangents** quote list.
  - **Autonomous Adaptation** badge ("Collaborative Partner").

---

## Part 3: Test Harness, Build & Lint Infrastructure

### 3.1 Test Infrastructure Audit

- **Runner:** Vitest v4.1.2 (`"test": "vitest run"`, `"test:watch": "vitest"`).
- **Config (`vitest.config.ts`):**
  ```typescript
  export default defineConfig({
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    test: {
      globals: true,
      environment: "node",
      include: ["**/*.test.ts"],
    },
  });
  ```
- **Current Test Suites:**
  1. `workflows/generate-show.test.ts` (11 tests): Tests `buildVeoPrompt` (monologue/conversation, speaker positioning, fallback), `sanitizeNotesForVeo` (HBO/NBC/SNL sanitization, celebrity name replacement), and `parseScriptJson` (valid JSON, embedded JSON, plaintext fallback, empty array).
  2. `app/lib/stitch.test.ts` (4 tests): Tests empty clip rejection, single clip copy, and `cleanupTempFiles`.
  3. `app/lib/veo.test.ts` (9 tests): Tests Gemini 3.7 text generation, Veo 3.1 video clip generation, operation polling, RAI error handling, and reference image resolution.
  4. `app/lib/memory-bank.test.ts` (2 tests): Tests memory summary computation from stored memories and personalized prompt context construction.
- **Execution Result:**
  ```bash
  Test Files  4 passed (4)
       Tests  26 passed (26)
    Duration  487ms
  ```
  **100% test pass rate with 0 failures.**

### 3.2 Build Verification (`npm run build`)

- **Framework:** Next.js 16.0.10 with Turbopack, React 19.2.0, Vercel Workflows (`workflow@^4.0.1-beta.29`).
- **Execution Result:**
  ```bash
  ✓ Compiled successfully in 7.0s
  ✓ Generating static pages using 9 workers (14/14)
  Finalizing page optimization ...
  ```
  All 14 routes (static landing, `/media`, `/create`, `/create/[showId]`, `/watch/[showId]`, `/templates`, workflow webhooks, and API routes) compiled with **0 errors**.

### 3.3 Environment Variable Validation (`app/lib/env.ts`)

- **Validation Engine:** Zod schema `EnvSchema` parsing `process.env`.
- **Required Variables:** `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `DATABASE_URL`.
- **Optional Variables:** `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `MUX_SIGNING_KEY`, `MUX_PRIVATE_KEY`, `REMOTION_AWS_ACCESS_KEY_ID`, `REMOTION_AWS_SECRET_ACCESS_KEY`, `NEXT_PUBLIC_BASE_URL`.
- **Build-Phase Bypass:**
  ```typescript
  // app/lib/env.ts:61-64
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return process.env as unknown as Env;
  }
  ```
  This guarantees `npm run build` succeeds in CI / build environments without runtime secrets.

### 3.4 ESLint & Code Style Audit (`eslint.config.mjs`)

- **Configuration:** `@antfu/eslint-config` v6.6.1 + `@next/eslint-plugin-next` + `@remotion/eslint-plugin`.
- **Rules Enforced:**
  - 2-space indentation, semicolons required, double quotes (`"`), cuddled braces (`1tbs`), operator linebreak at end of line.
  - `node/no-process-env`: Error when accessing `process.env` directly in application code.
  - `perfectionist/sort-imports`: Strict ordering with blank lines between groups.
  - `unicorn/filename-case`: Enforces `kebabCase`.
- **Lint Execution Findings:**
  - `npm run lint` reported 15 errors and 79 warnings.
  - The 15 errors stem from:
    1. `ORIGINAL_REQUEST.md`: File naming pattern in `eslint.config.mjs` (`^[A-Z][A-Z0-9-]+\\.md$` excludes `_`) and Prettier formatting.
    2. `README.md`: Prettier trailing space formatting.
    3. `app/create/create-form.tsx`: `antfu/if-newline` and `style/jsx-one-expression-per-line`.
  - The 79 warnings are mostly `no-console` warnings (configured as `"warn"`) and standard Next.js image / React key index warnings.
- **Recommended Action for Implementer:** Run `npm run lint:fix`, update `unicorn/filename-case` regex in `eslint.config.mjs` to include underscores (`^[A-Z0-9_-]+\\.md$`), and format `app/create/create-form.tsx` to achieve 0 lint errors.

---

## Part 4: Recommendations & Implementation Roadmap

1. **Add Drizzle Migration `0005_memory_bank_and_tangents.sql`**: Ensure `user_memories` and `show_tangents` tables, indexes, and vector dimension updates (768 for `text-embedding-004`) are formally versioned in `db/migrations/`.
2. **Expand Semantic RAG for Memory Retrieval**: Currently `db/search.ts` searches video transcript chunks. Extend vector search to index episodic user interaction memories, allowing semantic search over past user questions and host responses across sessions.
3. **Show SKILL Integration (R1 & R4 Procedural Memory)**: Wire the upcoming `SKILL.md` specifications directly into `show_templates` and `workflows/generate-show.ts` to enforce comedic density formulas, rule-of-three, tags, callbacks, and dynamic tangent drift.
4. **Expand Test Coverage**:
   - Add unit tests for `getMemorySummary` edge cases (empty memories, duplicate interests).
   - Add unit tests for `searchVideoChunks` and `searchChunksWithinVideo` mocking `GoogleGenAI` and Drizzle queries.
   - Add unit tests for `tts.ts` multi-speaker voice mapping and WAV header encoding.
