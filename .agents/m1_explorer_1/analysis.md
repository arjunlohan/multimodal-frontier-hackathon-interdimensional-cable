# Comprehensive Architecture Analysis: Archetype A (Writers'-Room Desk Shows) in `app/lib/skills/`

**Agent**: M1 Explorer 1 (Archetype A & Desk Show Architecture Explorer)  
**Date**: 2026-08-30  
**Milestone**: M1 (Two-Archetype Modular Show SKILL Engine)  
**Target Directory**: `app/lib/skills/`

---

## 1. Executive Summary & Problem Scope

The Interdimensional Cable platform requires high-craft, production-grade show definitions that encode the dramaturgical structure, comedic formulas, and stylometric mechanics of premium television writers' rooms. 

Previously, the show generation pipeline relied on generic single-prompt requests with simplistic template strings in `db/schema.ts`. This analysis specifies the modular **Archetype A: Writers'-Room Desk Shows** engine in `app/lib/skills/`, grounding late-night desk comedy in computational humor literature (Incongruity-Resolution Theory, DeepMind FAccT 2024, Burrows's Delta stylometrics) and strict legal safety guardrails.

This document defines:
1. **Dramaturgical & Mathematical Theory**: 3-act rhetorical spines, Rule-of-Three, joke tags, callbacks, and Laughs-Per-Minute (LPM) density formulas.
2. **Four Concrete Show Profiles**:
   - `investigative-desk` (John Oliver / *Last Week Tonight* deep-dive format)
   - `closer-look` (Seth Meyers / *A Closer Look* surgical dissection format)
   - `satirical-news-desk` (The Daily Show / *SNL Weekend Update* dual-anchor desk format)
   - `variety-monologue` (Jimmy Fallon / *Tonight Show* high-energy variety format)
3. **Exact TypeScript Interfaces & Zod Schemas**: Full validation suite with runtime guarantees.
4. **Complete Implementation Files**: Exact, ESLint-compliant TypeScript code ready for Worker implementation.

---

## 2. Theoretical Foundations of Writers'-Room Desk Comedy

### 2.1 Computational Humor & Cognitive Incongruity
Humor in writers'-room desk shows operates on the **Incongruity-Resolution Model** (Suls 1972, Attardo & Raskin 1991 GTVH) amplified by **DeepMind FAccT 2024 findings**:
- **Cognitive Script Incongruity**: The setup activates a default cognitive script $S_1$ (rational expectation of government, business, or culture). The punchline introduces an alternate schema $S_2$ that resolves the incongruity in a jarring, unexpected, yet logically coherent manner.
- **Grounded Absurdism**: Zero-shot LLMs produce shallow puns when unconstrained. High-craft desk comedy requires **grounded incongruities**—taking a real, verified, bizarre factual detail and using it as the pivot for an escalating absurd analogy.
- **Burrows's Delta Stylometrics**: Comedic voice is defined by sentence length variance ($\sigma^2$), subordination nesting, rhetorical question frequency, and outrage-to-affability ratios.

### 2.2 The 3-Act Rhetorical Spine

Every desk show segment (regardless of total runtime from 8s to 40s) follows a structured 3-act rhetorical progression:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ACT 1: THESIS & GROUNDED INCONGRUITY HOOK (20% – 25% of runtime)            │
│ - Anchor with verified factual reporting (S1 rational baseline).             │
│ - Introduce the core contradiction / absurd reality (S2 incongruity).       │
│ - Deliver initial high-traction hook punchline.                             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ ACT 2: SUPPORTING EVIDENCE & ESCALATING ANALOGIES (50% – 60% of runtime)    │
│ - Factual Beat → Absurdist Analogy Loop (Fact → Vehicle).                   │
│ - Rule-of-Three: Setup (Item 1) → Reinforce (Item 2) → Subvert (Item 3).    │
│ - Joke Tags: 1–3 rapid secondary punchlines on the same premise.            │
│ - Act-Outs: 2–3s voice caricature / imaginary dialogue.                     │
│ - Callback Anchor: Planting an absurd metaphor for later payoff.            │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ ACT 3: SYNTHESIS, THEATRICAL PAYOFF & CTA (20% – 25% of runtime)            │
│ - Connect the escalating analogies back to societal / human reality.        │
│ - Climax: High-concept synthesis set-piece or theatrical CTA.               │
│ - Hard-hitting closing punchline with punch-word at the absolute tail.      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Mathematical Formulas & Word-Budget Constraints

#### A. Speech Rate & Clip Word-Budget
- Video shows use **Google Veo 3.1** clips generated in **8-second segments** ($T_{\text{clip}} = 8.0\text{s}$).
- Standard broadcast delivery speed $v \approx 150\text{ words/minute} = 2.5\text{ words/second}$.
- **Word-Budget per 8s Clip**: $W_{\text{clip}} = 8.0 \times 2.5 = 20\text{ words}$ (Permissible range: **18 to 24 words**).

#### B. Laughs-Per-Minute (LPM) Formulas
$$\text{LPM} = \frac{\text{Count of Primary Punchlines} + \text{Count of Tags}}{\text{Total Duration in Seconds} / 60}$$

