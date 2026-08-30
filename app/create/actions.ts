"use server";

import { asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  encryptApiKeys,
  looksLikeGoogleKey,
  MissingApiKeyError,
  requiresUserApiKeys,
} from "@/app/lib/api-keys";
import { env } from "@/app/lib/env";
import { recordMemorySignal, topicToKey } from "@/app/lib/memory-bank";
import * as schema from "@/db/schema";
import type { ShowTemplate } from "@/db/schema";

const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = drizzle(pool, { schema });

// ─────────────────────────────────────────────────────────────────────────────
// Get Templates
// ─────────────────────────────────────────────────────────────────────────────

export async function getTemplatesAction(): Promise<ShowTemplate[]> {
  try {
    const templates = await db
      .select()
      .from(schema.showTemplates)
      .orderBy(desc(schema.showTemplates.isDefault), asc(schema.showTemplates.createdAt));

    return templates;
  } catch (error) {
    console.error("Failed to fetch templates:", error);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Show
// ─────────────────────────────────────────────────────────────────────────────

interface CreateShowInput {
  templateId: string;
  topic: string;
  topicType: string;
  durationSeconds: number;
  familiarity: string;
  useFrameChaining?: boolean;
  /** Visitor-supplied Google API keys. Required when REQUIRE_USER_API_KEYS is on. */
  vertexKey?: string;
  geminiKey?: string;
}

interface CreateShowResult {
  showId?: string;
  error?: string;
}

export async function createShowAction(formData: CreateShowInput): Promise<CreateShowResult> {
  // Validate input
  if (!formData.templateId || formData.templateId.trim().length === 0) {
    return { error: "Please select a template." };
  }

  if (!formData.topic || formData.topic.trim().length === 0) {
    return { error: "Please enter a topic." };
  }

  const validTopicTypes = ["freetext", "news_link", "hacker_news"];
  if (!validTopicTypes.includes(formData.topicType)) {
    return { error: "Invalid topic type." };
  }

  const validDurations = [8, 16, 24, 32, 40, 60, 120, 180, 240, 300];
  if (!validDurations.includes(formData.durationSeconds)) {
    return { error: "Invalid duration." };
  }

  const validFamiliarities = ["beginner", "familiar", "expert"];
  if (!validFamiliarities.includes(formData.familiarity)) {
    return { error: "Invalid familiarity level." };
  }

  // Model inference is the dominant running cost, so a public deployment makes
  // the visitor bring their own key and Google bills them directly.
  const vertexKey = formData.vertexKey?.trim();
  if (requiresUserApiKeys()) {
    if (!vertexKey) {
      return { error: new MissingApiKeyError().message };
    }
    if (!looksLikeGoogleKey(vertexKey)) {
      return { error: "That does not look like a Google API key. Vertex keys start with \"AQ.\" and Gemini API keys with \"AIza\"." };
    }
  }

  const encryptedApiKeys = vertexKey ?
      encryptApiKeys({ vertexKey, geminiKey: formData.geminiKey?.trim() || undefined }) :
    null;

  try {
    const [show] = await db
      .insert(schema.generatedShows)
      .values({
        templateId: formData.templateId,
        topic: formData.topic.trim(),
        topicType: formData.topicType,
        durationSeconds: formData.durationSeconds,
        familiarity: formData.familiarity,
        useFrameChaining: formData.useFrameChaining ?? false,
        status: "pending",
        encryptedApiKeys,
        // Without this the dramaturgy orchestrator skips the personalization
        // branch entirely, so the memory bank is recalled and displayed but
        // never reaches a generated episode.
        userId: "default_user",
      })
      .returning({ id: schema.generatedShows.id });

    // Learn from what was asked for. This is unambiguous signal handed to us
    // directly, so it needs no extraction call.
    void recordMemorySignal("default_user", {
      memoryType: "interest_topic",
      key: topicToKey(formData.topic),
      value: `Requested a show about "${formData.topic.trim()}"`,
      sourceShowId: show.id,
    });
    void recordMemorySignal("default_user", {
      memoryType: "custom_note",
      key: `format-${formData.durationSeconds > 40 ? "audio" : "video"}`,
      value: `Prefers ${formData.durationSeconds > 40 ? "long-form audio" : "short video"} episodes (${formData.durationSeconds}s), ${formData.familiarity} level`,
      sourceShowId: show.id,
    });

    // Start the generation workflow
    try {
      const workflowUrl = `${env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/workflows/generate-show`;
      console.log("[createShowAction] Starting workflow at:", workflowUrl, "showId:", show.id);

      const res = await fetch(workflowUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showId: show.id }),
      });
      const data = await res.json();
      console.log("[createShowAction] Workflow response:", res.status, JSON.stringify(data));

      if (data.runId) {
        await db
          .update(schema.generatedShows)
          .set({ workflowRunId: data.runId })
          .where(eq(schema.generatedShows.id, show.id));
        console.log("[createShowAction] Saved runId:", data.runId);
      } else if (data.error) {
        console.error("[createShowAction] Workflow returned error:", data.error);
      }
    } catch (err) {
      console.error("[createShowAction] Failed to start generation workflow:", err);
      // Show was created — the user can retry from the progress page
    }

    return { showId: show.id };
  } catch (error) {
    console.error("Failed to create show:", error);
    const message = error instanceof Error ? error.message : "Failed to create show.";
    return { error: message };
  }
}
