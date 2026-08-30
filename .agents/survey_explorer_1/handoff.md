# Handoff Report: Specification Mining for R1 & R2

**Agent**: Survey Explorer 1 (Specification and Architecture Miner)  
**Parent Agent**: 8e00ea42-e736-4534-812a-2e61841833c1  
**Timestamp**: 2026-08-30T02:51:00Z  
**Type**: Hard Handoff (Task Complete)  

---

## 1. Observation

1. **Workflow Structure (`workflows/generate-show.ts`)**:
   - Lines 47–95: `generateShowWorkflow` orchestrates `researchStep`, `scriptStep`, format branch (`audioPodcastSynthesisStep` vs `frameChainAndGenerateClipsStep`), `stitchStep`, and `uploadStep`.
   - Lines 152–215: `researchStep` executes a single Gemini call with `useGoogleSearch = true` to create a general research brief.
   - Lines 221–355: `scriptStep` executes a single Gemini prompt with template host personalities and formats the output into 8-second `TranscriptSegment[]` chunks.
   - Lines 361–416: `audioPodcastSynthesisStep` invokes `generateTts` in `app/lib/tts.ts` with Gemini 3.1 Flash TTS.
2. **Show Templates & Database Schema (`db/schema.ts` & `scripts/seed-templates.ts`)**:
   - `db/schema.ts` (lines 85–95): `showTemplates` table contains `name`, `showType` ("monologue" | "conversation"), `referenceImageUrl`, `hosts` (jsonb), `notes`, `isDefault`.
   - `scripts/seed-templates.ts` (lines 16–64): Seeds three initial shows ("Last Week Tonight with John Oliver", "Late Night with Seth Meyers", "SNL Weekend Update") with free-text personality descriptions and notes, but lacks explicit rhetorical spines, joke density formulas, or stylometric vectors.
3. **Gemini SDK & Model Capabilities (`app/lib/veo.ts`, `app/lib/tts.ts`, `package.json`)**:
   - `package.json` (line 27): `@google/genai: ^1.47.0`.
   - `app/lib/veo.ts` (lines 384–394): Configures `gemini-3.7-flash` with `ThinkingLevel.HIGH` and `tools: [{ googleSearch: {} }]`.
   - `app/lib/tts.ts` (lines 24–36, 151–158): Configures `gemini-3.1-flash-tts-preview` with prebuilt voices (`Charon`, `Orus`, `Puck`, `Fenrir`, `Aoede`, `Kore`, `Enceladus`).
4. **Original Requirements (`.agents/ORIGINAL_REQUEST.md`)**:
   - R1 requires Two-Archetype Modular Show SKILL Engine covering Archetype A (Writers'-Room Desk Shows: Oliver, Meyers, Daily Show, Fallon) and Archetype B (Conversational Podcasts: Rogan, Tim Dillon) with explicit rhetorical spines, LPM targets, and legal/identity safety guardrails.
   - R2 requires a 3-pass writers'-room loop: Pass 1 (Grounded Research & Premise Seed via Gemini Search Grounding), Pass 2 (Head-Writer Draft & Joke Construction via Act Beats/Formulas), Pass 3 ("Sound-Like-Them" Voice Pass & Table-Read Prune via Stylometrics & Critic scoring).
5. **Vitest Test Suite**:
   - `npm run test` ran 4 test files (`workflows/generate-show.test.ts`, `app/lib/stitch.test.ts`, `app/lib/veo.test.ts`, `app/lib/memory-bank.test.ts`) with 26 passing tests.

---

## 2. Logic Chain

1. **Inadequacy of Single-Prompt Scripting**:
   - Observation 1 demonstrates that `scriptStep` currently asks Gemini to simultaneously comprehend research, invent comedic angles, maintain multi-act rhetorical structure, tune character voice, and format 8-second JSON bounds in one generation turn.
   - Grounded in DeepMind FAccT 2024 humor literature, single-prompt humor lacks comedic escalation and fails to kill flat jokes.
   - Therefore, splitting generation into three distinct passes (Pass 1 Research Seed $\rightarrow$ Pass 2 Joke Construction $\rightarrow$ Pass 3 Voice Tuning & Table-Read Prune) directly addresses the root cause of comedic flatness.

2. **Decoupling Craft Spines from Biometric Personas (Legal & Ethical Architecture)**:
   - Observations 2 and 4 highlight the requirement to maintain strict legal and identity safety.
   - By formalizing show definition files (`ShowSkill`) around craft-based dramaturgical spines (`investigative_desk_monologue`, `closer_look_monologue`, `satirical_news_desk`, `variety_monologue`, `speculative_explorer_podcast`, `apocalyptic_satire_podcast`) and mapping them to licensed prebuilt Gemini TTS voices (Observation 3), the system avoids proprietary living-person cloning while achieving authentic late-night and podcast pacing.

3. **Workflow Integration Strategy**:
   - Observation 1 shows that Vercel Workflows is already configured with durable step boundaries.
   - Replacing `researchStep` and `scriptStep` with modular calls to `app/lib/dramaturgy/orchestrator.ts` allows the 3-pass pipeline to execute reliably with fine-grained error recovery and progress updates.

---

## 3. Caveats

- **No Live LLM / Veo API Calls during Exploration**: This exploration examined the static codebase, schemas, and local unit tests; actual Gemini and Veo API calls were mocked in Vitest tests (`app/lib/veo.test.ts`).
- **ESLint Linting Warnings**: `npm run lint` reported existing formatting and console warnings across the codebase; these do not block unit tests (`npm run test` passes 100%), but new code must strictly adhere to the cuddled-brace and import-order rules in `eslint.config.mjs`.

---

## 4. Conclusion

The specification and architecture for R1 and R2 are completely defined and ready for implementation:
1. **R1**: Create `app/lib/skills/` containing typed definitions for Archetype A (Oliver, Meyers, Daily Show, Fallon) and Archetype B (Rogan, Tim Dillon), encoding 3-act rhetorical spines, target LPMs (3.5–6.0), and voice mechanics vectors with licensed Gemini TTS voice mappings.
2. **R2**: Create `app/lib/dramaturgy/` with the 3-pass pipeline (`pass1-research.ts`, `pass2-head-writer.ts`, `pass3-voice-prune.ts`) integrating Google Search Grounding, high thinking levels, stylometric tuning, and table-read joke pruning.
3. Update `workflows/generate-show.ts` and test suite to verify the end-to-end multi-pass flow.

---

## 5. Verification Method

To verify these findings and the architecture documentation:
1. **Inspect Analysis Report**: View `/Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/survey_explorer_1/analysis.md`.
2. **Run Test Suite**: Run `npm run test` from the workspace root (must execute 4 test files and pass all 26 tests).
3. **Verify Show Templates**: Inspect `scripts/seed-templates.ts` and `db/schema.ts` to confirm template schema compatibility.
4. **Verify Google GenAI Integration**: Inspect `app/lib/veo.ts` and `app/lib/tts.ts` to confirm Gemini 3.7 Flash Search Grounding and Gemini 3.1 Flash TTS voice configurations.