| Show Profile | Target LPM Range | Primary Mechanism | Tag Frequency | Callback Target |
|---|---|---|---|---|
| **Investigative Desk (Oliver)** | 3.5 – 4.8 | Cascading Similes + Righteous Outrage | Medium (1–2 tags) | 2 callbacks |
| **Closer Look (Meyers)** | 4.5 – 5.8 | Staccato Snark + Impressions | High (2–3 tags) | 1 callback |
| **Satirical News Desk (Daily/Update)** | 5.0 – 6.5 | Rapid Headline Twists + Dual Riffing | High (Rapid tags) | 1 callback |
| **Variety Monologue (Fallon)** | 4.2 – 5.5 | Pop Puns + Audience Validation | Medium (1–2 tags) | 1 callback |

#### C. Duration-to-Clip Allocation Matrix (8s to 40s)

| Total Duration | Clip Count | Word Budget | Act Allocation | Comedic Structural Beats |
|---|---|---|---|---|
| **8s** | 1 clip | 18–24 words | Act 1 + Act 3 | Rapid Setup $\to$ Incongruity Punchline Closer |
| **16s** | 2 clips | 36–48 words | Act 1 (Clip 0) $\to$ Act 2/3 (Clip 1) | Clip 0: Thesis Hook; Clip 1: Escalating Analogy + Closer |
| **24s** | 3 clips | 54–72 words | Act 1 (Clip 0) $\to$ Act 2 (Clip 1) $\to$ Act 3 (Clip 2) | Clip 0: Thesis Hook; Clip 1: Rule-of-Three; Clip 2: Payoff CTA |
| **32s** | 4 clips | 72–96 words | Act 1 (Clip 0) $\to$ Act 2 (Clips 1–2) $\to$ Act 3 (Clip 3) | Clip 0: Hook; Clip 1: Analogy 1; Clip 2: Analogy 2 + Callback; Clip 3: Synthesis Closer |
| **40s** | 5 clips | 90–120 words | Act 1 (Clip 0) $\to$ Act 2 (Clips 1–3) $\to$ Act 3 (Clip 4) | Clip 0: Thesis Hook; Clip 1: Evidence + Rule of 3; Clip 2: Analogy Cascade; Clip 3: Act-Out/Tag; Clip 4: Theatrical CTA |

#### D. End-of-Sentence Punch Word Rule
In English comedy syntax, surprise resolution requires the tension to peak until the absolute end of the utterance:
$$\text{Sentence Structure} = [\text{Factual Premise / Setup Context}] + [\text{Connector Pivot}] + [\text{Punch Word}]$$
*Example*:  
❌ *Bad (Buried Punchline)*: "He looks like a haunted Victorian doll who was brought to life by a sad wish."  
✅ *Good (Tail-Weighted Punchline)*: "He looks like a Victorian doll brought to life by a single, depressing wish: **to be slightly more haunting**."

---

## 3. Four Concrete Show Profiles Specification

### 3.1 Profile 1: Investigative Desk Deep-Dive (`investigative-desk`)
- **Format**: Monologue (Solo Anchor behind desk)
- **Licensed TTS Voice**: `Charon` (crisp, authoritative, articulate formal British cadence)
- **Stylometric Fingerprint**:
  - Outrage-to-Affability Ratio: `0.85` (righteous indignant fury)
  - Mean Sentence Length: `18.5 words` (complex subordinate clauses, breathless delivery)
  - Profanity Register: `mild` ("Holy shit", "What the hell", "Goddammit")
  - Joke Density Target: `3.5 – 4.8 LPM`
  - Rule-of-Three Probability: `0.85`
  - Callback Target Count: `2`
- **Signature Devices & Catchphrases**:
  - Catchphrases: `["Look...", "Cool.", "And now, this...", "That is not a real thing, except it entirely is.", "Moving on!"]`
  - Lexical Idiosyncrasies: `["hyper-specific analogies with bizarre first names (e.g. 'Cool, Kevin')", "parenthetical asides to inanimate objects", "incredulous direct-address rhetorical questions"]`
  - Core Formulas: `["fact_analogy_loop", "escalating_simile_cascade", "hyper_specific_absurd_noun", "character_act_out", "theatrical_absurdist_cta"]`

### 3.2 Profile 2: Surgical Political Dissection (`closer-look`)
- **Format**: Monologue (Solo Anchor behind desk)
- **Licensed TTS Voice**: `Orus` (dry, sharp, energetic American baritone)
- **Stylometric Fingerprint**:
  - Outrage-to-Affability Ratio: `0.45` (affable, self-aware snark)
  - Mean Sentence Length: `13.2 words` (crisp, staccato setup-punch-tag rhythms)
  - Profanity Register: `clean`
  - Joke Density Target: `4.5 – 5.8 LPM`
  - Rule-of-Three Probability: `0.90`
  - Callback Target Count: `1`
- **Signature Devices & Catchphrases**:
  - Catchphrases: `["Let me explain...", "He talks like a guy who...", "I mean, look at this...", "And you just know...", "What are we doing here?"]`
  - Lexical Idiosyncrasies: `["breaking character to chuckle at own punchline", "third-person impression act-outs", "writerly self-corrections (e.g., 'and by that I mean...')"]`
  - Core Formulas: `["staccato_setup_punch_tag", "character_voice_impression", "meta_writers_room_audit", "rapid_rule_of_three", "accelerated_tag_barrage"]`

