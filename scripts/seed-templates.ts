/* eslint-disable no-console, node/no-process-env */
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getAllSkillsAsDbTemplates } from "../app/lib/skills/db-adapter";
import * as schema from "../db/schema";

dotenv.config({ path: ".env.local" });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema });

async function seedTemplates() {
  console.log("Seeding Show SKILL templates from unified registry...\n");

  const templates = getAllSkillsAsDbTemplates();

  for (const template of templates) {
    const existing = await db.query.showTemplates.findFirst({
      where: (t, { eq: eqOp }) => eqOp(t.name, template.name),
    });

    const hostCount = (template.hosts as Array<{ name: string }>).length;

    if (existing) {
      await db
        .update(schema.showTemplates)
        .set({
          showType: template.showType,
          referenceImageUrl: template.referenceImageUrl,
          hosts: template.hosts,
          notes: template.notes,
          isDefault: template.isDefault,
          displayOrder: template.displayOrder,
          updatedAt: new Date(),
        })
        .where(eq(schema.showTemplates.id, existing.id));
      console.log(`  ✓ Updated "${template.name}" (${template.showType}, ${hostCount} host${hostCount > 1 ? "s" : ""})`);
    } else {
      await db.insert(schema.showTemplates).values(template);
      console.log(`  + Seeded "${template.name}" (${template.showType}, ${hostCount} host${hostCount > 1 ? "s" : ""})`);
    }
  }

  console.log("\nDone! Show SKILL templates synchronized.\n");
}

seedTemplates()
  .catch((err) => {
    console.error("Failed to seed templates:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
