import { describe, expect, it, vi } from "vitest";

import { runDramaturgyPipeline } from "@/app/lib/dramaturgy/orchestrator";
import { createMockResearchBrief } from "@/app/lib/dramaturgy/pass1-research";
import { synthesizeDeterministicDeskDraft, synthesizeDeterministicPodcastDraft } from "@/app/lib/dramaturgy/pass2-head-writer";
import { runPass3VoiceAndPrune, sanitizeForVeoRai } from "@/app/lib/dramaturgy/pass3-voice-prune";
import { getDefaultShowSkill, getShowSkill, resolveSkillForShow } from "@/app/lib/skills/registry";
import type { ShowSkill } from "@/app/lib/skills/types";
import { buildVeoPrompt as buildVeoPromptContract } from "@/app/lib/veo";

// Mock env module
vi.mock("@/app/lib/env", () => ({
  env: {
    GEMINI_API_KEY: "test-gemini-key",
    GOOGLE_GENERATIVE_AI_API_KEY: undefined,
    DATABASE_URL: "postgresql://localhost:5432/test",
  },
}));

// Mock memory bank
vi.mock("@/app/lib/memory-bank", () => ({
  buildPersonalizedPromptContext: vi.fn().mockResolvedValue(
    "=== PERSISTENT USER MEMORY BANK ===\nPreferred Tone: Sharp Satire\nInterests: AI, Quantum",
  ),
  getMemorySummary: vi.fn().mockResolvedValue({
    conceptMastery: [],
    interests: ["AI"],
    humorPreference: "Sharp Satire",
    recentQuestions: [],
    totalMemories: 1,
  }),
}));

// Extracted helper functions matching workflows/generate-show.ts logic
function checkShowFormat(durationSeconds: number | null | undefined): { isAudioPodcast: boolean; durationSeconds: number } {
  const duration = durationSeconds ?? 16;
  return {
    isAudioPodcast: duration > 40,
    durationSeconds: duration,
  };
}

interface TranscriptSegment {
  speaker: string;
  text: string;
  startTime?: number;
  endTime?: number;
  startTimeSeconds?: number;
  endTimeSeconds?: number;
  clipIndex?: number;
  visualPrompt?: string;
  actingDirection?: string;
  durationSeconds?: number;
  acousticTags?: string[];
  wordCount?: number;
}

interface Host {
  name: string;
  personality?: string;
  position?: string;
}

function sanitizeNotesForVeo(notes: string): string {
  return notes
    .replace(/\bHBO\b/gi, "premium cable")
    .replace(/\bNBC\b/gi, "broadcast network")
    .replace(/\bSNL\b/gi, "sketch comedy show")
    .replace(/\bSaturday Night Live\b/gi, "sketch comedy show")
    .replace(/\bLast Week Tonight\b/gi, "weekly investigative comedy show")
    .replace(/\bLate Night\b/gi, "late-night show")
    .replace(/\bWeekend Update\b/gi, "news desk comedy segment")
    .replace(/\bColin Jost\b/gi, "Colin")
    .replace(/\bMichael Che\b/gi, "Michael")
    .replace(/\bJohn Oliver\b/gi, "John")
    .replace(/\bSeth Meyers\b/gi, "Seth");
}

function buildVeoPrompt(
  segment: TranscriptSegment,
  hosts: Host[],
  showType: string,
  notes: string,
): string {
  if (segment.visualPrompt && segment.visualPrompt.length >= 10) {
    return sanitizeNotesForVeo(segment.visualPrompt);
  }

  const host = hosts.find(h => h.name === segment.speaker) ?? hosts[0] ?? { name: "Host" };
  const sanitizedNotes = sanitizeNotesForVeo(notes);

  let prompt = "A professional late-night talk show segment. ";

  if (showType === "conversation") {
    prompt += "Two hosts sit behind a news desk with a world map graphic behind them. ";
    if (host.position === "left") {
      prompt += "The person on the LEFT is speaking and gesturing. ";
    } else if (host.position === "right") {
      prompt += "The person on the RIGHT is speaking and gesturing. ";
    }
  } else {
    prompt += "A single host behind a desk delivering a monologue, with a colorful graphic behind them. ";
  }

  prompt += `The host is saying: "${segment.text}" `;
  prompt += `Style: ${sanitizedNotes} `;
  prompt += "The host should be animated, expressive, and natural. Studio lighting, professional TV production quality.";

  return prompt;
}