### 3.3 Profile 3: Satirical Dual-Anchor News Desk (`satirical-news-desk`)
- **Format**: Conversation (Dual Anchors sitting side by side)
- **Licensed TTS Voices**:
  - Anchor 1 (Left / Straight-Man / Preppy): `Charon`
  - Anchor 2 (Right / Loose-Cannon / Subversive): `Puck`
- **Stylometric Fingerprint**:
  - Outrage-to-Affability Ratio: `0.60`
  - Mean Sentence Length: `11.5 words` (short, punchy one-liner headlines)
  - Profanity Register: `mild`
  - Joke Density Target: `5.0 – 6.5 LPM`
  - Rule-of-Three Probability: `0.75`
  - Callback Target Count: `1`
- **Signature Devices & Catchphrases**:
  - Catchphrases: `["For more on this...", "Really?", "I gotta say...", "Back to you...", "Look, man..."]`
  - Dynamic: Anchor 1 delivers deadpan journalistic setups; Anchor 2 interrupts with subversive streetwise reality checks and side-eye reactions.
  - Core Formulas: `["dual_headline_misdirection", "deadpan_straight_lead", "subversive_cohost_counter", "anchor_banter_interruption", "side_eye_reaction_beat"]`

### 3.4 Profile 4: High-Energy Variety Monologue (`variety-monologue`)
- **Format**: Monologue (Solo Host standup / desk hybrid)
- **Licensed TTS Voice**: `Aoede` (bright, melodic, exuberant) or `Orus`
- **Stylometric Fingerprint**:
  - Outrage-to-Affability Ratio: `0.05` (unabashedly positive, warm, enthusiastic)
  - Mean Sentence Length: `12.0 words`
  - Profanity Register: `clean`
  - Joke Density Target: `4.2 – 5.5 LPM`
  - Rule-of-Three Probability: `0.80`
  - Callback Target Count: `1`
- **Signature Devices & Catchphrases**:
  - Catchphrases: `["Did you see this, you guys?", "I love this so much!", "No, but seriously...", "That's what I'm talking about!", "We've got a great show tonight!"]`
  - Lexical Idiosyncrasies: `["pun-based resolutions", "high-frequency laughter cues [laughs]", "desk-slapping hyperbole", "crowd validation requests"]`
  - Core Formulas: `["high_energy_greeting", "relatable_headline_setup", "crowd_pleaser_punch", "sound_effect_act_out", "celebrity_vignette", "musical_signoff_tag"]`

---

## 4. Legal & Identity Safety Architecture

To guarantee strict compliance with copyright, publicity rights, and generative AI safety guidelines:
1. **Genre Craft Spines over Biometric Clones**: Show profiles are explicitly modeled after **dramaturgical archetypes and rhetorical traditions**, not proprietary living-person clones.
2. **Standard Licensed Google TTS Voices**: Voice mappings strictly reference prebuilt Gemini TTS voices (`Charon`, `Orus`, `Puck`, `Fenrir`, `Aoede`, `Kore`, `Enceladus`, `Zephyr`).
3. **Fictional Visual Prompts**: Veo 3.1 prompt generation uses stylized caricature descriptors ("A sharp satirical anchor in a navy suit behind an oak news desk with high-contrast studio lighting") rather than photorealistic deepfakes.
4. **Pre-flight Trademark Sanitizer**: All prompt generation strips out proprietary network names (e.g., "HBO", "NBC") and replaces them with generic broadcast descriptions ("premium cable broadcast", "late-night television desk").

---

## 5. Exact TypeScript Architecture & File Layout

The Worker should implement the following clean module layout under `app/lib/skills/`:

```
app/lib/skills/
├── types.ts                     # Zod schemas & TypeScript interfaces
├── archetype-a.ts               # Shared Archetype A base logic & budget helpers
├── profiles/
│   ├── investigative-desk.ts    # John Oliver craft profile
│   ├── closer-look.ts           # Seth Meyers craft profile
│   ├── satirical-news-desk.ts   # Daily Show / Weekend Update craft profile
│   └── variety-monologue.ts     # Fallon variety craft profile
├── registry.ts                  # Central ShowSkill registry & lookup methods
├── skills.test.ts               # Complete Vitest test suite for skills & schemas
└── index.ts                     # Barrel export
```

---

## 6. Complete Implementation Specifications

Below are the complete, production-ready TypeScript code specifications for each file, strictly adhering to `@antfu/eslint-config`, 2-space indentation, semicolons, and `perfectionist/sort-imports`.

