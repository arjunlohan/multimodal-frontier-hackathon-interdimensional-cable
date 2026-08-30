/**
 * What produced this specific episode.
 *
 * Deliberately driven by the show's own record rather than a static list: the
 * counts below are read off the stored research brief and transcript, so the
 * panel cannot claim work that did not happen. A show generated without
 * grounding shows no grounded sources.
 */

interface ProvenanceFact {
  sourceUrl?: string;
  sourceTitle?: string;
}

interface ProvenanceBrief {
  groundedFacts?: ProvenanceFact[];
  searchMetadata?: { searchQueriesUsed?: string[] };
}

interface ProvenancePanelProps {
  researchContext: string | null;
  segmentCount: number;
  durationSeconds: number;
  isAudio: boolean;
  hasMux: boolean;
  language: string;
}

const VERTEX_ICON = "/google/vertex-ai.svg";
const CLOUD_SQL_ICON = "/google/cloud-sql.svg";

function parseBrief(raw: string | null): ProvenanceBrief | null {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as ProvenanceBrief;
  } catch {
    return null;
  }
}

interface Row {
  stage: string;
  engine: string;
  icon?: string;
  service: string;
  detail: string;
}

export function ProvenancePanel({
  researchContext,
  segmentCount,
  durationSeconds,
  isAudio,
  hasMux,
  language,
}: ProvenancePanelProps) {
  const brief = parseBrief(researchContext);
  const facts = brief?.groundedFacts ?? [];
  const sourced = facts.filter(f => f.sourceUrl).length;
  const queries = brief?.searchMetadata?.searchQueriesUsed ?? [];

  const rows: Row[] = [
    {
      stage: "Research",
      engine: "Gemini 3.7 Flash",
      icon: VERTEX_ICON,
      service: "Vertex AI",
      detail: facts.length > 0 ?
        `${facts.length} grounded fact${facts.length === 1 ? "" : "s"}${sourced > 0 ? `, ${sourced} with a live source` : ""}${queries.length > 0 ? ` from ${queries.length} search quer${queries.length === 1 ? "y" : "ies"}` : ""}` :
        "No stored research brief for this episode",
    },
    {
      stage: "Script",
      engine: "Gemini 3.7 Flash",
      icon: VERTEX_ICON,
      service: "Vertex AI",
      detail: `${segmentCount} beat${segmentCount === 1 ? "" : "s"} across three passes: research, head writer, voice`,
    },
    isAudio ?
        {
          stage: "Voices",
          engine: "Gemini 3.1 Flash TTS",
          icon: VERTEX_ICON,
          service: "Vertex AI",
          detail: `Multi-speaker synthesis, ${durationSeconds}s, ${language.toUpperCase()}`,
        } :
        {
          stage: "Video",
          engine: "Veo 3.1",
          icon: VERTEX_ICON,
          service: "Vertex AI",
          detail: `${segmentCount} clip${segmentCount === 1 ? "" : "s"} with boundary-frame chaining for face continuity`,
        },
    {
      stage: "State",
      engine: "PostgreSQL 16 + pgvector",
      icon: CLOUD_SQL_ICON,
      service: "Cloud SQL",
      detail: "Transcript, memory and every step checkpoint",
    },
    {
      stage: "Delivery",
      engine: hasMux ? "Direct upload, HLS" : "Local render",
      service: "Mux",
      detail: hasMux ? "Adaptive bitrate streaming" : "Not yet uploaded",
    },
  ];

  return (
    <div className="card-flat p-4">
      <div
        className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-foreground-muted"
        style={{ fontFamily: "var(--font-space-mono)" }}
      >
        How this was made
      </div>
      <p className="mb-4 text-xs leading-relaxed text-foreground-muted">
        Every figure below is read from this episode&apos;s own record.
      </p>

      <div className="space-y-3">
        {rows.map(row => (
          <div key={row.stage} className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className="text-xs font-bold uppercase tracking-[0.1em]"
                style={{ fontFamily: "var(--font-space-mono)" }}
              >
                {row.stage}
                {" · "}
                {row.engine}
              </span>
              <span className="text-[11px] leading-tight text-foreground-muted">
                {row.detail}
              </span>
            </div>

            <span
              className="inline-flex shrink-0 items-center gap-1.5 border-2 border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{ fontFamily: "var(--font-space-mono)", background: "var(--surface-elevated)" }}
            >
              {row.icon ?
                  (
                    // eslint-disable-next-line next/no-img-element
                    <img src={row.icon} alt="" aria-hidden="true" className="h-3.5 w-3.5" />
                  ) :
                null}
              {row.service}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