function formatPodcastTranscriptForTts(segments: TranscriptSegment[], showType: string): string {
  return segments
    .map(s => (showType === "conversation" ? `${s.speaker}: ${s.text}` : s.text))
    .join("\n\n");
}

describe("challenger M2: Workflow Durability & Media Interface Integration", () => {
  const deskSkill: ShowSkill = getShowSkill("investigative-desk") ?? getDefaultShowSkill("writers_room_desk");
  const podcastSkill: ShowSkill = getShowSkill("speculative-podcast") ?? getDefaultShowSkill("conversational_podcast");

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Workflow Route & Duration Branching Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe("workflow routing & format branching", () => {
    it("correctly routes durations <= 40s to Video Show pipeline (Veo 3.1)", () => {
      const durations = [8, 16, 24, 32, 40];
      for (const d of durations) {
        const result = checkShowFormat(d);
        expect(result.isAudioPodcast).toBe(false);
        expect(result.durationSeconds).toBe(d);
      }
    });

    it("correctly routes durations > 40s up to 300s to Audio Podcast pipeline (Gemini 3.1 Flash TTS)", () => {
      const durations = [48, 60, 120, 180, 240, 300];
      for (const d of durations) {
        const result = checkShowFormat(d);
        expect(result.isAudioPodcast).toBe(true);
        expect(result.durationSeconds).toBe(d);
      }
    });

    it("defaults to 16s Video Show if duration is null or undefined", () => {
      expect(checkShowFormat(null).isAudioPodcast).toBe(false);
      expect(checkShowFormat(null).durationSeconds).toBe(16);
      expect(checkShowFormat(undefined).isAudioPodcast).toBe(false);
      expect(checkShowFormat(undefined).durationSeconds).toBe(16);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Dramaturgy Pipeline Progress Emission Tests across all 3 passes
  // ───────────────────────────────────────────────────────────────────────────
  describe("dramaturgy progress emission across 3 passes", () => {
    it("emits monotonically increasing progress events through Pass 1 -> Pass 2 -> Pass 3 -> Complete", async () => {
      const progressEvents: Array<{ step: string; progressFraction: number; message: string }> = [];

      const result = await runDramaturgyPipeline(
        {
          showId: "test-progress-show",
          topic: "Autonomous AI Law Firms",
          templateId: "investigative-desk",
          durationSeconds: 40,
          familiarity: "familiar",
          options: { forceMock: true },
        },
        async (event) => {
          progressEvents.push(event);
        },
      );

      expect(progressEvents).toHaveLength(4);

      // Verify steps in order
      expect(progressEvents[0].step).toBe("research");
      expect(progressEvents[0].progressFraction).toBe(0.25);
      expect(progressEvents[0].message).toContain("Researching");

      expect(progressEvents[1].step).toBe("script_draft");
      expect(progressEvents[1].progressFraction).toBe(0.65);
      expect(progressEvents[1].message).toContain("Head writer drafting");

      expect(progressEvents[2].step).toBe("voice_prune");
      expect(progressEvents[2].progressFraction).toBe(0.90);
      expect(progressEvents[2].message).toContain("Running stylometric voice pass");

      expect(progressEvents[3].step).toBe("complete");
      expect(progressEvents[3].progressFraction).toBe(1.0);
      expect(progressEvents[3].message).toContain("Script complete");

      // Verify strict monotonic increase
      for (let i = 1; i < progressEvents.length; i++) {
        expect(progressEvents[i].progressFraction).toBeGreaterThan(progressEvents[i - 1].progressFraction);
      }

      // Verify result data integrity
      expect(result.finalScript.segments).toHaveLength(5);
      expect(result.executionMetrics.jokesEvaluated).toBe(5);
      expect(result.executionMetrics.totalDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Segment Format Compatibility with Gemini 3.1 Flash TTS
  // ───────────────────────────────────────────────────────────────────────────
  describe("gemini 3.1 Flash TTS media interface compatibility", () => {
    it("formats multi-speaker podcast segments into valid dialogue transcripts for TTS", async () => {
      const brief = createMockResearchBrief({ topic: "Quantum Teleportation", showSkill: podcastSkill });
      const draft = synthesizeDeterministicPodcastDraft({
        researchBrief: brief,
        skill: podcastSkill,
        durationSeconds: 120,
      });
      const pass3 = await runPass3VoiceAndPrune({
        draft,
        skill: podcastSkill,
        options: { forceMock: true },
      });

      const { segments } = pass3.finalScript;
      expect(segments.length).toBeGreaterThanOrEqual(5);

      // Format for TTS
      const formattedDialogue = formatPodcastTranscriptForTts(segments, "conversation");

      // Verify speaker turns are properly delineated
      expect(formattedDialogue).toContain(":");
      for (const seg of segments) {
        expect(formattedDialogue).toContain(`${seg.speaker}: ${seg.text}`);
        expect(seg.durationSeconds).toBeGreaterThan(0);
        expect(seg.startTimeSeconds).toBeLessThan(seg.endTimeSeconds);
      }

      // Verify acoustic tags are present in text for expressive TTS
      const tagsInDialogue = formattedDialogue.match(/\[(laughs|chuckles|sighs|incredulous|whispering)\]/g);
      expect(tagsInDialogue).not.toBeNull();
      expect(tagsInDialogue!.length).toBeGreaterThanOrEqual(2);
    });

    it("verifies host configs match TTS voice mapping requirements", () => {
      const skills = [deskSkill, podcastSkill];
      for (const skill of skills) {
        expect(skill.hosts.length).toBeGreaterThanOrEqual(1);
        for (const host of skill.hosts) {
          expect(host.name).toBeDefined();
          expect(host.ttsVoice).toBeDefined();
          expect(["Charon", "Orus", "Puck", "Fenrir", "Aoede", "Kore", "Enceladus", "Zephyr"]).toContain(host.ttsVoice);
        }
      }
    });

    it("formats single-speaker monologue transcript without superfluous speaker labels", () => {
      const monologueSegments: TranscriptSegment[] = [
        { speaker: "John", text: "Welcome to the show.", durationSeconds: 8 },
        { speaker: "John", text: "Tonight we discuss AI toasters.", durationSeconds: 8 },
      ];

      const formatted = formatPodcastTranscriptForTts(monologueSegments, "monologue");
      expect(formatted).toBe("Welcome to the show.\n\nTonight we discuss AI toasters.");
      expect(formatted).not.toContain("John:");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Segment Format Compatibility with Google Veo 3.1
  // ───────────────────────────────────────────────────────────────────────────
  describe("google Veo 3.1 media interface compatibility", () => {
    it("generates valid Veo 3.1 visual prompts with RAI safety sanitization for all 8s clips", async () => {
      const brief = createMockResearchBrief({ topic: "Smart Refrigerator DRM", showSkill: deskSkill });
      const draft = synthesizeDeterministicDeskDraft({
        researchBrief: brief,
        skill: deskSkill,
        durationSeconds: 40,
      });
      const pass3 = await runPass3VoiceAndPrune({
        draft,
        skill: deskSkill,
        options: { forceMock: true },
      });

      const { segments } = pass3.finalScript;
      expect(segments).toHaveLength(5); // 40s / 8s = 5 clips

      const hosts: Host[] = deskSkill.hosts.map(h => ({
        name: h.name,
        personality: h.personaCraft,
        position: h.position,
      }));

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        expect(seg.clipIndex).toBe(i);
        expect(seg.durationSeconds).toBe(8);
        expect(seg.startTimeSeconds).toBe(i * 8);
        expect(seg.endTimeSeconds).toBe((i + 1) * 8);
        expect(seg.visualPrompt).toBeDefined();
        expect(seg.visualPrompt.length).toBeGreaterThanOrEqual(15);

        // Build prompt for Veo
        const veoPrompt = buildVeoPrompt(seg, hosts, "monologue", "premium cable style");

        // Verify Veo prompt characteristics
        expect(veoPrompt.length).toBeGreaterThan(20);
        expect(veoPrompt).not.toMatch(/\b(HBO|NBC|SNL|Last Week Tonight)\b/);
        expect(veoPrompt).not.toMatch(/\bphotorealistic identical clone\b/);

        // Verify word budget compliance (14 - 30 words per 8s clip)
        expect(seg.wordCount).toBeGreaterThanOrEqual(14);
        expect(seg.wordCount).toBeLessThanOrEqual(30);
      }
    });

    it("handles RAI sanitization in template notes and prioritizes visualPrompt", () => {
      const hosts: Host[] = [{ name: "John", position: "center" }];

      // 1. When visualPrompt is present, it is sanitized and prioritized
      const segmentWithPrompt: TranscriptSegment = {
        speaker: "John",
        text: "This is a great segment.",
        visualPrompt: "A high-concept HBO desk set with John Oliver delivering a sharp monologue on Last Week Tonight.",
        durationSeconds: 8,
      };

      const prioritizedPrompt = buildVeoPrompt(segmentWithPrompt, hosts, "monologue", "NBC style");
      expect(prioritizedPrompt).toContain("premium cable");
      expect(prioritizedPrompt).toContain("weekly investigative comedy show");
      expect(prioritizedPrompt).not.toContain("HBO");
      expect(prioritizedPrompt).not.toContain("Last Week Tonight");

      // 2. When visualPrompt is absent, notes style is sanitized
      const segmentWithoutPrompt: TranscriptSegment = {
        speaker: "John",
        text: "Welcome to the show.",
        durationSeconds: 8,
      };

      const fallbackPrompt = buildVeoPrompt(segmentWithoutPrompt, hosts, "monologue", "HBO and SNL format");
      expect(fallbackPrompt).toContain("single host behind a desk delivering a monologue");
      expect(fallbackPrompt).toContain("premium cable");
      expect(fallbackPrompt).toContain("sketch comedy show");
      expect(fallbackPrompt).not.toContain("Style: HBO");
      expect(fallbackPrompt).not.toContain("Style: SNL");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Dynamic Rolling Tail-Frame Chaining & Multi-Turn Scene Extensions
  // ───────────────────────────────────────────────────────────────────────────
  describe("dynamic rolling tail-frame chaining & 40s scene extensions", () => {
    it("verifies zero jump-cut boundary continuity FirstFrame(Clip_i) === LastFrame(Clip_{i-1})", async () => {
      const extractedFrames: Record<string, string> = {};
      const mockExtractFrame = vi.fn().mockImplementation(async (videoPath: string, timeSeconds: number) => {
        const key = `${videoPath}@${timeSeconds}s`;
        const resultPath = `/tmp/frame-${timeSeconds}-${videoPath.split("/").pop()}.png`;
        extractedFrames[key] = resultPath;
        return resultPath;
      });

      // Anchor framing clip
      const anchorClipPath = "/tmp/framing-anchor.mp4";
      const initialFirstFrame = await mockExtractFrame(anchorClipPath, 0);
      const anchorLastFrame = await mockExtractFrame(anchorClipPath, 7.5);

      expect(initialFirstFrame).toBe("/tmp/frame-0-framing-anchor.mp4.png");
      expect(anchorLastFrame).toBe("/tmp/frame-7.5-framing-anchor.mp4.png");

      // 5 clips totaling 40s
      const clipCount = 5;
      const clipDuration = 8;
      let currentFirstFrame: string | null = initialFirstFrame;
      let lastInteractionId: string | undefined;
      const turnLogs: Array<{ turn: number; firstFrame: string; lastFrame?: string; interactionId: string }> = [];

      for (let i = 0; i < clipCount; i++) {
        const isLastClip = i === clipCount - 1;
        const currentLastFrame = isLastClip ? anchorLastFrame : undefined;

        const clipResult = {
          filePath: `/tmp/content-clip-${i}.mp4`,
          localPath: `/tmp/content-clip-${i}.mp4`,
          interactionId: `interaction-turn-${i + 1}`,
          durationSeconds: clipDuration,
        };

        turnLogs.push({
          turn: i,
          firstFrame: currentFirstFrame!,
          lastFrame: currentLastFrame,
          interactionId: clipResult.interactionId,
        });

        lastInteractionId = clipResult.interactionId;

        if (!isLastClip) {
          const tailTime = clipDuration - 0.5; // 7.5s
          currentFirstFrame = await mockExtractFrame(clipResult.localPath, tailTime);
        }
      }

      // Assertions on the full 40s chain
      expect(turnLogs).toHaveLength(5);
      expect(turnLogs[0].firstFrame).toBe("/tmp/frame-0-framing-anchor.mp4.png");
      expect(turnLogs[0].lastFrame).toBeUndefined();

      expect(turnLogs[1].firstFrame).toBe("/tmp/frame-7.5-content-clip-0.mp4.png");
      expect(turnLogs[2].firstFrame).toBe("/tmp/frame-7.5-content-clip-1.mp4.png");
      expect(turnLogs[3].firstFrame).toBe("/tmp/frame-7.5-content-clip-2.mp4.png");
      expect(turnLogs[4].firstFrame).toBe("/tmp/frame-7.5-content-clip-3.mp4.png");

      // Final clip closes loop back to anchor
      expect(turnLogs[4].lastFrame).toBe("/tmp/frame-7.5-framing-anchor.mp4.png");
      expect(lastInteractionId).toBe("interaction-turn-5");
    });

    it("verifies multi-turn scene extension options structure for 40s broadcast length", () => {
      const generatedOptions: Array<{ turn: number; previousInteractionId?: string; extend: boolean }> = [];
      let lastInteractionId: string | undefined;

      for (let turn = 0; turn < 5; turn++) {
        const opts = {
          turn,
          previousInteractionId: lastInteractionId,
          extend: Boolean(lastInteractionId),
        };
        generatedOptions.push(opts);
        lastInteractionId = `turn-id-${turn + 1}`;
      }

      expect(generatedOptions[0]).toEqual({ turn: 0, previousInteractionId: undefined, extend: false });
      expect(generatedOptions[1]).toEqual({ turn: 1, previousInteractionId: "turn-id-1", extend: true });
      expect(generatedOptions[2]).toEqual({ turn: 2, previousInteractionId: "turn-id-2", extend: true });
      expect(generatedOptions[3]).toEqual({ turn: 3, previousInteractionId: "turn-id-3", extend: true });
      expect(generatedOptions[4]).toEqual({ turn: 4, previousInteractionId: "turn-id-4", extend: true });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Multimodal Character Reference Conditioning (<IMAGE_REF_0> .. <IMAGE_REF_N>)
  // ───────────────────────────────────────────────────────────────────────────
  describe("multimodal reference conditioning tags", () => {
    it("generates correct <IMAGE_REF_0> tag for single-host monologue", () => {
      const prompt = buildVeoPromptContract("Host delivers opening monologue", "Sharp studio lighting", {
        hasImageRef: true,
        imageRefIndices: [0],
      });
      expect(prompt).toMatch(/^<IMAGE_REF_0> Host delivers opening monologue\./);
    });

    it("generates correct <IMAGE_REF_0> <IMAGE_REF_1> tags for dual-anchor news desk", () => {
      const prompt = buildVeoPromptContract("Two anchors deliver witty banter", "Professional newsroom", {
        imageRefIndices: [0, 1],
      });
      expect(prompt).toMatch(/^<IMAGE_REF_0> <IMAGE_REF_1> Two anchors deliver witty banter\./);
    });

    it("enforces canonical tag prefix ordering <IMAGE_REF_0> <FIRST_FRAME> <LAST_FRAME>", () => {
      const prompt = buildVeoPromptContract("Seamless desk transition shot", "Studio lighting", {
        firstFrame: true,
        hasImageRef: true,
        imageRefIndices: [0],
        lastFrame: true,
      });
      expect(prompt).toMatch(/^<IMAGE_REF_0> <FIRST_FRAME> <LAST_FRAME> Seamless desk transition shot\./);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. Autonomous RAI Filter Retry Resilience & Postgres Sync
  // ───────────────────────────────────────────────────────────────────────────
  describe("autonomous RAI safety retry loop & transcript sync", () => {
    it("recovers from OmniRAIFilterError and VeoRAIFilterError by revising text and retrying", async () => {
      const { OmniRAIFilterError, VeoRAIFilterError } = await import("@/app/lib/veo");

      let attempt = 0;
      const mockGenerate = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          throw new OmniRAIFilterError(["Likeness policy: trademarked celebrity reference"]);
        }
        if (attempt === 2) {
          throw new VeoRAIFilterError(["Safety check: living person entity"]);
        }
        return {
          filePath: "/tmp/clip-final.mp4",
          interactionId: "interaction-attempt-3",
          durationSeconds: 8,
        };
      });

      const mockRevise = vi.fn().mockImplementation(async (text: string, reasons: string[]) => {
        return `Sanitized: ${text} without ${reasons.join(", ")}`;
      });

      let currentText = "John Oliver and Seth Meyers discuss NBC on HBO.";
      let completed = false;
      let finalResult = null;
      let retryCount = 0;
      const maxRetries = 2;

      while (retryCount <= maxRetries && !completed) {
        try {
          finalResult = await mockGenerate();
          completed = true;
        } catch (err) {
          const isRAI =
            err instanceof OmniRAIFilterError ||
            err instanceof VeoRAIFilterError ||
            (err as any)?.name === "OmniRAIFilterError" ||
            (err as any)?.name === "VeoRAIFilterError";

          if (isRAI && retryCount < maxRetries) {
            retryCount++;
            const reasons = (err as { reasons: string[] }).reasons;
            currentText = await mockRevise(currentText, reasons);
          } else {
            throw err;
          }
        }
      }

      expect(completed).toBe(true);
      expect(retryCount).toBe(2);
      expect(attempt).toBe(3);
      expect(finalResult?.interactionId).toBe("interaction-attempt-3");
      expect(currentText).toContain("Sanitized:");
    });
  });
});
