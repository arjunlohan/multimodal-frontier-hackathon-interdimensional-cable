# Handoff Report: Pass 1 Grounded Research & Premise Seed Architecture

**Agent:** M2 Explorer 1 (Grounded Research & Premise Seed Explorer)  
**Target Module:** `app/lib/dramaturgy/pass1-research.ts`  
**Related Modules:** `app/lib/skills/`, `app/lib/env.ts`, `app/lib/veo.ts`, `workflows/generate-show.ts`  
**Date:** 2026-08-30  

---

## 1. Observation

1. **Existing Baseline Scripting:**
   In `workflows/generate-show.ts:204-208`, research is performed via a generic unconstrained prompt:
   ```typescript
   const researchPrompt = `Research the following topic thoroughly. Provide key facts, recent developments, interesting angles, controversies, and anything a comedy talk show host would need to create funny, informed commentary...`;
   const researchContext = await generateText(researchPrompt, "You are a research assistant for a comedy talk show. Gather comprehensive information that can be turned into entertaining commentary.", true);
   ```
   This outputs unstructured plain text strings into `generatedShows.researchContext`, with no schema validation, no structured incongruity extraction, and no multiple premise angle choices.

2. **Google Gen AI Grounding Support in Codebase:**
   In `app/lib/veo.ts:384-409`:
   `@google/genai` (v1.47.0) is configured with `model: "gemini-3.7-flash"`, `thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }`, and `tools: [{ googleSearch: {} }]`. Grounding metadata is exposed via `response.candidates?.[0]?.groundingMetadata`, containing `webSearchQueries` and `groundingChunks`.

3. **Show SKILL Engine & Contracts:**
   `app/lib/skills/types.ts:68-175` defines two archetypes:
   - `writers_room_desk`: 3-act rhetorical spines, rule-of-three, tags, callbacks, word budgets per 8s clip.
   - `conversational_podcast`: talking point trees, tangent drift config, acoustic tag sets (`[laughs]`, `[incredulous]`).

4. **Environment Variables:**
   `app/lib/env.ts:32-35` exposes `GEMINI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` as optional strings, requiring graceful fallback when unconfigured.

5. **Code Style & Quality Constraints:**
   `AGENTS.md` mandates 2-space indentation, double quotes, semicolons, cuddled braces, strict import ordering with group blank lines, kebab-case file naming, and no direct `process.env`.

---

## 2. Logic Chain

1. **Premise Quality Drives Script Quality (Incongruity-Resolution):**
   Observing that comedy fails when premises are generic (Observation 1), Pass 1 must identify verifiable anchor facts and explicit **Incongruity Seeds** (stated purpose vs actual outcome). Grounded facts provide the factual bedrock for subsequent escalation.
2. **Grounding Metadata Integration:**
   Observing the working `@google/genai` pattern in `app/lib/veo.ts` (Observation 2), Pass 1 can leverage Gemini 3.7 Flash with Google Search Grounding to extract verified facts and live web sources, returning a structured `SearchGroundingMetadata` object with search queries and web citations.
3. **Multi-Angle Comedic Diversity:**
   Different show formats require distinct comedic vectors (Observation 3). Providing 3 to 5 distinct premise angles (`absurdist_escalation`, `hypocrisy_exposure`, `paranoid_wonder`, `surreal_literalism`, `apocalyptic_nihilism`) with explicit `targetArchetypeFit` scores allows the orchestrator to dynamically pair the best premise with the chosen `ShowSkill`.
4. **Resilience & Offline Simulation:**
   Because API keys are optional at build/test time (Observation 4), Pass 1 must incorporate a deterministic mock generator (`createMockResearchBrief`) that produces high-craft mock research briefs with zero network calls when keys are missing or during unit testing.
5. **Contract Seamlessness:**
   A strictly typed `ResearchBrief` with Zod validation (`ResearchBriefSchema`) ensures that Pass 2 (`pass2-head-writer.ts`) and Pass 3 (`pass3-voice-prune.ts`) receive guaranteed schemas, eliminating runtime type errors.

---

## 3. Caveats

1. **API Grounding Quota:** Google Search Grounding on Gemini 3.7 Flash consumes Search Grounding quota; the circuit breaker must catch 429 errors and smoothly degrade to mock briefs without throwing unhandled exceptions.
2. **URL Scraping Scope:** Pass 1 includes a lightweight fetch/HTML-strip for `topicType: "news_link"`; heavy JavaScript-rendered SPA websites may require static text fallback.
3. **No Direct Codebase Modification in Explorer Role:** As an explorer agent, I have designed the complete implementation spec and test plan in `analysis.md` and this handoff, leaving the actual file creation to the M2 Worker agent.

---

## 4. Conclusion

The architecture for Pass 1 (`app/lib/dramaturgy/pass1-research.ts`) is fully specified, typed, and validated:
- **Core Function:** `runPass1Research(input: Pass1ResearchInput): Promise<Pass1ResearchOutput>`
- **Grounding:** Gemini 3.7 Flash + `googleSearch: {}` + `ThinkingLevel.HIGH`.
- **Output:** Fully validated `ResearchBrief` with >=2 `GroundedFact`s, >=2 `IncongruitySeed`s, >=3 `ComedicPremiseAngle`s with 3-step escalation ladders, and complete grounding metadata.
- **Fallback Engine:** Deterministic `createMockResearchBrief` for offline testing and graceful error recovery.
- **Ready for Implementation:** The M2 Worker agent can directly implement `app/lib/dramaturgy/pass1-research.ts` based on the architectural specification in `.agents/m2_explorer_1/analysis.md`.

---

## 5. Verification Method

To verify the implementation once written by the M2 Worker:
1. **Vitest Unit Tests:** Run `npm run test` to verify schema validation, mock generation, angle selection, and fallback resilience.
2. **ESLint Validation:** Run `npm run lint` to ensure strict conformity to 2-space indentation, double quotes, semicolons, cuddled braces, and import ordering.
3. **Next.js Production Build:** Run `npm run build` to verify zero type-checking and bundling errors.