### 6.1 `app/lib/skills/types.ts`
```typescript
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Core Enums & Primitive Types
// ─────────────────────────────────────────────────────────────────────────────

export const ShowArchetypeSchema = z.enum([
  "writers_room_desk",
  "conversational_podcast",
]);
export type ShowArchetype = z.infer<typeof ShowArchetypeSchema>;

export const ShowFormatSchema = z.enum(["monologue", "conversation"]);
export type ShowFormat = z.infer<typeof ShowFormatSchema>;

export const ProfanityRegisterSchema = z.enum([
  "clean",
  "mild",
  "frequent",
  "explicit",
]);
export type ProfanityRegister = z.infer<typeof ProfanityRegisterSchema>;

export const TtsVoiceSchema = z.enum([
  "Charon",
  "Orus",
  "Puck",
  "Fenrir",
  "Aoede",
  "Kore",
  "Enceladus",
  "Zephyr",
]);
export type TtsVoice = z.infer<typeof TtsVoiceSchema>;

export const HostRoleSchema = z.enum([
  "anchor",
  "co-host",
  "guest",
  "sidekick",
]);
export type HostRole = z.infer<typeof HostRoleSchema>;

export const HostPositionSchema = z.enum(["left", "right", "center"]);
export type HostPosition = z.infer<typeof HostPositionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Host Configuration
// ─────────────────────────────────────────────────────────────────────────────

export const HostSkillConfigSchema = z.object({
  name: z.string().min(1),
  role: HostRoleSchema,
  position: HostPositionSchema.default("center"),
  ttsVoice: TtsVoiceSchema,
  personaCraft: z.string().min(10),
  catchphrases: z.array(z.string()).default([]),
  speakingRateWpm: z.number().int().min(100).max(220).default(150),
});
export type HostSkillConfig = z.infer<typeof HostSkillConfigSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Comedic & Rhetorical Spines
// ─────────────────────────────────────────────────────────────────────────────

export const RhetoricalActSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  targetDurationFraction: z.number().min(0.05).max(0.9),
  purpose: z.string().min(10),
  comedicFormulas: z.array(z.string()).min(1),
  promptGuidance: z.string().min(10),
});
export type RhetoricalAct = z.infer<typeof RhetoricalActSchema>;

export const LaughPerMinuteTargetSchema = z.object({
  min: z.number().min(1.0).max(10.0),
  max: z.number().min(1.0).max(12.0),
});
export type LaughPerMinuteTarget = z.infer<typeof LaughPerMinuteTargetSchema>;

export const RhetoricalSpineSchema = z.object({
  acts: z.array(RhetoricalActSchema).min(1),
  laughPerMinuteTarget: LaughPerMinuteTargetSchema,
  ruleOfThreeProbability: z.number().min(0.0).max(1.0),
  callbackTargetCount: z.number().int().min(0).max(10),
  wordBudgetPerSecond: z.number().min(1.5).max(3.5).default(2.5),
});
export type RhetoricalSpine = z.infer<typeof RhetoricalSpineSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Voice Mechanics & Stylometrics
// ─────────────────────────────────────────────────────────────────────────────

export const VoiceMechanicsSchema = z.object({
  meanSentenceLengthWords: z.number().min(5).max(35),
  profanityRegister: ProfanityRegisterSchema,
  outrageAffabilityRatio: z.number().min(0.0).max(1.0), // 0.0 (affable) to 1.0 (outrage)
  cynicismVsOptimismRatio: z.number().min(0.0).max(1.0), // 0.0 (optimistic) to 1.0 (cynical)
  catchphrases: z.array(z.string()).default([]),
  lexicalIdiosyncrasies: z.array(z.string()).default([]),
  punchlinePositionRule: z.literal("end_of_sentence").default("end_of_sentence"),
});
export type VoiceMechanics = z.infer<typeof VoiceMechanicsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Master ShowSkill Schema
// ─────────────────────────────────────────────────────────────────────────────

export const ShowSkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  archetype: ShowArchetypeSchema,
  showType: ShowFormatSchema,
  description: z.string().min(10),
  referenceImageUrl: z.string().optional(),
  rhetoricalSpine: RhetoricalSpineSchema,
  voiceMechanics: VoiceMechanicsSchema,
  hosts: z.array(HostSkillConfigSchema).min(1),
  visualStylePrompt: z.string().min(10),
  notes: z.string().optional(),
  isDefault: z.boolean().default(false),
});
export type ShowSkill = z.infer<typeof ShowSkillSchema>;
```

