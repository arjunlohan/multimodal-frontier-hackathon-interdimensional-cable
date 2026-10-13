# Interdimensional Cable (Multimodal Frontier Hackathon)

## Project Overview

A reference architecture for **durable video AI pipelines** using `@mux/ai`, Vercel Workflow DevKit, and Remotion. Three progressive integration layers:

1. **Layer 1 (Primitives):** Direct function calls: summarization, tagging, transcript search
2. **Layer 2 (Workflows):** Durable workflows: caption translation, audio dubbing
3. **Layer 3 (Connectors):** Complex pipelines: social clip rendering via Remotion Lambda

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL + pgvector · Drizzle ORM · Mux · Remotion · Vercel Workflows

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

- Use the shared client and helpers from `@/app/lib/mux` (e.g. `getAsset`, `listAssets`); never create new `Mux()` instances

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
app/media/[slug]/       # Media detail page (co-located feature modules)
workflows/              # Vercel Workflow definitions (durable pipelines)
remotion/               # Video rendering compositions (social clips)
db/                     # Drizzle ORM schema + migrations
scripts/                # CLI utilities (import, cleanup)
context/                # AI assistant documentation
DOCS/                   # Operational docs (rate limits, metrics, deployments)
```

---

## Database

- **PostgreSQL + pgvector**: semantic search via embeddings
- Tables: `videos`, `video_chunks` (embeddings), `rate_limits`, `feature_metrics`
- Embeddings: Google `text-embedding-004` (768 dimensions)
- HNSW index for cosine similarity search

---

## Design System

- **Brutalist aesthetic:** thick black borders, sharp corners, hard shadows
- **Fonts:** Syne (headings), Space Mono (code/labels)
- **Layer badges:** "PRIMITIVES", "WORKFLOWS", "CONNECTORS"
- **Status UI:** inline progress indicators, not toasts
