"use client";

import { AUDIO_PODCAST_DURATION_OPTIONS, VIDEO_DURATION_OPTIONS } from "./constants";

interface DurationSelectorProps {
  mediaFormat?: "video" | "audio";
  onChange: (v: number) => void;
  value: number;
}

export function DurationSelector({ value, onChange, mediaFormat = "video" }: DurationSelectorProps) {
  const options = mediaFormat === "audio" ? AUDIO_PODCAST_DURATION_OPTIONS : VIDEO_DURATION_OPTIONS;

  return (
    <div className="flex flex-wrap gap-2">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          className={`tone-btn ${value === option.value ? "active" : ""}`}
          style={{ fontFamily: "var(--font-space-mono)" }}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