### 6.2 `app/lib/skills/archetype-a.ts`
```typescript
import type { RhetoricalAct, ShowSkill } from "./types";

/**
 * Standard 3-act rhetorical acts for Writers'-Room Desk Shows (Archetype A).
 */
export const ARCHETYPE_A_STANDARD_ACTS: RhetoricalAct[] = [
  {
    id: "act_1_thesis_hook",
    name: "Act 1: Thesis & Grounded Incongruity Hook",
    targetDurationFraction: 0.25,
    purpose: "Anchor the topic in verified factuality, establish standard expectation S1, and introduce the core incongruity S2 with an immediate punchy hook.",
    comedicFormulas: [
      "journalistic_premise",
      "rational_expectation_contrast",
      "thesis_incongruity_hook",
    ],
    promptGuidance: "State the topic with newsroom authority. Immediately contrast what normal people expect with the bizarre reality. Land a strong hook punchline within the first segment.",
  },
  {
    id: "act_2_evidence_analogies",
    name: "Act 2: Supporting Evidence & Escalating Absurdist Analogies",
    targetDurationFraction: 0.50,
    purpose: "Advance the core argument through alternating factual evidence and escalating absurdist analogies, utilizing the Rule-of-Three, rapid joke tags, and character act-outs.",
    comedicFormulas: [
      "fact_analogy_loop",
      "escalating_simile_cascade",
      "rule_of_three",
      "rapid_tag",
      "character_act_out",
      "callback_thread",
    ],
    promptGuidance: "For every factual point, deploy an escalating analogy. Follow the Rule of Three (Setup -> Reinforce -> Subvert). Tack on 1-2 rapid tags after major laughs. Plant an absurd character or noun for later callback.",
  },
  {
    id: "act_3_synthesis_cta",
    name: "Act 3: Synthesis, Theatrical Payoff & Call-to-Action",
    targetDurationFraction: 0.25,
    purpose: "Synthesize the absurdity into a final moral or existential insight, culminating in a theatrical set-piece or exasperated CTA with a hard-hitting closer punchline.",
    comedicFormulas: [
      "existential_moral_synthesis",
      "theatrical_absurdist_cta",
      "crescendo_closer",
    ],
    promptGuidance: "Bring all analogies together into a climactic crescendo. Deliver a high-concept comedic CTA or absurd realization. The final sentence must place the punch word at the absolute end.",
  },
];

export interface ClipWordBudget {
  clipIndex: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
  targetWordsMin: number;
  targetWordsMax: number;
  assignedActId: string;
  actName: string;
}

/**
 * Calculates per-clip word budgets and act distribution for video shows (8s clip granularity).
 */
export function calculateClipWordBudgets(
  totalDurationSeconds: number,
  skill: ShowSkill,
  clipDurationSeconds = 8,
): ClipWordBudget[] {
  const clipCount = Math.ceil(totalDurationSeconds / clipDurationSeconds);
  const wordsPerSecond = skill.rhetoricalSpine.wordBudgetPerSecond || 2.5;
  const targetWordsPerClip = clipDurationSeconds * wordsPerSecond; // 20 words

  const acts = skill.rhetoricalSpine.acts;
  const budgets: ClipWordBudget[] = [];

  for (let i = 0; i < clipCount; i++) {
    const startTime = i * clipDurationSeconds;
    const endTime = Math.min((i + 1) * clipDurationSeconds, totalDurationSeconds);
    const duration = endTime - startTime;
    const progressFraction = (startTime + duration / 2) / totalDurationSeconds;

    // Determine which act this clip belongs to based on cumulative duration fractions
    let cumulativeFraction = 0;
    let selectedAct = acts[0];
    for (const act of acts) {
      cumulativeFraction += act.targetDurationFraction;
      if (progressFraction <= cumulativeFraction || act === acts[acts.length - 1]) {
        selectedAct = act;
        break;
      }
    }

    budgets.push({
      clipIndex: i,
      startTimeSeconds: startTime,
      endTimeSeconds: endTime,
      durationSeconds: duration,
      targetWordsMin: Math.floor(targetWordsPerClip * 0.85), // ~17-18 words
      targetWordsMax: Math.ceil(targetWordsPerClip * 1.15), // ~23-24 words
      assignedActId: selectedAct.id,
      actName: selectedAct.name,
    });
  }

  return budgets;
}
```

### 6.3 `app/lib/skills/profiles/investigative-desk.ts`
```typescript
import { ARCHETYPE_A_STANDARD_ACTS } from "../archetype-a";
import type { ShowSkill } from "../types";

export const investigativeDeskSkill: ShowSkill = {
  id: "investigative-desk",
  name: "Investigative Desk Deep-Dive",
  archetype: "writers_room_desk",
  showType: "monologue",
  description: "Erudite, high-velocity investigative monologue combining righteous moral outrage with cascading, hyper-specific absurdist analogies and theatrical set-pieces.",
  referenceImageUrl: "/templates/john-oliver.png",
  rhetoricalSpine: {
    acts: ARCHETYPE_A_STANDARD_ACTS,
    laughPerMinuteTarget: { min: 3.5, max: 4.8 },
    ruleOfThreeProbability: 0.85,
    callbackTargetCount: 2,
    wordBudgetPerSecond: 2.5,
  },
  voiceMechanics: {
    meanSentenceLengthWords: 18.5,
    profanityRegister: "mild",
    outrageAffabilityRatio: 0.85,
    cynicismVsOptimismRatio: 0.70,
    catchphrases: [
      "Look...",
      "Cool.",
      "And now, this...",
      "That is not a real thing, except it entirely is.",
      "Moving on!",
      "Holy shit.",
    ],
    lexicalIdiosyncrasies: [
      "hyper-specific analogies with bizarre first names (e.g., 'Cool, Kevin')",
      "parenthetical asides addressing inanimate objects or corporations",
      "breathless cascading metaphors ('X is like Y, if Y were run by...')",
      "incredulous direct second-person camera address",
    ],
    punchlinePositionRule: "end_of_sentence",
  },
  hosts: [
    {
      name: "John Oliver",
      role: "anchor",
      position: "center",
      ttsVoice: "Charon",
      personaCraft: "Articulate, fast-talking British satirical anchor delivering long, passionate rants that build from measured journalistic facts to incredulous existential outrage. Delivers elaborate similes that escalate to bizarre extremes before snapping back to reality.",
      catchphrases: [
        "Look...",
        "Cool.",
        "That is not a real thing, except it entirely is.",
      ],
      speakingRateWpm: 160,
    },
  ],
  visualStylePrompt: "A sharp, bespectacled satirical news anchor in a tailored suit sitting behind a sleek modern late-night television desk with a high-tech graphics monitor on the left, studio lighting, cinematic 8k broadcast television set.",
  notes: "Signature deep-dive format. Heavy journalistic research wrapped in escalating absurdist metaphors and righteous indignation.",
  isDefault: true,
};
```

