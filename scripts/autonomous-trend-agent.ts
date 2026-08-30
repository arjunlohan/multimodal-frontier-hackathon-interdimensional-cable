/* eslint-disable no-console, node/no-process-env */
/**
 * Autonomous Trend Ingestion Agent (The Taskmaster Track Showcase)
 *
 * Demonstrates an event-driven autonomous agent coordinator that:
 * 1. Monitors trending topics / Hacker News feeds
 * 2. Evaluates relevance against the User Memory Bank
 * 3. Autonomously assigns the optimal show persona & template
 * 4. Triggers the durable multi-step show generation workflow
 *
 * Run: tsx scripts/autonomous-trend-agent.ts
 */

import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { buildGenAIClient } from "../app/lib/genai";
import * as schema from "../db/schema";

import type { GoogleGenAI } from "@google/genai";

dotenv.config({ path: ".env.local" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey)
    throw new Error("GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY required");
  // Must route through the shared factory: express (`AQ.*`) keys are Vertex-only
  // and a bare client returns 403 PERMISSION_DENIED against them.
  return buildGenAIClient(apiKey);
}

interface TrendingStory {
  title: string;
  url: string;
  score: number;
}

async function fetchHackerNewsTopStories(): Promise<TrendingStory[]> {
  console.log("[taskmaster] Fetching top stories from Hacker News API...");
  try {
    const topIdsRes = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
    if (!topIdsRes.ok)
      throw new Error("Failed to fetch top story IDs");
    const topIds = (await topIdsRes.json() as number[]).slice(0, 5);

    const stories: TrendingStory[] = [];
    for (const id of topIds) {
      const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      if (itemRes.ok) {
        const item = await itemRes.json() as { title: string; url?: string; score: number };
        if (item.title) {
          stories.push({
            title: item.title,
            url: item.url || `https://news.ycombinator.com/item?id=${id}`,
            score: item.score || 0,
          });
        }
      }
    }
    return stories;
  } catch (err) {
    console.warn("[taskmaster] HN fetch error, using fallback topics:", err);
    return [
      {
        title: "Gemini 3.5 and the Rise of Autonomous Multimodal Agentic Networks",
        url: "https://ai.google.dev",
        score: 450,
      },
      {
        title: "Quantum Advantage Demonstrated in High-Dimensional State Simulation",
        url: "https://quantumai.google",
        score: 380,
      },
    ];
  }
}

async function runAutonomousIngestionAgent() {
  console.log("\n=======================================================");
  console.log("  TASKMASTER: Autonomous Ingestion & Routing Agent     ");
  console.log("=======================================================\n");

  const stories = await fetchHackerNewsTopStories();
  console.log(`[taskmaster] Discovered ${stories.length} candidate stories.`);

  // Fetch available templates
  const templates = await db.select().from(schema.showTemplates);
  if (templates.length === 0) {
    console.error("[taskmaster] No show templates found. Run 'npm run seed-templates' first.");
    return;
  }

  // Fetch user memories to match interests
  const memories = await db.select().from(schema.userMemories);
  const memoryContext = memories.map(m => `${m.key}: ${m.value}`).join("; ") || "General interest in tech breakthroughs, satire, and AI";

  console.log("[taskmaster] Evaluating stories with Gemini 3 Flash router...");
  const client = getClient();

  const routingPrompt = `You are the Autonomous Program Director Agent for Interdimensional Cable.
You have discovered the following trending stories:
${JSON.stringify(stories, null, 2)}

Available Show Templates:
${JSON.stringify(templates.map(t => ({ id: t.id, name: t.name, type: t.showType })), null, 2)}

User Memory Profile:
${memoryContext}

Select the single BEST story to produce an on-demand episode for this user right now.
Assign the most suitable template (e.g. John Oliver for investigative tech deep-dives, Weekend Update for rapid headlines).

Return valid JSON in this format:
{
  "selectedStory": { "title": "...", "url": "..." },
  "selectedTemplateId": "uuid-here",
  "reasoning": "why this matches user memory and which comedy angle fits best",
  "durationSeconds": 16,
  "familiarity": "familiar"
}`;

  const response = await client.models.generateContent({
    model: "gemini-3.7-flash",
    contents: [{ role: "user", parts: [{ text: routingPrompt }] }],
    config: {
      responseMimeType: "application/json",
    },
  });

  const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    console.error("[taskmaster] Empty response from Gemini routing agent.");
    return;
  }

  const decision = JSON.parse(rawText) as {
    selectedStory: { title: string; url: string };
    selectedTemplateId: string;
    reasoning: string;
    durationSeconds: number;
    familiarity: string;
  };

  console.log("\n[taskmaster] Autonomous Routing Decision:");
  console.log("  Topic:", decision.selectedStory.title);
  console.log("  Template ID:", decision.selectedTemplateId);
  console.log("  Reasoning:", decision.reasoning);

  // Validate template ID
  const matchedTemplate = templates.find(t => t.id === decision.selectedTemplateId) || templates[0];

  // Insert show record
  console.log("\n[taskmaster] Provisioning show record in Postgres...");
  const [show] = await db.insert(schema.generatedShows).values({
    templateId: matchedTemplate.id,
    topic: decision.selectedStory.title,
    topicType: decision.selectedStory.url ? "news_link" : "freetext",
    durationSeconds: decision.durationSeconds || 16,
    familiarity: decision.familiarity || "familiar",
    status: "pending",
    userId: "default_user",
  }).returning();

  console.log(`✓ Show record created (ID: ${show.id})`);

  // Dispatch over HTTP rather than calling start() directly. The workflow id is
  // injected by the Next.js bundler plugin (next.config.ts `withWorkflow`), which
  // never runs under tsx — start() therefore throws in a bare script process.
  console.log("[taskmaster] Dispatching durable workflow execution...");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/workflows/generate-show`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ showId: show.id }),
  });
  const dispatch = await res.json();

  if (!dispatch.runId) {
    // Never leave an orphaned `pending` row behind when dispatch fails.
    await db.delete(schema.generatedShows).where(eq(schema.generatedShows.id, show.id));
    throw new Error(
      `Workflow dispatch failed (${res.status}): ${dispatch.error ?? "no runId returned"}`,
    );
  }

  await db.update(schema.generatedShows)
    .set({ workflowRunId: dispatch.runId })
    .where(eq(schema.generatedShows.id, show.id));

  console.log(`✓ Durable workflow started! Run ID: ${dispatch.runId}`);
  console.log(`✓ Inspect progress at: /create/${show.id}`);
  console.log("\n[taskmaster] Autonomous coordination cycle complete.\n");

  await pool.end();
}

runAutonomousIngestionAgent().catch((err) => {
  console.error("[taskmaster] Fatal error:", err);
  process.exit(1);
});
