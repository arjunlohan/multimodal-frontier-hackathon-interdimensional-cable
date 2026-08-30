# Handoff Report: Archetype B & Conversational Podcast Architecture

**Agent**: M1 Explorer 2 (Archetype B & Podcast Architecture Explorer)  
**Date**: 2026-08-30  
**Target Milestone**: M1 (Two-Archetype Modular Show SKILL Engine)  
**Destination Path**: `/Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/m1_explorer_2/handoff.md`  

---

## 1. Observation

1. **Original Request & Project Plan**:
   - `ORIGINAL_REQUEST.md:15` requires: *"Archetype B (Conversational Long-Form Podcasts): Encodes prep-doc generation, talking point trees, dynamic tangent drift, and natural multi-speaker turn-taking for Rogan-style and Tim Dillon-style dialogue."*
   - `ORIGINAL_REQUEST.md:25` states: *"Audio Podcasts (Up to 5 min / 300s): Direct multi-speaker dialogue synthesis using Gemini 3.1 Flash TTS (`gemini-3.1-flash-tts-preview`) with natural backchannels, laughter cues, and turn-taking."*
   - `PROJECT.md:81-110` specifies interface contracts between M1 Show SKILL Engine and M2 Dramaturgy Pipeline.
2. **Current Codebase State**:
   - `app/lib/skills/` directory does not yet exist.
   - `app/lib/tts.ts:132-160` implements `gemini-3.1-flash-tts-preview` with `multiSpeakerVoiceConfig`, mapping host names to prebuilt voices (`Charon`, `Orus`, `Puck`, `Fenrir`, `Aoede`, `Enceladus`, `Kore`).
   - `workflows/generate-show.ts:66-73,361-416` handles long-form podcast routing (`durationSeconds > 40`) via `audioPodcastSynthesisStep`, generating WAV audio and uploading to Mux directly without invoking Veo.
   - `scripts/seed-templates.ts:16-64` seeds three initial templates (John Oliver, Seth Meyers, SNL Weekend Update) in Postgres, but lacks explicit podcast profiles and stylometric vectors.
   - `app/create/constants.ts:9-15` defines audio podcast duration options from 60s (1 min) up to 300s (5 min max).
3. **Repository Rules (`AGENTS.md`)**:
   - ESLint config (`eslint.config.mjs`) enforces 2-space indent, semicolons, double quotes, cuddled braces, strict import ordering (`node:*` $\rightarrow$ external $\rightarrow$ internal), kebab-case filenames, and no direct `process.env`.

---

## 2. Logic Chain

1. **Dramaturgical Distinction**:
   - Monologues (Archetype A) rely on linear 3-act rhetorical progression (Thesis $\rightarrow$ Evidence + Absurdist Analogies $\rightarrow$ Call to Action) with high LPM (3.5–6.0) mapped to 8-second video cuts.
   - Conversational podcasts (Archetype B) operate as non-linear dialogues up to 300 seconds (5 min) requiring **talking point trees**, **associative tangent drift**, and **multi-speaker turn-taking** with acoustic performance tags for Gemini 3.1 Flash TTS.
2. **Computational Humor Grounding (DeepMind FAccT 2024 & Incongruity-Resolution)**:
   - LLMs default to bland agreement and uniform turn length when generating dialogue.
   - To produce professional comedic banter, the schema must enforce **asymmetric host dynamics** (e.g. *Earnest Inquirer* vs *Fringe Theorist*, or *Manic Diatribist* vs *Giggling Sounding Board*) and weighted turn length distributions (backchannels, ping-pong banter, speculative riffs, diatribes).
3. **Tangent Drift State Machine**:
   - A 4-stage drift mechanism (Anchor Setup $\rightarrow$ Associative Leap $\rightarrow$ Deep Riff $\rightarrow$ Organic Snapback) allows natural divergence from the core topic while guaranteeing re-anchoring within `maxDriftDepth` turns using signature snapback phrases.
4. **Data Modeling & Type Safety**:
   - The unified `ShowSkill` schema in `app/lib/skills/types.ts` cleanly houses both `rhetoricalSpine` (Archetype A) and `podcastDynamics` (Archetype B) with complete Zod schemas and TypeScript interfaces.
5. **Concrete Show Profiles**:
   - `podcast-speculative-wonder.ts`: Rogan style (curiosity 10/10, mean sentence length 14, `Fenrir` + `Puck` voices, primal/space/ancient metaphors).
   - `podcast-apocalyptic-satire.ts`: Tim Dillon style (outrage 0.92, mean sentence length 22, `Enceladus` + `Orus` voices, fake business/suburban decay rants).

---

## 3. Caveats

- **Acoustic Cue Interpretation**: `gemini-3.1-flash-tts-preview` parses stage directions like `[laughs]`, `[chuckles]`, and `[sighs]` when placed inline, but excessive or nested brackets can occasionally be read phonetically. The prompt engineering in Pass 3 should enforce simple, single-word acoustic cues.
- **Duration Tuning**: Estimated word-to-second ratios in podcasts vary with host speed (~140–160 words per minute). A 5-minute podcast requires approximately 700–800 words across all turns.
- **Database Schema**: The database `show_templates` table uses JSONB for `hosts` and text for `notes`. The full `ShowSkill` object can be stored or resolved from the in-memory skill registry.

---

## 4. Conclusion

Archetype B is fully specified, mathematically grounded, and architected for clean implementation by the M1 Worker:
- **Files to Create**:
  - `app/lib/skills/types.ts`: Master schemas and TypeScript types.
  - `app/lib/skills/podcast-speculative-wonder.ts`: Speculative wonder profile (Rogan style).
  - `app/lib/skills/podcast-apocalyptic-satire.ts`: Apocalyptic cynical satire profile (Tim Dillon style).
  - `app/lib/skills/registry.ts`: Registry with lookup helpers.
  - `app/lib/skills/index.ts`: Public exports.
- **ESLint Compliance**: Strict 2-space indentation, double quotes, semicolons, kebab-case file names, sorted imports.
- **Downstream Readiness**: Directly feeds Pass 1/2/3 in M2 and Gemini 3.1 Flash TTS multi-speaker synthesis in M3.

---

## 5. Verification Method

To independently verify the implementation:
1. **Schema Validation Test**:
   ```bash
   npx vitest run tests/skills.test.ts # or app/lib/skills/*.test.ts
   ```
   Validate that `ShowSkillSchema.safeParse(podcastSpeculativeWonderSkill).success === true` and `ShowSkillSchema.safeParse(podcastApocalypticSatireSkill).success === true`.
2. **ESLint & TypeScript Typecheck**:
   ```bash
   npm run build
   npx eslint app/lib/skills/
   ```
   Verify 0 ESLint errors and clean compilation.
3. **Seeding Script Execution**:
   ```bash
   npx tsx scripts/seed-templates.ts
   ```
   Verify that podcast templates are successfully seeded into PostgreSQL.
