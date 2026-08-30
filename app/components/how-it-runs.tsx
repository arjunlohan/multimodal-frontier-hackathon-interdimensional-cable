/**
 * The production pipeline, made visible.
 *
 * Every stage listed here maps to a real `"use step"` boundary in
 * `workflows/generate-show.ts`. Engines named here are the ones that actually
 * execute — no aspirational services, because the architecture claims on this
 * page are checkable against the repo.
 */

interface Engine {
  label: string;
  icon?: string;
  google: boolean;
}

const VERTEX: Engine = { label: "Vertex AI", icon: "/google/vertex-ai.svg", google: true };
const CLOUD_SQL: Engine = { label: "Cloud SQL", icon: "/google/cloud-sql.svg", google: true };
const FFMPEG: Engine = { label: "FFmpeg", google: false };
const MUX: Engine = { label: "Mux", google: false };

interface Stage {
  id: string;
  title: string;
  model: string;
  engine: Engine;
  detail: string;
}

const STAGES: Stage[] = [
  {
    id: "preflight",
    title: "Capacity preflight",
    model: "Mux Video API",
    engine: MUX,
    detail:
      "Checks there is somewhere to store the result before anything is generated. A full library stops the run here rather than after the render bill.",
  },
  {
    id: "research",
    title: "Grounded research",
    model: "Gemini 3.7 Flash · Google Search grounding",
    engine: VERTEX,
    detail:
      "Reads the topic or fetches the pasted URL, then researches it against live search results and returns cited facts and premise angles.",
  },
  {
    id: "script",
    title: "Three-pass writers' room",
    model: "Gemini 3.7 Flash",
    engine: VERTEX,
    detail:
      "Head writer drafts structure and jokes, then a voice pass rewrites in the host's cadence and prunes to the exact runtime.",
  },
  {
    id: "voice",
    title: "Multi-speaker synthesis",
    model: "Gemini 3.1 Flash TTS",
    engine: VERTEX,
    detail:
      "Infers each host's gender and accent from the show template, then assigns a matching neural voice. Two hosts, one take.",
  },
  {
    id: "video",
    title: "Video generation",
    model: "Veo 3.1 · predictLongRunning",
    engine: VERTEX,
    detail:
      "Renders each beat as a clip. The last frame of one becomes the first frame of the next, so the host stays continuous across cuts.",
  },
  {
    id: "stitch",
    title: "Assembly",
    model: "FFmpeg concat demuxer",
    engine: FFMPEG,
    detail:
      "Joins clips and aligns audio, falling back to a 48 kHz AAC re-encode when streams do not match.",
  },
  {
    id: "publish",
    title: "Publish",
    model: "Mux direct upload · HLS",
    engine: MUX,
    detail:
      "Uploads the master and returns an adaptive-bitrate playback ID. A failed upload keeps the rendered file, so a retry costs nothing.",
  },
];

function EngineChip({ engine }: { engine: Engine }) {
  return (
    <span
      className="badge inline-flex items-center gap-1.5 justify-self-start whitespace-nowrap md:justify-self-end"
      style={{
        fontFamily: "var(--font-space-mono)",
        background: engine.google ? "var(--surface)" : "var(--surface-elevated)",
      }}
    >
      {engine.icon ?
          (
            <img src={engine.icon} alt="" aria-hidden="true" className="h-4 w-4" />
          ) :
        null}
      {engine.label}
    </span>
  );
}

