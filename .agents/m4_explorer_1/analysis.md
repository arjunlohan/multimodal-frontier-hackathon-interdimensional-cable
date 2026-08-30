# M4 Architecture & Exploration Report: Cognitive Memory Bank & Real-Time RAG

**Author**: M4 Explorer 1 (Cognitive Memory Bank & RAG Explorer)  
**Date**: 2026-08-30  
**Status**: COMPLETE  
**Workspace**: `/Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable`  

---

## 1. Executive Summary

This investigation explores the architectural foundation, schema parity, data flows, and test coverage for **Milestone 4 (M4: Persistent Memory Bank & Real-Time RAG)** of the *Interdimensional Cable* multi-agent comedy show and podcast orchestrator.

The cognitive engine powers listener personalization, comedic continuity, in-character live banter, dynamic spin-off tangents, and factual grounding across episodes. The architecture implements a **4-tier cognitive memory model** inspired by human cognitive psychology:

| Cognitive Tier | Storage Layer | Data Entity | Function & Lifetime |
| :--- | :--- | :--- | :--- |
| **Tier 1: Working Memory** | PostgreSQL `chat_messages` + Memory buffer | Session turns, transcript & research context | Short-term context window during active playback; handles turn-taking and immediate conversational coherence. |
| **Tier 2: Episodic Memory** | PostgreSQL `user_memories` & `show_tangents` | Concept mastery, humor preferences, tracked interests, tangents | Cross-session user mental model, callbacks, and topic familiarity with temporal decay & boost dynamics. |
| **Tier 3: Semantic Memory** | PostgreSQL `video_chunks` (pgvector 768d) | HNSW indexed embeddings via `text-embedding-004` | Global knowledge retrieval, transcript semantic search, and historical clip grounding (`cosineDistance`). |
| **Tier 4: Procedural Memory** | `app/lib/skills/` & `show_templates` | Show SKILL definitions, stylometrics, joke formulas | Production craft spines, act beat structures, laugh-per-minute targets, profanity registers, and TTS voice bindings. |

---

## 2. 4-Tier Cognitive Memory Bank Architecture

```
                                  [ Listener Interaction / User Request ]
                                                     │
                                                     ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │                                   4-TIER COGNITIVE MEMORY BANK                                         │
 ├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
 │                                                                                                        │
 │  ┌───────────────────────────────────┐               ┌──────────────────────────────────────────────┐  │
 │  │ TIER 1: WORKING MEMORY            │               │ TIER 2: EPISODIC MEMORY                      │  │
 │  │ • chat_messages table             │               │ • user_memories (concept mastery, interests) │  │
 │  │ • Active show transcript context  │               │ • show_tangents (audio deep-dive archives)   │  │
 │  │ • Ephemeral conversation buffer   │               │ • Half-life confidence decay & boost dynamics│  │
 │  └─────────────────┬─────────────────┘               └──────────────────────┬───────────────────────┘  │
 │                    │                                                        │                          │
 │                    └──────────────────────────┬─────────────────────────────┘                          │
 │                                               ▼                                                        │
 │  ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐  │
 │  │ TIER 3: SEMANTIC MEMORY (pgvector 768d)                                                          │  │
 │  │ • Google text-embedding-004 vector representations                                               │  │
 │  │ • HNSW cosine distance search on video_chunks table                                               │  │
 │  │ • Cross-episode factual retrieval & transcript jump citations                                    │  │
 │  └────────────────────────────────────────────┬─────────────────────────────────────────────────────┘  │
 │                                               │                                                        │
 │  ┌────────────────────────────────────────────┴─────────────────────────────────────────────────────┐  │
 │  │ TIER 4: PROCEDURAL MEMORY (Show SKILLs)                                                          │  │
 │  │ • Archetype A (Desk Shows) vs Archetype B (Conversational Podcasts)                              │  │
 │  │ • Rhetorical spines, joke-per-minute targets, rule-of-three, stylometric vectors                 │  │
 │  │ • Host persona craft & Gemini TTS voice bindings (Charon, Orus, Puck, Fenrir, Aoede, Kore)       │  │
 │  └────────────────────────────────────────────┬─────────────────────────────────────────────────────┘  │
 └───────────────────────────────────────────────┼────────────────────────────────────────────────────────┘
                                                 │
                   ┌─────────────────────────────┼─────────────────────────────┐
                   ▼                             ▼                             ▼
   [ 3-Pass Dramaturgy Scripting ]     [ In-Character Live Chat ]     [ Dynamic Audio Tangents ]
   • Grounded research angle           • 2-4 sentence witty banter    • 30-45s monologue spin-off
   • Adaptive joke depth & analogies   • Grounded in transcript       • Gemini Flash TTS audio
   • Stylometric audience tuning       • Background memory extraction • Autonomous memory learning
```

