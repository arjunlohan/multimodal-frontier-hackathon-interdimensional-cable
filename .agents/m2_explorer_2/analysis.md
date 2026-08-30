# M2 Explorer 2: Pass 2 (Head-Writer Draft & Joke Construction) Implementation Architecture

## 1. Executive Summary & Architectural Overview

Pass 2 (`app/lib/dramaturgy/pass2-head-writer.ts`) represents the central creative engine of the 3-Pass Dramaturgy Pipeline for **Interdimensional Cable**. It transitions the pipeline from factual discovery (Pass 1: Grounded Research & Premise Seed) to structural comedic drafting, constructing the complete narrative blueprint before passing it to Pass 3 for voice tuning and table-read evaluation.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Pass 1: Grounded Research & Premise Seed (`pass1-research.ts`)              │
│ - Verified Facts & Bizarre Metrics (Google Search Grounding)               │
│ - Incongruity Seeds & Contradictions                                       │
│ - Selected Premise Angle (e.g. Absurdist Escalation / Corporate Scam)       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Pass 2: Head-Writer Draft & Joke Construction (`pass2-head-writer.ts`)      │
│ - Model: Gemini 3.7 Flash with `ThinkingLevel.HIGH`                        │
│ - Consumes: `ResearchBrief` + `ShowSkill` + `durationSeconds`               │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Archetype A: Desk Shows (Video <= 40s)                                  │ │
│ │ - 3-Act Rhetorical Spine (Thesis → Evidence/Analogies → Synthesis/CTA)  │ │
│ │ - Explicit Formulas: Setup-Misdirection, Rule-of-Three, Tags, Callbacks  │ │
│ │ - 8-Second Veo Clip Segmentation (Word budgets: 17-23 words/clip)       │ │
│ │ - Dual-Track Generation: Spoken Dialogue + Veo Visual Conditioning      │ │
│ ├─────────────────────────────────────────────────────────────────────────┤ │
│ │ Archetype B: Conversational Podcasts (Audio up to 300s)                 │ │
│ │ - Talking Point Tree Traversal & Associative Tangent Drift Engine       │ │
│ │ - Multi-Speaker Turn-Taking (Inquiry, Riff, Diatribe, Ping-Pong, etc.)  │ │
│ │ - Backchannel Injection & Dynamic Snapback Loops                        │ │
│ │ - Acoustic Cue Tagging ([laughs], [chuckles], [incredulous], [sighs])   │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Pass 3: Voice Pass & Table-Read Pruning (`pass3-voice-prune.ts`)            │
│ - Table-Read Critic (Prunes jokes < 7/10)                                   │
│ - Stylometric Cadence Tuning & Profanity Register Alignment                │
│ - Pre-Flight Veo 3.1 RAI Safety Sanitization                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Computational Humor Theory Foundations