export function HowItRuns() {
  return (
    <section>
      <div
        className="section-header-brutal stripes-dark text-white"
        style={{ fontFamily: "var(--font-syne)" }}
      >
        WHAT RUNS WHEN YOU PRESS GENERATE
      </div>

      <p className="mt-6 max-w-3xl text-base leading-relaxed text-foreground-muted">
        Each stage below is a checkpointed step in a durable workflow. If one fails,
        the run resumes from the last completed step instead of starting over, and
        every intermediate result is written to Cloud SQL as it lands.
      </p>

      <ol className="mt-6 space-y-3">
        {STAGES.map((stage, i) => (
          <li key={stage.id} className="card-brutal">
            <div className="grid gap-3 p-5 md:grid-cols-[auto_1fr_auto] md:items-start md:gap-5">
              <span
                className="text-2xl font-extrabold leading-none text-accent md:pt-1"
                style={{ fontFamily: "var(--font-space-mono)" }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>

              <div className="min-w-0">
                <h3
                  className="text-lg font-extrabold"
                  style={{ fontFamily: "var(--font-syne)" }}
                >
                  {stage.title}
                </h3>
                <p
                  className="mt-0.5 text-xs font-bold uppercase tracking-[0.15em] text-foreground-muted"
                  style={{ fontFamily: "var(--font-space-mono)" }}
                >
                  {stage.model}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
                  {stage.detail}
                </p>
              </div>

              <EngineChip engine={stage.engine} />
            </div>
          </li>
        ))}
      </ol>

      {/*
        State layer sits under every stage rather than beside them, so it is
        marked dashed. `border-dashed` alone loses to `.card-brutal`'s
        `border: 3px solid` shorthand, hence the inline style.
      */}
      <div className="card-brutal mt-3" style={{ borderStyle: "dashed" }}>
        <div className="grid gap-3 p-5 md:grid-cols-[auto_1fr_auto] md:items-start md:gap-5">
          <span
            className="text-2xl font-extrabold leading-none text-foreground-muted md:pt-1"
            style={{ fontFamily: "var(--font-space-mono)" }}
          >
            ↻
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold" style={{ fontFamily: "var(--font-syne)" }}>
              Throughout · state and memory
            </h3>
            <p
              className="mt-0.5 text-xs font-bold uppercase tracking-[0.15em] text-foreground-muted"
              style={{ fontFamily: "var(--font-space-mono)" }}
            >
              Cloud SQL for PostgreSQL 16 · pgvector
            </p>
            <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
              Every step checkpoint, transcript, chat message and memory record lands
              here. Embeddings are stored as 768-dimension vectors with an HNSW cosine
              index, so retrieval happens in the same query as the show metadata.
            </p>
          </div>
          <EngineChip engine={CLOUD_SQL} />
        </div>
      </div>
    </section>
  );
}

interface FootprintRow {
  requirement: string;
  satisfiedBy: string;
  icon?: string;
  evidence: string;
}

const FOOTPRINT: FootprintRow[] = [
  {
    requirement: "Gemini 3.5 or newer",
    satisfiedBy: "Gemini 3.7 Flash, Gemini 3.1 Flash TTS, text-embedding-004",
    icon: "/google/vertex-ai.svg",
    evidence: "app/lib/genai.ts",
  },
  {
    requirement: "Google agent framework",
    satisfiedBy: "Google GenAI SDK (@google/genai) across 9 runtime modules",
    evidence: "app/lib/genai.ts",
  },
  {
    requirement: "Google Cloud infrastructure",
    satisfiedBy: "Cloud SQL for PostgreSQL 16 with pgvector 0.8.5",
    icon: "/google/cloud-sql.svg",
    evidence: "scripts/provision-cloud-sql.sh",
  },
  {
    requirement: "Bonus model integration",
    satisfiedBy: "Veo 3.1 generates every video clip",
    icon: "/google/vertex-ai.svg",
    evidence: "app/lib/vertex-video.ts",
  },
];

export function CloudFootprint() {
  return (
    <section>
      <div
        className="section-header-brutal stripes-accent text-foreground"
        style={{ fontFamily: "var(--font-syne)" }}
      >
        BUILT ON GOOGLE CLOUD
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {FOOTPRINT.map(row => (
          <div key={row.requirement} className="card-brutal flex flex-col gap-2 p-5">
            <div className="flex items-center gap-2">
              {row.icon ?
                  (
                    <img src={row.icon} alt="" aria-hidden="true" className="h-6 w-6 shrink-0" />
                  ) :
                null}
              <h3
                className="text-base font-extrabold"
                style={{ fontFamily: "var(--font-syne)" }}
              >
                {row.requirement}
              </h3>
            </div>
            <p className="text-sm leading-relaxed text-foreground-muted">
              {row.satisfiedBy}
            </p>
            <code
              className="mt-auto pt-1 text-xs text-foreground-muted"
              style={{ fontFamily: "var(--font-space-mono)" }}
            >
              {row.evidence}
            </code>
          </div>
        ))}
      </div>

      <p className="mt-4 text-sm leading-relaxed text-foreground-muted">
        Two components are deliberately not Google, and are named rather than hidden:
        {" "}
        <strong className="text-foreground">Mux</strong>
        {" "}
        handles video hosting and HLS
        delivery, and
        <strong className="text-foreground">FFmpeg</strong>
        {" "}
        stitches clips
        locally.
      </p>
    </section>
  );
}
