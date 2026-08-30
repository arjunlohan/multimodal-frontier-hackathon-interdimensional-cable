# M2 Explorer 1 Analysis: Grounded Research & Premise Seed Engine (Pass 1)

**Author:** M2 Explorer 1 (Grounded Research & Premise Seed Explorer)  
**Date:** 2026-08-30  
**Target File:** `app/lib/dramaturgy/pass1-research.ts`  
**Dependencies:** `@google/genai` (v1.47.0), `zod` (v4.1.13), `app/lib/skills/`, `app/lib/env.ts`

---

## 1. Executive Summary & Problem Framing

In the single-pass baseline, comedy scripting was performed with a single generic prompt (`workflows/generate-show.ts:259-306`). This caused severe hallucination, generic observational tropes ("Have you ever noticed how airlines charge for bags?"), lack of comedic punch, and total detachment from real-time news developments.

**Pass 1 (Grounded Research & Premise Seed)** re-architects the top of the comedy writers' room pipeline by:
1. **Executing Real-Time Google Search Grounding** via Gemini 3.7 Flash (`googleSearch: {}`, `thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }`) to extract verifiable, obscure facts, bizarre statistics, official quotes, and real-world institutional absurdities.
2. **Applying Computational Incongruity-Resolution Theory** (Suls 1972, Ritchie 2004, DeepMind FAccT 2024) to identify stark contradictions between official stated claims and chaotic real-world execution.
3. **Generating 3 to 5 Distinct Comedic Premise Angles** spanning 5 distinct comedic archetypes:
   - `absurdist_escalation` (slippery-slope hyperbole to cosmic disaster)
   - `hypocrisy_exposure` (lofty PR vs petty corruption)
   - `paranoid_wonder` (wide-eyed conspiratorial dot-connecting)
   - `surreal_literalism` (deadpan literal execution of corporate jargon)
   - `apocalyptic_nihilism` (banal consumer habits as heralds of societal collapse)
4. **Providing Resilient Fallbacks** with zero-latency deterministic mocking when API keys are absent, quotas are exceeded (429), or offline test suites are executed.

---

## 2. Theoretical Foundations: Computational Humor & Grounding

### 2.1 Incongruity-Resolution Theory in AI Writing
Humor requires an initial cognitive model (the setup) that is abruptly destabilized by an unexpected, contrasting reality (the incongruity), which is then reconciled by a secondary, absurdist logic (the punchline). Pass 1 explicitly extracts **Incongruity Seeds**—factual data points where human behavior, government policy, or corporate greed directly contradicts common sense.

### 2.2 DeepMind FAccT 2024 Finding: Specificity Equals Humor Density
Generic jokes fail because they rely on well-worn semantic stereotypes. High-craft satire (John Oliver, Seth Meyers, Tim Dillon) derives its comedic power from **hyper-specific, verifiable trivia** (e.g., "$42 million federal budget line item for training pigeons to identify art", "a town in Alaska where the mayor is a dead cat"). Pass 1 mandates extracting exact figures, dates, and names before any joke construction begins.

### 2.3 Rule-of-Three Escalation Ladders
Every premise angle generated in Pass 1 includes an explicit 3-step escalation path:
- **Step 1 (Plausible/Grounded):** The actual real-world rule or occurrence.
- **Step 2 (Absurdist Extension):** A logical but ridiculous extension into everyday life.
- **Step 3 (Catastrophic/Cosmic Extreme):** The ultimate chaotic breakdown of society or logic.

---

## 3. Architecture & Data Contracts

### 3.1 TypeScript Type Definitions

