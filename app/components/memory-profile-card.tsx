"use client";

import { useEffect, useState } from "react";

import { getMemorySourcesAction, getUserMemorySummaryAction } from "@/app/watch/[showId]/chat/actions";

interface MemorySources {
  topicsRequested: number;
  conceptsTracked: number;
  questionPatterns: number;
  humorSignals: number;
  preferences: number;
  tangents: number;
  showsContributing: number;
}

interface MemorySummary {
  conceptMastery: Array<{ concept: string; level: string; confidence: number }>;
  interests: string[];
  humorPreference: string;
  recentQuestions: string[];
  totalMemories: number;
}

export function MemoryProfileCard({ userId = "default_user" }: { userId?: string }) {
  const [summary, setSummary] = useState<MemorySummary | null>(null);
  const [sources, setSources] = useState<MemorySources | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getUserMemorySummaryAction(userId),
      getMemorySourcesAction(userId),
    ])
      .then(([s, src]) => {
        setSummary(s);
        setSources(src);
      })
      .finally(() => setIsLoading(false));
  }, [userId]);

  // Only the channels that actually contributed, so the strip never implies
  // learning that did not happen.
  const learnedFrom = sources ?
      [
        sources.topicsRequested > 0 && `${sources.topicsRequested} topic${sources.topicsRequested === 1 ? "" : "s"} requested`,
        sources.conceptsTracked > 0 && `${sources.conceptsTracked} concept${sources.conceptsTracked === 1 ? "" : "s"} tracked`,
        sources.questionPatterns > 0 && `${sources.questionPatterns} question pattern${sources.questionPatterns === 1 ? "" : "s"}`,
        sources.tangents > 0 && `${sources.tangents} tangent${sources.tangents === 1 ? "" : "s"}`,
        sources.humorSignals > 0 && `${sources.humorSignals} humour signal${sources.humorSignals === 1 ? "" : "s"}`,
        sources.preferences > 0 && `${sources.preferences} stated preference${sources.preferences === 1 ? "" : "s"}`,
      ].filter(Boolean) as string[] :
      [];

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

      {/* Where the knowledge came from */}
      {learnedFrom.length > 0 && (
        <div className="mb-4 border-2 border-border bg-surface-elevated px-3 py-2">
          <div
            className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-foreground-muted"
            style={{ fontFamily: "var(--font-space-mono)" }}
          >
            Learned from
          </div>
          <p className="text-xs leading-relaxed">
            {learnedFrom.join(" · ")}
            {sources && sources.showsContributing > 0 ?
                (
                  <span className="text-foreground-muted">
                    {` — across ${sources.showsContributing} episode${sources.showsContributing === 1 ? "" : "s"}`}
                  </span>
                ) :
              null}
          </p>
        </div>
      )}

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