### 2.1 Tier 1: Working Memory (Session Buffer)
- **Source**: `db/schema.ts` (`chatMessages`), `app/watch/[showId]/chat/actions.ts`.
- **Characteristics**:
  - Bound to an active show (`showId`) and listener session.
  - Houses the sequential user/assistant conversation history ordered by `createdAt ASC`.
  - Injected directly into Gemini 3.7 Flash prompt alongside the active show transcript and grounded research context.
- **Access Pattern**:
  - `getChatMessagesAction(showId)` loads the session transcript.
  - Fast optimistic rendering on the client with server action persistence.

### 2.2 Tier 2: Episodic Memory (Cross-Session Knowledge & Tangents)
- **Source**: `db/schema.ts` (`userMemories`, `showTangents`), `app/lib/memory-bank.ts`.
- **Memory Types**:
  1. `concept_mastery`: Tracks listener comprehension of technical or niche subjects (e.g. `quantum-computing` $\to$ `"Expert level"`, `confidence: 0.95`).
  2. `humor_preference`: Records audience stylistic taste (e.g. `humor` $\to$ `"Sharp, dry British satire with escalating absurdist analogies"`).
  3. `interest_topic`: Tracks recurring interests (e.g. `ai-agents`, `fusion-energy`, `media-critique`).
  4. `question_pattern`: Retains past listener queries to enable host callbacks ("As you asked earlier about Veo 3.1...").
  5. `show_tangents`: Stores interactive, host-narrated 30-45s audio spin-offs requested during playback.

### 2.3 Tier 3: Semantic Memory (Google `text-embedding-004` 768d Vector Retrieval)
- **Source**: `db/schema.ts` (`videoChunks`), `db/search.ts`.
- **Specifications**:
  - Embedding Model: Google `text-embedding-004` outputting 768-dimensional float vectors.
  - pgvector index: `HNSW` using `vector_cosine_ops`.
  - Similarity metric: Cosine similarity calculated as `1 - (videoChunks.embedding <=> queryEmbedding)`.
- **Retrieval Functions**:
  - `searchVideoChunks(query, limit)`: Global semantic search across all processed video catalog chunks.
  - `searchChunksWithinVideo(query, muxAssetId, limit)`: Scoped semantic search within a single show's transcript chunks for instant time-stamped citation and playback navigation.

