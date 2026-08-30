import { asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/app/lib/env";
import { resolveSkillForShow } from "@/app/lib/skills/registry";
import type { ShowSkill } from "@/app/lib/skills/types";
import * as schema from "@/db/schema";
import type { ChatMessage, ShowTangent, UserMemory } from "@/db/schema";
import { searchVideoChunks } from "@/db/search";

import { MissingApiKeyError, resolveVertexKey } from "./api-keys";
import { buildGenAIClient } from "./genai";

import type { GoogleGenAI } from "@google/genai";

// ─────────────────────────────────────────────────────────────────────────────
// Database & Gemini Client
// ─────────────────────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = drizzle(pool, { schema });

function getGenAIClient(): GoogleGenAI {
  const apiKey = resolveVertexKey();
  if (!apiKey) {
    throw new MissingApiKeyError();
  }
  return buildGenAIClient(apiKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type MasteryLevel = "beginner" | "familiar" | "expert";

export type MemoryType =
  | "concept_mastery" |
  "humor_preference" |
  "interest_topic" |
  "question_pattern" |
  "custom_note";

export interface ConceptMasteryItem {
  concept: string;
  level: string;
  confidence: number;
}

export interface MemorySummary {
  conceptMastery: ConceptMasteryItem[];
  interests: string[];
  humorPreference: string;
  recentQuestions: string[];
  totalMemories: number;
}

export interface UserPersonalizationProfile {
  userId: string;
  familiarity: "beginner" | "familiar" | "expert";
  preferredTone: string;
  customDirectives: string[];
  recentTopics: string[];
}

export interface SemanticMemoryItem {
  chunkId: string;
  muxAssetId: string;
  similarityScore: number;
  title: string | null;
  summary: string | null;
  startTime: number | null;
  endTime: number | null;
}

export interface CognitiveMemoryContext {
  workingMemory: string;
  episodicSummary: MemorySummary;
  proceduralCraft: string;
  semanticGrounding?: SemanticMemoryItem[];
  promptBlock: string;
}

export interface CognitiveContextOptions {
  userId?: string;
  showId?: string;
  query?: string;
  topic?: string;
  skillIdOrSlug?: string;
  includeSemantic?: boolean;
}

export interface MemorySummaryOptions {
  applyDecay?: boolean;
  now?: Date | string | number;
  halfLifeDays?: number;
}

export interface PersonalizedPromptOptions {
  showType?: "monologue" | "conversation" | "tangent";
  includeDirectives?: boolean;
  now?: Date | string | number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mathematical Concept Mastery Dynamics: Decay & Boost Models
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes boosted confidence score when a concept is reinforced or understood.
 * Formula: C_new = min(1.0, C_old + alpha * (1.0 - C_old))
 * @param currentConfidence Current confidence score in [0.0, 1.0]
 * @param alpha Learning/boost rate parameter (default 0.30)
 */
export function calculateBoostedConfidence(
  currentConfidence: number,
  alpha: number = 0.30,
): number {
  const clamped = Math.max(0.0, Math.min(1.0, currentConfidence));
  const boosted = clamped + alpha * (1.0 - clamped);
  return Math.round(Math.min(1.0, Math.max(0.0, boosted)) * 1000) / 1000;
}

/**
 * Calculates temporal decay of a concept's confidence using an Ebbinghaus half-life curve.
 * Formula: C(t) = C_0 * 2^(-delta_t / t_half)
 * @param initialConfidence Starting confidence score in [0.0, 1.0]
 * @param daysElapsed Days elapsed since last reinforcement
 * @param halfLifeDays Half-life in days (default 30 days)
 */
export function calculateDecayedConfidence(
  initialConfidence: number,
  daysElapsed: number,
  halfLifeDays: number = 30,
): number {
  if (daysElapsed <= 0) {
    return Math.max(0.0, Math.min(1.0, initialConfidence));
  }
  const decayFactor = 2 ** (-daysElapsed / halfLifeDays);
  const decayed = initialConfidence * decayFactor;
  return Math.round(Math.max(0.0, Math.min(1.0, decayed)) * 1000) / 1000;
}

/**
 * Maps confidence score to standard mastery level identifier.
 * - < 0.35: beginner
 * - 0.35 - 0.749: familiar
 * - >= 0.75: expert
 */
export function getMasteryLevelFromConfidence(confidence: number): MasteryLevel {
  if (confidence >= 0.75) {
    return "expert";
  }
  if (confidence >= 0.35) {
    return "familiar";
  }
  return "beginner";
}

/**
 * Formats mastery level into human-readable label.
 */
export function getMasteryLabel(confidence: number): string {
  const level = getMasteryLevelFromConfidence(confidence);
  switch (level) {
    case "expert":
      return "Expert level";
    case "familiar":
      return "Familiar";
    case "beginner":
      return "Beginner level";
  }
}

/**
 * Applies temporal decay to a concept memory based on updatedAt timestamp and target date.
 */
export function applyConceptDecay(
  confidence: number,
  lastUpdated: Date | string | number,
  now: Date | string | number = new Date(),
  halfLifeDays: number = 30,
): { confidence: number; level: string; slug: MasteryLevel } {
  const lastTime = new Date(lastUpdated).getTime();
  const currentTime = new Date(now).getTime();
  const diffDays = Math.max(0, (currentTime - lastTime) / (1000 * 60 * 60 * 24));

  const decayedConfidence = calculateDecayedConfidence(confidence, diffDays, halfLifeDays);
  const slug = getMasteryLevelFromConfidence(decayedConfidence);
  const level = getMasteryLabel(decayedConfidence);

  return {
    confidence: decayedConfidence,
    level,
    slug,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 1: Working Memory (Active Session Buffers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formats working memory (chat messages & immediate turns) into a structured dialogue history.
 */
export function formatWorkingMemory(messages: Array<{ role: string; content: string }>): string {
  if (!messages || messages.length === 0) {
    return "No recent working conversation turns.";
  }
  return messages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join("\n");
}

/**
 * Retrieves session working memory turns from chatMessages table.
 */
export async function getWorkingMemory(showId: string): Promise<ChatMessage[]> {
  try {
    return await db
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.showId, showId))
      .orderBy(asc(schema.chatMessages.createdAt));
  } catch (error) {
    console.error("[memory-bank] Failed to load working memory:", error);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 2: Episodic Memory (Cross-Session Knowledge, Tangents & Callback Bank)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieves all memories for a user, sorted by most recent.
 */
export async function getUserMemories(userId: string): Promise<UserMemory[]> {
  try {
    return await db
      .select()
      .from(schema.userMemories)
      .where(eq(schema.userMemories.userId, userId))
      .orderBy(desc(schema.userMemories.updatedAt));
  } catch (error) {
    console.error("[memory-bank] Failed to get user memories:", error);
    return [];
  }
}

/**
 * Summarizes the user's persistent memory bank into structured insights for UI and prompting.
 * Supports optional concept temporal decay calculations.
 */
export async function getMemorySummary(
  userId: string,
  options: MemorySummaryOptions = {},
): Promise<MemorySummary> {
  const memories = await getUserMemories(userId);

  const concepts: ConceptMasteryItem[] = [];
  const interests: string[] = [];
  let humorPreference = "Sharp, witty satire with clear punchlines";
  const recentQuestions: string[] = [];

  const shouldDecay = options.applyDecay !== false;
  const now = options.now ?? new Date();

  for (const mem of memories) {
    if (mem.memoryType === "concept_mastery") {
      let conf = mem.confidence ?? 1.0;
      let level = mem.value;

      if (shouldDecay && mem.updatedAt) {
        const decayed = applyConceptDecay(conf, mem.updatedAt, now, options.halfLifeDays);
        conf = decayed.confidence;
        if (
          !level ||
          level === "Expert level" ||
          level === "Familiar" ||
          level === "Beginner level" ||
          level === "expert" ||
          level === "familiar" ||
          level === "beginner"
        ) {
          level = decayed.level;
        }
      }

      concepts.push({
        concept: mem.key,
        level: level || getMasteryLabel(conf),
        confidence: conf,
      });
    } else if (mem.memoryType === "interest_topic") {
      if (!interests.includes(mem.key)) {
        interests.push(mem.key);
      }
    } else if (mem.memoryType === "humor_preference") {
      humorPreference = mem.value;
    } else if (mem.memoryType === "question_pattern") {
      if (!recentQuestions.includes(mem.value)) {
        recentQuestions.push(mem.value);
      }
    }
  }

  return {
    conceptMastery: concepts.slice(0, 10),
    interests: interests.slice(0, 10),
    humorPreference,
    recentQuestions: recentQuestions.slice(0, 5),
    totalMemories: memories.length,
  };
}

/**
 * Retrieves past on-demand show tangents requested by a user.
 */
export async function getUserTangents(userId: string, limit: number = 5): Promise<ShowTangent[]> {
  try {
    return await db
      .select()
      .from(schema.showTangents)
      .where(eq(schema.showTangents.userId, userId))
      .orderBy(desc(schema.showTangents.createdAt))
      .limit(limit);
  } catch (error) {
    console.error("[memory-bank] Failed to get user tangents:", error);
    return [];
  }
}

/**
 * Retrieves tangents recorded for a specific show broadcast.
 */
export async function getShowTangents(showId: string): Promise<ShowTangent[]> {
  try {
    return await db
      .select()
      .from(schema.showTangents)
      .where(eq(schema.showTangents.showId, showId))
      .orderBy(desc(schema.showTangents.createdAt));
  } catch (error) {
    console.error("[memory-bank] Failed to get show tangents:", error);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 3: Semantic Memory (Google text-embedding-004 pgvector Grounding)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieves semantic memory via vector search on video transcript chunks.
 */
export async function getSemanticMemory(
  query: string,
  limit: number = 5,
): Promise<SemanticMemoryItem[]> {
  if (!query || !query.trim()) {
    return [];
  }
  try {
    const results = await searchVideoChunks(query, limit);
    return results.map(r => ({
      chunkId: r.chunk_id,
      muxAssetId: r.mux_asset_id,
      similarityScore: r.similarity_score,
      title: r.title,
      summary: r.summary,
      startTime: r.start_time,
      endTime: r.end_time,
    }));
  } catch (error) {
    console.warn("[memory-bank] Semantic memory retrieval fallback:", error);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier 4: Procedural Memory (Show SKILLs & Archetype Craft Spines)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves procedural memory craft instructions for a given show archetype or template.
 */
export function getProceduralMemory(showIdentifier?: string): ShowSkill {
  return resolveSkillForShow(showIdentifier);
}

/**
 * Formats procedural craft rules (rhetorical spine, LPM targets, stylometrics, voice mappings).
 */
export function formatProceduralMemory(skillOrIdentifier?: string | ShowSkill): string {
  const skill = typeof skillOrIdentifier === "object" && skillOrIdentifier !== null ?
    skillOrIdentifier :
      resolveSkillForShow(skillOrIdentifier);

  const lpm = skill.rhetoricalSpine.laughPerMinuteTarget;
  const lpmStr = `${lpm.min}-${lpm.max} LPM`;
  const actNames = skill.rhetoricalSpine.acts.map(a => a.name).join(" -> ");

  const parts = [
    `=== PROCEDURAL CRAFT MEMORY (${skill.name.toUpperCase()}) ===`,
    `Archetype: ${skill.archetype === "writers_room_desk" ? "Writers'-Room Desk Show" : "Conversational Podcast"}`,
    `Target Laughs-Per-Minute: ${lpmStr}`,
    `Mean Sentence Length: ${skill.voiceMechanics.meanSentenceLengthWords} words`,
    `Profanity Register: ${skill.voiceMechanics.profanityRegister}`,
    `Outrage / Affability Ratio: ${skill.voiceMechanics.outrageAffabilityRatio.toFixed(2)}`,
    `Rhetorical Acts: ${actNames}`,
  ];

  if (skill.hosts.length > 0) {
    const hostInfo = skill.hosts.map(h => `${h.name} (${h.ttsVoice}, role: ${h.role})`).join("; ");
    parts.push(`Host Voice & Persona Bindings: ${hostInfo}`);
  }

  return parts.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified Cognitive Retrieval & Prompt Context Injection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unified 4-tier cognitive memory bank retrieval engine.
 * Synthesizes Working, Episodic, Semantic, and Procedural memory into a single structured context.
 */
export async function buildCognitiveMemoryBankContext(
  options: CognitiveContextOptions,
): Promise<CognitiveMemoryContext> {
  const userId = options.userId || "default_user";

  // Tier 1: Working Memory
  let workingMemory = "No active session history.";
  if (options.showId) {
    const messages = await getWorkingMemory(options.showId);
    if (messages.length > 0) {
      workingMemory = formatWorkingMemory(messages);
    }
  }

  // Tier 2: Episodic Memory
  const episodicSummary = await getMemorySummary(userId);

  // Tier 3: Semantic Memory (Optional)
  let semanticGrounding: SemanticMemoryItem[] | undefined;
  if (options.includeSemantic && (options.query || options.topic)) {
    const searchQuery = options.query || options.topic || "";
    semanticGrounding = await getSemanticMemory(searchQuery, 3);
  }

  // Tier 4: Procedural Memory
  const proceduralCraft = formatProceduralMemory(options.skillIdOrSlug);

  // Formatted Prompt Block
  const promptBlock = await buildPersonalizedPromptContext(userId, { now: undefined });

  return {
    workingMemory,
    episodicSummary,
    proceduralCraft,
    semanticGrounding,
    promptBlock,
  };
}

/**
 * Builds personalized prompt instructions for Gemini when scripting, doing in-character banter, or answering Q&A.
 */
export async function buildPersonalizedPromptContext(
  userId: string,
  options?: PersonalizedPromptOptions,
): Promise<string> {
  const summary = await getMemorySummary(userId, { now: options?.now });

  if (summary.totalMemories === 0) {
    return "No prior user interaction history. Maintain standard balanced conversational tone.";
  }

  const parts = [
    "=== PERSISTENT USER MEMORY BANK ===",
    `Preferred Tone/Humor: ${summary.humorPreference}`,
  ];

  if (summary.interests.length > 0) {
    parts.push(`Known User Interests: ${summary.interests.join(", ")}`);
  }

  if (summary.conceptMastery.length > 0) {
    const conceptStrs = summary.conceptMastery
      .map(c => `${c.concept} (${c.level})`)
      .join(", ");
    parts.push(`User Concept Mastery: ${conceptStrs}`);
  }

  if (summary.recentQuestions.length > 0) {
    parts.push(`Recent Questions Asked by User:\n- ${summary.recentQuestions.join("\n- ")}`);
  }

  if (options?.showType === "tangent") {
    parts.push(
      "Instruction: Provide an on-demand tangent tailored to this listener's known mastery level, maintaining host comedic posture without referencing internal memory structures.",
    );
  } else {
    parts.push(
      "Instruction: Adapt your explanation depth, humor, and analogies to resonate with these learned preferences without explicitly mentioning this memory bank.",
    );
  }

  return parts.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Autonomous Memory Extraction (The Learning Engine)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Autonomous Memory Extractor: Analyzes user interactions (questions, feedback, tangents)
 * using Gemini 3.7 Flash JSON mode and updates the user's persistent Memory Bank with reinforcement.
 */
export async function updateMemoryFromInteraction(
  userId: string,
  userMessage: string,
  assistantResponse: string,
  topic: string,
  showId?: string,
): Promise<void> {
  try {
    const client = getGenAIClient();

    const extractionPrompt = `You are the Memory Extraction Engine for an adaptive AI podcast network.
Analyze the following interaction between a listener and the show assistant to extract persistent memories about the user.

TOPIC: ${topic}
USER MESSAGE: ${userMessage}
ASSISTANT RESPONSE: ${assistantResponse}

Extract any new or updated insights in the following JSON format:
{
  "memories": [
    {
      "memoryType": "concept_mastery" | "interest_topic" | "humor_preference" | "question_pattern",
      "key": "short identifier (e.g. quantum-computing, sarcastic-humor, ai-ethics)",
      "value": "description or level (e.g. 'Expert level understanding', 'Prefers punchy analogies', 'Interested in GPU supply chains')",
      "confidence": 0.85
    }
  ]
}

Only extract meaningful, persistent facts or preferences. If nothing noteworthy is revealed, return {"memories": []}.
Output valid JSON only.`;

    const response = await client.models.generateContent({
      model: "gemini-3.7-flash",
      contents: [{ role: "user", parts: [{ text: extractionPrompt }] }],
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return;
    }

    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned) as {
      memories?: Array<{
        memoryType: "concept_mastery" | "interest_topic" | "humor_preference" | "question_pattern" | "custom_note";
        key: string;
        value: string;
        confidence?: number;
      }>;
    };

    if (parsed.memories && Array.isArray(parsed.memories)) {
      for (const mem of parsed.memories) {
        if (!mem.key || !mem.value || !mem.memoryType) {
          continue;
        }

        // Upsert or insert memory
        const existing = await db
          .select()
          .from(schema.userMemories)
          .where(eq(schema.userMemories.userId, userId));

        const match = existing.find(e => e.key === mem.key && e.memoryType === mem.memoryType);

        if (match) {
          // If reinforcing existing concept mastery, boost confidence
          let updatedConfidence = mem.confidence ?? 1.0;
          if (mem.memoryType === "concept_mastery") {
            const currentConf = match.confidence ?? 0.7;
            updatedConfidence = calculateBoostedConfidence(currentConf);
          }

          await db
            .update(schema.userMemories)
            .set({
              value: mem.value,
              confidence: updatedConfidence,
              sourceShowId: showId ?? null,
              updatedAt: new Date(),
            })
            .where(eq(schema.userMemories.id, match.id));
        } else {
          await db.insert(schema.userMemories).values({
            userId,
            memoryType: mem.memoryType,
            key: mem.key,
            value: mem.value,
            confidence: mem.confidence ?? 1.0,
            sourceShowId: showId ?? null,
          });
        }
      }
    }
  } catch (error) {
    console.error("[memory-bank] Memory extraction failed:", error);
  }
}
