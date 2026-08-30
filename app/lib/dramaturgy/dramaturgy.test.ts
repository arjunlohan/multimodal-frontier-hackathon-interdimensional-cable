import { describe, expect, it, vi } from "vitest";

import { getDefaultShowSkill, getShowSkill } from "@/app/lib/skills/registry";

import { runDramaturgyPipeline } from "./orchestrator";
import { createMockResearchBrief, runPass1Research } from "./pass1-research";
import {
  generateHeadWriterDraft,
  synthesizeDeterministicDeskDraft,
  synthesizeDeterministicPodcastDraft,
} from "./pass2-head-writer";
import {
  applyStylometricVoiceTuning,
  calculateJokeCompositeScore,
  enforceProfanityRegister,
  evaluateSingleJokeDeterministic,
  runPass3VoiceAndPrune,
  sanitizeForVeoRai,
} from "./pass3-voice-prune";
import {
  DramaturgyResultSchema,
  FinalScriptSchema,
  HeadWriterDraftSchema,
  ResearchBriefSchema,
} from "./schemas";

// Mock env module before importing anything else
vi.mock("@/app/lib/env", () => ({
  env: {
    GEMINI_API_KEY: "test-gemini-key",
    GOOGLE_GENERATIVE_AI_API_KEY: undefined,
    DATABASE_URL: "postgresql://localhost:5432/test",
  },
}));

// Mock memory-bank
vi.mock("@/app/lib/memory-bank", () => ({
  buildPersonalizedPromptContext: vi.fn().mockResolvedValue(
    "=== PERSISTENT USER MEMORY BANK ===\nPreferred Tone/Humor: Sharp, dry British satire\nKnown User Interests: ai-agents, quantum-computing",
  ),
  getMemorySummary: vi.fn().mockResolvedValue({
    conceptMastery: [{ concept: "quantum-computing", level: "Expert", confidence: 0.9 }],
    interests: ["ai-agents"],
    humorPreference: "Sharp, dry British satire",
    recentQuestions: [],
    totalMemories: 2,
  }),
}));

