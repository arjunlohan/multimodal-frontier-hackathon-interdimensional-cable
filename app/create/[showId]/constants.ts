export type GenerationStepId = "research" | "script" | "frame-chain" | "generate-clips" | "stitch" | "upload";

export const GENERATION_STEPS: { id: GenerationStepId; label: string }[] = [
  { id: "research", label: "Researching topic" },
  { id: "script", label: "Writing transcript" },
  { id: "frame-chain", label: "Generating anchor clip" },
  { id: "generate-clips", label: "Generating video clips" },
  { id: "stitch", label: "Stitching clips" },
  { id: "upload", label: "Uploading to Mux" },
];

/** Audio podcasts never render video, so the video wording would be misleading. */
const AUDIO_STEP_LABELS: Partial<Record<GenerationStepId, string>> = {
  "generate-clips": "Synthesizing audio",
  "stitch": "Assembling audio track",
};

export function generationSteps(isAudio: boolean): { id: GenerationStepId; label: string }[] {
  if (!isAudio) {
    return GENERATION_STEPS;
  }
  return GENERATION_STEPS.map(s => ({ ...s, label: AUDIO_STEP_LABELS[s.id] ?? s.label }));
}

export const POLL_INTERVAL = 2000;