```typescript
import type { ShowSkill } from "@/app/lib/skills/types";

export type PremiseAngleType =
  | "absurdist_escalation"
  | "hypocrisy_exposure"
  | "paranoid_wonder"
  | "surreal_literalism"
  | "apocalyptic_nihilism";

export type FactCategory =
  | "statistic"
  | "historical_trivia"
  | "institutional_quote"
  | "technical_detail"
  | "policy_absurdity";

export type AbsurdityType =
  | "stated_vs_actual"
  | "scale_mismatch"
  | "bureaucratic_nightmare"
  | "unintended_consequence"
  | "existential_banality";

export interface GroundedFact {
  id: string;
  fact: string;
  sourceUrl?: string;
  sourceTitle?: string;
  verified: boolean;
  category: FactCategory;
  absurdityScore: number; // 1.0 to 10.0
}

export interface IncongruitySeed {
  id: string;
  setupFact: string;
  contradiction: string;
  absurdityType: AbsurdityType;
  comedicPotential: string;
  relatedFactIds: string[];
}

export interface ComedicPremiseAngle {
  id: string;
  angleType: PremiseAngleType;
  title: string;
  logline: string;
  thematicHook: string;
  anchorFacts: string[];
  escalationLadder: [string, string, string]; // [Plausible, Absurd, Cosmic]
  targetArchetypeFit: {
    writersRoomDesk: number; // 0.0 to 1.0
    conversationalPodcast: number; // 0.0 to 1.0
  };
  suggestedAnalogies: string[];
  recommendedActSpineMapping?: {
    act1Thesis: string;
    act2Escalation: string;
    act3ClimaxOrCTA: string;
  };
}

export interface SearchGroundingMetadata {
  enabled: boolean;
  searchQueriesUsed: string[];
  groundingSources: Array<{ title: string; url: string }>;
  groundingChunkCount: number;
}

export interface ResearchBrief {
  topic: string;
  topicType: "custom" | "news_link" | "hacker_news" | "trend";
  summary: string;
  groundedFacts: GroundedFact[];
  incongruitySeeds: IncongruitySeed[];
  premiseAngles: ComedicPremiseAngle[];
  selectedAngleId: string;
  searchMetadata: SearchGroundingMetadata;
  familiarityLevel: "beginner" | "familiar" | "expert";
  generatedAt: string; // ISO timestamp
  isMocked: boolean;
}

export interface Pass1ResearchInput {
  topic: string;
  topicType?: "custom" | "news_link" | "hacker_news" | "trend";
  familiarity?: "beginner" | "familiar" | "expert";
  showSkill?: ShowSkill;
  skillId?: string;
  userProfile?: {
    conceptMastery?: Record<string, number>;
    trackedInterests?: string[];
    humorPreference?: string;
    recentQuestions?: string[];
  };
  options?: {
    enableSearch?: boolean; // default true
    maxAngles?: number; // default 4 (range: 3-5)
    forceMock?: boolean; // default false
    temperature?: number; // default 0.75
  };
}

export interface Pass1ResearchOutput {
  brief: ResearchBrief;
  selectedAngle: ComedicPremiseAngle;
  isMocked: boolean;
  latencyMs: number;
  rawResponse?: string;
}
```

---

## 4. Zod Validation Schemas

To ensure strict runtime validation and zero typing drift:

```typescript
import { z } from "zod";

export const PremiseAngleTypeSchema = z.enum([
  "absurdist_escalation",
  "hypocrisy_exposure",
  "paranoid_wonder",
  "surreal_literalism",
  "apocalyptic_nihilism",
]);

export const FactCategorySchema = z.enum([
  "statistic",
  "historical_trivia",
  "institutional_quote",
  "technical_detail",
  "policy_absurdity",
]);

export const AbsurdityTypeSchema = z.enum([
  "stated_vs_actual",
  "scale_mismatch",
  "bureaucratic_nightmare",
  "unintended_consequence",
  "existential_banality",
]);

export const GroundedFactSchema = z.object({
  id: z.string().min(1),
  fact: z.string().min(10),
  sourceUrl: z.string().url().optional(),
  sourceTitle: z.string().optional(),
  verified: z.boolean().default(true),
  category: FactCategorySchema,
  absurdityScore: z.number().min(1).max(10).default(5),
});

export const IncongruitySeedSchema = z.object({
  id: z.string().min(1),
  setupFact: z.string().min(10),
  contradiction: z.string().min(10),
  absurdityType: AbsurdityTypeSchema,
  comedicPotential: z.string().min(10),
  relatedFactIds: z.array(z.string()).default([]),
});

export const ComedicPremiseAngleSchema = z.object({
  id: z.string().min(1),
  angleType: PremiseAngleTypeSchema,
  title: z.string().min(5),
  logline: z.string().min(15),
  thematicHook: z.string().min(10),
  anchorFacts: z.array(z.string()).min(1),
  escalationLadder: z.tuple([
    z.string().min(5),
    z.string().min(5),
    z.string().min(5),
  ]),
  targetArchetypeFit: z.object({
    writersRoomDesk: z.number().min(0.0).max(1.0),
    conversationalPodcast: z.number().min(0.0).max(1.0),
  }),
  suggestedAnalogies: z.array(z.string()).min(1),
  recommendedActSpineMapping: z.object({
    act1Thesis: z.string(),
    act2Escalation: z.string(),
    act3ClimaxOrCTA: z.string(),
  }).optional(),
});

export const SearchGroundingMetadataSchema = z.object({
  enabled: z.boolean(),
  searchQueriesUsed: z.array(z.string()).default([]),
  groundingSources: z.array(z.object({
    title: z.string(),
    url: z.string(),
  })).default([]),
  groundingChunkCount: z.number().int().nonnegative().default(0),
});

export const ResearchBriefSchema = z.object({
  topic: z.string().min(1),
  topicType: z.enum(["custom", "news_link", "hacker_news", "trend"]).default("custom"),
  summary: z.string().min(20),
  groundedFacts: z.array(GroundedFactSchema).min(2),
  incongruitySeeds: z.array(IncongruitySeedSchema).min(2),
  premiseAngles: z.array(ComedicPremiseAngleSchema).min(3),
  selectedAngleId: z.string().min(1),
  searchMetadata: SearchGroundingMetadataSchema,
  familiarityLevel: z.enum(["beginner", "familiar", "expert"]).default("familiar"),
  generatedAt: z.string(),
  isMocked: z.boolean().default(false),
});
```