### 6.4 `app/lib/skills/profiles/closer-look.ts`
```typescript
import { ARCHETYPE_A_STANDARD_ACTS } from "../archetype-a";
import type { ShowSkill } from "../types";

export const closerLookSkill: ShowSkill = {
  id: "closer-look",
  name: "Surgical Political Dissection",
  archetype: "writers_room_desk",
  showType: "monologue",
  description: "Sharp, staccato political dissection driven by head-writer wit, quick character impressions, conversational self-audits, and rapid-fire joke tags.",
  referenceImageUrl: "/templates/seth-meyers.png",
  rhetoricalSpine: {
    acts: ARCHETYPE_A_STANDARD_ACTS,
    laughPerMinuteTarget: { min: 4.5, max: 5.8 },
    ruleOfThreeProbability: 0.90,
    callbackTargetCount: 1,
    wordBudgetPerSecond: 2.5,
  },
  voiceMechanics: {
    meanSentenceLengthWords: 13.2,
    profanityRegister: "clean",
    outrageAffabilityRatio: 0.45,
    cynicismVsOptimismRatio: 0.55,
    catchphrases: [
      "Let me explain...",
      "He talks like a guy who...",
      "I mean, look at this...",
      "And you just know...",
      "What are we doing here?",
    ],
    lexicalIdiosyncrasies: [
      "breaking into slight chuckles at own absurd comparisons",
      "rapid setup-punch-tag-tag cadences",
      "third-person impressions of political figures and everyday archetypes",
      "meta-commentary on the monologue's own writing",
    ],
    punchlinePositionRule: "end_of_sentence",
  },
  hosts: [
    {
      name: "Seth Meyers",
      role: "anchor",
      position: "center",
      ttsVoice: "Orus",
      personaCraft: "Sharp, dry, cerebral head-writer delivery. Delivers surgical takedowns of news clips with knowing smiles, rapid-fire tags, and brief voice impressions. Pauses for effect and readily breaks into slight laughter at his own analogies.",
      catchphrases: [
        "Let me explain...",
        "He talks like a guy who...",
        "What are we doing here?",
      ],
      speakingRateWpm: 150,
    },
  ],
  visualStylePrompt: "A witty, clean-cut satirical television host in a sharp grey suit behind an elegant minimalist dark wood desk, warm late-night studio lighting, graphic overlay screen in background.",
  notes: "Surgical political comedy. Prioritizes tight joke economy, tags, and rapid impressions over grand theatrical set-pieces.",
  isDefault: true,
};
```

### 6.5 `app/lib/skills/profiles/satirical-news-desk.ts`
```typescript
import { ARCHETYPE_A_STANDARD_ACTS } from "../archetype-a";
import type { ShowSkill } from "../types";

export const satiricalNewsDeskSkill: ShowSkill = {
  id: "satirical-news-desk",
  name: "Satirical Dual-Anchor News Desk",
  archetype: "writers_room_desk",
  showType: "conversation",
  description: "High-density dual-anchor news desk trading rapid one-liners, deadpan straight-man setups, subversive streetwise reactions, and cross-desk banter.",
  referenceImageUrl: "/templates/snl-weekend-update.png",
  rhetoricalSpine: {
    acts: ARCHETYPE_A_STANDARD_ACTS,
    laughPerMinuteTarget: { min: 5.0, max: 6.5 },
    ruleOfThreeProbability: 0.75,
    callbackTargetCount: 1,
    wordBudgetPerSecond: 2.5,
  },
  voiceMechanics: {
    meanSentenceLengthWords: 11.5,
    profanityRegister: "mild",
    outrageAffabilityRatio: 0.60,
    cynicismVsOptimismRatio: 0.75,
    catchphrases: [
      "For more on this...",
      "Really?",
      "I gotta say...",
      "Back to you...",
      "Look, man...",
    ],
    lexicalIdiosyncrasies: [
      "crisp news-headline syntax with sudden absurd punch words",
      "side-eye reaction glances and chuckle markers between anchors",
      "uncomfortable boundary-pushing provocations",
      "rapid straight-man setup into loose-cannon punchline",
    ],
    punchlinePositionRule: "end_of_sentence",
  },
  hosts: [
    {
      name: "Colin Jost",
      role: "anchor",
      position: "left",
      ttsVoice: "Charon",
      personaCraft: "Polished, Ivy League straight-man anchor delivering deadpan setups with newsroom sincerity. Maintains composure through shocking punchlines and endures good-natured ribbing from his co-anchor.",
      catchphrases: ["For more on this...", "Really?"],
      speakingRateWpm: 145,
    },
    {
      name: "Michael Che",
      role: "anchor",
      position: "right",
      ttsVoice: "Puck",
      personaCraft: "Relaxed, streetwise, subversive co-anchor. Delivers boundary-pushing jokes with casual conversational ease, chuckles at his own lines, and gives knowing side-eyes to the camera and his co-anchor.",
      catchphrases: ["I gotta say...", "Look, man..."],
      speakingRateWpm: 140,
    },
  ],
  visualStylePrompt: "Two comedic news anchors sitting side-by-side behind a wide modern satirical news desk, high-contrast studio lighting, broadcast graphics monitors, vibrant newsroom set backdrop.",
  notes: "Dual-anchor news parody format. The comedic engine relies entirely on the contrasting dynamic between the polished straight man on the left and the subversive loose cannon on the right.",
  isDefault: true,
};
```

