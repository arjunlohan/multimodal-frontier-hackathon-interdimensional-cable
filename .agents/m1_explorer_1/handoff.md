# Handoff Report: Archetype A & Desk Show Architecture (`app/lib/skills/`)

**Agent**: M1 Explorer 1 (Archetype A & Desk Show Architecture Explorer)  
**Date**: 2026-08-30  
**Type**: Hard (Task Complete)  
**Destination Path**: `.agents/m1_explorer_1/handoff.md`

---

## 1. Observation

1. **Existing Codebase State**:
   - `app/lib/skills/` directory does not currently exist (`find_by_name` in `app/lib` returned 17 files, none in `skills/`).
   - Current show generation in `workflows/generate-show.ts` (lines 257–306) utilizes a single-turn prompt with unvalidated, flat host strings from `db/schema.ts` (`showTemplates`).
   - `db/schema.ts` (lines 85–95) defines `showTemplates` with columns `id`, `name`, `showType`, `referenceImageUrl`, `hosts`, `notes`, `isDefault`, lacking explicit comedic metrics (LPM, rhetorical spines, stylometric vectors, joke tags).
   - In `app/lib/tts.ts` (lines 24–35), licensed Gemini TTS voices are mapped (`"John Oliver": "Charon"`, `"Seth Meyers": "Orus"`, `"Colin Jost": "Charon"`, `"Michael Che": "Puck"`, fallback list: `["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Enceladus"]`).
   - In `package.json` (lines 48–69), dependencies include `zod: "^4.1.13"`, `@google/genai: "^1.47.0"`, `@antfu/eslint-config: "^6.6.1"`, `vitest: "^4.1.2"`.

2. **Project Specification & Style Rules**:
   - `PROJECT.md` (lines 79–110) mandates `ShowSkill` contract with `rhetoricalSpine`, `voiceMechanics`, `hosts`, and `laughPerMinuteTarget`.
   - `ORIGINAL_REQUEST.md` (§R1) mandates Archetype A encoding multi-act rhetorical spines (Thesis → Supporting Evidence + Absurdist Analogies → Conclusion/CTA), Rule-of-Three, tags, callbacks, and LPM joke density formulas for John Oliver, Seth Meyers, Satirical News Desk (Daily Show / Weekend Update), and Fallon.
   - `AGENTS.md` & `eslint.config.mjs` mandate 2-space indentation, semicolons, double quotes, kebab-case filenames, and strict import sorting (`perfectionist/sort-imports`).

---

## 2. Logic Chain

1. **Premise 1 (Rhetorical Structure)**:
   - Writers'-room desk comedy requires a structured 3-act spine:
     - Act 1 (20–25% duration): Factual baseline setup + Grounded Incongruity Hook.
     - Act 2 (50–60% duration): Supporting Evidence + Escalating Absurdist Analogies (Fact-Analogy loop, Rule-of-Three, Tags, Callbacks, Act-outs).
     - Act 3 (20–25% duration): Synthesis, Theatrical Payoff & Call-to-Action.
   - Grounded in Incongruity-Resolution Theory (Suls 1972) and DeepMind FAccT 2024 findings, which prove LLMs need grounded real-world incongruities and escalating analogies to avoid flat puns.

2. **Premise 2 (Mathematical Constraints & LPM Formulas)**:
   - Broadcast speech velocity is $\approx 150\text{ wpm} = 2.5\text{ words/sec}$.
   - Video shows are generated in 8-second clips ($T_{\text{clip}} = 8.0\text{s}$), dictating a word budget of $18 - 24\text{ words}$ per clip.
   - Laughs-Per-Minute ($\text{LPM} = \frac{N_{\text{laughs}}}{T_{\text{sec}} / 60}$) ranges:
     - John Oliver (`investigative-desk`): 3.5 – 4.8 LPM (high semantic density, cascading similes).
     - Seth Meyers (`closer-look`): 4.5 – 5.8 LPM (staccato snark, rapid tags).
     - Satirical News Desk (`satirical-news-desk`): 5.0 – 6.5 LPM (tight headline twists, dual ping-pong).
     - Fallon Variety (`variety-monologue`): 4.2 – 5.5 LPM (accessible puns, high affability).

3. **Premise 3 (Legal & Identity Guardrails)**:
   - Show definitions are decoupled from proprietary biometric cloning by defining them as dramaturgical genre craft archetypes (`investigative-desk`, `closer-look`, `satirical-news-desk`, `variety-monologue`).
   - Voice synthesis strictly uses prebuilt licensed Google Gemini TTS voices (`Charon`, `Orus`, `Puck`, `Aoede`).

4. **Inference (Architecture & Schema Design)**:
   - A modular TypeScript + Zod architecture under `app/lib/skills/` cleanly isolates `types.ts`, `archetype-a.ts`, individual profiles (`profiles/*.ts`), and `registry.ts`.
   - A comprehensive test suite (`app/lib/skills/skills.test.ts`) verifies schema validation, 3-act spine completeness, LPM bounds, and word-budget calculation across all durations (8s to 40s).

---

## 3. Caveats

- **No Caveats on Archetype A**: Archetype A scope is fully covered.
- **Archetype B Separation**: Conversational long-form podcasts (Rogan, Tim Dillon styles, prep-doc trees, tangent drift) are explored by M1 Explorer 2.
- **Dramaturgy Engine Separation**: The 3-pass execution engine (`app/lib/dramaturgy/`) is slated for Milestone M2 and will consume the `ShowSkill` data structures defined here.

---

## 4. Conclusion

The complete architectural blueprint, TypeScript interfaces, Zod validation schemas, word-budget algorithms, and 4 show profiles for Archetype A have been formulated and documented in `.agents/m1_explorer_1/analysis.md`. 

The Worker can immediately implement these files in `app/lib/skills/`:
1. `app/lib/skills/types.ts`
2. `app/lib/skills/archetype-a.ts`
3. `app/lib/skills/profiles/investigative-desk.ts`
4. `app/lib/skills/profiles/closer-look.ts`
5. `app/lib/skills/profiles/satirical-news-desk.ts`
6. `app/lib/skills/profiles/variety-monologue.ts`
7. `app/lib/skills/registry.ts`
8. `app/lib/skills/skills.test.ts`
9. `app/lib/skills/index.ts`

---

## 5. Verification Method

Once implemented by the Worker, verify independently using:
1. **Vitest Unit Tests**:
   ```bash
   npx vitest run app/lib/skills/skills.test.ts
   ```
   *Expected result*: 6 passing test cases verifying schema parsing, 3-act total fraction $= 1.0$, LPM bounds, licensed TTS voices, clip word budgets, and registry lookups.
2. **ESLint Validation**:
   ```bash
   npm run lint
   ```
   *Expected result*: 0 errors, full compliance with import sorting, 2-space indentation, and kebab-case file naming.
3. **TypeScript Build Check**:
   ```bash
   npx tsc --noEmit
   ```
   *Expected result*: 0 type errors.
