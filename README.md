# Interdimensional Cable

### An autonomous, memory-adaptive on-demand podcast and video show network

**Built for the [All Things Agentic Hackathon](https://allthingsagentichackathon.devpost.com/) (Google Cloud & Gemini)**

[![Gemini 3.7 Flash](https://img.shields.io/badge/Google%20Gemini-3.7%20Flash-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)
[![Vertex AI Veo 3.1](https://img.shields.io/badge/Vertex%20AI-Veo%203.1%20Video-34A853?logo=googlecloud&logoColor=white)](https://cloud.google.com/vertex-ai)
[![Gemini 3.1 Flash TTS](https://img.shields.io/badge/Gemini%203.1%20Flash-Multi--Speaker%20TTS-FBBC05?logo=google&logoColor=white)](https://ai.google.dev/)
[![Google Embeddings](https://img.shields.io/badge/Embeddings-text--embedding--004-EA4335?logo=google&logoColor=white)](https://ai.google.dev/)

---

## 🎯 Executive Pitch: Moving from Static Broadcast to Autonomous Agentic Media

Traditional podcasts and comedy talk shows are static, broadcast media: recorded once for a generic audience, non-interactive, and impossible to steer.

**Interdimensional Cable** redefines the medium as an **autonomous, adaptive on-demand studio**. It combines **multi-agent orchestration**, **Google Search grounding**, **Veo 3.1 video generation on Vertex AI** (`veo-3.1-generate-001`), **multi-speaker Gemini 3.1 Flash TTS**, and a **four-tier cognitive memory store** on Postgres/pgvector (`app/lib/memory-bank.ts`):

1. **On-Demand Custom Show Synthesis**: Turn any niche topic, URL, or breaking news item into a fully produced monologue or multi-host news desk episode in a single unattended run (roughly 2-5 minutes of wall clock for a 16-second video show; audio-only shows are faster).
2. **Persistent Memory Bank (Collaborative Partner Track)**: As you listen and converse with the podcast, the agent remembers your questions, concept mastery level, and humor preferences across sessions, dynamically adapting future episodes and explanations.
3. **Live In-Character Q&A & Tangents**: Interrupt the hosts mid-stream to ask questions. Hosts reply in their authentic comedic voices using Gemini Flash + Gemini TTS and can spin off instant 30-second audio tangent deep dives.
4. **Autonomous Ingestion Coordinator (Taskmaster Track)**: An event-driven coordinator monitors trending feeds (e.g. Hacker News), matches stories against your memory profile, picks the optimal host persona, and autonomously dispatches the entire production workflow.

---

## 🏆 Hackathon Track Alignment

### Track 1: The Collaborative Partner

- **Stateful Multi-Turn Dialogue**: Multi-turn in-character dialogue where the host references transcript cues and deep research.
- **Persistent Memory Bank (`user_memories`)**: Tracks concept mastery (e.g. beginner vs. expert in quantum computing), preferred humor styles, and interaction history across sessions.
- **Real-Time Context Retrieval (RAG)**: Uses **Google `text-embedding-004`** + pgvector cosine similarity to retrieve relevant transcript chunks and background knowledge.

### Track 2: The Taskmaster

- **Event-Driven Coordinator (`scripts/autonomous-trend-agent.ts`)**: Each cycle pulls top stories from the Hacker News Firebase API, ranks them against the persisted memory profile using Gemini 3.7 Flash structured output, routes to a host persona, provisions the show row, and dispatches the durable workflow. No human input.
- **Autonomous Multi-Step Routing**: Evaluates story depth, selects host templates, provisions database records, and triggers background workflow execution.
- **Durable Workflows**: Every stage is a Vercel Workflow `"use step"` boundary (`workflows/generate-show.ts`), so completed steps are checkpointed and never re-executed on retry. A failed Mux upload preserves the rendered file (`generated_shows.local_render_path`) so re-running costs no paid regeneration. The browser polls `generated_shows.status` for progress.

---

## 🏗️ System Architecture

```mermaid
flowchart TB
    subgraph ClientLayer ["Client & Listener Experience"]
        UserUI["Web Studio UI (Next.js 16 + React 19)"]
        LivePlayer["Interactive Video & Synced Transcript Player"]
        ChatEngine["Live In-Character Host Q&A (Voice + Text)"]
        MemoryView["Agent Memory Profile Dashboard"]
    end

    subgraph AgentCore ["Google Multi-Agent Orchestrator"]
        TaskmasterAgent["Taskmaster: Autonomous Ingestion & Routing"]
        ResearchAgent["Research Agent · Gemini 3.7 Flash + Google Search Grounding"]
        DramaturgyAgent["Persona & Scripting Agent · Gemini 3.7 Flash, 3-pass"]
        MemoryBankAgent["Memory Bank Agent (Cross-Session Knowledge Extraction)"]
    end

    subgraph GoogleAI ["Google AI · Vertex AI"]
        VideoGen["Veo 3.1 (veo-3.1-generate-001) · REST predictLongRunning"]
        GeminiTTS["Gemini 3.1 Flash TTS (multi-speaker neural synthesis)"]
    end

    subgraph External ["Non-Google components (named explicitly)"]
        FFmpeg["FFmpeg concat demuxer (app/lib/stitch.ts)"]
        MuxDelivery["Mux · direct upload + HLS playback"]
    end

    subgraph DataLayer ["Google Cloud SQL for PostgreSQL 16 + pgvector"]
        DBSchema["Shows, Clips, Transcripts, Chat Messages"]
        DBMemory["Agent Memory Bank & User Preferences"]
        DBVector["text-embedding-004 vectors (768-dim, HNSW cosine index)"]
    end

    UserUI --> DramaturgyAgent
    TaskmasterAgent --> ResearchAgent
    TaskmasterAgent --> MemoryBankAgent
    MemoryBankAgent <--> DBMemory

    ResearchAgent --> DramaturgyAgent
    DramaturgyAgent --> VideoGen
    DramaturgyAgent --> GeminiTTS
    VideoGen --> FFmpeg
    GeminiTTS --> FFmpeg
    FFmpeg --> MuxDelivery
    MuxDelivery --> DBSchema

    LivePlayer <--> ChatEngine
    ChatEngine <--> MemoryBankAgent
    ChatEngine --> GeminiTTS
    MemoryBankAgent --> DBVector
```

---

## ☁️ Google Cloud Footprint

| Requirement                                    | Satisfied by                                                                                                                                                              | Evidence                                             |
| :--------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------- |
| Gemini 3.5 or newer via Gemini API / Vertex AI | **Gemini 3.7 Flash** for research, scripting and memory extraction; **Gemini 3.1 Flash TTS**; **text-embedding-004**                                                      | `app/lib/genai.ts`, `app/lib/tts.ts`, `db/search.ts` |
| A Google agent framework                       | **Google GenAI SDK** (`@google/genai`) across 9 runtime modules — grounding, thinking level, structured output, embeddings, multi-speaker speech config, video operations | `app/lib/genai.ts` and callers                       |
| A Google Cloud infrastructure service          | **Cloud SQL for PostgreSQL 16** with `pgvector` 0.8.5, holding every show, transcript, chat message, memory record and embedding                                          | `scripts/provision-cloud-sql.sh`, `db/index.ts`      |
| Bonus model integration                        | **Veo 3.1** (`veo-3.1-generate-001`) on Vertex AI generates every video clip                                                                                              | `app/lib/vertex-video.ts`                            |

Instance `ic-pg` runs in `us-central1` on project `gen-lang-client-0573852365`.

---

## 🛠️ Google Agentic & Gemini Stack

| Component                      | Technology                                                                                               | Purpose                                                                                                                                                                                                                                                                                                                                                                   |
| :----------------------------- | :------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Reasoning & Planning**       | **Gemini 3.7 Flash** (`@google/genai`)                                                                   | Autonomous research, comedy dramaturgy, multi-host banter scripting.                                                                                                                                                                                                                                                                                                      |
| **Search Grounding**           | **Gemini Google Search Grounding**                                                                       | Dynamic factual grounding for breaking news and technical topics.                                                                                                                                                                                                                                                                                                         |
| **Video Clip Generation**      | **Vertex AI Veo 3.1** (`veo-3.1-generate-001`) via REST `predictLongRunning` (`app/lib/vertex-video.ts`) | Video generation, pinned to 720p 16:9 by the show workflow. Continuity across turns via boundary-frame chaining (`extractFrame` → `firstFrame`) plus reference-asset anchoring for host face consistency. An alternate Gemini Developer API path (`gemini-omni-1.1-flash`, `app/lib/veo.ts`) is implemented behind `GEMINI_VIDEO_API_KEY` and is **not** the active path. |
| **Voice Synthesis (TTS)**      | **Gemini 3.1 Flash TTS** (`gemini-3.1-flash-tts-preview`)                                                | Multi-speaker neural voice generation (used for shows, tangents, and 5m podcasts).                                                                                                                                                                                                                                                                                        |
| **Vector Embeddings**          | **Google `text-embedding-004`** (768 dimensions)                                                         | Transcript chunk embeddings and semantic vector search in PostgreSQL.                                                                                                                                                                                                                                                                                                     |
| **Memory Extraction**          | **Gemini 3.7 Flash**                                                                                     | Autonomous extraction of concept mastery, humor preferences, and listener insights.                                                                                                                                                                                                                                                                                       |
| **Autonomous Coordinator**     | **Custom coordinator** (`scripts/autonomous-trend-agent.ts`) on the **Google GenAI SDK**                 | Pulls Hacker News top stories, ranks against the memory profile with Gemini 3.7 Flash structured output, provisions the show, dispatches the durable workflow.                                                                                                                                                                                                            |
| **Application State**          | **Google Cloud SQL for PostgreSQL 16** (`pgvector`, HNSW cosine index)                                   | Every show, transcript, chat message, memory record and embedding. Reached through the Cloud SQL Auth Proxy.                                                                                                                                                                                                                                                              |
| **Video Delivery & Streaming** | **Mux Video + HLS**                                                                                      | Adaptive bitrate streaming and multi-language track management.                                                                                                                                                                                                                                                                                                           |
| **Video Compositor**           | **FFmpeg** (`app/lib/stitch.ts`)                                                                         | Local concat-demuxer stitching with a 48 kHz AAC re-encode fallback. Remotion Lambda (AWS) renders the separate legacy social-clip feature and is **not** on the show path.                                                                                                                                                                                               |

---

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 24.11.0 (see `.nvmrc`)
- `ffmpeg` on PATH (used to stitch clips: `brew install ffmpeg`)
- A Google Cloud project with billing enabled, and the `gcloud` CLI
  (`brew install --cask google-cloud-sdk`)
- PostgreSQL 16 with the `pgvector` extension — provisioned on Cloud SQL by
  `./scripts/provision-cloud-sql.sh`, or run locally for development
- Google Gemini API Key (`GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY`)
- Mux API credentials (`MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`)

### 2. Installation & Setup

```bash
# Clone the repository
git clone https://github.com/arjunlohan/multimodal-frontier-hackathon-interdimensional-cable.git
cd multimodal-frontier-hackathon-interdimensional-cable

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
# Edit .env.local with your GEMINI_API_KEY, DATABASE_URL, and MUX credentials
```

### 3. Provision Google Cloud SQL

The application's state layer runs on **Cloud SQL for PostgreSQL 16** with `pgvector`.

```bash
# One-time: authenticate (both are required — they are separate consent flows)
gcloud auth login
gcloud auth application-default login

# Creates the instance and database, enables pgvector, starts the Auth Proxy
./scripts/provision-cloud-sql.sh

# Copies local data across, verifies nothing was lost, repoints DATABASE_URL
./scripts/migrate-to-cloud-sql.sh
```

Both scripts are idempotent. The migration refuses to switch `DATABASE_URL`
unless every row arrives intact.

To develop against local Postgres instead, set `DATABASE_URL` to a local
connection string and run the migrations below — the application code is
identical either way.

### 4. Database Migration & Template Seeding

```bash
# Run database migrations (creates pgvector tables, memory bank, and shows)
npm run db:migrate

# Seed show templates (John Oliver, Seth Meyers, SNL Weekend Update)
npm run seed-templates
```

### 5. Launch the Application

```bash
# Start the development server
npm run dev
# Visit http://localhost:3000
```

### 6. Run the Autonomous Taskmaster Agent

```bash
# Triggers the autonomous news discovery, memory matching, and show generation agent
npm run agent:taskmaster
```

---

## 🧪 Testing & Verification

13 suites, 320 tests, all passing. Coverage spans the durable show workflow, the four-tier memory bank, the video engine, multi-speaker TTS, the FFmpeg stitcher, and the skill/dramaturgy registries, including adversarial "challenger" suites that attack boundary conditions.

```bash
# Run all tests
npm run test
```

---

## 🎬 4-Minute Demo Script

Judges stop watching at 4:00 exactly. Recorded with a real voice, not a synthesized one.

| Time            | Shot                                                                                                                                                                                                          | Notes                                                                                                                                                                           |
| :-------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0:00 - 0:18** | **Cold open. No talking.** A finished episode full screen with the synced transcript scrolling beside it. 15 seconds of actual comedy, with sound.                                                            | Speak only over the tail: "Nobody wrote that. Nobody filmed it. An agent produced it end to end from a link."                                                                   |
| **0:18 - 0:32** | Problem and value proposition, over the still-playing episode.                                                                                                                                                | Static media is recorded once for a generic audience and cannot be steered. Three sentences.                                                                                    |
| **0:32 - 0:50** | **The stack, in-product.** The homepage: the "Running on" strip, then scroll "What runs when you press generate" — seven stages, each naming its model and its service, with Cloud SQL spanning all of them.  | The architecture, explained without a slide. "Every one of those is a checkpointed step. Here it is actually running."                                                          |
| **0:50 - 1:30** | **One workflow, live.** Paste a Hacker News link on `/create`, hit generate, cut to the durable steps executing: research → script → clips → stitch → upload.                                                 | Narrate the engineering: a blocked safety filter triggers a rewrite-and-retry rather than a failed run, and a capacity preflight refuses to spend render money it cannot store. |
| **1:30 - 1:42** | **Honest cut.** On-screen text, and say it aloud: "Video generation takes about six minutes. Here is the same pipeline's output from earlier."                                                                | Never fake a real-time render.                                                                                                                                                  |
| **1:42 - 2:30** | **Multimodal, one continuous take.** Pause mid-episode. Type a question. The host answers in character, in its own synthesized voice, grounded live by Google Search. Then trigger a 30-second audio tangent. | Video, multi-speaker neural voice, grounded text and synced transcript on one surface. Costs TTS tokens, not render money, so rehearse it freely.                               |
| **2:30 - 3:00** | **Memory that adapts _and forgets_.** The memory card: concept mastery moving beginner → intermediate, with confidence values.                                                                                | "Confidence decays on an Ebbinghaus schedule, so a concept you asked about in March stops steering the show by August. The next script is written against this profile."        |
| **3:00 - 3:20** | **Autonomy.** Terminal: `npm run agent:taskmaster`. It pulls live Hacker News, ranks stories against the memory profile, prints its routing reasoning, and dispatches the workflow. Zero human input.         | "Takes action, not text."                                                                                                                                                       |
| **3:20 - 3:50** | **Google Cloud proof — mandatory.** Cloud SQL instance `ic-pg`, then **Query Insights** showing the queries from the run you just did landing live.                                                           | This is the shot the rules require. Query Insights is the strong one: it shows the app hitting Google Cloud in real time, not a static console page.                            |
| **3:50 - 4:00** | **Close** on the homepage's "Built on Google Cloud" section — each requirement mapped to the file that satisfies it. One sentence, then stop.                                                                 | The last frame is the checklist judges score against.                                                                                                                           |

**Overrun policy:** cut 0:18-0:32 first, then the close. Never cut the multimodal take or the Google Cloud proof.

**Before recording:** free at least two Mux slots (the free plan caps at 10 and the preflight hard-blocks generation when full), and watch the console for `[pass1-research] falling back to mock` during the take — that path fabricates sources and would hollow out the grounding claim on camera.

---

## 🗺️ Repository Map

| Path                                | What lives here                                                                                                                                                        |
| :---------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflows/generate-show.ts`        | The durable production pipeline. Nine checkpointed `"use step"` boundaries: research → script → voice → clips → stitch → upload.                                       |
| `app/lib/dramaturgy/`               | The three-pass writers' room. `pass1-research` (grounded research), `pass2-head-writer` (structure and jokes), `pass3-voice-prune` (persona voice + trim to duration). |
| `app/lib/memory-bank.ts`            | Four-tier cognitive memory: working, episodic, procedural, semantic. Includes Ebbinghaus confidence decay and reinforcement.                                           |
| `app/lib/vertex-video.ts`           | Veo 3.1 over Vertex REST `predictLongRunning`. The active video path.                                                                                                  |
| `app/lib/veo.ts`                    | The Gemini Developer API video path (`gemini-omni-1.1-flash`), plus rate limiting, RAI handling, and frame chaining. Inactive by default.                              |
| `app/lib/genai.ts`                  | Single shared GenAI client factory. Routes express (`AQ.*`) keys to Vertex.                                                                                            |
| `app/lib/tts.ts`                    | Multi-speaker synthesis with host gender/accent inference driven by the show template.                                                                                 |
| `app/lib/stitch.ts`                 | FFmpeg concat-demuxer stitching with an AAC re-encode fallback.                                                                                                        |
| `scripts/autonomous-trend-agent.ts` | The Taskmaster coordinator: discover → rank against memory → route → provision → dispatch.                                                                             |
| `db/schema.ts`                      | State model. pgvector `vector(768)` with an HNSW cosine index.                                                                                                         |
| `app/watch/[showId]/`               | Player, synced transcript, in-character Q&A, audio tangents, memory profile card.                                                                                      |

---

## 🔬 Engineering Insights

Three things that cost real time and are not in any documentation:

**1. `AQ.*` and `AIza` keys are different auth surfaces, and the prefix does not tell you which.**
Express-mode keys exist on _both_ the Gemini Developer API and Vertex, but they are not interchangeable. A client built without `vertexai: true` returns `403 PERMISSION_DENIED` against a Vertex express key. This is centralized in `app/lib/genai.ts` so it can only be got wrong once.

**2. Express keys cannot address long-running video operations through the SDK.**
`generateVideos` needs an explicit `projects/{p}/locations/{l}` path, which the express-key initializer rejects (`project`/`location` are mutually exclusive with `apiKey`). The workaround is a hand-rolled REST client that calls `predictLongRunning` and polls `fetchPredictOperation` directly — `app/lib/vertex-video.ts`.

**3. Google Search grounding is incompatible with `responseMimeType: "application/json"`.**
You must choose grounded-and-unstructured or structured-and-ungrounded. Worse, the failure is silent: an 8192-token cap truncated the grounded research brief mid-object, JSON parsing failed, and the pipeline fell back to mock research that fabricated `example.com` sources while reporting success. Fixed by raising the cap to 32768 and parsing defensively. **The lesson generalizes: a fallback that silently substitutes fake data is worse than a crash.**

We also hand-rolled the memory tier on Postgres/pgvector rather than using Vertex AI Agent Engine Memory Bank, because retrieval needed to happen in the same transaction as show metadata.

---

## ⚠️ Known Limitations

Stated up front rather than left to be discovered:

- **Single-tenant.** `"default_user"` is hardcoded. There is no auth; every session shares one memory profile.
- **Workflow run store.** Off Vercel, the Workflow DevKit persists runs to the local filesystem. A production deployment would move the step queue to Cloud Tasks or Pub/Sub.
- **`vertex-video.ts` has no unit coverage.** It is exercised manually via `npm run test:veo`, which costs real money, so it is not in CI.
- **Mux free tier caps at 10 assets.** The workflow runs a capacity preflight and refuses to start rather than spend render money it cannot store, but you must delete assets to keep generating.
- **`gemini-omni-1.1-flash` is implemented but inactive.** It requires AI Studio prepay credits on the key's project; ours has none, so video runs on Veo 3.1 via Vertex instead. Both paths are in the repo.
- **Retry is automatic, not manual.** Steps are checkpointed and resume on retry, but there is no user-facing "resume this run" control yet.

---

## 🏅 Bonus Integrations

- **Veo** — `veo-3.1-generate-001` generates every video clip, through Vertex AI (`app/lib/vertex-video.ts`).

---

## 📜 License

MIT License. Built for the **All Things Agentic Hackathon 2026**.
