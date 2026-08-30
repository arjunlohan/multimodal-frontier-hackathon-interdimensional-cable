export type GenerationStepId = "research" | "script" | "frame-chain" | "generate-clips" | "stitch" | "upload";

/**
 * What each step actually runs on.
 *
 * The progress view used to show only a verb ("Researching topic"), which hid
 * the entire Google stack doing the work. Naming the model and the service per
 * step makes the pipeline legible while it executes, and every entry here is
 * the engine that genuinely runs that step in `workflows/generate-show.ts`.
 */
export interface StepEngine {
  /** Model or service performing the work. */
  model: string;
  /** Product icon, when the step runs on Google Cloud. */
  icon?: string;
  /** Short service name shown beside the icon. */
  service: string;
}

const VERTEX_ICON = "/google/vertex-ai.svg";

export interface GenerationStep {
  id: GenerationStepId;
  label: string;
  engine: StepEngine;
}

export const GENERATION_STEPS: GenerationStep[] = [
  {
    id: "research",
    label: "Researching topic",
    engine: { model: "Gemini 3.7 Flash · Search grounding", icon: VERTEX_ICON, service: "Vertex AI" },
  },
  {
    id: "script",
    label: "Writing transcript",
    engine: { model: "Gemini 3.7 Flash · 3-pass", icon: VERTEX_ICON, service: "Vertex AI" },
  },
  {
    id: "frame-chain",
    label: "Generating anchor clip",
    engine: { model: "Veo 3.1 · boundary frame", icon: VERTEX_ICON, service: "Vertex AI" },
  },
  {
    id: "generate-clips",
    label: "Generating video clips",
    engine: { model: "Veo 3.1 · predictLongRunning", icon: VERTEX_ICON, service: "Vertex AI" },
  },
  {
    id: "stitch",
    label: "Stitching clips",
    engine: { model: "FFmpeg concat demuxer", service: "Local" },
  },
  {
    id: "upload",
    label: "Uploading to Mux",
    engine: { model: "Direct upload · HLS", service: "Mux" },
  },
];

/** Audio podcasts never render video, so the video wording would be misleading. */
const AUDIO_STEP_LABELS: Partial<Record<GenerationStepId, string>> = {
  "generate-clips": "Synthesizing audio",
  "stitch": "Assembling audio track",
};

/** The audio path runs TTS where the video path runs Veo. */
const AUDIO_STEP_ENGINES: Partial<Record<GenerationStepId, StepEngine>> = {
  "generate-clips": {
    model: "Gemini 3.1 Flash TTS · multi-speaker",
    icon: VERTEX_ICON,
    service: "Vertex AI",
  },
  "stitch": { model: "FFmpeg · 48 kHz AAC", service: "Local" },
};

export function generationSteps(isAudio: boolean): GenerationStep[] {
  if (!isAudio) {
    return GENERATION_STEPS;
  }
  return GENERATION_STEPS.map(s => ({
    ...s,
    label: AUDIO_STEP_LABELS[s.id] ?? s.label,
    engine: AUDIO_STEP_ENGINES[s.id] ?? s.engine,
  }));
}

export const POLL_INTERVAL = 2000;
