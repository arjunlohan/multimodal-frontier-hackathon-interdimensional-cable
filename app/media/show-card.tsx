"use client";

import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";

import { deleteShowAction } from "./actions";

interface ShowCardProps {
  id: string;
  topic: string;
  templateName: string;
  showType: string;
  playbackId: string | null;
  durationSeconds: number;
  createdAt: Date | null;
}

function getThumbnailUrl(playbackId: string): string {
  return `https://image.mux.com/${playbackId}/thumbnail.webp?width=640&height=360&fit_mode=smartcrop`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function ShowCard({ id, topic, templateName, showType, playbackId, durationSeconds, createdAt }: ShowCardProps) {
  const shouldReduceMotion = useReducedMotion();
  // Mirrors checkShowFormatStep in workflows/generate-show.ts: > 40s is an audio podcast.
  const isAudio = durationSeconds > 40;

  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  const handleDelete = () => {
    setDeleteError(null);
    startDelete(async () => {
      const result = await deleteShowAction(id);
      if (!result.ok) {
        setDeleteError(result.error ?? "Delete failed.");
        setConfirming(false);
      }
      // On success the server action revalidates /media and the card disappears.
    });
  };

  const cardVariants = {
    rest: {
      x: 0,
      y: 0,
      boxShadow: "6px 6px 0 var(--border)",
    },
    hover: {
      x: -4,
      y: -4,
      boxShadow: "8px 8px 0 var(--border)",
    },
  } as const;

  const thumbVariants = {
    rest: { scale: 1 },
    hover: { scale: 1.05 },
  } as const;

  const ctaVariants = {
    rest: {
      scale: 1,
      y: 0,
      boxShadow: "4px 4px 0 var(--border)",
    },
    hover: {
      scale: 1.02,
      y: -2,
      boxShadow: "6px 6px 0 var(--border)",
    },
  } as const;

  return (
    <div className="relative">
      {/* Delete lives outside the Link so it cannot trigger navigation. */}
      <div className="absolute right-2 top-2 z-20">
        {confirming ?
            (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="border-2 border-border bg-red-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
                  style={{ fontFamily: "var(--font-space-mono)" }}
                >
                  {isDeleting ? "Deleting..." : "Confirm"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={isDeleting}
                  className="border-2 border-border bg-surface px-2 py-1 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
                  style={{ fontFamily: "var(--font-space-mono)" }}
                >
                  Cancel
                </button>
              </div>
            ) :
            (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                title="Delete this show and free a Mux storage slot"
                aria-label="Delete show"
                className="border-2 border-border bg-surface px-2 py-1 text-[11px] font-bold text-foreground-muted transition-colors hover:bg-red-600 hover:text-white"
                style={{ fontFamily: "var(--font-space-mono)" }}
              >
                ✕
              </button>
            )}
      </div>

      {deleteError && (
        <p className="absolute left-2 right-2 top-10 z-20 border-2 border-border bg-red-600 px-2 py-1 text-[10px] text-white">
          {deleteError}
        </p>
      )}

      <Link href={`/watch/${id}`} className="block">
        <motion.article
          className="card-brutal relative flex h-full flex-col overflow-visible"
          initial="rest"
          animate="rest"
          whileHover={shouldReduceMotion ? undefined : "hover"}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.99, x: 0, y: 0 }}
          variants={cardVariants}
          transition={{ type: "spring", stiffness: 500, damping: 28 }}
        >
          {/* Thumbnail */}
          <div className="border-b-3 border-border bg-surface p-3">
            <div className="relative aspect-video w-full overflow-hidden border-3 border-border bg-background-dark">
              {playbackId && !isAudio ?
                  (
                    <motion.div
                      className="absolute inset-0"
                      variants={thumbVariants}
                      transition={{ type: "spring", stiffness: 450, damping: 30 }}
                    >
                      <Image
                        src={getThumbnailUrl(playbackId)}
                        alt={topic}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        className="object-cover"
                      />
                    </motion.div>
                  ) :
                playbackId && isAudio ?
                    (
                // Mux returns 400 for thumbnails on assets with no video track,
                // so audio podcasts get a placard instead of a broken image.
                      <div className="flex h-full flex-col items-center justify-center gap-2 bg-background-dark text-white">
                        <span className="text-3xl">🎙️</span>
                        <span
                          className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70"
                          style={{ fontFamily: "var(--font-space-mono)" }}
                        >
                          Audio Podcast
                        </span>
                      </div>
                    ) :
                    (
                      <div className="flex h-full items-center justify-center">
                        <span className="text-foreground-muted">No preview</span>
                      </div>
                    )}
            </div>
          </div>

          {/* Content */}
          <div className="flex flex-1 flex-col gap-3 p-5 pb-14">
            <h3
              className="line-clamp-3 text-xl font-extrabold leading-tight tracking-tight"
              style={{ fontFamily: "var(--font-syne)" }}
            >
              {topic}
            </h3>

            <div className="flex flex-wrap gap-2">
              <span
                className="border-2 border-border bg-surface px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-foreground"
                style={{ fontFamily: "var(--font-space-mono)" }}
              >
                {templateName}
              </span>
              <span
                className="border-2 border-border bg-surface px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-foreground-muted"
                style={{ fontFamily: "var(--font-space-mono)" }}
              >
                {showType}
              </span>
              <span
                className="border-2 border-border bg-surface px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-foreground-muted"
                style={{ fontFamily: "var(--font-space-mono)" }}
              >
                {durationSeconds}
                s
              </span>
            </div>

            {createdAt && (
              <p
                className="text-xs text-foreground-muted"
                style={{ fontFamily: "var(--font-space-mono)" }}
              >
                {formatDate(createdAt)}
              </p>
            )}

            <div className="flex-1" />
          </div>

          {/* Watch CTA */}
          <div className="pointer-events-none absolute bottom-0 left-5 -translate-x-1 translate-y-1/2">
            <motion.div
              className="pointer-events-auto inline-flex items-center gap-2 border-3 border-border bg-accent px-6 py-3 text-sm font-extrabold uppercase tracking-[0.1em] text-foreground"
              style={{ fontFamily: "var(--font-space-mono)" }}
              variants={ctaVariants}
              transition={{ type: "spring", stiffness: 450, damping: 26 }}
            >
              Watch
              <svg
                className="block h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path strokeLinecap="square" strokeLinejoin="miter" d="M9 5l7 7-7 7" />
              </svg>
            </motion.div>
          </div>
        </motion.article>
      </Link>
    </div>
  );
}