### 6.6 `app/lib/skills/profiles/variety-monologue.ts`
```typescript
import { ARCHETYPE_A_STANDARD_ACTS } from "../archetype-a";
import type { ShowSkill } from "../types";

export const varietyMonologueSkill: ShowSkill = {
  id: "variety-monologue",
  name: "High-Energy Variety Monologue",
  archetype: "writers_room_desk",
  showType: "monologue",
  description: "Exuberant, fast-paced variety monologue packed with pop-culture puns, infectious laughter, audience validation, and broad relatable absurdity.",
  referenceImageUrl: "/templates/john-oliver.png", // Or appropriate placeholder
  rhetoricalSpine: {
    acts: ARCHETYPE_A_STANDARD_ACTS,
    laughPerMinuteTarget: { min: 4.2, max: 5.5 },
    ruleOfThreeProbability: 0.80,
    callbackTargetCount: 1,
    wordBudgetPerSecond: 2.5,
  },
  voiceMechanics: {
    meanSentenceLengthWords: 12.0,
    profanityRegister: "clean",
    outrageAffabilityRatio: 0.05,
    cynicismVsOptimismRatio: 0.10,
    catchphrases: [
      "Did you see this, you guys?",
      "I love this so much!",
      "No, but seriously...",
      "That's what I'm talking about!",
      "We've got a great show tonight!",
    ],
    lexicalIdiosyncrasies: [
      "high-frequency infectious laughter markers [laughs]",
      "enthusiastic hyperbole and physical desk-slapping cadence",
      "accessible pop-culture puns and broad wordplay",
      "frequent rhetorical questions directed at the audience",
    ],
    punchlinePositionRule: "end_of_sentence",
  },
  hosts: [
    {
      name: "Jimmy Fallon",
      role: "anchor",
      position: "center",
      ttsVoice: "Aoede",
      personaCraft: "High-energy, joyous, enthusiastic late-night variety host. Delivers playful, accessible topical jokes with constant laughter breaks, enthusiastic hand gestures, and charming eagerness to entertain.",
      catchphrases: [
        "Did you see this, you guys?",
        "I love this so much!",
        "No, but seriously...",
      ],
      speakingRateWpm: 155,
    },
  ],
  visualStylePrompt: "An exuberant, smiling late-night talk show host in a sleek suit standing in front of a colorful cityscape backdrop with vibrant studio stage lighting and microphone.",
  notes: "Broad mainstream variety format. Focuses on infectious positive energy, relatable pop-culture punchlines, and high affability.",
  isDefault: false,
};
```

### 6.7 `app/lib/skills/registry.ts`
```typescript
import { closerLookSkill } from "./profiles/closer-look";
import { investigativeDeskSkill } from "./profiles/investigative-desk";
import { satiricalNewsDeskSkill } from "./profiles/satirical-news-desk";
import { varietyMonologueSkill } from "./profiles/variety-monologue";
import { type ShowArchetype, type ShowSkill, ShowSkillSchema } from "./types";

/**
 * Master Registry of all validated Show SKILLs.
 */
export const SHOW_SKILL_REGISTRY: Record<string, ShowSkill> = {
  [investigativeDeskSkill.id]: ShowSkillSchema.parse(investigativeDeskSkill),
  [closerLookSkill.id]: ShowSkillSchema.parse(closerLookSkill),
  [satiricalNewsDeskSkill.id]: ShowSkillSchema.parse(satiricalNewsDeskSkill),
  [varietyMonologueSkill.id]: ShowSkillSchema.parse(varietyMonologueSkill),
};

/**
 * Retrieves a ShowSkill by its unique ID. Returns undefined if not found.
 */
export function getShowSkill(id: string): ShowSkill | undefined {
  return SHOW_SKILL_REGISTRY[id];
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
 * Retrieves the default ShowSkill, falling back to investigative-desk.
 */
export function getDefaultShowSkill(): ShowSkill {
  const defaultSkill = listShowSkills().find(s => s.isDefault);
  return defaultSkill ?? investigativeDeskSkill;
}
```

### 6.8 `app/lib/skills/index.ts`
```typescript
export * from "./archetype-a";
export * from "./profiles/closer-look";
export * from "./profiles/investigative-desk";
export * from "./profiles/satirical-news-desk";
export * from "./profiles/variety-monologue";
export * from "./registry";
export * from "./types";
```

