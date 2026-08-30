# Comprehensive Architecture & Specification Analysis: R1 (Show SKILL Engine) & R2 (Multi-Pass Scripting Orchestrator)

**Agent**: Survey Explorer 1 (Specification and Architecture Miner)  
**Date**: 2026-08-30  
**Target Repository**: `multimodal-frontier-hackathon-interdimensional-cable`  

---

## 1. Executive Summary & Architecture Overview

The **Interdimensional Cable** application is an autonomous comedy talk show and podcast generation platform built on Next.js 16, Vercel Workflows DevKit, Google Gemini multimodal infrastructure (`gemini-3.7-flash`, `gemini-3.1-flash-tts-preview`, `veo-3.1-generate-preview`), and Mux video streaming.

This investigation explores two core requirements:
1. **R1 (Two-Archetype Modular Show SKILL Engine)**: Grounded in computational humor research (Incongruity-Resolution, DeepMind FAccT 2024, Burrows's Delta stylometrics, GTVH) and industry television/podcast writers' room practices. Covers two distinct archetypes: **Archetype A** (Writers'-Room Desk Shows) and **Archetype B** (Conversational Long-Form Podcasts), with strict legal/identity safety guardrails.
2. **R2 (Multi-Pass Scripting & Dramaturgy Orchestrator)**: Replacing naive single-prompt generation with a production-grade 3-pass writers' room pipeline:
   - **Pass 1: Grounded Research & Premise Seed** (Gemini 3.7 Flash + Google Search Grounding)
   - **Pass 2: Head-Writer Draft & Joke Construction** (Act beats, misdirection, escalating analogies, act-outs)
   - **Pass 3: "Sound-Like-Them" Voice Pass & Table-Read Prune** (Cadence, outrage/affability tuning, punchline tightening, joke kill/prune loop)

---

## 2. Current Codebase Analysis & Infrastructure Baseline

### 2.1 Technology Stack & Dependencies
- **Core Framework**: Next.js 16.0.10 (App Router), React 19.2.0, TypeScript 5.
- **Workflow Orchestration**: `workflow: ^4.0.1-beta.29` (Vercel Workflows SDK) with `"use workflow"` and `"use step"` primitives.
- **AI Infrastructure**:
  - `@google/genai: ^1.47.0` (Official Google GenAI SDK) — utilized for `gemini-3.7-flash`, `veo-3.1-generate-preview`, `gemini-3.1-flash-tts-preview`.
  - `ai: ^5.0.113` & `@ai-sdk/openai: ^2.0.86` — Vercel AI SDK used in chat and tangents.
- **Database**: PostgreSQL with `pgvector` via `drizzle-orm: ^0.45.1` and `pg: ^8.16.3`.
- **Media Ingestion & Streaming**: `@mux/mux-node: ^12.8.1`, `@mux/mux-player-react: ^3.10.1`, `@mux/ai: 0.3.1`.
- **Video Stitching & Motion**: Remotion 4.0.390, fluent-ffmpeg / local ffmpeg spawn in `app/lib/stitch.ts`.

### 2.2 Existing Generation Pipeline (`workflows/generate-show.ts`)
The current show generation workflow follows these steps:
1. `researchStep`: Calls `generateText` with `useGoogleSearch: true` (Gemini 3.7 Flash with Google Search tool). Takes URL content or freetext and produces a basic 500–1000 word brief.
2. `scriptStep`: Issues a single prompt to Gemini asking for a JSON array of `TranscriptSegment` items (8-second chunks). Uses simple host descriptions from `show_templates`.
3. `checkShowFormatStep`: Routes to `audioPodcastSynthesisStep` if `durationSeconds > 40`, otherwise `frameChainAndGenerateClipsStep`.
4. `frameChainAndGenerateClipsStep` / `audioPodcastSynthesisStep`: Generates either 8-second Veo video clips (capped at 40s) or multi-speaker WAV via Gemini 3.1 Flash TTS (up to 300s).
5. `stitchStep` & `uploadStep`: Stitches video clips with ffmpeg or prepares podcast WAV, then uploads directly to Mux via direct upload.

### 2.3 Key Limitations in Current Scripting Pipeline
- **Single-Turn Scripting**: The current `scriptStep` attempts to do research interpretation, joke crafting, character voice, and timing in a single prompt. This results in generic late-night tropes without escalating absurdism or structural callbacks.
- **Under-specified Show Models**: Show templates in `db/schema.ts` only contain `name`, `showType`, `referenceImageUrl`, `hosts`, and `notes`. They lack explicit comedic metrics (Laughs-Per-Minute, rhetorical spines, voice mechanics vectors, tag patterns).
- **No Dramaturgy / Pruning**: Zero evaluation is performed on generated jokes; weak jokes are never pruned or replaced, violating the fundamental writers' room dynamic where 80% of pitches are killed at the table read.

---

## 3. R1: Two-Archetype Modular Show SKILL Engine

### 3.1 Theoretical Foundations of Computational Humor
1. **Incongruity-Resolution Theory (Suls 1972, Attardo & Raskin 1991 GTVH)**:
   - Humor operates on a two-stage cognitive model:
     - **Stage 1 (Incongruity)**: The audience encounters a premise or fact that violates their cognitive script or standard expectations ($S_1$).
     - **Stage 2 (Resolution)**: A punchline introduces an alternate schema ($S_2$) that suddenly resolves the incongruity in an unexpected yet logically coherent manner.
2. **DeepMind FAccT 2024 Findings ("Can LLMs Be Funny?")**:
   - Zero-shot LLMs suffer from "comedic flatness" (predictable puns, superficial wordplay).
   - High-craft humor requires:
     - **Grounded Incongruous Facts**: Real, bizarre, verified details provide far better comedic traction than purely fabricated premises.
     - **Contrastive Escalation**: Progressing from relatable reality to wildly specific absurd analogies.
     - **Negative Pruning**: Rejection sampling based on predictable punchline detection.
3. **Burrows's Delta & Stylometrics**:
   - Stylistic voice differentiation is governed by function-word frequency distributions, sentence length variance ($\sigma^2$), clause nesting, and rhetorical question ratios.
   - Distinct comedic personas have measurable stylometric fingerprints (e.g., John Oliver's high subordinate clause nesting and incredulous tag clauses vs. Seth Meyers's staccato setup-punch-tag cadences).

---

### 3.2 Archetype A: Writers'-Room Desk Shows (Late-Night / Satirical Newsroom)

#### A. Rhetorical Spines
Writers'-Room Desk Shows adhere to a strict three-act rhetorical progression:
- **Act 1: Thesis & Grounded Incongruity Hook (0% - 25% of runtime)**
  - *Setup*: Introduce the real-world news anchor topic with verified facts.
  - *Rational Baseline*: Establish what normal, sane people would expect.
  - *First Break*: Identify the specific absurdity or cognitive dissonance in the situation.
- **Act 2: Supporting Evidence & Escalating Absurdist Analogies (25% - 75% of runtime)**
  - *Fact $\rightarrow$ Analogy Loop*: Every piece of factual reporting is paired with an escalating absurdist comparison.
  - *Rule of Three*:
    1. Item 1: Relatable, standard expectation.
    2. Item 2: Plausible escalation.
    3. Item 3: Total absurdist left-turn/subversion.
  - *Tags*: 1–3 rapid secondary punchlines tacked onto the initial laugh without changing topic.
  - *Callbacks*: Re-introducing an absurd character, metaphor, or specific noun from Act 1 into Act 2's climax.
  - *Act-Outs*: Host breaks direct camera address to perform a 2-second imaginary dialogue or character caricature.
- **Act 3: Theatrical Payoff & Call-to-Action (75% - 100% of runtime)**
  - *Synthesis*: Tie together the disparate absurd analogies with the core thesis.
  - *Climactic Set-Piece / CTA*: High-concept culmination (theatrical mock-campaign, mascot reveal, or existential exasperation).

#### B. Joke Density & Syllable Formulas
- **Target LPM (Laughs Per Minute)**: 3.5 to 6.0 LPM.
- **Segment Word-Budget**:
  - Video clips are 8 seconds each $\rightarrow$ word budget is **20 to 26 words per segment** (approx. 150–160 words per minute).
  - 16s show (2 clips): 1 major setup-punchline + 1 tag/escalation.
  - 24s show (3 clips): Act 1 setup, Act 2 escalating analogy, Act 3 payoff tag.
  - 40s show (5 clips): Full 3-act spine with Rule of Three and callback.
- **Punchline Syntax Rule**: The "punch word" must land on the final 1–3 words of the sentence. Never bury punchlines in the middle of a clause.

#### C. Craft-Based Style Profiles

1. **Investigative Deep-Dive ("John Oliver Style" / `investigative_desk_monologue`)**:
   - *Rhetorical Mechanism*: Righteous moral outrage wrapped in hyper-specific absurdist analogies.
   - *Signature Devices*: Cascading metaphors ("X is like Y, if Y were..."), breathless pacing, incredulous direct-address catchphrases ("Look...", "Cool.", "And now, this..."), absurd character names.
   - *Voice Vector*: Outrage 9/10, Moral Conviction 9/10, Lexical Density 9/10, Affability 4/10.

2. **Surgical Political Dissection ("Seth Meyers Style" / `closer_look_monologue`)**:
   - *Rhetorical Mechanism*: Dry snark, frame-by-frame political dissection, conversational self-audits.
   - *Signature Devices*: Breaking into giggles at own jokes, third-person impression act-outs ("He talks like a guy who..."), rapid-fire tags, meta-commentary on the writing itself.
   - *Voice Vector*: Affability 7/10, Sarcasm 9/10, Meta-Irony 9/10, Outrage 5/10.

3. **Satirical Newsroom Desk ("Daily Show / Weekend Update Style" / `satirical_news_desk`)**:
   - *Rhetorical Mechanism*: Deadpan journalistic delivery clashing with surreal headlines, dual-anchor contrast.
   - *Signature Devices*: Straight-man setup vs. wild reaction; knowing smirks; side-eye camera glances; snappy 1-line headline twists.
   - *Voice Vector*: Deadpan 8/10, Snark 8/10, Pacing 9/10.

4. **High-Energy Mainstream Variety ("Fallon Style" / `variety_monologue`)**:
   - *Rhetorical Mechanism*: Joyful exuberance, enthusiastic hyperbole, crowd validation, pop-culture puns.
   - *Signature Devices*: Laughter breaks, desk slapping, accessible broad humor, musicality.
   - *Voice Vector*: Affability 10/10, Outrage 1/10, Cynicism 1/10, Energy 10/10.

---

### 3.3 Archetype B: Conversational Long-Form Podcasts (1–5 Minute Audio Broadcasts)

#### A. Prep-Doc & Talking Point Trees
Unlike tightly scripted desk monologues, conversational podcasts require **Talking Point Trees**:
- **Core Premise / Anchor Thesis**: The central speculative or controversial topic.
- **Branching Nodes (3–4 Sub-Themes)**:
  - Node A: Personal experience / anecdote.
  - Node B: Weird historical, technological, or primal parallel.
  - Node C: Fringe hypothesis / existential speculation.
- **Evidence Seeds**: 2–3 bizarre factoids to ground the discussion.

#### B. Dynamic Tangent Drift & Snapback
- **Drift Stage 1 (Initial Setup)**: Speaker 1 introduces the core topic.
- **Drift Stage 2 (Associative Leap)**: Speaker 2 latches onto an incidental word or concept, pivoting to an unexpected domain (e.g., from Quantum Computing $\rightarrow$ DMT trips $\rightarrow$ Ancient Egyptian toolmaking).
- **Drift Stage 3 (Deep Riff)**: Both speakers explore the absurd hypothesis with high conviction.
- **Snapback (Re-anchoring)**: Speaker 1 brings the conversation back with an organic pivot ("Wait, how did we get here? Right, the GPU shortage...").

#### C. Multi-Speaker Turn-Taking & Acoustic Realism
- **Natural Backchannels**: Injections of "100%", "Yeah, exactly", "Wait, what?", "Dude...", "That's wild".
- **Turn Length Variance**: Alternating between rapid ping-pong banter (3–8 words) and extended speculative riffs (40–70 words).
- **Laughter Cues & Breathing**: Explicit acoustic stage directions for Gemini 3.1 Flash TTS (`[chuckles]`, `[sighs]`, `[laughs]`, `[whispering]`).

#### D. Craft-Based Style Profiles

1. **Speculative Wonder & Primal Curiosity ("Rogan Style" / `speculative_explorer_podcast`)**:
   - *Rhetorical Mechanism*: Earnest fascination with extreme human performance, fringe science, psychedelics, MMA, and cosmic dread.
   - *Signature Devices*: "Have you ever seen a chimp without hair?", "It's entirely possible", "Jamie, look that up", open-ended existential awe.
   - *Voice Vector*: Curiosity 10/10, Earnestness 9/10, Intensity 8/10, Casual Vernacular 10/10.

2. **Apocalyptic Cynicism & Suburban Chaos ("Tim Dillon Style" / `apocalyptic_satire_podcast`)**:
   - *Rhetorical Mechanism*: Scorched-earth socio-economic rants delivered with high-energy manic certainty.
   - *Signature Devices*: Treating absurd moral bankruptcy as a legitimate business model ("It's a fake business!"), breathless escalation, addressing listeners as accomplices.
   - *Voice Vector*: Cynicism 10/10, Outrage 10/10, Absurdity 9/10, Energy 9/10.

---

### 3.4 Legal & Identity Guardrails

To strictly protect the system and comply with ethical, legal, and intellectual property standards:
1. **Craft & Rhetorical Spines vs. Personal Cloning**:
   - Show definitions are codified around **dramaturgical styles and genre tropes** (`investigative_desk_monologue`, `closer_look_monologue`, `speculative_explorer_podcast`, `apocalyptic_satire_podcast`).
   - Voice synthesis utilizes **standard, licensed Gemini prebuilt TTS voices** (`Charon`, `Orus`, `Puck`, `Fenrir`, `Aoede`, `Kore`, `Enceladus`, `Zephyr`).
   - Reference images and video prompts are conditioned on fictional caricature archetypes or stylized stage sets rather than biometric deepfakes.
2. **Pre-flight Filter Sanitization**:
   - Automated text cleaning replaces trademarked show titles and living celebrity names with generic satirical equivalents (e.g., "HBO" $\rightarrow$ "premium cable network", "Colin Jost" $\rightarrow$ "the anchor").

---

## 4. R2: Multi-Pass Scripting & Dramaturgy Orchestrator

The 3-Pass writers' room loop transforms raw research into razor-sharp comedic scripts:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PASS 1: GROUNDED RESEARCH                       │
│  Gemini 3.7 Flash + Google Search Grounding (`googleSearch: {}`)        │
│  - Gathers verified facts, statistics, obscure details                 │
│  - Extracts 3-5 Incongruous Premise Angles                             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Research Dossier
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     PASS 2: HEAD-WRITER DRAFT & JOKES                  │
│  Gemini 3.7 Flash with High Thinking Level                             │
│  - Applies Show SKILL Rhetorical Spine (Act 1 → Act 2 → Act 3)         │
│  - Injects Rule of Three, Misdirection, Escalating Analogies, Act-Outs │
│  - Maps to strict 8s clip boundaries (Video) or Banter Segments (Audio)│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Structural Draft
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  PASS 3: VOICE PASS & TABLE-READ PRUNE                 │
│  Gemini 3.7 Flash Dramaturgy Critic                                    │
│  - Burrows's Delta stylometric calibration (sentence length, cadence)  │
│  - Table-Read Critique: Scores jokes on Incongruity/Punch (1-10)       │
│  - Kills/replaces flat jokes; enforces punchline-at-end syntax         │
│  - Pre-flight RAI filter validation                                    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Production-Ready Script
                                    ▼
                     To Dual-Modality Media Engine
```

### 4.1 Pass 1: Grounded Research & Premise Seed
- **Model**: `gemini-3.7-flash` with `tools: [{ googleSearch: {} }]`.
- **System Instruction**: Elite investigative comedy researcher.
- **Input**: User topic (freetext / news URL), listener familiarity level (`beginner`, `familiar`, `expert`), user memory bank insights.
- **Output Schema**:
  ```json
  {
    "coreFacts": ["Fact 1", "Fact 2"],
    "obscureDetails": ["Bizarre detail A", "Weird statistic B"],
    "incongruities": [
      {
        "observation": "What is happening",
        "contradiction": "Why it makes no logical sense",
        "comedicPotential": "High"
      }
    ],
    "premiseAngles": [
      { "angleName": "Angle 1", "thesis": "...", "angleType": "absurdist_hypocrisy" }
    ]
  }
  ```

### 4.2 Pass 2: Head-Writer Draft & Joke Construction
- **Model**: `gemini-3.7-flash` with `thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }`.
- **System Instruction**: Head Writer enforcing the Show SKILL rhetorical spine.
- **Input**: Pass 1 Research Dossier + Show SKILL Template (rhetorical spine, target LPM, joke formulas).
- **Execution Rules**:
  - Act 1: Setup thesis + initial incongruity.
  - Act 2: Supporting evidence + 2 escalating analogies + Rule of Three.
  - Act 3: Callback + absurdist conclusion.
  - Segment allocation: Exactly $N$ segments for duration (e.g. 5 segments for 40s video).
- **Output**: Structured beat sheet with draft dialogue and joke annotations (`jokeType`, `setup`, `punchline`, `targetLpm`).

### 4.3 Pass 3: "Sound-Like-Them" Voice Pass & Table-Read Prune
- **Model**: `gemini-3.7-flash`.
- **System Instruction**: Table-Read Showrunner & Dramaturgy Critic.
- **Input**: Pass 2 Structural Draft + Voice Mechanics Vector (cadence, profanity/outrage register, characteristic hooks, syntax rules).
- **Operations**:
  1. *Stylometric Tuning*: Rewrites lines into host-specific rhythm and cadence.
  2. *Joke Pruning Loop*: Evaluates each joke on a 1–10 scale (`incongruityScore`, `punchlineClarity`, `voiceFit`). If any beat scores $< 7.0$, it is rewritten with a punchier alternative.
  3. *Punchline Tightening*: Removes filler words so the punchline lands on the final words of the segment.
  4. *RAI Safety Sanitization*: Checks for prohibited terms that could trigger Veo/TTS safety blocks.
- **Output**: Final `TranscriptSegment[]` ready for video or audio generation.

---

## 5. Architectural Blueprint for Codebase Integration

### 5.1 Proposed Directory & File Structure
```
app/
├── lib/
│   ├── skills/                       # Show SKILL definitions & templates
│   │   ├── types.ts                  # ShowSkill, RhetoricalSpine, VoiceVector types
│   │   ├── desk-investigative.ts     # Archetype A1: John Oliver style
│   │   ├── desk-political-snark.ts   # Archetype A2: Seth Meyers style
│   │   ├── desk-news-anchor.ts       # Archetype A3: Daily Show / Weekend Update style
│   │   ├── desk-variety.ts           # Archetype A4: Fallon style
│   │   ├── podcast-speculative.ts    # Archetype B1: Rogan style
│   │   ├── podcast-apocalyptic.ts    # Archetype B2: Tim Dillon style
│   │   └── index.ts                  # Skill registry & lookup
│   ├── dramaturgy/                   # Multi-pass scripting orchestrator
│   │   ├── types.ts                  # ResearchDossier, ScriptDraft, Critique types
│   │   ├── pass1-research.ts         # Pass 1: Gemini Search Grounding
│   │   ├── pass2-head-writer.ts      # Pass 2: Act beats & joke construction
│   │   ├── pass3-voice-prune.ts      # Pass 3: Voice pass & table-read prune
│   │   └── orchestrator.ts           # 3-Pass pipeline runner
workflows/
├── generate-show.ts                  # Updated durable Vercel Workflow with 3-pass steps
```

### 5.2 TypeScript Interfaces for Show SKILLs & Multi-Pass Pipeline

```typescript
// app/lib/skills/types.ts

export type ShowArchetype = "writers_room_desk" | "conversational_podcast";

export interface RhetoricalAct {
  actNumber: 1 | 2 | 3;
  name: string;
  purpose: string;
  timePercentage: number; // e.g. 0.25, 0.50, 0.25
  requiredElements: Array<"thesis_setup" | "grounded_fact" | "escalating_analogy" | "rule_of_three" | "tag" | "callback" | "act_out" | "call_to_action">;
}

export interface VoiceMechanicsVector {
  outrageLevel: number;      // 1 to 10
  affabilityLevel: number;    // 1 to 10
  cynicismLevel: number;      // 1 to 10
  lexicalDensity: number;     // 1 to 10
  sentenceCadence: "staccato_snappy" | "rolling_breathless" | "conversational_riff" | "academic_deadpan";
  catchphrases: string[];
  signatureConnectors: string[]; // e.g. "Look...", "And the crazy thing is...", "100%"
  ttsVoice: string;           // "Charon" | "Orus" | "Puck" | "Fenrir" | "Aoede" | "Kore"
}

export interface ShowSkill {
  id: string;
  name: string;
  archetype: ShowArchetype;
  showType: "monologue" | "conversation";
  targetLpm: number;          // Laughs per minute (e.g. 4.5)
  rhetoricalSpine: RhetoricalAct[];
  voiceVector: VoiceMechanicsVector;
  hosts: Array<{ name: string; role: "main_host" | "co_host" | "straight_man" | "wildcard"; personality: string }>;
  referenceImageSlug?: string;
  notes: string;
}
```

---

## 6. Features Discovered & Technical Specifications

## Features Discovered
| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | R1 Show SKILL | Archetype A: Investigative Desk Monologue | 3-act rhetorical spine with grounded facts, cascading metaphors, and moral outrage | Topic, Duration, Familiarity | Structured Monologue Script with Act beats | Falls back to generic monologue | `ORIGINAL_REQUEST.md`, `scripts/seed-templates.ts` |
| 2 | R1 Show SKILL | Archetype A: Surgical Political Dissection | High-LPM snappy script with third-person impressions, snarky setups, and self-audits | Topic, Duration | Monologue with rapid-fire tags | Falls back to standard monologue | `ORIGINAL_REQUEST.md`, `workflows/generate-show.ts` |
| 3 | R1 Show SKILL | Archetype A: Satirical News Desk Duo | Dual-anchor alternating dialogue with straight-man / wildcard dynamic and callbacks | Topic, Duration | Dual-speaker dialogue with position cues | Falls back to single speaker | `ORIGINAL_REQUEST.md`, `scripts/seed-templates.ts` |
| 4 | R1 Show SKILL | Archetype A: High-Energy Variety Monologue | Enthusiastic pop-culture monologue with musicality and crowd-friendly punchlines | Topic, Duration | High-affability variety monologue | Falls back to standard monologue | `ORIGINAL_REQUEST.md` |
| 5 | R1 Show SKILL | Archetype B: Speculative Explorer Podcast | Talking-point tree with dynamic tangent drift, ancient/tech parallels, and curious wonder | Topic, Duration (60-300s) | Multi-speaker podcast with backchannels | Falls back to standard conversation | `ORIGINAL_REQUEST.md`, `app/lib/tts.ts` |
| 6 | R1 Show SKILL | Archetype B: Apocalyptic Satirical Podcast | Manic cynical diatribes, absurd economic metaphors, and aggressive turn-taking | Topic, Duration (60-300s) | High-outrage satirical podcast script | Falls back to standard conversation | `ORIGINAL_REQUEST.md` |
| 7 | R1 Legal Safety | Format-Based Voice & Craft Spines | Safe craft templates mapped to prebuilt licensed Gemini TTS voices without living-person likeness cloning | Host name, Style | Licensed voice name (`Charon`, `Orus`, etc.) | Selects random fallback voice | `app/lib/tts.ts`, `ORIGINAL_REQUEST.md` |
| 8 | R2 Dramaturgy | Pass 1: Grounded Research & Premise Seed | Gemini 3.7 Flash + Google Search Grounding to extract verified facts, oddities, and incongruities | Topic string/URL, Memory profile | Grounded Research Dossier JSON | Fallback to internal Gemini knowledge base | `workflows/generate-show.ts`, `app/lib/veo.ts` |
| 9 | R2 Dramaturgy | Pass 2: Head-Writer Joke Construction | High Thinking Level Gemini structuring 3 acts with Rule of Three, misdirection, and act-outs | Research Dossier, Show SKILL | Structural Draft with joke tags & timing | Fallback to unannotated script | `workflows/generate-show.ts` |
| 10 | R2 Dramaturgy | Pass 3: Stylometric Voice Pass | Burrows's Delta stylometric calibration, clause rhythm, and tone tuning | Structural Draft, Voice Vector | Stylized draft with host cadences | Retains Pass 2 draft | `workflows/generate-show.ts` |
| 11 | R2 Dramaturgy | Pass 3: Table-Read Joke Pruning Loop | Critic model scoring jokes 1-10 on Incongruity/Punch, pruning/replacing weak beats (<7) | Stylized draft | Pruned, tightened production script | Keeps existing beat if retry fails | `ORIGINAL_REQUEST.md` |
| 12 | R2 Safety | Pre-flight RAI Sanitization | Text rewriting step replacing potentially filtered names/brands before Veo/TTS generation | Draft lines | Sanitized lines avoiding RAI triggers | Keeps original text with generic fallback | `workflows/generate-show.ts:618-642` |
| 13 | R4 Personalization | Memory Bank Prompt Context Injection | Injects user concept mastery, humor preferences, and recent questions into Pass 1 & Pass 2 | `userId` | Contextual string header for prompts | Falls back to generic prompt context | `app/lib/memory-bank.ts` |
| 14 | Workflow Engine | Vercel Workflow Step Durability | Multi-step execution (`research` → `script` → `media` → `stitch` → `upload`) with resumability | `showId` | `GenerateShowResult` | Updates DB status to `failed`, logs error | `workflows/generate-show.ts` |

---

## 7. Edge Cases & Resilience Behaviors

## Edge Cases
| # | Feature | Input | Observed / Expected Behavior |
|---|---------|-------|-------------------|
| 1 | Pass 1 Research | Obscure or fictional topic not found on Google Search | Search grounding returns 0 search queries; Gemini generates imaginative premise based on internal knowledge with explicit disclosure |
| 2 | Pass 1 Research | News URL behind paywall or 403 Forbidden | URL fetch fails gracefully; Gemini uses the raw URL text and topic title to conduct search grounding query |
| 3 | Pass 2 Joke Construction | Short duration (8s / 1 clip) | Script engine constrains output to exactly 1 high-impact setup + punchline beat (20–25 words), bypassing Act 2/3 extensions |
| 4 | Pass 2 Joke Construction | Max video duration (40s / 5 clips) | Script engine allocates exactly 1 clip for Act 1 setup, 3 clips for Act 2 escalation (Rule of 3 + Callback), and 1 clip for Act 3 payoff |
| 5 | Pass 3 Table-Read Prune | LLM produces a flat/cliché joke (e.g. dad pun) | Critic scores beat $<7.0$; regenerates joke with higher incongruity and tighter punchline syntax |
| 6 | Pass 3 Voice Pass | Host outrage vector is 10/10 but topic is delicate | Voice pass modulates vocabulary to satirical incredulity rather than inappropriate vitriol |
| 7 | Pass 3 Pre-flight Sanitization | Draft contains living politician or celebrity full name | Pre-flight sanitizer substitutes name with satirical descriptive title ("the former governor", "the tech billionaire") before hitting Veo |
| 8 | Multi-Speaker Podcast | Asymmetric speaker talk time | Script engine balances turn-taking based on host roles (`main_host` vs `co_host` / `wildcard`), ensuring natural backchannels |
| 9 | Gemini TTS Synthesis | Multi-speaker script with overlapping speech | Formats multiSpeakerVoiceConfig with distinct prebuilt voices (`Charon` and `Puck`) and natural conversational tags |
| 10 | Workflow Progress Streaming | SSE stream disconnection mid-scripting | Vercel Workflow continues running durably in background; client re-attaches and polls runId on reconnect |

---

## 8. Summary of Recommendations for Implementation Phase

1. **Create Show SKILL Module (`app/lib/skills/`)**:
   - Implement `types.ts` defining `ShowSkill`, `RhetoricalAct`, and `VoiceMechanicsVector`.
   - Implement the 6 full craft templates (John Oliver, Seth Meyers, Daily Show, Fallon, Rogan, Tim Dillon styles) encoded with explicit rhetorical spines and target LPMs.
2. **Implement 3-Pass Dramaturgy Pipeline (`app/lib/dramaturgy/`)**:
   - `pass1-research.ts`: Gemini 3.7 Flash + Google Search Grounding.
   - `pass2-head-writer.ts`: Act beats, escalating analogies, Rule of Three, act-outs.
   - `pass3-voice-prune.ts`: Burrows's Delta stylometric cadence tuning, table-read joke critique & pruning loop, and pre-flight filter sanitization.
3. **Upgrade `workflows/generate-show.ts`**:
   - Replace single-shot `researchStep` and `scriptStep` with durable calls to the 3-pass pipeline.
   - Pass Show SKILL configuration and Memory Bank context into the dramaturgical passes.
4. **Unit Testing Suite (`workflows/generate-show.test.ts` & `app/lib/dramaturgy/*.test.ts`)**:
   - Add unit tests validating rhetorical act beat allocation, joke formula parsing, joke pruning logic, and format-based voice mappings.
