import { describe, expect, it, vi } from "vitest";

import { listShowSkills } from "./skills/registry";
import { deliveryStyleForHost, inferHostAccent, voiceForHostPublic } from "./tts";

// tts.ts -> api-keys.ts -> env.ts validates at import time. vi.mock is hoisted,
// so the stub has to be inline rather than a referenced const.
vi.mock("./env", () => ({ env: { GEMINI_API_KEY: "AQ.test", DATABASE_URL: "postgresql://localhost:5432/test" } }));
vi.mock("@/app/lib/env", () => ({ env: { GEMINI_API_KEY: "AQ.test", DATABASE_URL: "postgresql://localhost:5432/test" } }));

describe("per-show voice assignment", () => {
  const skills = listShowSkills();

  it("registers all seven show archetypes", () => {
    expect(skills.length).toBe(7);
  });

  it("pins an explicit voice on every host, so nothing falls back to round-robin", () => {
    for (const skill of skills) {
      for (const host of skill.hosts) {
        expect(host.ttsVoice, `${skill.name} / ${host.name}`).toBeTruthy();
      }
    }
  });

  it("honours the pinned voice rather than inferring one", () => {
    for (const skill of skills) {
      skill.hosts.forEach((host, i) => {
        expect(voiceForHostPublic(host, i)).toBe(host.ttsVoice);
      });
    }
  });

  it("gives co-hosts on the same show different voices", () => {
    for (const skill of skills.filter(s => s.hosts.length > 1)) {
      const voices = skill.hosts.map(h => h.ttsVoice);
      expect(new Set(voices).size, `${skill.name} reuses a voice`).toBe(voices.length);
    }
  });

  it("derives a British delivery for the British-persona host", () => {
    const desk = skills.find(s => s.id.includes("investigative"))!;
    const host = desk.hosts[0];
    expect(inferHostAccent(host)).toMatch(/British/i);
    expect(deliveryStyleForHost(host)).toMatch(/British/i);
  });
});
