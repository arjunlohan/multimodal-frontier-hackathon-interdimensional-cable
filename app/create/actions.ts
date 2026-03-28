"use server";

import { asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/app/lib/env";
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

  const validDurations = [16, 24, 32];
  if (!validDurations.includes(formData.durationSeconds)) {
    return { error: "Invalid duration." };
  }

  const validFamiliarities = ["beginner", "familiar", "expert"];
  if (!validFamiliarities.includes(formData.familiarity)) {
    return { error: "Invalid familiarity level." };
  }

  try {
    const [show] = await db
      .insert(schema.generatedShows)
      .values({
        templateId: formData.templateId,
        topic: formData.topic.trim(),
        topicType: formData.topicType,
        durationSeconds: formData.durationSeconds,
        familiarity: formData.familiarity,
        status: "pending",
      })
      .returning({ id: schema.generatedShows.id });

    // Start the generation workflow
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/workflows/generate-show`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ showId: show.id }),
        },
      );
      const data = await res.json();

      if (data.runId) {
        await db
          .update(schema.generatedShows)
          .set({ workflowRunId: data.runId })
          .where(eq(schema.generatedShows.id, show.id));
      }
    } catch (err) {
      console.error("Failed to start generation workflow:", err);
      // Show was created — the user can retry from the progress page
    }

    return { showId: show.id };
  } catch (error) {
    console.error("Failed to create show:", error);
    const message = error instanceof Error ? error.message : "Failed to create show.";
    return { error: message };
  }
}