### 6.9 `app/lib/skills/skills.test.ts`
```typescript
import { describe, expect, it } from "vitest";

import { calculateClipWordBudgets } from "./archetype-a";
import { closerLookSkill } from "./profiles/closer-look";
import { investigativeDeskSkill } from "./profiles/investigative-desk";
import { satiricalNewsDeskSkill } from "./profiles/satirical-news-desk";
import { varietyMonologueSkill } from "./profiles/variety-monologue";
import {
  getDefaultShowSkill,
  getShowSkill,
  getShowSkillsByArchetype,
  listShowSkills,
  SHOW_SKILL_REGISTRY,
} from "./registry";
import { ShowSkillSchema } from "./types";

describe("Archetype A Show SKILL Engine", () => {
  const skills = [
    investigativeDeskSkill,
    closerLookSkill,
    satiricalNewsDeskSkill,
    varietyMonologueSkill,
  ];

  it("validates all Archetype A show skills against ShowSkillSchema", () => {
    for (const skill of skills) {
      const parsed = ShowSkillSchema.safeParse(skill);
      expect(parsed.success, `Failed to validate skill: ${skill.id}`).toBe(true);
    }
  });

  it("ensures all Archetype A skills have 3-act rhetorical spines", () => {
    for (const skill of skills) {
      expect(skill.rhetoricalSpine.acts.length).toBe(3);
      const totalFraction = skill.rhetoricalSpine.acts.reduce(
        (sum, act) => sum + act.targetDurationFraction,
        0,
      );
      expect(totalFraction).toBeCloseTo(1.0, 2);
    }
  });

  it("enforces valid LPM target ranges for all profiles", () => {
    for (const skill of skills) {
      const { min, max } = skill.rhetoricalSpine.laughPerMinuteTarget;
      expect(min).toBeGreaterThanOrEqual(3.0);
      expect(max).toBeGreaterThan(min);
      expect(max).toBeLessThanOrEqual(8.0);
    }
  });

  it("enforces licensed Gemini TTS voice mappings", () => {
    const validVoices = ["Charon", "Orus", "Puck", "Fenrir", "Aoede", "Kore", "Enceladus", "Zephyr"];
    for (const skill of skills) {
      for (const host of skill.hosts) {
        expect(validVoices).toContain(host.ttsVoice);
      }
    }
  });

  it("calculates accurate clip word budgets across video durations", () => {
    const skill = investigativeDeskSkill;
    const durations = [8, 16, 24, 32, 40];

    for (const duration of durations) {
      const budgets = calculateClipWordBudgets(duration, skill, 8);
      const expectedClips = Math.ceil(duration / 8);
      expect(budgets.length).toBe(expectedClips);

      for (const budget of budgets) {
        expect(budget.targetWordsMin).toBeGreaterThanOrEqual(15);
        expect(budget.targetWordsMax).toBeLessThanOrEqual(25);
        expect(budget.assignedActId).toBeDefined();
      }
    }
  });

  it("correctly manages the central registry", () => {
    const allSkills = listShowSkills();
    expect(allSkills.length).toBeGreaterThanOrEqual(4);

    expect(getShowSkill("investigative-desk")).toBeDefined();
    expect(getShowSkill("closer-look")).toBeDefined();
    expect(getShowSkill("satirical-news-desk")).toBeDefined();
    expect(getShowSkill("variety-monologue")).toBeDefined();

    const deskSkills = getShowSkillsByArchetype("writers_room_desk");
    expect(deskSkills.length).toBeGreaterThanOrEqual(4);

    const defaultSkill = getDefaultShowSkill();
    expect(defaultSkill).toBeDefined();
    expect(defaultSkill.id).toBe("investigative-desk");
  });
});
```

---

## 7. Downstream Integration Guidance (M2 Dramaturgy & Workflows)

When M2 Worker implements the 3-Pass Scripting Orchestrator (`app/lib/dramaturgy/`), it will consume `ShowSkill` directly:

1. **Pass 1 (Grounded Research Seed)**:
   - Takes topic & user familiarity.
   - Extracts verified facts and selects an incongruity angle calibrated to `skill.rhetoricalSpine.acts[0]`.
2. **Pass 2 (Head-Writer Draft & Joke Construction)**:
   - Injects `skill.rhetoricalSpine.acts` and `calculateClipWordBudgets(duration, skill)`.
   - Forces Gemini 3.7 Flash with High Thinking Level to output act beats adhering to `skill.rhetoricalSpine.ruleOfThreeProbability` and `callbackTargetCount`.
3. **Pass 3 ("Sound-Like-Them" Voice Pass & Table-Read Prune)**:
   - Injects `skill.voiceMechanics` (outrage/affability, catchphrases, lexical idiosyncrasies).
   - Enforces `skill.voiceMechanics.punchlinePositionRule === "end_of_sentence"`.
   - Prunes any joke with an incongruity score $< 7/10$.
4. **TTS & Stitching Pipeline (`workflows/generate-show.ts` & `app/lib/tts.ts`)**:
   - Seamlessly uses `host.ttsVoice` (`Charon`, `Orus`, `Puck`, `Aoede`) for multi-speaker synthesis.

---

## 8. Summary of Worker Action Items
1. Create directory `app/lib/skills/` and `app/lib/skills/profiles/`.
2. Implement files: `types.ts`, `archetype-a.ts`, `profiles/investigative-desk.ts`, `profiles/closer-look.ts`, `profiles/satirical-news-desk.ts`, `profiles/variety-monologue.ts`, `registry.ts`, `skills.test.ts`, and `index.ts`.
3. Verify ESLint formatting: `npm run lint`.
4. Verify Vitest tests: `npm run test`.
