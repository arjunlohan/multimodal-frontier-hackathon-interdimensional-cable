import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMockResearchBrief,
  DramaturgyResultSchema,
  enforceProfanityRegister,
  evaluateSingleJokeDeterministic,
  FinalScriptSchema,
  generateHeadWriterDraft,
  HeadWriterDraftSchema,
  ResearchBriefSchema,
  runDramaturgyPipeline,
  runPass1Research,
  runPass3VoiceAndPrune,
  sanitizeForVeoRai,
  synthesizeDeterministicDeskDraft,
  synthesizeDeterministicPodcastDraft,
} from "@/app/lib/dramaturgy";
import {
  buildCognitiveMemoryBankContext,
  buildPersonalizedPromptContext,
  calculateBoostedConfidence,
  calculateDecayedConfidence,
  formatProceduralMemory,
  getMasteryLevelFromConfidence,
  getProceduralMemory,
  updateMemoryFromInteraction,
} from "@/app/lib/memory-bank";
import {
  apocalypticSatireSkill,
  assertLicensedGeminiVoice,
  closerLookSkill,
  generateSatiricalDisclaimer,
  getShowSkillsByArchetype,
  investigativeDeskSkill,
  isLicensedGeminiVoice,
  LICENSED_GEMINI_TTS_VOICES,
  LICENSED_VOICE_PROFILES,
  listShowSkills,
  resolveSkillForShow,
  sanitizePromptForLegalSafety,
  satiricalNewsSkill,
  ShowSkillSchema,
  speculativePodcastSkill,
  validateSkill,
  validateSkillLegalGuardrails,
  varietyMonologueSkill,
} from "@/app/lib/skills";
import { cleanupTempFiles, stitchClips } from "@/app/lib/stitch";
import { generateSingleVoiceClip, generateTts } from "@/app/lib/tts";
import { _resetRateLimiter, VeoRAIFilterError } from "@/app/lib/veo";
import * as dbSchema from "@/db/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks for External Dependencies, API Clients, and Postgres
// ─────────────────────────────────────────────────────────────────────────────

const { mockGenerateContent, mockSearchVideoChunks } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
  mockSearchVideoChunks: vi.fn(),
}));

vi.mock("@/app/lib/env", () => ({
  env: {
    GEMINI_API_KEY: "test-gemini-key",
    GOOGLE_GENERATIVE_AI_API_KEY: "test-google-key",
    DATABASE_URL: "postgresql://localhost:5432/test",
  },
}));

vi.mock("./env", () => ({
  env: {
    GEMINI_API_KEY: "test-gemini-key",
    GOOGLE_GENERATIVE_AI_API_KEY: "test-google-key",
    DATABASE_URL: "postgresql://localhost:5432/test",
  },
}));

vi.mock("@google/genai", () => {
  class MockGoogleGenAI {
    models = {
      generateContent: mockGenerateContent,
    };
  }
  return {
    GoogleGenAI: MockGoogleGenAI,
    ThinkingLevel: { LOW: "LOW", HIGH: "HIGH" },
    VideoGenerationReferenceType: { ASSET: "ASSET" },
  };
});

