"use client";

import { useEffect, useState } from "react";

import { getUserMemorySummaryAction } from "@/app/watch/[showId]/chat/actions";

interface MemorySummary {
  conceptMastery: Array<{ concept: string; level: string; confidence: number }>;
  interests: string[];
  humorPreference: string;
  recentQuestions: string[];
  totalMemories: number;
}

export function MemoryProfileCard({ userId = "default_user" }: { userId?: string }) {
  const [summary, setSummary] = useState<MemorySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getUserMemorySummaryAction(userId)
      .then(setSummary)
      .finally(() => setIsLoading(false));
  }, [userId]);

  return (
    <div className="card-brutal border-3 border-border bg-surface p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between border-b-2 border-border pb-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
          <h3
            className="text-sm font-bold uppercase tracking-wider text-foreground"
            style={{ fontFamily: "var(--font-space-mono)" }}
          >
            Agent Memory Bank
          </h3>
        </div>
        <span className="badge badge-sync text-xs">Collaborative Partner</span>
      </div>

      {isLoading ?
          (
            <p className="text-xs text-foreground-muted">Loading persistent memory state...</p>
          ) :
          (
            <div className="space-y-4 text-xs">
              {/* Humor & Tone Adaptation */}
              <div>
                <span
                  className="text-[11px] font-bold uppercase text-foreground-muted"
                  style={{ fontFamily: "var(--font-space-mono)" }}
                >
                  Learned Tone & Humor
                </span>
                <p className="mt-1 font-medium text-foreground">
                  {summary?.humorPreference || "Adapting to listener pacing"}
                </p>
              </div>

              {/* Mastered Concepts */}
              {summary && summary.conceptMastery.length > 0 && (
                <div>
                  <span
                    className="text-[11px] font-bold uppercase text-foreground-muted"
                    style={{ fontFamily: "var(--font-space-mono)" }}
                  >
                    Concepts Mastered
                  </span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {summary.conceptMastery.map(c => (
                      <span
                        key={c.concept}
                        className="border border-border bg-surface-elevated px-2 py-0.5 font-mono text-[10px]"
                        title={`Confidence: ${(c.confidence * 100).toFixed(0)}%`}
                      >
                        {c.concept}
                        :
                        <strong className="text-accent">{c.level}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Interests */}
              {summary && summary.interests.length > 0 && (
                <div>
                  <span
                    className="text-[11px] font-bold uppercase text-foreground-muted"
                    style={{ fontFamily: "var(--font-space-mono)" }}
                  >
                    Tracked Interests
                  </span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {summary.interests.map(interest => (
                      <span
                        key={interest}
                        className="border border-border bg-surface-elevated px-2 py-0.5 font-mono text-[10px]"
                      >
                        #
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Questions */}
              {summary && summary.recentQuestions.length > 0 && (
                <div>
                  <span
                    className="text-[11px] font-bold uppercase text-foreground-muted"
                    style={{ fontFamily: "var(--font-space-mono)" }}
                  >
                    Recent In-Character Tangents
                  </span>
                  <ul className="mt-1 list-disc pl-4 space-y-1 text-foreground-muted">
                    {summary.recentQuestions.slice(0, 3).map((q, i) => (
                      <li key={i} className="line-clamp-1 italic">
                        &ldquo;
                        {q}
                        &rdquo;
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Footer note */}
              <div className="pt-2 border-t border-border/50 text-[10px] text-foreground-muted">
                <span className="font-bold">Autonomous Adaptation:</span>
                {" "}
                Future episodes and host answers automatically adjust depth and humor to match this profile.
              </div>
            </div>
          )}
    </div>
  );
}