---

## 5. Gemini 3.7 Flash Grounding Integration

### 5.1 Invocation Configuration
Gemini 3.7 Flash (`gemini-3.7-flash`) is called via `@google/genai`:

```typescript
const response = await client.models.generateContent({
  model: "gemini-3.7-flash",
  contents: [{ role: "user", parts: [{ text: userPrompt }] }],
  config: {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    temperature: 0.75,
    maxOutputTokens: 8192,
    thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
    tools: enableSearch ? [{ googleSearch: {} }] : undefined,
  },
});
```

### 5.2 Grounding Metadata Extraction
When `tools: [{ googleSearch: {} }]` is enabled, the model returns grounding metadata in `response.candidates?.[0]?.groundingMetadata`. Pass 1 extracts:
1. `webSearchQueries?: string[]` → Records what queries the AI issued to verify facts.
2. `groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>` → Maps claims to real sources and URLs.
3. Injects these back into `SearchGroundingMetadata` and decorates `GroundedFact` instances with verified web URLs.

### 5.3 JSON Parsing & Fence Recovery
Because Search Grounding can occasionally interleave markdown commentary, the parsing pipeline employs a robust 3-stage extraction:
1. Attempt direct `JSON.parse(cleanedText)`.
2. Extract via regex match `/\{[\s\S]*\}/` to peel away markdown code fences (````json ... ````).
3. If JSON parsing fails completely, seamlessly invoke the deterministic fallback generator, log a warning, and return a valid `ResearchBrief` with `isMocked: true`.

---

## 6. Deterministic Mock Engine & Fallback Architecture

To support offline testing (`npm run test`), CI/CD environments without API keys, and graceful degradation during network failures:

### 6.1 Deterministic Brief Generator (`createMockResearchBrief`)
- Computes topic hash to deterministically seed comedic angles.
- Generates 4 verified-style facts with realistic sources (e.g. "Federal Register Vol. 88", "Bureau of Labor Statistics").
- Generates 3 incongruity seeds with distinct absurdity types (`stated_vs_actual`, `scale_mismatch`, `bureaucratic_nightmare`).
- Generates 4 distinct premise angles spanning `absurdist_escalation`, `hypocrisy_exposure`, `paranoid_wonder`, and `surreal_literalism`.
- Calculates accurate `targetArchetypeFit` scores and matches the best angle to the provided `ShowSkill.archetype`.

---

## 7. Interaction Contracts with Downstream Modules

| Upstream / Downstream | Interface Contract | Purpose |
|---|---|---|
| **M1 Show SKILLs (`app/lib/skills/`)** | `ShowSkill` | Informs angle scoring: desk shows favor `hypocrisy_exposure` / `absurdist_escalation`; podcasts favor `paranoid_wonder` / `apocalyptic_nihilism`. |
| **M2 Pass 2 Head-Writer (`pass2-head-writer.ts`)** | `ResearchBrief` + `selectedAngle` | Pass 2 consumes `escalationLadder`, `anchorFacts`, and `incongruitySeeds` to construct Act 1/2/3 beats or talking point trees. |
| **M4 Memory Bank (`app/lib/memory-bank.ts`)** | `UserPersonalizationProfile` | Injects user concept mastery and tone preferences to skip 101 explanations on advanced topics. |
| **Workflows (`workflows/generate-show.ts`)** | `pass1ResearchStep` | Workflow step executes Pass 1, updates `generatedShows.researchContext`, and passes `ResearchBrief` to script step. |

---

## 8. Verification & Quality Gates

1. **Vitest Unit Tests (`app/lib/dramaturgy/dramaturgy.test.ts`)**:
   - `pass1Research` returns a valid `ResearchBrief` matching `ResearchBriefSchema`.
   - Generates at least 3 distinct premise angles with all 5 required fields.
   - Accurately selects `selectedAngleId` matching the `ShowSkill` archetype.
   - Handles empty/invalid API keys gracefully without crashing (falling back to mock).
   - Validates URL text extraction for `topicType === "news_link"`.
2. **Lint & Build Verification**:
   - 0 ESLint errors (`npm run lint`).
   - Clean Next.js production build (`npm run build`).