### 2.4 Tier 4: Procedural Memory (Show SKILLs & Templates)
- **Source**: `app/lib/skills/`, `db/schema.ts` (`showTemplates`).
- **Specifications**:
  - Archetype A (Writers'-Room Desk Shows: Oliver, Meyers, Satirical News Desk, Fallon).
  - Archetype B (Conversational Podcasts: Rogan, Tim Dillon formats).
  - Encodes rhetorical spines, act formulas, LPM targets (e.g. 3.5 - 6.0 LPM for desk shows), stylometrics (mean sentence length, profanity register, outrage/affability ratio), and licensed TTS voice mappings (`Charon`, `Orus`, `Puck`, `Fenrir`, `Aoede`, `Kore`, `Enceladus`).

---

## 3. Personalization & Prompt Context Injection

Personalization context is generated by `buildPersonalizedPromptContext(userId)` and injected across three distinct execution pipelines:

### 3.1 Pipeline A: Multi-Pass Scripting (`runDramaturgyPipeline`)
1. **Pass 1 (Grounded Research)**: Injects listener tone and interest preferences so research angle selection prioritizes topics the user enjoys without dumbing down concepts already mastered.
2. **Pass 2 (Head-Writer Draft)**: Adapts joke complexity, analogical targets, and act pacing to match user concept mastery (e.g., if user has expert mastery in AI, avoid introductory definitions and use technical satire).
3. **Pass 3 (Voice Polish & Table-Read)**: Evaluates script against both show stylometrics and listener humor preference.

### 3.2 Pipeline B: Live In-Character Chat Banter (`sendChatMessageAction`)
- When a viewer asks a question in the chat panel:
  - Working memory: loads all prior chat messages for the show.
  - Episodic memory: loads user's concept mastery, humor style, and interests.
  - Prompt structure:
    ```
    You are {hostName}, the host of this talk show segment about "{topic}".
    Stay completely in character with your signature humor, wit, pacing, and comedic worldview.

    === PERSISTENT USER MEMORY BANK ===
    Preferred Tone/Humor: Sharp, witty satire with escalating analogies
    Known User Interests: ai-agents, distributed-systems
    User Concept Mastery: quantum-computing (Expert level), neural-rendering (Familiar)
    Recent Questions Asked by User:
    - How does Veo 3.1 maintain temporal consistency?
    Instruction: Adapt your explanation depth, humor, and analogies to resonate with these learned preferences without explicitly mentioning this memory bank.

    TRANSCRIPT: ...
    RESEARCH CONTEXT: ...
    ```
- Result: Host answers concisely (2-4 sentences) in-character with optional Gemini TTS audio synthesis.

### 3.3 Pipeline C: Dynamic Tangent Generation (`createShowTangentAction`)
- Allows listener to request an on-demand 30-45s audio tangent on any subtopic.
- Injects personal memory context to tailor the tangent monologue.
- Generates speech audio with Gemini 3.1 Flash TTS and archives the tangent in `show_tangents` table.
- Autonomously extracts learned concepts/questions back into `user_memories`.

---

## 4. Autonomous Memory Extraction Engine

Autonomous memory extraction occurs in the background without blocking the UI:

```typescript
export async function updateMemoryFromInteraction(
  userId: string,
  userMessage: string,
  assistantResponse: string,
  topic: string,
  showId?: string,
): Promise<void>
```

### 4.1 Extraction Protocol
1. Invokes **Gemini 3.7 Flash** with structured output configuration (`responseMimeType: "application/json"`).
2. Uses a structured JSON schema:
   ```json
   {
     "memories": [
       {
         "memoryType": "concept_mastery" | "interest_topic" | "humor_preference" | "question_pattern",
         "key": "identifier-slug",
         "value": "description or level",
         "confidence": 0.85
       }
     ]
   }
   ```
3. Performs upsert logic:
   - If a memory with the same `(userId, memoryType, key)` exists: updates `value`, `confidence`, `sourceShowId`, and `updatedAt`.
   - If not: inserts a new record in `user_memories`.

---

## 5. Concept Mastery Dynamics: Mathematical Decay & Boost Model

To prevent stale memories and accurately track audience familiarity, concept mastery should follow a formal decay and boost model:

### 5.1 Boost / Reinforcement Formula
When a listener engages with a topic or exhibits understanding, the mastery confidence is boosted:
$$C_{\text{new}} = \min\left(1.0, C_{\text{old}} + \alpha \cdot (1.0 - C_{\text{old}})\right)$$
where $\alpha = 0.30$ (learning rate parameter).

Mastery Level Progression:
- $C < 0.35 \implies \text{beginner}$
- $0.35 \le C < 0.75 \implies \text{familiar}$
- $C \ge 0.75 \implies \text{expert}$

### 5.2 Temporal Half-Life Decay Formula
For a memory last updated at $t_{\text{last}}$, with elapsed time $\Delta t = t_{\text{current}} - t_{\text{last}}$ in days:
$$C(t) = C_0 \cdot 2^{-\frac{\Delta t}{t_{\text{half}}}}$$
where $t_{\text{half}} = 30 \text{ days}$.

If $C(t)$ drops below thresholds:
- An `expert` concept drops to `familiar` after ~45 days of inactivity.
- A `familiar` concept drops to `beginner` after ~60 days of inactivity.

---

## 6. Database Schema Parity & Migration Design

### 6.1 Schema Analysis & Gap Identification
In the current codebase:
- `db/schema.ts` defines `userMemories` and `showTangents`, and specifies `videoChunks.embedding` as `vector("embedding", { dimensions: 768 })`.
- `0000_init.sql` originally created `video_chunks.embedding` with `vector(1536)` (OpenAI legacy).
- `0001_rate_limits.sql`, `0002_feature_metrics.sql`, `0003_interdimensional_cable.sql`, `0004_frame_chaining.sql` do **not** include `user_memories`, `show_tangents`, or the 768d vector alteration.
- **Migration `0005_memory_bank_and_tangents.sql` is required** to achieve full database parity.

### 6.2 Migration DDL Specification (`0005_memory_bank_and_tangents.sql`)

```sql
-- Migration: 0005_memory_bank_and_tangents.sql
-- Parity for 4-tier memory bank, show tangents, and 768d Google text-embedding-004 pgvector

-- 1. Upgrade video_chunks embedding dimensions from 1536 to 768 (Google text-embedding-004)
DROP INDEX IF EXISTS "video_chunks_embedding_idx";

ALTER TABLE "video_chunks" 
  ALTER COLUMN "embedding" TYPE vector(768);

CREATE INDEX "video_chunks_embedding_idx" 
  ON "video_chunks" 
  USING hnsw ("embedding" vector_cosine_ops);

-- 2. Agent Memory Bank (Cross-session knowledge, interests & mental model)
CREATE TABLE IF NOT EXISTS "user_memories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "memory_type" text NOT NULL,
  "key" text NOT NULL,
  "value" text NOT NULL,
  "confidence" real DEFAULT 1.0,
  "source_show_id" uuid REFERENCES "generated_shows"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "user_memories_user_id_idx" ON "user_memories" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "user_memories_type_idx" ON "user_memories" USING btree ("memory_type");

-- 3. Show Tangents (On-the-fly generated interactive deep-dives & audio clips)
CREATE TABLE IF NOT EXISTS "show_tangents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "show_id" uuid NOT NULL REFERENCES "generated_shows"("id") ON DELETE CASCADE,
  "user_id" text,
  "question" text NOT NULL,
  "host_name" text NOT NULL,
  "script_text" text NOT NULL,
  "audio_url" text,
  "audio_data" text,
  "duration_seconds" integer,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "show_tangents_show_id_idx" ON "show_tangents" USING btree ("show_id");
```

---

## 7. Comprehensive Test Suite Formulation (`app/lib/memory-bank.test.ts`)

The existing test file contains only 2 basic tests. The test suite must be expanded to cover the following test cases:

### Test Suite 1: 4-Tier Memory Retrieval & Synthesis
1. `should compute MemorySummary aggregating concept mastery, interests, humor preferences, and recent questions`
2. `should handle empty memory bank gracefully and return fallback defaults`
3. `should deduplicate repetitive interest topics while preserving unique entries`
4. `should cap summary arrays to prevent prompt bloat (max 10 concepts, 10 interests, 5 questions)`

### Test Suite 2: Concept Mastery Boost & Temporal Decay
1. `should calculate boosted confidence on repeated positive interactions`
2. `should decay confidence score over time according to 30-day half-life formula`
3. `should transition mastery label (beginner -> familiar -> expert) when confidence crosses thresholds`

### Test Suite 3: Personalized Prompt Context Formatting
1. `should return neutral guidance string when user has zero stored memories`
2. `should include all active memory sections (Tone, Interests, Concepts, Questions) when available`
3. `should format concept mastery with level tags (e.g., 'quantum-computing (Expert level)')`
4. `should include instruction directive to prevent fourth-wall breaking`

### Test Suite 4: Autonomous Memory Extractor (Gemini 3.7 Flash JSON Mode)
1. `should parse Gemini Flash JSON response and insert new memories into database`
2. `should update existing memories when matching (userId, memoryType, key) already exists`
3. `should gracefully handle malformed or non-JSON model output without throwing unhandled exceptions`
4. `should ignore empty or invalid memory objects lacking required fields`

### Test Suite 5: Dynamic Tangents & Semantic Search Integration
1. `should retrieve and format tangent records associated with showId`
2. `should support semantic chunk search cosine distance calculation`

---

## 8. Implementation Roadmap for M4 Worker

1. **Step 1: Database Migration**:
   - Write `db/migrations/0005_memory_bank_and_tangents.sql`.
   - Update `db/migrations/meta/_journal.json` to register migration `0005`.
2. **Step 2: Memory Bank Enhancement**:
   - Add temporal decay and confidence boost helpers to `app/lib/memory-bank.ts`.
   - Add unified 4-tier context retrieval helper `buildCognitiveMemoryBankContext`.
3. **Step 3: Test Hardening**:
   - Upgrade `app/lib/memory-bank.test.ts` to implement all 5 test suites.
   - Verify 100% test pass rate with `npm run test`.
4. **Step 4: Verification**:
   - Run `npm run lint` and `npm run build` to guarantee zero type errors or linter warnings.
