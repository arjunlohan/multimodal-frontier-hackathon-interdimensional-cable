# Interdimensional Cable

AI-generated talk shows — pick a late-night format, give it any topic, and watch a full episode come to life in seconds.

Built for the [Multimodal Frontier Hackathon](https://frontierai.devpost.com/).

## How It Works

1. **Pick a show** — Choose from talk show templates (John Oliver, Seth Meyers, SNL Weekend Update), each with unique host personalities and humor styles.
2. **Give it a topic** — Paste a news link, article, or just describe what you want the show to cover. The AI researches it deeply using Google Search grounding.
3. **Watch your episode** — The system generates a script, produces video clips with Veo, synthesizes host voices with Gemini TTS, and stitches everything into a watchable episode.

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- **Tailwind CSS 4** — brutalist design system
- **Google Gemini** — script generation, research, TTS voice synthesis
- **Google Veo** — AI video clip generation
- **Mux** — video hosting, playback, and streaming
- **PostgreSQL + Drizzle ORM** — show/template storage
- **Vercel** — hosting and deployment

## Quick Start

```bash
npm install
npm run db:migrate
npm run dev
```

## Environment Variables

Create a `.env.local` file:

```bash
# Database (PostgreSQL)
DATABASE_URL=

# Google AI (Gemini + Veo)
GOOGLE_GENERATIVE_AI_API_KEY=

# Mux (video hosting)
MUX_TOKEN_ID=
MUX_TOKEN_SECRET=
```

## Key Routes

| Route | Description |
| --- | --- |
| `/` | Landing page — pitch + how it works |
| `/create` | Create a new show — pick template, topic, duration |
| `/create/[showId]` | Generation progress — watch the pipeline run |
| `/watch/[showId]` | Watch page — video player, transcript, research, chat |
| `/media` | Browse — previously generated shows |
| `/templates` | Manage show templates |

## Project Structure

```
app/                    # Next.js App Router
├── api/                # API routes (generate, chat, TTS)
├── components/         # Shared UI (header, footer)
├── create/             # Show creation flow
├── lib/                # Utilities (env, mux, veo, tts)
├── media/              # Browse shows
├── templates/          # Template management
└── watch/[showId]/     # Watch page + panels
db/                     # Drizzle schema + migrations
public/templates/       # Show template reference images
```
