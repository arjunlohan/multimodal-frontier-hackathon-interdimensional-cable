import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

// pass2 -> genai -> api-keys -> env validates at import time.
vi.mock("../env", () => ({ env: { GEMINI_API_KEY: "AQ.test", DATABASE_URL: "postgresql://localhost:5432/test" } }));
vi.mock("@/app/lib/env", () => ({ env: { GEMINI_API_KEY: "AQ.test", DATABASE_URL: "postgresql://localhost:5432/test" } }));

/**
 * Guards against a class of bug that is invisible at runtime: a maxOutputTokens
 * budget too small to survive the model's own thinking. Gemini 3.7 Flash spends
 * roughly 100 to 2000 tokens reasoning even with no thinking config, and those
 * count against this budget. A budget below that returns an empty candidate with
 * finishReason MAX_TOKENS, which callers usually treat as "no result" and skip.
 *
 * Verified against the live API: 100 tokens produced 97 thought tokens and zero
 * output; 4096 produced a complete answer.
 */
const VERIFIED_MODEL_CEILING = 65536; // 131072 is rejected with a 400
const MIN_SAFE_WITH_THINKING = 4096;

const FILES = [
  "app/lib/dramaturgy/pass1-research.ts",
  "app/lib/dramaturgy/pass2-head-writer.ts",
  "app/lib/dramaturgy/pass3-voice-prune.ts",
  "app/lib/veo.ts",
  "app/lib/genai.ts",
];

describe("output token budgets", () => {
  const found: Array<{ file: string; value: number }> = [];
  for (const file of FILES) {
    const src = readFileSync(file, "utf8");
    // Matches both a literal budget and a `?? N` fallback default.
    for (const m of src.matchAll(/maxOutputTokens:[^,\n]*?(\d{2,})/g)) {
      found.push({ file, value: Number(m[1]) });
    }
  }

  it("sets a budget everywhere a model is called", () => {
    expect(found.length).toBeGreaterThanOrEqual(6);
  });

  it("never budgets below what the model spends thinking", () => {
    for (const { file, value } of found) {
      expect(value, `${file} budgets ${value}, which thinking alone can exhaust`)
        .toBeGreaterThanOrEqual(MIN_SAFE_WITH_THINKING);
    }
  });

  it("never exceeds the model ceiling, which would be rejected outright", () => {
    for (const { file, value } of found) {
      expect(value, `${file} budgets ${value}, above the ${VERIFIED_MODEL_CEILING} ceiling`)
        .toBeLessThanOrEqual(VERIFIED_MODEL_CEILING);
    }
  });

  it("gives the research and scripting passes the full ceiling", () => {
    const heavy = found.filter(f => f.file.includes("pass1-research") || f.file.includes("pass2-head-writer"));
    expect(heavy.length).toBe(3);
    heavy.forEach(h => expect(h.value).toBe(VERIFIED_MODEL_CEILING));
  });
});

describe("panel seat coverage", () => {
  it("gives every seat lines when the deterministic fallback runs", async () => {
    const { synthesizeDeterministicPodcastDraft } = await import("./pass2-head-writer");
    const { createMockResearchBrief } = await import("./pass1-research");
    const { getShowSkill } = await import("../skills/registry");

    const skill = getShowSkill("venture-panel")!;
    expect(skill.hosts.length).toBe(4);

    const draft = synthesizeDeterministicPodcastDraft({
      researchBrief: createMockResearchBrief({ topic: "Office real estate", showSkill: skill }),
      skill,
      durationSeconds: 180,
    });

    const speakers = new Set(draft.turns?.map(t => t.speaker));
    // The regression this guards: a four-handed panel that only ever voiced two
    // hosts, because the turn skeleton was written for a two-hander.
    for (const host of skill.hosts) {
      expect(speakers.has(host.name), `${host.name} never speaks`).toBe(true);
    }
  });

  it("leaves a two-host format alone", async () => {
    const { synthesizeDeterministicPodcastDraft } = await import("./pass2-head-writer");
    const { createMockResearchBrief } = await import("./pass1-research");
    const { getShowSkill } = await import("../skills/registry");

    const skill = getShowSkill("speculative-podcast")!;
    const draft = synthesizeDeterministicPodcastDraft({
      researchBrief: createMockResearchBrief({ topic: "Deep sea", showSkill: skill }),
      skill,
      durationSeconds: 120,
    });
    const speakers = new Set(draft.turns?.map(t => t.speaker));
    expect(speakers.size).toBe(2);
  });
});
