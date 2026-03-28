"use client";

import { PlayerProvider } from "@/app/media/[slug]/player/provider";
import { VideoPlayer } from "@/app/media/[slug]/player/ui";
import { Layer2Localization } from "@/app/media/[slug]/localization/ui";
import { Layer3SocialClips } from "@/app/media/[slug]/social-clips/ui";
import type { TranscriptCue } from "@/app/media/types";

import { ChatPanel } from "./chat/chat-panel";
import { ShowTranscript } from "./show-transcript";

import type { GeneratedShow, ShowTemplate } from "@/db/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TranscriptSegment {
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
}

interface WatchContentProps {
  show: GeneratedShow;
  template: ShowTemplate;
  hasElevenLabsKey: boolean;
  hasRemotionLambdaKeys: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function WatchContent({ show, template, hasElevenLabsKey, hasRemotionLambdaKeys }: WatchContentProps) {
  const hosts = (template.hosts ?? []) as Array<{ name: string; personality: string; position?: string }>;
  const segments = (show.transcriptSegments ?? []) as TranscriptSegment[];

  // Convert transcript segments to TranscriptCue[] for social clips
  const transcriptCues: TranscriptCue[] = segments.map((seg, i) => ({
    id: `cue-${i}`,
    startTime: seg.startTime,
    endTime: seg.endTime,
    text: seg.text,
  }));

  return (
    <PlayerProvider>
      <div className="grid gap-8 md:grid-cols-[1.3fr_1fr]">
        {/* Left Column — Video + Transcript */}
        <div className="space-y-6">
          {/* Mux Player */}
          <div className="border-3 border-border shadow-[6px_6px_0_var(--border)]">
            <VideoPlayer
              playbackId={show.muxPlaybackId!}
              title={show.topic}
            />
          </div>

          {/* Synced Transcript */}
          {segments.length > 0 && (
            <ShowTranscript segments={segments} />
          )}
        </div>

        {/* Right Column — Info Panels */}
        <div className="space-y-6">
          {/* Research Context */}
          {show.researchContext && (
            <div className="card-flat overflow-hidden">
              <div
                className="panel-brutal-header bg-background-dark text-white"
                style={{ fontFamily: "var(--font-space-mono)" }}
              >
                Research
              </div>
              <div className="max-h-64 overflow-y-auto p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground-muted">
                  {show.researchContext}
                </p>
              </div>
            </div>
          )}

          {/* Chat */}
          <ChatPanel
            showId={show.id}
            topic={show.topic}
            transcript={show.transcript ?? ""}
            researchContext={show.researchContext ?? ""}
          />

          {/* Language Switching */}
          {show.muxAssetId && (
            <Layer2Localization
              assetId={show.muxAssetId}
              hasElevenLabsKey={hasElevenLabsKey}
            />
          )}

          {/* Social Clips */}
          {show.muxAssetId && show.muxPlaybackId && transcriptCues.length > 0 && (
            <Layer3SocialClips
              assetId={show.muxAssetId}
              playbackId={show.muxPlaybackId}
              playbackPolicy="public"
              transcriptCues={transcriptCues}
              title={show.topic}
              hasRemotionLambdaKeys={hasRemotionLambdaKeys}
            />
          )}

          {/* Show Details */}
          <div className="card-flat p-4">
            <div
              className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-foreground-muted"
              style={{ fontFamily: "var(--font-space-mono)" }}
            >
              Show Details
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-foreground-muted">Template</span>
                <span className="font-bold">{template.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-muted">Type</span>
                <span className="font-bold capitalize">{template.showType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-muted">Duration</span>
                <span className="font-bold">{show.durationSeconds}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-muted">Familiarity</span>
                <span className="font-bold capitalize">{show.familiarity}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground-muted">Language</span>
                <span className="font-bold">{show.language?.toUpperCase() ?? "EN"}</span>
              </div>
              {hosts.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-foreground-muted">Hosts</span>
                  <span className="font-bold">{hosts.map(h => h.name).join(", ")}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PlayerProvider>
  );
}