describe("milestone 2: Multi-Pass Dramaturgy & Scripting Engine", () => {
  const deskSkill = getShowSkill("investigative-desk") ?? getDefaultShowSkill("writers_room_desk");
  const podcastSkill = getShowSkill("speculative-podcast") ?? getDefaultShowSkill("conversational_podcast");

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Pass 1: Grounded Research & Premise Seed Engine
  // ───────────────────────────────────────────────────────────────────────────
  describe("pass 1: Grounded Research & Premise Seed", () => {
    it("generates a comprehensive deterministic research brief with verified facts and incongruity seeds", () => {
      const brief = createMockResearchBrief({
        topic: "Autonomous AI Toasters",
        showSkill: deskSkill,
      });

      expect(brief.topic).toBe("Autonomous AI Toasters");
      expect(brief.groundedFacts.length).toBeGreaterThanOrEqual(3);
      expect(brief.incongruitySeeds.length).toBeGreaterThanOrEqual(2);
      expect(brief.premiseAngles.length).toBeGreaterThanOrEqual(3);

      // Verify facts contain required fields
      const fact = brief.groundedFacts[0];
      expect(fact.id).toBeDefined();
      expect(fact.fact.length).toBeGreaterThan(20);
      expect(fact.verified).toBe(true);
      expect(fact.absurdityScore).toBeGreaterThanOrEqual(1);

      // Verify incongruity seeds
      const seed = brief.incongruitySeeds[0];
      expect(seed.setupFact).toBeDefined();
      expect(seed.contradiction).toBeDefined();
      expect(seed.absurdityType).toBeDefined();

      // Verify escalation ladder triplet
      const angle = brief.premiseAngles[0];
      expect(angle.escalationLadder).toHaveLength(3);
      expect(angle.escalationLadder[0].length).toBeGreaterThan(5);
      expect(angle.escalationLadder[1].length).toBeGreaterThan(5);
      expect(angle.escalationLadder[2].length).toBeGreaterThan(5);

      // Validate against Zod schema
      expect(() => ResearchBriefSchema.parse(brief)).not.toThrow();
    });

    it("selects appropriate premise angle matching ShowSkill archetype", () => {
      const deskBrief = createMockResearchBrief({
        topic: "Corporate AI Accounting",
        showSkill: deskSkill,
      });
      expect(deskBrief.selectedAngle.targetArchetypeFit.writersRoomDesk).toBeGreaterThanOrEqual(0.7);

      const podBrief = createMockResearchBrief({
        topic: "Quantum Simulation Theory",
        showSkill: podcastSkill,
      });
      expect(podBrief.selectedAngle.targetArchetypeFit.conversationalPodcast).toBeGreaterThanOrEqual(0.7);
    });

    it("runs Pass 1 research with forceMock option cleanly without API keys", async () => {
      const output = await runPass1Research({
        topic: "Microplastic Diet Trends",
        showSkill: deskSkill,
        options: { forceMock: true },
      });

      expect(output.isMocked).toBe(true);
      expect(output.brief).toBeDefined();
      expect(output.selectedAngle).toBeDefined();
      expect(output.latencyMs).toBeGreaterThanOrEqual(0);
      expect(output.brief.searchMetadata.enabled).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Pass 2: Head-Writer Draft & Joke Construction
  // ───────────────────────────────────────────────────────────────────────────
  describe("pass 2: Head-Writer Draft & Joke Construction", () => {
    it("synthesizes deterministic 3-act desk draft adhering to 8-second clip granularity", () => {
      const brief = createMockResearchBrief({ topic: "Smart Refrigerator DRM", showSkill: deskSkill });
      const draft = synthesizeDeterministicDeskDraft({
        researchBrief: brief,
        skill: deskSkill,
        durationSeconds: 40,
      });

      expect(draft.archetype).toBe("writers_room_desk");
      expect(draft.beats).toBeDefined();
      expect(draft.beats).toHaveLength(5); // 40s / 8s = 5 clips

      // Verify each beat has word budget and Veo visual prompt
      for (const beat of draft.beats!) {
        expect(beat.durationSeconds).toBe(8);
        expect(beat.actualWordCount).toBeGreaterThanOrEqual(14);
        expect(beat.actualWordCount).toBeLessThanOrEqual(30);
        expect(beat.setup.length).toBeGreaterThan(10);
        expect(beat.punchline.length).toBeGreaterThan(10);
        expect(beat.visualPrompt.length).toBeGreaterThan(20);
        expect(beat.visualPrompt).toMatch(/(talk show set|desk|host|shot)/i);
      }

      // Verify callback resolution
      expect(draft.callbacks.length).toBeGreaterThanOrEqual(1);
      const callback = draft.callbacks[0];
      expect(callback.plantedInBeatId).toBe("beat-1");
      expect(callback.resolvedInBeatId).toBe("beat-4");

      // Verify rule of three beat exists
      const ruleOfThree = draft.beats!.find(b => b.mechanism === "rule_of_three");
      expect(ruleOfThree).toBeDefined();

      // Validate against Zod schema
      expect(() => HeadWriterDraftSchema.parse(draft)).not.toThrow();
    });

    it("synthesizes deterministic podcast draft with dynamic turn-taking and acoustic tags", () => {
      const brief = createMockResearchBrief({ topic: "Ancient Egyptian Batteries", showSkill: podcastSkill });
      const draft = synthesizeDeterministicPodcastDraft({
        researchBrief: brief,
        skill: podcastSkill,
        durationSeconds: 120,
      });

      expect(draft.archetype).toBe("conversational_podcast");
      expect(draft.turns).toBeDefined();
      expect(draft.turns!.length).toBeGreaterThanOrEqual(5);

      // Verify turn types and acoustic cues
      const acousticTurns = draft.turns!.filter(t => t.acousticTags.length > 0);
      expect(acousticTurns.length).toBeGreaterThanOrEqual(2);

      const snapbackTurn = draft.turns!.find(t => t.turnType === "snapback");
      expect(snapbackTurn).toBeDefined();
      expect(snapbackTurn?.snapbackTriggered).toBe(true);

      const tangentTurns = draft.turns!.filter(t => t.isTangent);
      expect(tangentTurns.length).toBeGreaterThanOrEqual(1);

      // Validate against Zod schema
      expect(() => HeadWriterDraftSchema.parse(draft)).not.toThrow();
    });

    it("executes generateHeadWriterDraft with forceMock option", async () => {
      const brief = createMockResearchBrief({ topic: "Subprime Car Loans for AI", showSkill: deskSkill });
      const draft = await generateHeadWriterDraft({
        researchBrief: brief,
        skill: deskSkill,
        durationSeconds: 32,
        options: { forceMock: true },
      });

      expect(draft.archetype).toBe("writers_room_desk");
      expect(draft.beats).toHaveLength(4);
      expect(draft.metrics.totalDurationSeconds).toBe(32);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Pass 3: Voice Tuning, Table-Read Critic & Pre-Flight RAI Safety
  // ───────────────────────────────────────────────────────────────────────────
  describe("pass 3: Voice Tuning, Table-Read Critic & Pre-Flight RAI Safety", () => {
    it("sanitizes studio trademarks, living celebrity names, and biometric triggers for Veo RAI", () => {
      const dirtyPrompt = "A photorealistic identical clone of John Oliver on the HBO set of Last Week Tonight with Seth Meyers and Colin Jost.";
      const { sanitizedText, report } = sanitizeForVeoRai(dirtyPrompt);

      expect(sanitizedText).not.toContain("HBO");
      expect(sanitizedText).not.toContain("Last Week Tonight");
      expect(sanitizedText).not.toContain("John Oliver");
      expect(sanitizedText).not.toContain("Seth Meyers");
      expect(sanitizedText).not.toContain("Colin Jost");
      expect(sanitizedText).not.toContain("photorealistic identical clone of");

      expect(sanitizedText).toContain("premium cable broadcast");
      expect(sanitizedText).toContain("investigative comedy deep-dive");
      expect(sanitizedText).toContain("John");
      expect(sanitizedText).toContain("Seth");
      expect(sanitizedText).toContain("Colin");
      expect(report.isCleanForVeo).toBe(true);
      expect(report.replacementsApplied.length).toBeGreaterThanOrEqual(4);
    });

    it("enforces profanity register filters cleanly", () => {
      const vulgarText = "This fucking system is total shit and the asshole CEO knows it.";
      const clean = enforceProfanityRegister(vulgarText, "clean");

      expect(clean).not.toContain("fucking");
      expect(clean).not.toContain("shit");
      expect(clean).not.toContain("asshole");
      expect(clean).toContain("frick");
      expect(clean).toContain("crap");
    });

    it("applies stylometric voice tuning and detects catchphrases", () => {
      const text = "Look, this is completely bonkers. That is not hyperbole, that is the actual rule. Cool. Great system.";
      const result = applyStylometricVoiceTuning(text, deskSkill);

      expect(result.meanSentenceLength).toBeGreaterThan(0);
      expect(result.tunedText).toBeDefined();
    });

    it("calculates table-read joke composite scores using 0.35/0.35/0.30 formula", () => {
      const score = calculateJokeCompositeScore(8.0, 9.0, 7.0);
      // (8 * 0.35) + (9 * 0.35) + (7 * 0.30) = 2.8 + 3.15 + 2.1 = 8.05
      expect(score).toBe(8.05);
    });

    it("evaluates jokes deterministically in table-read critic", () => {
      const evalResult = evaluateSingleJokeDeterministic(
        "Look at their customer service policy:",
        "It legally transfers your home mortgage to an emotional support badger.",
        0,
      );

      expect(evalResult.compositeScore).toBeGreaterThanOrEqual(7.0);
      expect(evalResult.passed).toBe(true);
      expect(evalResult.critique).toBeDefined();
    });

    it("runs Pass 3 voice and prune end-to-end to produce a validated FinalScript", async () => {
      const brief = createMockResearchBrief({ topic: "Smart Microwaves", showSkill: deskSkill });
      const draft = synthesizeDeterministicDeskDraft({
        researchBrief: brief,
        skill: deskSkill,
        durationSeconds: 40,
      });

      const pass3Output = await runPass3VoiceAndPrune({
        draft,
        skill: deskSkill,
        options: { forceMock: true },
      });

      const { finalScript } = pass3Output;
      expect(finalScript.title).toBe(draft.showTitle);
      expect(finalScript.segments).toHaveLength(5);
      expect(finalScript.tableReadReport.totalJokes).toBe(5);
      expect(finalScript.tableReadReport.averageScore).toBeGreaterThanOrEqual(7.0);
      expect(finalScript.sanitizationReport.isCleanForVeo).toBe(true);
      expect(finalScript.transcriptPlainText).toContain(finalScript.segments[0].speaker);

      // Validate against Zod schema
      expect(() => FinalScriptSchema.parse(finalScript)).not.toThrow();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Unified Dramaturgy Orchestrator Pipeline
  // ───────────────────────────────────────────────────────────────────────────
  describe("unified Dramaturgy Orchestrator", () => {
    it("executes the complete 3-pass pipeline for Desk Show (Archetype A)", async () => {
      const events: string[] = [];

      const result = await runDramaturgyPipeline(
        {
          showId: "test-desk-show-123",
          topic: "Autonomous AI Law Firms",
          templateId: "investigative-desk",
          durationSeconds: 40,
          familiarity: "familiar",
          options: { forceMock: true },
        },
        async (event) => {
          events.push(event.step);
        },
      );

      expect(events).toContain("research");
      expect(events).toContain("script_draft");
      expect(events).toContain("voice_prune");
      expect(events).toContain("complete");

      expect(result.showId).toBe("test-desk-show-123");
      expect(result.skill.archetype).toBe("writers_room_desk");
      expect(result.researchBrief.groundedFacts.length).toBeGreaterThanOrEqual(3);
      expect(result.headWriterDraft.beats).toHaveLength(5);
      expect(result.finalScript.segments).toHaveLength(5);
      expect(result.executionMetrics.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(result.executionMetrics.jokesEvaluated).toBe(5);

      // Validate master result schema
      expect(() => DramaturgyResultSchema.parse(result)).not.toThrow();
    });

    it("executes the complete 3-pass pipeline for Podcast (Archetype B)", async () => {
      const result = await runDramaturgyPipeline({
        showId: "test-podcast-456",
        topic: "Interdimensional Signal Decoding",
        templateId: "speculative-podcast",
        durationSeconds: 120,
        familiarity: "expert",
        options: { forceMock: true },
      });

      expect(result.showId).toBe("test-podcast-456");
      expect(result.skill.archetype).toBe("conversational_podcast");
      expect(result.finalScript.segments.length).toBeGreaterThanOrEqual(5);
      expect(result.finalScript.showType).toBe("conversation");
      expect(result.finalScript.transcriptPlainText.length).toBeGreaterThan(100);

      expect(() => DramaturgyResultSchema.parse(result)).not.toThrow();
    });
  });
});