Pass 2 operationalizes key principles from computational humor and cognitive linguistics literature (DeepMind FAccT 2024, Suls Incongruity-Resolution Theory, Burrows's Stylometric Delta):

### 2.1 Incongruity-Resolution Mechanics ($S_1 \rightarrow S_2$)
- **Setup ($S_1$)**: Builds a high-confidence, standard cognitive schema based on grounded journalistic facts or common-sense assumptions.
- **Incongruity ($S_2$)**: Introduces a sudden, shocking violation of the expectation that appears absurd.
- **Resolution**: The punchline bridges $S_1$ and $S_2$, forcing the audience to realize that the absurd interpretation is horrifyingly or hilarious true in the given context.
- **End-of-Sentence Punchline Rule**: To maximize cognitive surprise, the comedic reveal (the operative punch word) must be positioned at the absolute end of the sentence.

### 2.2 The Rule-of-Three Progression
- **Pattern establishment**: Step 1 (Normal journalistic baseline) $\rightarrow$ Step 2 (Plausible/mildly heightened variation) $\rightarrow$ Step 3 (Absurdist collapse/surreal exaggeration).
- Pass 2 enforces a structured triplet schema in prompt instructions and output validation.

### 2.3 Rapid Tagging & Joke Escalation
- Following a primary laugh, the host delivers 1–2 rapid "tags" (2–8 words) that heighten the premise without rebuilding a new setup.
- Tags maintain comedic momentum and increase the effective Laughs-Per-Minute (LPM) target defined in the `ShowSkill`.

### 2.4 Structural Callback Architecture
- In Act 1 or early Act 2, the Head Writer plants a bizarre, hyper-specific anchor motif (e.g. "Kevin, an unlicensed artisanal ferrier in New Jersey").
- In Act 3 (Closer/CTA), the motif is repurposed to resolve the overarching premise, providing structural narrative and comedic closure.

---

## 3. Archetype A: Desk Shows (Writers'-Room Joke Construction)

### 3.1 3-Act Rhetorical Spine Alignment
For Desk Shows (John Oliver, Seth Meyers, Daily Show, Fallon styles), Pass 2 aligns the beat sequence to the show's `RhetoricalSpine`:

| Act | Name | Target Duration Fraction | Primary Comedic Formulas | Required Elements |
|---|---|---|---|---|
| **Act 1** | Thesis & Grounded Incongruity Hook | 25% (~10s in 40s show) | `journalistic_premise`, `rational_expectation_contrast`, `thesis_incongruity_hook` | `thesis_setup`, `grounded_fact` |
| **Act 2** | Supporting Evidence & Escalating Absurdist Analogies | 50% (~20s in 40s show) | `fact_analogy_loop`, `escalating_simile_cascade`, `rule_of_three`, `rapid_tag`, `character_act_out`, `callback_thread` | `grounded_fact`, `escalating_analogy`, `rule_of_three`, `tag`, `act_out` |
| **Act 3** | Synthesis, Theatrical Payoff & Call-to-Action | 25% (~10s in 40s show) | `existential_moral_synthesis`, `theatrical_absurdist_cta`, `crescendo_closer` | `callback`, `call_to_action` |

### 3.2 8-Second Veo Clip Granularity & Word Budget Allocation
Google Veo 3.1 video generation operates on discrete video clip generations capped at 40s (5 clips $\times$ 8 seconds). Pass 2 enforces strict synchronization between spoken text and visual clips:

$$\text{Target Words Per Clip} = \text{Clip Duration (8s)} \times \text{Word Budget Per Second (2.5 wps)} \approx 20\text{ words}$$
$$\text{Allowable Range: } 17 \le \text{Words} \le 23\text{ words per clip}$$

#### Clip Map for 40-Second Video Show:
- **Clip 0 (0s – 8s)**: Act 1 Thesis Hook (17–23 words). Visual prompt: Host at desk establishing topic with serious broadcast newsroom demeanor, over-the-shoulder graphic displaying topic title.
- **Clip 1 (8s – 16s)**: Act 2 Grounded Fact & Analogy 1 (17–23 words). Visual prompt: Host gestures with raised eyebrows and incredulous hand motions, monitor displays absurd diagram.
- **Clip 2 (16s – 24s)**: Act 2 Rule-of-Three Breakdown & Rapid Tag (17–23 words). Visual prompt: Host leans in toward camera with mock-serious exasperation, rapid lighting flare.
- **Clip 3 (24s – 32s)**: Act 2 Character Act-Out & Analogy 2 (17–23 words). Visual prompt: Host mimics corporate executive or spokesperson with hyperbolic voice gesture.
- **Clip 4 (32s – 40s)**: Act 3 Synthesis, Callback Payoff & Climactic CTA (17–23 words). Visual prompt: Wide cinematic desk shot, host delivers impassioned closer, set lighting dramatic.

---

## 4. Archetype B: Conversational Podcasts (Talking Point Tree & Tangent Drift)

### 4.1 Talking Point Tree Navigation & Tangent Drift Engine
For Archetype B (Rogan and Tim Dillon styles), the script is generated as a dynamic dialogue graph traversing the `talkingPointTree` and `driftConfig` in `ShowSkill.podcastDynamics`:

```
                     ┌───────────────────────────────┐
                     │     Root Premise Node         │
                     │  (Grounded Anomaly / Scam)    │
                     └───────────────┬───────────────┘
                                     │ (driftProbability: 0.65 - 0.80)
                     ┌───────────────┴───────────────┐
                     │                               │
                     ▼                               ▼
       ┌───────────────────────────┐   ┌───────────────────────────┐
       │   Tangent Branch A        │   │   Tangent Branch B        │
       │ (Primal Biology / Chimps) │   │ (Suburban Ponzi Schemes)  │
       └─────────────┬─────────────┘   └─────────────┬─────────────┘
                     │ (driftDepth > maxDriftDepthTurns)
                     ▼
       ┌───────────────────────────┐
       │   Snapback Transition     │
       │ ("Wait, how did we get    │
       │  here? Back to the...")   │
       └───────────────────────────┘
```

### 4.2 Multi-Speaker Turn Taxonomy & Dynamics

| Turn Type | Typical Duration | Role | Description |
|---|---|---|---|
| `inquiry` | 3–6s (8–15 words) | Lead Host | Earnest, probing question setting up an anomaly or premise |
| `speculative_riff` | 8–18s (20–45 words) | Guest / Host | Hyperbolic thought experiment connecting distant phenomena |
| `diatribe` | 12–25s (30–65 words) | Lead Host (Dillon style) | Breathless, high-voltage compound rant targeting societal decay |
| `ping_pong` | 2–5s (4–12 words) | Both Hosts | Rapid-fire comedic volley building on an absurd premise |
| `backchannel` | 1–3s (2–6 words) | Co-Host / Sounding Board | Supportive or incredulous reaction: `"100 percent"`, `"[chuckles] Wait, really?"` |
| `tangent_pivot` | 6–12s (15–30 words) | Either Host | Associative leap connecting the topic to ancient history, primal biology, or local scams |
| `snapback` | 4–8s (10–20 words) | Lead Host | Deploys a signature snapback phrase to re-anchor the dialogue on core facts |

### 4.3 Acoustic Cue Tagging
Pass 2 injects acoustic tags from `skill.podcastDynamics.acousticTagSet` directly into spoken dialogue segments. These tags are parsed and processed by Gemini 3.1 Flash TTS (`gemini-3.1-flash-tts-preview`) to generate authentic vocal inflections:
- `[laughs]` — Full laughter burst
- `[chuckles]` — Low suppressed chuckle
- `[snickers]` — Sarcastic or mischievous snicker
- `[sighs]` — Heavy exasperated breath
- `[gasps]` — Sudden intake of air / shock
- `[whispering]` — Conspiratorial drop in vocal volume
- `[incredulous]` — Rising pitch disbelief
- `[screaming]` / `[wheezes]` — High-intensity vocal climax

---

## 5. TypeScript Types & Zod Schemas (`app/lib/dramaturgy/types.ts`)

```typescript
import { z } from "zod";
import type {
  ClipWordBudget,
  HostRole,
  ProfanityRegister,
  RhetoricalAct,
  ShowArchetype,
  ShowSkill,
  TtsVoice,
} from "../skills/types";

// ─────────────────────────────────────────────────────────────────────────────
// Pass 1 Interfaces (Research Brief)
// ─────────────────────────────────────────────────────────────────────────────

export interface GroundedFact {
  fact: string;
  sourceUrl?: string;
  bizarreMetric?: string;
  incongruityNote?: string;
}

export interface IncongruitySeed {
  observation: string;
  contradiction: string;
  comedicTension: string;
}

export interface PremiseAngle {
  id: string;
  title: string;
  angle: string;
  comedicPremise: string;
  targetArchetype?: ShowArchetype;
}

export interface ResearchBrief {
  topic: string;
  summary: string;
  verifiedFacts: GroundedFact[];
  incongruitySeeds: IncongruitySeed[];
  premiseAngles: PremiseAngle[];
  selectedAngle: PremiseAngle;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pass 2 Input Contracts
// ─────────────────────────────────────────────────────────────────────────────

export interface PersonalizationContext {
  conceptMastery?: Record<string, number>;
  trackedInterests?: string[];
  humorPreference?: {
    preferredTone?: string;
    absurdismTolerance?: number;
  };
  recentQuestions?: string[];
}

export interface Pass2Input {
  researchBrief: ResearchBrief;
  skill: ShowSkill;
  durationSeconds: number;
  personalizationProfile?: PersonalizationContext;
  customInstructions?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pass 2 Comedic Mechanisms & Beat Contracts (Archetype A)
// ─────────────────────────────────────────────────────────────────────────────

export type ComedicMechanism =
  | "setup_misdirection"
  | "rule_of_three"
  | "escalating_analogy"
  | "rapid_tag"
  | "callback"
  | "character_act_out"
  | "rhetorical_crescendo"
  | "theatrical_cta";

export interface ComedicBeat {
  id: string;
  actId: string;
  actName: string;
  clipIndex: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
  targetWordCount: number;
  actualWordCount: number;
  speaker: string;
  setup: string;
  punchline: string;
  tags?: string[];
  fullText: string;
  mechanism: ComedicMechanism;
  plantedCallbackMotif?: string;
  resolvedCallbackMotif?: string;
  visualPrompt: string;
  actingDirection: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pass 2 Podcast Turn Contracts (Archetype B)
// ─────────────────────────────────────────────────────────────────────────────

export type TurnType =
  | "inquiry"
  | "speculative_riff"
  | "diatribe"
  | "ping_pong"
  | "backchannel"
  | "tangent_pivot"
  | "snapback";

export interface PodcastTurn {
  id: string;
  turnIndex: number;
  speaker: string;
  role: HostRole;
  ttsVoice: TtsVoice;
  turnType: TurnType;
  text: string;
  acousticTags: string[];
  wordCount: number;
  estimatedDurationSeconds: number;
  currentNodeId: string;
  isTangent: boolean;
  driftDepth: number;
  snapbackTriggered?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pass 2 Master Output Contracts
// ─────────────────────────────────────────────────────────────────────────────

export interface CallbackLink {
  plantedInBeatId: string;
  resolvedInBeatId: string;
  motif: string;
}

export interface HeadWriterDraft {
  archetype: ShowArchetype;
  showId: string;
  showTitle: string;
  topic: string;
  selectedPremise: PremiseAngle;
  beats?: ComedicBeat[];
  turns?: PodcastTurn[];
  callbacks: CallbackLink[];
  clipWordBudgets?: ClipWordBudget[];
  metrics: {
    totalDurationSeconds: number;
    totalWordCount: number;
    estimatedLpm: number;
    jokeCount: number;
    callbackCount: number;
    ruleOfThreeCount: number;
    tangentCount?: number;
    maxDriftDepthReached?: number;
  };
  pass1Context: {
    verifiedFactsCount: number;
    incongruitySeedsCount: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Zod Schemas for Runtime Validation
// ─────────────────────────────────────────────────────────────────────────────

export const ComedicMechanismSchema = z.enum([
  "setup_misdirection",
  "rule_of_three",
  "escalating_analogy",
  "rapid_tag",
  "callback",
  "character_act_out",
  "rhetorical_crescendo",
  "theatrical_cta",
]);

export const ComedicBeatSchema = z.object({
  id: z.string(),
  actId: z.string(),
  actName: z.string(),
  clipIndex: z.number().int().nonnegative(),
  startTimeSeconds: z.number().nonnegative(),
  endTimeSeconds: z.number().positive(),
  durationSeconds: z.number().positive(),
  targetWordCount: z.number().int().positive(),
  actualWordCount: z.number().int().positive(),
  speaker: z.string().min(1),
  setup: z.string().min(1),
  punchline: z.string().min(1),
  tags: z.array(z.string()).optional(),
  fullText: z.string().min(1),
  mechanism: ComedicMechanismSchema,
  plantedCallbackMotif: z.string().optional(),
  resolvedCallbackMotif: z.string().optional(),
  visualPrompt: z.string().min(10),
  actingDirection: z.string().min(3),
});

export const PodcastTurnSchema = z.object({
  id: z.string(),
  turnIndex: z.number().int().nonnegative(),
  speaker: z.string().min(1),
  role: z.string(),
  ttsVoice: z.string(),
  turnType: z.enum([
    "inquiry",
    "speculative_riff",
    "diatribe",
    "ping_pong",
    "backchannel",
    "tangent_pivot",
    "snapback",
  ]),
  text: z.string().min(1),
  acousticTags: z.array(z.string()).default([]),
  wordCount: z.number().int().positive(),
  estimatedDurationSeconds: z.number().positive(),
  currentNodeId: z.string().min(1),
  isTangent: z.boolean().default(false),
  driftDepth: z.number().int().nonnegative().default(0),
  snapbackTriggered: z.boolean().optional(),
});

export const CallbackLinkSchema = z.object({
  plantedInBeatId: z.string(),
  resolvedInBeatId: z.string(),
  motif: z.string(),
});

export const HeadWriterDraftSchema = z.object({
  archetype: z.enum(["writers_room_desk", "conversational_podcast"]),
  showId: z.string(),
  showTitle: z.string(),
  topic: z.string(),
  selectedPremise: z.object({
    id: z.string(),
    title: z.string(),
    angle: z.string(),
    comedicPremise: z.string(),
  }),
  beats: z.array(ComedicBeatSchema).optional(),
  turns: z.array(PodcastTurnSchema).optional(),
  callbacks: z.array(CallbackLinkSchema).default([]),
  metrics: z.object({
    totalDurationSeconds: z.number().positive(),
    totalWordCount: z.number().int().positive(),
    estimatedLpm: z.number().nonnegative(),
    jokeCount: z.number().int().nonnegative(),
    callbackCount: z.number().int().nonnegative(),
    ruleOfThreeCount: z.number().int().nonnegative(),
    tangentCount: z.number().int().nonnegative().optional(),
    maxDriftDepthReached: z.number().int().nonnegative().optional(),
  }),
  pass1Context: z.object({
    verifiedFactsCount: z.number().int().nonnegative(),
    incongruitySeedsCount: z.number().int().nonnegative(),
  }),
});
```

---

## 6. Prompt Engineering & Gemini 3.7 Flash High Thinking Level Specification

### 6.1 Model Invocation Parameters
- **SDK**: `@google/genai`
- **Model**: `gemini-3.7-flash` (or `gemini-2.5-pro` / fallback)
- **Thinking Configuration**: `thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }` (or `thinkingBudget: 8192`)
- **Temperature**: `0.90` (optimally calibrated for creative joke construction within strict JSON structure)
- **Max Output Tokens**: `8192`
- **Response Format**: `responseMimeType: "application/json"` with embedded JSON schema.

### 6.2 Archetype A (Desk Show) System Prompt Specification

```markdown
You are the veteran Head Writer in an elite late-night comedy television writers' room (e.g. Last Week Tonight, A Closer Look, The Daily Show).

YOUR MISSION:
Transform the provided verified journalistic research and comedic premise angle into an airtight, joke-dense 3-Act desk show script tailored for broadcast video.

CORE COMEDIC CRAFT RULES:
1. INCONGRUITY-RESOLUTION: Every joke must establish a normal, plausible expectation (Schema 1) and suddenly resolve it with an unexpected, logically sound absurdity (Schema 2).
2. PUNCHLINE POSITION RULE: The operative punchline word or phrase MUST BE PLACED AT THE ABSOLUTE END of the sentence. Never bury the funny noun in the middle.
3. RULE-OF-THREE: Use [Normal Example] -> [Heightened Example] -> [Surreal Absurdist Breakdown].
4. ESCALATING ANALOGIES: Deploy hyper-specific, unexpected similes ("X is like Y, if Y were run by Z").
5. TAGS: After major laughs, immediately tack on 1-2 rapid 3-8 word punchline tags to elevate the laugh momentum.
6. CALLBACK: Plant an absurd, memorable noun/persona in Act 1/2, and deliver a triumphant comedic callback payoff in Act 3.
7. 8-SECOND CLIP GRANULARITY: Video shows are segmented into exact 8-second clips. Each clip must adhere to the word budget (17-23 words per clip at ~2.5 words/second).
8. DUAL-TRACK OUTPUT: For every clip, generate both the spoken dialogue AND a vivid, face-anchored visual prompt for Google Veo 3.1 conditioning.

OUTPUT REQUIREMENT:
Output ONLY valid JSON matching the specified HeadWriterDraft schema.
```

### 6.3 Archetype B (Podcast) System Prompt Specification

```markdown
You are the executive showrunner and dialogue architect for a top-charting comedy/speculative podcast studio (e.g. Joe Rogan Experience, Tim Dillon Show).

YOUR MISSION:
Transform the verified research brief and selected premise into a dynamic, authentic multi-speaker podcast dialogue tree featuring organic tangent drift, high-voltage riffs, and natural turn-taking.

CORE CONVERSATIONAL CRAFT RULES:
1. MULTI-SPEAKER TURN TAKING: Alternate turns between hosts with authentic personality dynamics.
   - Lead Host: Drives open-ended curiosity or breathless satirical diatribes.
   - Co-Host/Sounding Board: Injects supportive/incredulous backchannels, suppressed giggles, and probing questions.
2. DYNAMIC TANGENT DRIFT:
   - Traverse the talking point tree from root premise to associative tangents (primal evolutionary biology, suburban Ponzi schemes, ancient tech).
   - If drift depth exceeds the limit, execute a natural SNAPBACK turn using the host's signature transition phrase.
3. ACOUSTIC TAGGING:
   - Embed authentic acoustic tags directly in the dialogue: [laughs], [chuckles], [snickers], [sighs], [gasps], [whispering], [incredulous], [wheezes].
   - Place acoustic tags where a real human speaker would naturally chuckle or pause for breath.
4. RHYTHM & PACING:
   - Mix turn lengths: Short backchannels (2-6 words), rapid ping-pong (5-15 words), and long rolling speculative riffs / diatribes (25-60 words).

OUTPUT REQUIREMENT:
Output ONLY valid JSON matching the specified HeadWriterDraft schema.
```

---

## 7. Pass 2 Generator Architecture (`pass2-head-writer.ts`)

### 7.1 Unified Entry Point
```typescript
/**
 * Master Pass 2 Head-Writer Draft Generator.
 * Dispatches to specialized generators based on ShowSkill archetype.
 */
export async function generateHeadWriterDraft(
  input: Pass2Input,
): Promise<HeadWriterDraft> {
  const { skill, researchBrief, durationSeconds } = input;

  if (skill.archetype === "writers_room_desk") {
    return await generateDeskShowDraft(input);
  } else if (skill.archetype === "conversational_podcast") {
    return await generatePodcastDraft(input);
  } else {
    throw new Error(`Unsupported show archetype: ${skill.archetype}`);
  }
}
```

### 7.2 Archetype A Beat Construction Pipeline
1. **Word Budget Calculation**: Call `calculateClipWordBudgets(durationSeconds, skill, 8)` to compute clip intervals and word limits.
2. **Gemini High-Thinking Synthesis**: Call Gemini 3.7 Flash with `ThinkingLevel.HIGH`, injecting `ARCHETYPE_A_STANDARD_ACTS`, `researchBrief`, and host `voiceMechanics`.
3. **Response Sanitization & Zod Parsing**: Parse JSON, sanitize word counts against clip budgets, compute metrics (LPM, joke count, callback links).
4. **Resilience & Fallback Handler**: If Gemini API call fails (or during testing without API keys), trigger `synthesizeDeterministicDeskDraft(input)` to generate a structurally valid, fully compliant draft.

### 7.3 Archetype B Dynamic Turn Pipeline
1. **Dynamics Extraction**: Read `talkingPointTree`, `driftConfig`, and `acousticTagSet` from `skill.podcastDynamics`.
2. **Gemini High-Thinking Synthesis**: Call Gemini 3.7 Flash with `ThinkingLevel.HIGH`, instructing the model to simulate conversational drift, turn types, and acoustic tags.
3. **Drift & Acoustic Cue Analysis**: Extract embedded acoustic tags, verify snapback occurrence, validate speaker role mappings and duration fractions.
4. **Resilience & Fallback Handler**: If Gemini API call fails, trigger `synthesizeDeterministicPodcastDraft(input)` to generate an authentic turn-taking conversation traversing the talking point tree.

---

## 8. Deterministic Fallback Synthesis (Resilience Mode)

To ensure 100% test reliability and resilience when Gemini API credentials are mock-tested or throttled:

### 8.1 Desk Show Deterministic Synthesizer
- Generates 5 distinct 8s clips for a 40s show:
  - Clip 0 (Act 1): Thesis hook combining `researchBrief.topic` and `selectedAngle.comedicPremise`.
  - Clip 1 (Act 2): Fact-analogy beat combining `researchBrief.verifiedFacts[0]` with an escalating simile. Plants callback motif `"Kevin, the unlicensed artisanal taxidermist"`.
  - Clip 2 (Act 2): Rule-of-three beat (`[Setup 1, Setup 2, Absurd Breakdown 3]`) + rapid tag `"Cool. Great system."`.
  - Clip 3 (Act 2): Character act-out beat with host imitation and second fact from `verifiedFacts`.
  - Clip 4 (Act 3): Climactic synthesis, pays off callback motif `"Kevin"`, delivers high-concept CTA.

### 8.2 Podcast Deterministic Synthesizer
- Generates a sequence of 8–12 conversational turns matching `durationSeconds`:
  - Turn 0 (`inquiry`, Lead Host): Introduces `researchBrief.topic` with `[laughs]` or `[sighs]` acoustic cue.
  - Turn 1 (`speculative_riff`, Guest/Co-Host): Traverses `talkingPointTree[1]` (tangent drift depth 1).
  - Turn 2 (`backchannel`, Lead Host): Incredulous reaction (`"[chuckles] Wait, really?"`).
  - Turn 3 (`diatribe` / `speculative_riff`, Co-Host): Extrapolates into primal biology / suburban grift (drift depth 2).
  - Turn 4 (`snapback`, Lead Host): Deploys signature snapback phrase (`"Wait, how did we get here? Right, the actual topic..."`) resetting drift depth to 0.
  - Turn 5 (`ping_pong`, Both Hosts): Rapid comedic exchanges concluding on cosmic wonder or cynical payoff.

---

## 9. Verification & Quality Metrics

Pass 2 computes and validates the following objective quality metrics:

1. **Word Budget Compliance**:
   - For Desk Shows: $\ge 90\%$ of clips must fall within $[17, 23]$ words.
   - For Podcasts: Total word count matches $\text{durationSeconds} \times \text{wordBudgetPerSecond} \pm 10\%$.
2. **LPM (Laughs-Per-Minute) Target Range**:
   - Calculated as: $(\text{Jokes Count} + \text{Tags Count}) / (\text{Duration in Seconds} / 60)$.
   - Verified against `skill.rhetoricalSpine.laughPerMinuteTarget` (e.g. 3.5 – 4.8 LPM for John Oliver, 4.5 – 6.5 LPM for Tim Dillon).
3. **Callback Integrity**:
   - Asserts that every planted callback motif has a corresponding resolution in Act 3 / final segment.
4. **Acoustic Tag Presence**:
   - For Podcasts: Asserts $\ge 1$ acoustic tag per 30 seconds of dialogue.
5. **Veo Prompt Richness**:
   - For Desk Shows: Asserts each beat includes a $\ge 15$-word visual prompt specifying host action, set lighting, and over-the-shoulder monitor graphics.
