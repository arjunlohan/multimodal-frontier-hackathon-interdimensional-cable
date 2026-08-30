"use server";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/app/lib/env";
import { buildPersonalizedPromptContext, getMemorySummary, updateMemoryFromInteraction } from "@/app/lib/memory-bank";
import { generateSingleVoiceClip } from "@/app/lib/tts";
import * as schema from "@/db/schema";
import type { ChatMessage, ShowTangent } from "@/db/schema";

const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = drizzle(pool, { schema });

// ─────────────────────────────────────────────────────────────────────────────
// Get Messages & Memory
// ─────────────────────────────────────────────────────────────────────────────

export async function getChatMessagesAction(showId: string): Promise<ChatMessage[]> {
  try {
    return await db
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.showId, showId))
      .orderBy(asc(schema.chatMessages.createdAt));
  } catch (error) {
    console.error("Failed to fetch chat messages:", error);
    return [];
  }
}

export async function getUserMemorySummaryAction(userId: string = "default_user") {
  try {
    return await getMemorySummary(userId);
  } catch (error) {
    console.error("Failed to fetch memory summary:", error);
    return {
      conceptMastery: [],
      interests: [],
      humorPreference: "Balanced comedic insight",
      recentQuestions: [],
      totalMemories: 0,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Send Message (with Memory Bank & Voice Synthesis)
// ─────────────────────────────────────────────────────────────────────────────

interface ChatContext {
  topic: string;
  transcript: string;
  researchContext: string;
  userId?: string;
  hostName?: string;
  generateVoice?: boolean;
}

interface SendMessageResult {
  message?: ChatMessage;
  audioData?: string;
  error?: string;
}

export async function sendChatMessageAction(
  showId: string,
  userMessage: string,
  context: ChatContext,
): Promise<SendMessageResult> {
  if (!userMessage.trim()) {
    return { error: "Message cannot be empty." };
  }

  const effectiveUserId = context.userId || "default_user";

  try {
    // Save user message
    await db
      .insert(schema.chatMessages)
      .values({
        showId,
        role: "user",
        content: userMessage.trim(),
      });

    // Fetch conversation history for context
    const history = await db
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.showId, showId))
      .orderBy(asc(schema.chatMessages.createdAt));

    // Load Memory Bank personalization for this listener
    const memoryContext = await buildPersonalizedPromptContext(effectiveUserId);

    // Build messages for LLM
    const hostName = context.hostName || "Host";
    const systemPrompt = `You are ${hostName}, the host of this talk show segment about "${context.topic}".
Stay completely in character with your signature humor, wit, pacing, and comedic worldview.

${memoryContext}

You have access to the show's full transcript and research context below. Answer the user's questions directly in-character.

TRANSCRIPT:
${context.transcript}

RESEARCH CONTEXT:
${context.researchContext}

Guidelines:
- Speak directly in the first person ("I think...", "Look, here's the deal...")
- Ground your answers in the transcript and research when possible
- Keep responses conversational, witty, and punchy (2-4 sentences unless the user explicitly asks for a deep dive)
- Adapt your delivery based on the listener's known preferences from the Memory Bank`;

    const messages = history.map(msg => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    // Call Gemini via AI SDK
    const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY;
    const google = createGoogleGenerativeAI({ apiKey });
    const result = await generateText({
      model: google("gemini-3.7-flash"),
      system: systemPrompt,
      messages,
      providerOptions: {
        google: {
          thinkingConfig: { thinkingLevel: "high" },
        },
      },
    });

    // Save assistant response
    const [savedAssistantMsg] = await db
      .insert(schema.chatMessages)
      .values({
        showId,
        role: "assistant",
        content: result.text,
      })
      .returning();

    // Generate voice clip with Gemini TTS if requested
    let audioData: string | undefined;
    if (context.generateVoice) {
      try {
        audioData = await generateSingleVoiceClip(result.text, hostName);
      } catch (ttsErr) {
        console.warn("[chat] Optional TTS generation skipped:", ttsErr);
      }
    }

    // Autonomously update user memory bank in background
    void updateMemoryFromInteraction(
      effectiveUserId,
      userMessage,
      result.text,
      context.topic,
      showId,
    );

    return { message: savedAssistantMsg, audioData };
  } catch (error) {
    console.error("Chat error:", error);
    const message = error instanceof Error ? error.message : "Failed to generate response.";
    return { error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// On-Demand Tangent Generation (Spin-off Audio Deep Dives)
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateTangentResult {
  tangent?: ShowTangent;
  audioData?: string;
  error?: string;
}

export async function createShowTangentAction(
  showId: string,
  question: string,
  hostName: string = "John Oliver",
  topic: string,
  userId: string = "default_user",
): Promise<CreateTangentResult> {
  try {
    const memoryContext = await buildPersonalizedPromptContext(userId);
    const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY;
    const google = createGoogleGenerativeAI({ apiKey });

    const tangentPrompt = `You are ${hostName}. A listener just interrupted your show to ask:
"${question}"

Topic: ${topic}
${memoryContext}

Write a 30-45 second mini-tangent audio monologue (approx 60-80 words).
Requirements:
- Jump straight in with high energy and host humor
- Deliver a concise, hilarious, and enlightening answer
- End with a punchy sign-off back to the main broadcast
- Return ONLY the spoken words, no sound effects or stage directions`;

    const scriptRes = await generateText({
      model: google("gemini-3.7-flash"),
      prompt: tangentPrompt,
      providerOptions: {
        google: {
          thinkingConfig: { thinkingLevel: "high" },
        },
      },
    });

    const scriptText = scriptRes.text.trim();
    const audioData = await generateSingleVoiceClip(scriptText, hostName);

    const [savedTangent] = await db
      .insert(schema.showTangents)
      .values({
        showId,
        userId,
        question,
        hostName,
        scriptText,
        audioData,
        durationSeconds: 35,
      })
      .returning();

    // Learn from this tangent question
    void updateMemoryFromInteraction(
      userId,
      question,
      scriptText,
      topic,
      showId,
    );

    return { tangent: savedTangent, audioData };
  } catch (error) {
    console.error("Failed to create show tangent:", error);
    const message = error instanceof Error ? error.message : "Tangent creation failed";
    return { error: message };
  }
}
