import { apocalypticSatireSkill } from "./apocalyptic-satire";
import { closerLookSkill } from "./closer-look";
import { investigativeDeskSkill } from "./investigative-desk";
import { satiricalNewsSkill } from "./satirical-news";
import { ShowSkillSchema } from "./schemas";
import { speculativePodcastSkill } from "./speculative-podcast";
import type { ShowArchetype, ShowSkill } from "./types";
import { varietyMonologueSkill } from "./variety-monologue";

/**
 * In-memory index of all validated Show SKILLs.
 */
export const SHOW_SKILL_REGISTRY: Record<string, ShowSkill> = {
  [investigativeDeskSkill.id]: ShowSkillSchema.parse(investigativeDeskSkill),
  [closerLookSkill.id]: ShowSkillSchema.parse(closerLookSkill),
  [satiricalNewsSkill.id]: ShowSkillSchema.parse(satiricalNewsSkill),
  [varietyMonologueSkill.id]: ShowSkillSchema.parse(varietyMonologueSkill),
  [speculativePodcastSkill.id]: ShowSkillSchema.parse(speculativePodcastSkill),
  [apocalypticSatireSkill.id]: ShowSkillSchema.parse(apocalypticSatireSkill),
};

/**
 * Retrieves a ShowSkill by its exact ID or slug.
 * Returns undefined if no exact match is found.
 */
export function getShowSkill(idOrSlug: string): ShowSkill | undefined {
  if (!idOrSlug) {
    return undefined;
  }

  // 1. Direct key match (by id)
  if (SHOW_SKILL_REGISTRY[idOrSlug]) {
    return SHOW_SKILL_REGISTRY[idOrSlug];
  }

  // 2. Slug or alias match
  const normalized = idOrSlug.toLowerCase().trim();
  return Object.values(SHOW_SKILL_REGISTRY).find((skill) => {
    if (skill.slug.toLowerCase() === normalized) {
      return true;
    }
    if (skill.aliases?.some(alias => alias.toLowerCase() === normalized)) {
      return true;
    }
    return false;
  });
}

/**
 * Returns an array of all registered Show SKILLs.
 */
export function listShowSkills(): ShowSkill[] {
  return Object.values(SHOW_SKILL_REGISTRY);
}

/**
 * Filters and returns all Show SKILLs matching a specific archetype.
 */
export function getShowSkillsByArchetype(archetype: ShowArchetype): ShowSkill[] {
  return listShowSkills().filter(skill => skill.archetype === archetype);
}

/**
 * Retrieves the default ShowSkill, optionally filtered by archetype.
 */
export function getDefaultShowSkill(archetype?: ShowArchetype): ShowSkill {
  if (archetype) {
    const defaultByArchetype = getShowSkillsByArchetype(archetype).find(s => s.isDefault);
    if (defaultByArchetype) {
      return defaultByArchetype;
    }
    if (archetype === "conversational_podcast") {
      return speculativePodcastSkill;
    }
    return investigativeDeskSkill;
  }

  const globalDefault = listShowSkills().find(s => s.isDefault);
  return globalDefault ?? investigativeDeskSkill;
}

/**
 * Smart resolution algorithm that finds the most relevant ShowSkill for any user input or identifier:
 * 1. Exact ID match
 * 2. Slug match
 * 3. Alias match
 * 4. Name substring match (case-insensitive)
 * 5. Host name match
 * 6. Archetype match ("writers_room_desk" / "desk" / "podcast" / "conversational_podcast")
 * 7. Fallback to default skill
 */
export function resolveSkillForShow(identifier?: string): ShowSkill {
  if (!identifier) {
    return getDefaultShowSkill();
  }

  const directMatch = getShowSkill(identifier);
  if (directMatch) {
    return directMatch;
  }

  const query = identifier.toLowerCase().trim();

  // Check archetype keywords
  if (query === "writers_room_desk" || query === "desk" || query === "monologue") {
    return getDefaultShowSkill("writers_room_desk");
  }
  if (query === "conversational_podcast" || query === "podcast" || query === "conversation") {
    return getDefaultShowSkill("conversational_podcast");
  }

  // Check name substring or host match
  const skills = listShowSkills();

  const nameMatch = skills.find(s => s.name.toLowerCase().includes(query) || query.includes(s.name.toLowerCase()));
  if (nameMatch) {
    return nameMatch;
  }

  const hostMatch = skills.find(s =>
    s.hosts.some(h => h.name.toLowerCase().includes(query) || query.includes(h.name.toLowerCase())),
  );
  if (hostMatch) {
    return hostMatch;
  }

  // Global fallback
  return getDefaultShowSkill();
}

/**
 * Registers a new ShowSkill dynamically into the registry after validation.
 */
export function registerSkill(skill: ShowSkill): void {
  const validated = ShowSkillSchema.parse(skill);
  SHOW_SKILL_REGISTRY[validated.id] = validated;
}

/**
 * Validates untyped or raw data against the ShowSkillSchema.
 */
export function validateSkill(data: unknown): ShowSkill {
  return ShowSkillSchema.parse(data);
}