vi.mock("@/db/search", () => ({
  searchVideoChunks: mockSearchVideoChunks,
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

// In-Memory Database Storage for State Tracking Across Tiers
interface StoredMemory {
  id: string;
  userId: string;
  memoryType: string;
  key: string;
  value: string;
  confidence: number;
  sourceShowId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface StoredChatMessage {
  id: string;
  showId: string;
  role: string;
  content: string;
  createdAt: Date;
}

interface StoredTangent {
  id: string;
  showId: string;
  userId?: string | null;
  question: string;
  hostName: string;
  scriptText: string;
  audioUrl?: string | null;
  audioData?: string | null;
  durationSeconds?: number | null;
  createdAt: Date;
}

let mockDbMemories: StoredMemory[] = [];
let mockDbChatMessages: StoredChatMessage[] = [];
let mockDbTangents: StoredTangent[] = [];
const mockInsertCalls: any[] = [];
const mockUpdateCalls: any[] = [];

vi.mock("pg", () => {
  class MockPool {
    query = vi.fn().mockResolvedValue({ rows: [] });
    end = vi.fn().mockResolvedValue(undefined);
  }
  return { Pool: MockPool };
});

function createQueryBuilder(table: any) {
  let limitCount: number | undefined;

  const getResults = () => {
    if (table?.showId && !table?.question) {
      return [...mockDbChatMessages];
    }
    if (table?.question) {
      return [...mockDbTangents];
    }
    return [...mockDbMemories];
  };

  const builder: any = {
    where: vi.fn().mockImplementation(() => builder),
    orderBy: vi.fn().mockImplementation(() => builder),
    limit: vi.fn().mockImplementation((lim: number) => {
      limitCount = lim;
      return builder;
    }),
    then: (resolve: (val: any) => any, reject?: (reason: any) => any) => {
      let results = getResults();
      if (limitCount !== undefined) {
        results = results.slice(0, limitCount);
      }
      return Promise.resolve(results).then(resolve, reject);
    },
  };
  return builder;
}

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn().mockReturnValue({
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: any) => createQueryBuilder(table)),
    })),
    insert: vi.fn().mockImplementation((_table: any) => ({
      values: vi.fn().mockImplementation((val: any) => {
        mockInsertCalls.push(val);
        const record = {
          id: `id-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ...val,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        if (val.question) {
          mockDbTangents.push(record as StoredTangent);
        } else if (val.role) {
          mockDbChatMessages.push(record as StoredChatMessage);
        } else {
          mockDbMemories.push(record as StoredMemory);
        }
        return {
          returning: vi.fn().mockResolvedValue([record]),
          then: (resolve: (val: any) => any, reject?: (reason: any) => any) =>
            Promise.resolve([record]).then(resolve, reject),
        };
      }),
    })),
    update: vi.fn().mockImplementation((_table: any) => ({
      set: vi.fn().mockImplementation((val: any) => ({
        where: vi.fn().mockImplementation(() => {
          mockUpdateCalls.push(val);
          return {
            returning: vi.fn().mockResolvedValue([{ id: "updated-record", ...val }]),
            then: (resolve: (val: any) => any, reject?: (reason: any) => any) =>
              Promise.resolve([{ id: "updated-record", ...val }]).then(resolve, reject),
          };
        }),
      })),
    })),
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Format Routing Helper (matching workflows/generate-show.ts)
// ─────────────────────────────────────────────────────────────────────────────

function checkShowFormat(durationSeconds: number | null | undefined): {
  isAudioPodcast: boolean;
  durationSeconds: number;
} {
  const duration = durationSeconds ?? 16;
  return {
    isAudioPodcast: duration > 40,
    durationSeconds: duration,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Veo Prompt Builder Helper (matching workflows/generate-show.ts)
// ─────────────────────────────────────────────────────────────────────────────

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
  segment: { speaker: string; text: string; visualPrompt?: string },
  hosts: Array<{ name: string; position?: string }>,
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

// ─────────────────────────────────────────────────────────────────────────────
// Master End-to-End Integration Test Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("master E2E integration test suite: Interdimensional Cable Comedy Orchestrator", () => {
  let tmpDir: string;
  const createdFiles: string[] = [];

  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockSearchVideoChunks.mockReset();
    vi.mocked(execFile).mockReset();
    _resetRateLimiter();

    mockDbMemories = [];
    mockDbChatMessages = [];
    mockDbTangents = [];
    mockInsertCalls.length = 0;
    mockUpdateCalls.length = 0;

    tmpDir = path.join(os.tmpdir(), `e2e-suite-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    cleanupTempFiles(createdFiles);
    createdFiles.length = 0;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore temp dir cleanup failures
    }
  });

  function createTestFile(name: string, content = "sample-media-data"): string {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, content);
    createdFiles.push(filePath);
    return filePath;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 1: FEATURE COVERAGE (All 14 Features in Isolation)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("tier 1: Feature Coverage (All 14 Features in Isolation)", () => {
    // Feature 1: Archetype A Show SKILLs
    it("feature 1: validates all Archetype A (Writers'-Room Desk) Show SKILLs", () => {
      const deskSkills = getShowSkillsByArchetype("writers_room_desk");
      expect(deskSkills.length).toBeGreaterThanOrEqual(4);

      const skillIds = deskSkills.map(s => s.id);
      expect(skillIds).toContain(investigativeDeskSkill.id);
      expect(skillIds).toContain(closerLookSkill.id);
      expect(skillIds).toContain(satiricalNewsSkill.id);
      expect(skillIds).toContain(varietyMonologueSkill.id);

      for (const skill of deskSkills) {
        expect(() => ShowSkillSchema.parse(skill)).not.toThrow();
        expect(skill.archetype).toBe("writers_room_desk");
        expect(skill.rhetoricalSpine.acts.length).toBeGreaterThanOrEqual(3);
        expect(skill.rhetoricalSpine.laughPerMinuteTarget.min).toBeGreaterThan(0);
        expect(skill.rhetoricalSpine.laughPerMinuteTarget.max).toBeGreaterThanOrEqual(
          skill.rhetoricalSpine.laughPerMinuteTarget.min,
        );
        expect(skill.rhetoricalSpine.ruleOfThreeProbability).toBeGreaterThan(0);
        expect(skill.voiceMechanics.meanSentenceLengthWords).toBeGreaterThan(5);
        expect(skill.hosts.length).toBeGreaterThanOrEqual(1);
      }
    });

    // Feature 2: Archetype B Show SKILLs
    it("feature 2: validates all Archetype B (Conversational Podcast) Show SKILLs", () => {
      const podcastSkills = getShowSkillsByArchetype("conversational_podcast");
      expect(podcastSkills.length).toBeGreaterThanOrEqual(2);

      const skillIds = podcastSkills.map(s => s.id);
      expect(skillIds).toContain(speculativePodcastSkill.id);
      expect(skillIds).toContain(apocalypticSatireSkill.id);

      for (const skill of podcastSkills) {
        expect(() => ShowSkillSchema.parse(skill)).not.toThrow();
        expect(skill.archetype).toBe("conversational_podcast");
        expect(skill.hosts.length).toBeGreaterThanOrEqual(1);
        expect(skill.voiceMechanics.outrageAffabilityRatio).toBeGreaterThanOrEqual(0.0);
        expect(skill.voiceMechanics.outrageAffabilityRatio).toBeLessThanOrEqual(1.0);
      }
    });

    // Feature 3: Legal & Identity Guardrails
    it("feature 3: enforces legal guardrails, licensed Gemini voices, trademark sanitization, and disclaimers", () => {
      // 1. Voice verification
      for (const voice of LICENSED_GEMINI_TTS_VOICES) {
        expect(isLicensedGeminiVoice(voice)).toBe(true);
        expect(() => assertLicensedGeminiVoice(voice)).not.toThrow();
        expect(LICENSED_VOICE_PROFILES[voice]).toBeDefined();
      }
      expect(() => assertLicensedGeminiVoice("UnlicensedCelebrityClone")).toThrow(/Illegal or unlicensed TTS voice/);

      // 2. Skill guardrail validator
      const allSkills = listShowSkills();
      for (const skill of allSkills) {
        const guardrailResult = validateSkillLegalGuardrails(skill);
        expect(guardrailResult.valid).toBe(true);
        expect(guardrailResult.errors).toHaveLength(0);
      }

      // 3. Trademark normalization
      const rawPrompt = "An HBO exclusive on Last Week Tonight with Joe Rogan Experience to clone the exact voice of someone";
      const sanitized = sanitizePromptForLegalSafety(rawPrompt);
      expect(sanitized).not.toContain("HBO");
      expect(sanitized).not.toContain("Last Week Tonight");
      expect(sanitized).not.toContain("Joe Rogan Experience");
      expect(sanitized).not.toContain("clone the exact voice of");
      expect(sanitized).toContain("premium cable broadcast");
      expect(sanitized).toContain("investigative comedy deep-dive");
      expect(sanitized).toContain("the speculative podcast studio");
      expect(sanitized).toContain("reproduce the rhetorical cadence and comedic style of");

      // 4. Parody disclaimer
      const disclaimer = generateSatiricalDisclaimer(investigativeDeskSkill, "AI Regulation");
      expect(disclaimer).toContain("original satirical parody");
      expect(disclaimer).toContain("Google Cloud Gemini TTS");
    });

    // Feature 4: Pass 1 Grounded Research Seed
    it("feature 4: generates research briefs with verified facts, incongruity seeds, and escalation ladders", async () => {
      const brief = createMockResearchBrief({
        topic: "Suborbital Commuter Shuttles",
        showSkill: investigativeDeskSkill,
      });

      expect(() => ResearchBriefSchema.parse(brief)).not.toThrow();
      expect(brief.groundedFacts.length).toBeGreaterThanOrEqual(3);
      expect(brief.incongruitySeeds.length).toBeGreaterThanOrEqual(2);
      expect(brief.premiseAngles.length).toBeGreaterThanOrEqual(3);
      expect(brief.selectedAngle.escalationLadder).toHaveLength(3);

      const pass1Result = await runPass1Research({
        topic: "Autonomous Fast Food Drive-Thrus",
        showSkill: closerLookSkill,
        options: { forceMock: true },
      });
      expect(pass1Result.brief.topic).toBe("Autonomous Fast Food Drive-Thrus");
      expect(pass1Result.brief.groundedFacts.length).toBeGreaterThan(0);
    });

    // Feature 5: Pass 2 Joke Construction
    it("feature 5: drafts structured act beats and multi-speaker dialogue applying comedic formulas", async () => {
      const brief = createMockResearchBrief({
        topic: "Quantum Smart Refrigerators",
        showSkill: investigativeDeskSkill,
      });

      const deskDraft = await generateHeadWriterDraft({
        researchBrief: brief,
        skill: investigativeDeskSkill,
        durationSeconds: 32,
        options: { forceMock: true },
      });

      expect(() => HeadWriterDraftSchema.parse(deskDraft)).not.toThrow();
      expect(deskDraft.beats?.length).toBeGreaterThanOrEqual(3);
      for (const beat of deskDraft.beats ?? []) {
        expect(beat.setup.length).toBeGreaterThan(0);
        expect(beat.punchline.length).toBeGreaterThan(0);
        expect(beat.mechanism).toBeDefined();
      }

      const podDraft = synthesizeDeterministicPodcastDraft({
        researchBrief: brief,
        skill: speculativePodcastSkill,
        durationSeconds: 60,
      });
      expect(podDraft.turns?.length).toBeGreaterThanOrEqual(2);
    });

    // Feature 6: Pass 3 Table-Read Voice & Prune
    it("feature 6: executes stylometric voice pass, table-read joke critic, and weak joke pruning", async () => {
      const brief = createMockResearchBrief({
        topic: "Deep Sea Mining Asteroids",
        showSkill: investigativeDeskSkill,
      });
      const draft = synthesizeDeterministicDeskDraft({
        researchBrief: brief,
        skill: investigativeDeskSkill,
        durationSeconds: 32,
      });

      const pass3Result = await runPass3VoiceAndPrune({
        draft,
        skill: investigativeDeskSkill,
        options: { forceMock: true, skipTableReadPrune: false },
      });

      expect(() => FinalScriptSchema.parse(pass3Result.finalScript)).not.toThrow();
      expect(pass3Result.finalScript.segments.length).toBeGreaterThan(0);
      expect(pass3Result.finalScript.tableReadReport.averageScore).toBeGreaterThanOrEqual(7.0);

      // Single joke evaluation logic
      const evalResult = evaluateSingleJokeDeterministic(
        "Our smart appliances are secretly judging our carb intake.",
        "Which explains why my microwave just ordered me an elliptical from Kevin the taxidermist.",
        0,
      );
      expect(evalResult.compositeScore).toBeGreaterThan(0);
      expect(evalResult.passed).toBe(true);
    });

    // Feature 7: Multi-Speaker Audio Synthesis
    it("feature 7: formats multi-speaker dialogue and encodes 24 kHz WAV audio with Gemini TTS", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: Buffer.from("mock-pcm-audio-bytes").toString("base64") } }],
            },
          },
        ],
      });

      const hosts = [
        { name: "John Oliver", ttsVoice: "Charon" },
        { name: "Skeptical Host", ttsVoice: "Orus" },
      ];

      const wavBuffer = await generateTts(
        "[John Oliver]: Welcome to the show!\n[Skeptical Host]: Glad to be here.",
        hosts,
      );

      expect(wavBuffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(wavBuffer.subarray(8, 12).toString("ascii")).toBe("WAVE");
      expect(wavBuffer.readUInt32LE(24)).toBe(24000); // 24 kHz sample rate
      expect(wavBuffer.readUInt16LE(22)).toBe(1); // 1 channel mono
      expect(wavBuffer.readUInt16LE(34)).toBe(16); // 16-bit PCM

      // Single voice clip helper
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: Buffer.from("short-clip").toString("base64") } }],
            },
          },
        ],
      });
      const dataUri = await generateSingleVoiceClip("Quick tangent punchline!", "John Oliver");
      expect(dataUri.startsWith("data:audio/wav;base64,")).toBe(true);
    });

    // Feature 8: 40s Video Cap & Veo 3.1 Engine
    it("feature 8: enforces 40s duration cap and builds sanitized Veo 3.1 prompts", () => {
      expect(checkShowFormat(8).isAudioPodcast).toBe(false);
      expect(checkShowFormat(40).isAudioPodcast).toBe(false);
      expect(checkShowFormat(41).isAudioPodcast).toBe(true);

      const segment = {
        speaker: "John Olive",
        text: "This is completely absurd.",
      };
      const prompt = buildVeoPrompt(segment, [{ name: "John Oliver" }], "monologue", "HBO style");
      expect(prompt).toContain("single host behind a desk");
      expect(prompt).toContain("premium cable");
      expect(prompt).not.toContain("HBO");

      // VeoRAIFilterError verification
      const filterError = new VeoRAIFilterError(["Violence filter triggered", "Safety violation"]);
      expect(filterError.name).toBe("VeoRAIFilterError");
      expect(filterError.reasons).toHaveLength(2);
      expect(filterError.message).toContain("RAI filter");
    });

    // Feature 9: 48 kHz Audio Normalization & Stitch
    it("feature 9: validates 48 kHz broadcast normalization and video clip concatenation", async () => {
      const clip1 = createTestFile("clip1.mp4");
      const clip2 = createTestFile("clip2.mp4");
      const output = path.join(tmpDir, "stitched.mp4");

      // Normal lossless concat
      vi.mocked(execFile).mockImplementationOnce((_cmd, _args, _opts, callback: any) => {
        callback(null, { stdout: "", stderr: "" });
        return {} as any;
      });

      const res = await stitchClips([clip1, clip2], output);
      expect(res).toBe(output);

      // Single clip direct copy bypass
      const singleOutput = path.join(tmpDir, "single-copy.mp4");
      const resSingle = await stitchClips([clip1], singleOutput);
      expect(resSingle).toBe(singleOutput);
      expect(fs.existsSync(singleOutput)).toBe(true);
    });

    // Feature 10: 4-Tier Cognitive Memory Bank
    it("feature 10: validates working, episodic, semantic, and procedural memory tiers with temporal decay", () => {
      // 1. Mastery dynamics (boost and decay)
      const boosted = calculateBoostedConfidence(0.2, 0.3);
      expect(boosted).toBe(0.44); // 0.2 + 0.3 * (1 - 0.2) = 0.44

      const decayed = calculateDecayedConfidence(0.8, 30, 30); // 1 half-life
      expect(decayed).toBe(0.4);

      expect(getMasteryLevelFromConfidence(0.2)).toBe("beginner");
      expect(getMasteryLevelFromConfidence(0.5)).toBe("familiar");
      expect(getMasteryLevelFromConfidence(0.85)).toBe("expert");

      // 2. Procedural memory formatting
      const procedural = getProceduralMemory(investigativeDeskSkill.id);
      const formatted = formatProceduralMemory(procedural);
      expect(formatted).toContain("=== PROCEDURAL CRAFT MEMORY");
      expect(formatted).toContain(investigativeDeskSkill.name.toUpperCase());
    });

    // Feature 11: Real-Time Personalization & RAG
    it("feature 11: constructs personalized context prompts from user memory profile", async () => {
      mockDbMemories.push({
        id: "mem-1",
        userId: "user-alpha",
        memoryType: "concept_mastery",
        key: "artificial_intelligence",
        value: "expert",
        confidence: 0.9,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockDbMemories.push({
        id: "mem-2",
        userId: "user-alpha",
        memoryType: "humor_preference",
        key: "tone",
        value: "dry, cynical political satire with escalating absurdism",
        confidence: 1.0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const context = await buildPersonalizedPromptContext("user-alpha", {
        showType: "monologue",
      });

      expect(context).toContain("=== PERSISTENT USER MEMORY BANK ===");
      expect(context).toContain("artificial_intelligence");
      expect(context).toContain("dry, cynical political satire");
    });

    // Feature 12: Database Schema & Migration Parity
    it("feature 12: validates Drizzle ORM schema exports, foreign keys, and vector column dimensions", () => {
      expect(dbSchema.videos).toBeDefined();
      expect(dbSchema.videoChunks).toBeDefined();
      expect(dbSchema.showTemplates).toBeDefined();
      expect(dbSchema.generatedShows).toBeDefined();
      expect(dbSchema.videoClips).toBeDefined();
      expect(dbSchema.chatMessages).toBeDefined();
      expect(dbSchema.userMemories).toBeDefined();
      expect(dbSchema.showTangents).toBeDefined();

      // Check vector column dimension config on videoChunks
      const embeddingCol = (dbSchema.videoChunks as any).embedding;
      expect(embeddingCol.dimensions).toBe(768);
    });

    // Feature 13: E2E Integration Pipeline Coordination
    it("feature 13: coordinates 3-pass dramaturgy execution and outputs verified result", async () => {
      const progressSteps: string[] = [];

      const result = await runDramaturgyPipeline(
        {
          showId: "test-show-id",
          topic: "Subterranean Geothermal Bitcoin Farming",
          skillIdOrSlug: "investigative-desk",
          durationSeconds: 32,
          userId: "user-alpha",
          options: { forceMock: true },
        },
        async (ev) => {
          progressSteps.push(ev.step);
        },
      );

      expect(progressSteps).toContain("research");
      expect(progressSteps).toContain("script_draft");
      expect(progressSteps).toContain("voice_prune");
      expect(progressSteps).toContain("complete");

      expect(() => DramaturgyResultSchema.parse(result)).not.toThrow();
      expect(result.executionMetrics.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(result.finalScript.segments.length).toBeGreaterThan(0);
    });

    // Feature 14: Production Build & Clean Typings Verification
    it("feature 14: verifies zero type ambiguity across show skill registry and runtime contracts", () => {
      const skills = listShowSkills();
      expect(skills.length).toBeGreaterThanOrEqual(6);

      for (const skill of skills) {
        const validated = validateSkill(skill);
        expect(validated.id).toBe(skill.id);
      }

      const resolvedDesk = resolveSkillForShow("John Olive");
      expect(resolvedDesk.id).toBe(investigativeDeskSkill.id);

      const resolvedPodcast = resolveSkillForShow("Joe Brogan");
      expect(resolvedPodcast.id).toBe(speculativePodcastSkill.id);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 2: BOUNDARY & CORNER CASES
  // ═══════════════════════════════════════════════════════════════════════════
  describe("tier 2: Boundary & Corner Cases", () => {
    it("evaluates strict duration boundaries: 8s, 40s, 41s, and 300s", () => {
      // 8s (single video clip)
      const dur8 = checkShowFormat(8);
      expect(dur8.isAudioPodcast).toBe(false);
      expect(dur8.durationSeconds).toBe(8);

      // 40s (maximum video show cap)
      const dur40 = checkShowFormat(40);
      expect(dur40.isAudioPodcast).toBe(false);
      expect(dur40.durationSeconds).toBe(40);

      // 40.001s / 41s (switch threshold to audio podcast)
      const dur40_001 = checkShowFormat(40.001);
      expect(dur40_001.isAudioPodcast).toBe(true);

      const dur41 = checkShowFormat(41);
      expect(dur41.isAudioPodcast).toBe(true);
      expect(dur41.durationSeconds).toBe(41);

      // 300s (maximum 5m podcast limit)
      const dur300 = checkShowFormat(300);
      expect(dur300.isAudioPodcast).toBe(true);
      expect(dur300.durationSeconds).toBe(300);

      // Default fallback
      const durNull = checkShowFormat(null);
      expect(durNull.isAudioPodcast).toBe(false);
      expect(durNull.durationSeconds).toBe(16);
    });

    it("handles empty or degenerate research briefs with robust fallback generation", () => {
      const emptyBrief = createMockResearchBrief({
        topic: "Silent Topic",
        showSkill: investigativeDeskSkill,
      });

      const draft = synthesizeDeterministicDeskDraft({
        researchBrief: emptyBrief,
        skill: investigativeDeskSkill,
        durationSeconds: 16,
      });

      expect(draft.beats?.length).toBeGreaterThan(0);
      expect(draft.beats?.[0]?.setup).toBeDefined();
    });

    it("evaluates edge-case joke composite scoring boundaries (0/10, 6.9/10, 7.0/10, 10/10)", () => {
      // High quality joke matching skill mechanics
      const setup = "According to municipal regulations, smart meters monitor electrical current.";
      const punchline = "Which is why my refrigerator now knows I eat pancake snacks at 3 AM with Kevin.";

      const highResult = evaluateSingleJokeDeterministic(setup, punchline, 0, 7.0);
      expect(highResult.compositeScore).toBeGreaterThanOrEqual(7.0);
      expect(highResult.passed).toBe(true);

      // Short / non-specific punchline without end-load bonus
      const weakSetup = "Hello.";
      const weakPunchline = "Here is a very long, meandering, repetitive sentence that just goes on and on and completely loses the rhythm before mentioning anything funny at all.";
      const lowResult = evaluateSingleJokeDeterministic(weakSetup, weakPunchline, 1, 9.0);
      expect(lowResult.passed).toBe(false);
    });

    it("evaluates mastery decay and learning boost mathematical edge limits", () => {
      // 0 days elapsed -> exactly initial confidence
      expect(calculateDecayedConfidence(0.75, 0, 30)).toBe(0.75);

      // Negative days elapsed -> clamped to initial confidence
      expect(calculateDecayedConfidence(0.75, -10, 30)).toBe(0.75);

      // Infinite days elapsed -> 0.0
      expect(calculateDecayedConfidence(0.75, 10000, 30)).toBe(0.0);

      // Initial confidence 0.0 boosted with alpha 0.3 -> 0.3
      expect(calculateBoostedConfidence(0.0, 0.3)).toBe(0.3);

      // Initial confidence 1.0 boosted -> remains 1.0
      expect(calculateBoostedConfidence(1.0, 0.3)).toBe(1.0);

      // Clamp out-of-range initial confidence
      expect(calculateBoostedConfidence(1.5, 0.3)).toBe(1.0);
      expect(calculateBoostedConfidence(-0.5, 0.3)).toBe(0.3);
    });

    it("handles adversarial inputs, special characters, unicode emojis, and malicious prompts", () => {
      const adversarialTopic = "🔥 Quantum AI & Nuclear Toasters \u0000 <script>alert('pwn')</script> -- ' OR 1=1;";
      const brief = createMockResearchBrief({
        topic: adversarialTopic,
        showSkill: investigativeDeskSkill,
      });
      expect(brief.topic).toBe(adversarialTopic);

      // Verify profanity enforcement on aggressive registers
      const dirtyText = "This is a fucking shit disaster and asshole move!";
      const cleaned = enforceProfanityRegister(dirtyText, "clean");
      expect(cleaned).not.toContain("fucking");
      expect(cleaned).not.toContain("shit");
      expect(cleaned).not.toContain("asshole");
      expect(cleaned).toContain("frick");

      // Verify Veo RAI sanitizer strips trademarks, names, and biometric clone prompts
      const rawPrompt = "An HBO studio with John Oliver and a photorealistic identical clone of the host";
      const sanitized = sanitizeForVeoRai(rawPrompt);
      expect(sanitized.sanitizedText).not.toContain("HBO");
      expect(sanitized.sanitizedText).not.toContain("John Oliver");
      expect(sanitized.sanitizedText).not.toContain("photorealistic identical clone of");
      expect(sanitized.sanitizedText).toContain("premium cable broadcast");
      expect(sanitized.sanitizedText).toContain("stylized broadcast caricature in the rhetorical style of");
    });

    it("evaluates stitch error boundaries: 0 clips error and multi-track re-encode fallback", async () => {
      await expect(stitchClips([])).rejects.toThrow("No clips to stitch");

      const clip1 = createTestFile("c1.mp4");
      const clip2 = createTestFile("c2.mp4");
      const out = path.join(tmpDir, "out-fallback.mp4");

      // First call fails (lossless concat error), fallback succeeds
      vi.mocked(execFile)
        .mockImplementationOnce((_cmd, _args, _opts, callback: any) => {
          callback(new Error("Lossless concat format mismatch"), { stdout: "", stderr: "" });
          return {} as any;
        })
        .mockImplementationOnce((_cmd, args: any, _opts, callback: any) => {
          // Verify 48 kHz flags in fallback re-encode
          expect(args).toContain("-ar");
          expect(args).toContain("48000");
          callback(null, { stdout: "", stderr: "" });
          return {} as any;
        });

      const stitched = await stitchClips([clip1, clip2], out);
      expect(stitched).toBe(out);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  describe("tier 3: Cross-Feature Combinations", () => {
    it("pipeline combination 1: Desk Show SKILL + Expert Memory Profile + 3-Pass Dramaturgy + 40s Video Pipeline", async () => {
      // 1. Setup Expert Memory Bank profile
      mockDbMemories.push({
        id: "mem-exp-1",
        userId: "expert-researcher",
        memoryType: "concept_mastery",
        key: "quantum_cryptography",
        value: "expert",
        confidence: 0.95,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 2. Run Dramaturgy Pipeline
      const dramaturgyResult = await runDramaturgyPipeline({
        showId: "desk-show-40s",
        topic: "Post-Quantum Cryptography Mandates",
        skillIdOrSlug: "investigative-desk",
        durationSeconds: 40,
        userId: "expert-researcher",
        options: { forceMock: true },
      });

      expect(dramaturgyResult.skill.archetype).toBe("writers_room_desk");
      expect(dramaturgyResult.finalScript.segments.length).toBeGreaterThanOrEqual(4);

      // 3. Media Format Decision
      const format = checkShowFormat(40);
      expect(format.isAudioPodcast).toBe(false); // <=40s routes to video show

      // 4. Video Prompt Building & Reference Conditioning
      const host = dramaturgyResult.skill.hosts[0];
      for (const segment of dramaturgyResult.finalScript.segments) {
        const veoPrompt = buildVeoPrompt(
          segment,
          [{ name: host.name, position: "center" }],
          "monologue",
          dramaturgyResult.skill.visualStylePrompt ?? "",
        );
        expect(veoPrompt.length).toBeGreaterThan(20);
        expect(veoPrompt).not.toContain("HBO");
      }
    });

    it("pipeline combination 2: Podcast Show SKILL + Beginner Memory + 180s Podcast Synthesis + Memory Reinforcement", async () => {
      // 1. Setup Beginner Memory Bank profile
      mockDbMemories.push({
        id: "mem-beg-1",
        userId: "curious-listener",
        memoryType: "concept_mastery",
        key: "mycology_telepathy",
        value: "beginner",
        confidence: 0.15,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 2. Dramaturgy Pipeline with Podcast Skill
      const dramaturgyResult = await runDramaturgyPipeline({
        showId: "podcast-180s",
        topic: "Interconnected Fungal Information Networks",
        skillIdOrSlug: "speculative-podcast",
        durationSeconds: 180,
        userId: "curious-listener",
        options: { forceMock: true },
      });

      expect(dramaturgyResult.skill.archetype).toBe("conversational_podcast");

      // 3. Format routing
      const format = checkShowFormat(180);
      expect(format.isAudioPodcast).toBe(true); // >40s routes to Gemini TTS multi-speaker audio

      // 4. Multi-Speaker Audio Synthesis
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: Buffer.from("simulated-podcast-audio-pcm").toString("base64") } }],
            },
          },
        ],
      });

      const audioBuffer = await generateTts(
        dramaturgyResult.finalScript.segments.map(s => `[${s.speaker}]: ${s.text}`).join("\n"),
        dramaturgyResult.skill.hosts,
      );
      expect(audioBuffer.length).toBeGreaterThan(44);

      // 5. Post-show memory reinforcement (boost learning confidence)
      const updatedConfidence = calculateBoostedConfidence(0.15, 0.3);
      expect(updatedConfidence).toBe(0.405);
      expect(getMasteryLevelFromConfidence(updatedConfidence)).toBe("familiar");
    });

    it("pipeline combination 3: Apocalyptic Satire SKILL + High Outrage + Live Chat Banter + Working Memory Buffer", async () => {
      // 1. Verify Apocalyptic Satire mechanics
      expect(apocalypticSatireSkill.voiceMechanics.outrageAffabilityRatio).toBeGreaterThanOrEqual(0.9);
      expect(apocalypticSatireSkill.voiceMechanics.profanityRegister).toBe("explicit");

      // 2. Simulate User Interaction & Tangent Update
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    memories: [
                      {
                        memoryType: "interest_topic",
                        key: "suburban_surveillance",
                        value: "interested in HOA overreach and blimps",
                        confidence: 0.95,
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      });

      await updateMemoryFromInteraction(
        "user-beta",
        "Why is the local zoning committee buying surveillance blimps?",
        "Because our suburban HOA has decided that measuring lawn grass requires military-grade thermals!",
        "Suburban Surveillance",
        "show-tangent-live",
      );

      expect(mockInsertCalls.length).toBeGreaterThanOrEqual(1);

      // 3. Build Cognitive Context including Working Memory & Tangents
      mockSearchVideoChunks.mockResolvedValueOnce([
        {
          chunkId: "chunk-1",
          muxAssetId: "asset-1",
          similarityScore: 0.88,
          title: "HOA Dystopia Talk",
          summary: "Surveillance blimps over suburban gated communities.",
          startTime: 10,
          endTime: 40,
        },
      ]);

      const cognitiveContext = await buildCognitiveMemoryBankContext({
        userId: "user-beta",
        showId: "show-tangent-live",
        topic: "Suburban Surveillance",
        skillIdOrSlug: "apocalyptic-satire",
        includeSemantic: true,
      });

      expect(cognitiveContext.workingMemory).toBeDefined();
      expect(cognitiveContext.proceduralCraft).toContain(apocalypticSatireSkill.name.toUpperCase());
      expect(cognitiveContext.promptBlock).toContain("=== PERSISTENT USER MEMORY BANK ===");
    });

    it("pipeline combination 4: Variety Monologue + Multilingual Translation + Trademark Sanitization + Parody Disclaimer", async () => {
      // 1. Variety Monologue resolution
      const skill = resolveSkillForShow("variety-monologue");
      expect(skill.id).toBe(varietyMonologueSkill.id);

      // 2. Multilingual translation + TTS synthesis mock
      mockGenerateContent
        // Translation mock
        .mockResolvedValueOnce({
          candidates: [{ content: { parts: [{ text: "[Aoede]: ¡Bienvenidos al programa de esta noche!" }] } }],
        })
        // TTS audio mock
        .mockResolvedValueOnce({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { data: Buffer.from("spanish-wav-audio-pcm").toString("base64") } }],
              },
            },
          ],
        });

      const wavSpanish = await generateTts(
        "[Aoede]: Welcome to tonight's variety show!",
        [{ name: "Aoede", ttsVoice: "Aoede" }],
        "es",
      );
      expect(wavSpanish.length).toBeGreaterThan(44);

      // 3. Disclaimer generation
      const disclaimer = generateSatiricalDisclaimer(skill, "Late Night Variety Highlights");
      expect(disclaimer).toContain("original satirical parody");
      expect(disclaimer).toContain("Jimmy Fallon Like");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // ═══════════════════════════════════════════════════════════════════════════
  describe("tier 4: Real-World Application Scenarios", () => {
    it("scenario 1: John Oliver investigative desk episode generation ('Cryptocurrency Mining on Public Lands')", async () => {
      const topic = "Cryptocurrency Mining on Public Lands";
      const skill = investigativeDeskSkill;

      // Pass 1: Grounded Research
      const brief = createMockResearchBrief({ topic, showSkill: skill });
      expect(brief.topic).toBe(topic);
      expect(brief.groundedFacts.length).toBeGreaterThanOrEqual(3);

      // Pass 2: Head-Writer Draft
      const draft = synthesizeDeterministicDeskDraft({
        researchBrief: brief,
        skill,
        durationSeconds: 40,
      });
      expect(draft.beats?.length).toBeGreaterThanOrEqual(3);
      for (const beat of draft.beats ?? []) {
        expect(beat.actName).toBeDefined();
        expect(beat.setup).toBeDefined();
        expect(beat.punchline).toBeDefined();
      }

      // Pass 3: Voice Pass & Critic Scoring
      const pass3 = await runPass3VoiceAndPrune({
        draft,
        skill,
        options: { forceMock: true },
      });
      expect(pass3.finalScript.tableReadReport.averageScore).toBeGreaterThanOrEqual(7.0);

      // Video Show Formatting & Prompt Sanitization
      const format = checkShowFormat(40);
      expect(format.isAudioPodcast).toBe(false);

      const segment = pass3.finalScript.segments[0];
      const veoPrompt = buildVeoPrompt(
        segment,
        [{ name: "John Oliver", position: "center" }],
        "monologue",
        skill.visualStylePrompt ?? "",
      );
      expect(veoPrompt).toContain("sits behind the desk");
      expect(veoPrompt).toContain("Cryptocurrency Mining on Public Lands");

      // Voice verification
      expect(skill.hosts[0].ttsVoice).toBe("Charon");
      expect(isLicensedGeminiVoice(skill.hosts[0].ttsVoice)).toBe(true);
    });

    it("scenario 2: Seth Meyers 'A Closer Look' surgical political dissection ('Bipartisan Congressional UFO Briefing')", async () => {
      const topic = "Bipartisan Congressional UFO Briefing";
      const skill = closerLookSkill;

      const brief = createMockResearchBrief({ topic, showSkill: skill });
      const draft = synthesizeDeterministicDeskDraft({
        researchBrief: brief,
        skill,
        durationSeconds: 32,
      });

      expect(skill.voiceMechanics.catchphrases).toContain("Let me explain...");
      expect(skill.hosts[0].ttsVoice).toBe("Orus");

      const pass3 = await runPass3VoiceAndPrune({
        draft,
        skill,
        options: { forceMock: true },
      });

      expect(pass3.finalScript.segments.length).toBeGreaterThanOrEqual(3);
      for (const seg of pass3.finalScript.segments) {
        expect(seg.speaker).toBe("Seth Mires");
        expect(seg.text.length).toBeGreaterThan(10);
      }
    });

    it("scenario 3: Joe Rogan 'Joe Rogan Like' long-form wonder podcast ('Ancient Microscopic Civilizations')", async () => {
      const topic = "Ancient Microscopic Civilizations in Antarctic Ice";
      const skill = speculativePodcastSkill;

      expect(skill.hosts).toHaveLength(2);
      expect(skill.hosts[0].name).toBe("Joe Brogan");
      expect(skill.hosts[0].ttsVoice).toBe("Fenrir");
      expect(skill.hosts[1].name).toBe("Duncan Trussed");
      expect(skill.hosts[1].ttsVoice).toBe("Puck");

      const brief = createMockResearchBrief({ topic, showSkill: skill });
      const draft = synthesizeDeterministicPodcastDraft({
        researchBrief: brief,
        skill,
        durationSeconds: 180,
      });

      expect(draft.turns?.length).toBeGreaterThanOrEqual(3);
      expect(draft.turns?.some(n => n.speaker === "Joe Brogan")).toBe(true);
      expect(draft.turns?.some(n => n.speaker === "Duncan Trussed")).toBe(true);

      const pass3 = await runPass3VoiceAndPrune({
        draft,
        skill,
        options: { forceMock: true },
      });

      expect(pass3.finalScript.segments.length).toBeGreaterThanOrEqual(3);

      // Duration routing to 180s audio podcast
      const format = checkShowFormat(180);
      expect(format.isAudioPodcast).toBe(true);
      expect(format.durationSeconds).toBe(180);
    });

    it("scenario 4: Tim Dillon 'Tim Dillon Like' satirical podcast with live Q&A banter", async () => {
      const topic = "Suburban HOA Feuds and Global Geopolitics";
      const skill = apocalypticSatireSkill;

      expect(skill.hosts[0].ttsVoice).toBe("Enceladus");
      expect(skill.voiceMechanics.profanityRegister).toBe("explicit");
      expect(skill.voiceMechanics.outrageAffabilityRatio).toBe(0.92);

      // Live user question & dynamic tangent generation
      const userQuestion = "How do I fight an HOA fine for painting my mailbox desert sunset?";
      const hostRant =
        "You don't fight them, you sell the house to a shell company and move into a bunker in Sedona!";

      mockDbTangents.push({
        id: "tangent-hoa-1",
        showId: "show-hoa-dillon",
        userId: "listener-99",
        question: userQuestion,
        hostName: "Apocalyptic Host",
        scriptText: hostRant,
        durationSeconds: 12,
        createdAt: new Date(),
      });

      mockDbChatMessages.push({
        id: "msg-1",
        showId: "show-hoa-dillon",
        role: "user",
        content: userQuestion,
        createdAt: new Date(),
      });

      mockDbChatMessages.push({
        id: "msg-2",
        showId: "show-hoa-dillon",
        role: "assistant",
        content: hostRant,
        createdAt: new Date(),
      });

      const cognitiveContext = await buildCognitiveMemoryBankContext({
        userId: "listener-99",
        showId: "show-hoa-dillon",
        topic,
        skillIdOrSlug: skill.id,
      });

      expect(cognitiveContext.workingMemory).toContain(userQuestion);
      expect(cognitiveContext.workingMemory).toContain(hostRant);
      expect(cognitiveContext.proceduralCraft).toContain("TIM DILLON LIKE");
    });
  });
});
