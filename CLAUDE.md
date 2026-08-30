# CLAUDE.md — Interdimensional Cable (Multimodal Frontier Hackathon)

## Project Overview

A reference architecture for **durable video AI pipelines** using `@mux/ai`, Vercel Workflow DevKit, and Remotion. Three progressive integration layers:

1. **Layer 1 (Primitives):** Direct function calls — summarization, tagging, transcript search
2. **Layer 2 (Workflows):** Durable workflows — caption translation, audio dubbing
3. **Layer 3 (Connectors):** Complex pipelines — social clip rendering via Remotion Lambda

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL + pgvector · Drizzle ORM · Mux · Remotion · Vercel Workflows

---

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

---

## Task Management

1. **Plan First:** Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan:** Check in before starting implementation
3. **Track Progress:** Mark items complete as you go
4. **Explain Changes:** High-level summary at each step
5. **Document Results:** Add review section to `tasks/todo.md`
6. **Capture Lessons:** Update `tasks/lessons.md` after corrections

---

## Core Principles

- **Simplicity First:** Make every change as simple as possible. Impact minimal code.
- **No Laziness:** Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact:** Changes should only touch what's necessary. Avoid introducing bugs.

---

## Quick Commands

```bash
npm run dev                    # Dev server (http://localhost:3000)
npm run build                  # Production build
npm run lint                   # ESLint
npm run lint:fix               # Auto-fix lint issues
npm run db:generate            # Generate migration from schema changes
npm run db:migrate             # Run pending migrations
npm run db:studio              # Drizzle Studio (http://localhost:4983)
npm run import-mux-assets      # Populate DB with Mux assets + embeddings
npm run remotion:studio        # Remotion Studio (http://localhost:5432)
npm run remotion:deploy        # Deploy Remotion to AWS Lambda
npm run visualize:workflows    # Workflow visualization UI
```

---

## Code Conventions

### File Naming
- **kebab-case** for all source files (e.g., `translate-captions.ts`)

### Style (ESLint enforced)
- 2-space indent, double quotes, always semicolons
- Cuddled braces (`} else {`)
- Import order: side-effects → built-ins → parent/sibling → external → internal (`@mux/ai`)

### Environment Variables
- **Never** use `process.env` directly
- **Always** import from `app/lib/env.ts` (Zod-validated)

```typescript
import { env } from "@/app/lib/env";
```

### Mux Client
- Single shared instance in `app/lib/mux.ts` — never create new `Mux()` instances
- Import helpers: `import { getAsset, listAssets } from "@/lib/mux";`

### Vercel Workflows
- `"use workflow"` as first line inside workflow function
- `"use step"` as first line inside step functions
- Trigger via `start()` from `workflow/api` in route handlers

### Client State
- Workflow progress persisted in localStorage via `app/lib/workflow-state.ts`
- Key format: `workflow:${assetId}:${workflowType}:${targetLang?}`

---

## Key Directories

```
app/                    # Next.js App Router (pages, API routes, components, lib)
app/media/[slug]/       # Media detail page — co-located feature modules
workflows/              # Vercel Workflow definitions (durable pipelines)
remotion/               # Video rendering compositions (social clips)
db/                     # Drizzle ORM schema + migrations
scripts/                # CLI utilities (import, cleanup)
context/                # AI assistant documentation
DOCS/                   # Operational docs (rate limits, metrics, deployments)
tasks/                  # Task tracking (todo.md, lessons.md)
```

---

## Database

- **PostgreSQL + pgvector** — semantic search via embeddings
- Tables: `videos`, `video_chunks` (embeddings), `rate_limits`, `feature_metrics`
- Embeddings: OpenAI `text-embedding-3-small` (1536 dimensions)
- HNSW index for cosine similarity search

---

## Design System

- **Brutalist aesthetic:** thick black borders, sharp corners, hard shadows
- **Fonts:** Syne (headings), Space Mono (code/labels)
- **Layer badges:** "PRIMITIVES", "WORKFLOWS", "CONNECTORS"
- **Status UI:** inline progress indicators, not toasts
