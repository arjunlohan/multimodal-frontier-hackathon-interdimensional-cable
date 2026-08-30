## 2026-08-30T03:00:49Z

You are M2 Worker 1 (Multi-Pass Scripting & Dramaturgy Orchestrator Implementer).
Your working directory is: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/m2_worker_1
Workspace root: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable

Authoritative user request: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/ORIGINAL_REQUEST.md
Master project plan: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/PROJECT.md
Style & rules: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/AGENTS.md
Show SKILL engine: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/app/lib/skills/

Explorer analyses to synthesize:
- Pass 1 Analysis: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/m2_explorer_1/analysis.md
- Pass 2 Analysis: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/m2_explorer_2/analysis.md
- Pass 3 & Workflow Analysis: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/m2_explorer_3/analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Scope & Exclusive Write Ownership:
You own `app/lib/dramaturgy/` directory, `workflows/generate-show.ts`, `app/lib/dramaturgy/dramaturgy.test.ts`, and `workflows/generate-show.test.ts`.

Tasks:
1. Implement `app/lib/dramaturgy/types.ts` and `app/lib/dramaturgy/schemas.ts`:
   - Comprehensive types and Zod schemas for Pass 1 (`ResearchBrief`), Pass 2 (`HeadWriterDraft`, `ComedicBeat`, `PodcastTurn`), Pass 3 (`VoicePrunedScript`, `TableReadCritique`), and master `DramaturgyResult`.
2. Implement `app/lib/dramaturgy/pass1-research.ts`:
   - Gemini 3.7 Flash + Google Search Grounding (`googleSearch: {}`).
   - Extract verified facts, bizarre statistics, and logical incongruity seeds.
   - Formulate 3-5 distinct comedic premise angles with escalation ladders.
   - Provide robust fallback/mocking for tests and offline resilience.
3. Implement `app/lib/dramaturgy/pass2-head-writer.ts`:
   - Consumes selected premise angle, verified research, and active `ShowSkill` from `app/lib/skills/`.
   - Archetype A (Desk Shows): 3-act rhetorical spine, 8-second Veo clip granularity, word budgets (17-23 words/clip), setup-misdirection, rule-of-three, tags, callbacks, visual conditioning prompts.
   - Archetype B (Podcasts): talking point tree traversal, turn-taking, dynamic tangent drift, acoustic cues (`[laughs]`, `[chuckles]`, etc.).
4. Implement `app/lib/dramaturgy/pass3-voice-prune.ts`:
   - Voice tuning: calibrates rhythm, sentence length to `meanSentenceLengthWords`, outrage/affability ratios.
   - Table-read critic evaluation: scores jokes on incongruity and punchiness (1-10 scale), replaces/prunes weak jokes scoring <7.0/10.
   - Pre-flight sanitization for Veo 3.1 RAI safety filters.
5. Implement `app/lib/dramaturgy/orchestrator.ts` and `app/lib/dramaturgy/index.ts`:
   - Orchestrates Pass 1 → Pass 2 → Pass 3 with R4 Memory Bank context injection and progress callbacks.
6. Integrate 3-pass pipeline into `workflows/generate-show.ts`:
   - Update `scriptStep` and `researchStep` to invoke the dramaturgy orchestrator while preserving Vercel Workflow step durability and streaming progress events.
7. Create comprehensive test suite `app/lib/dramaturgy/dramaturgy.test.ts` and update `workflows/generate-show.test.ts`:
   - Test all 3 passes, joke scoring, stylometric verification, RAI sanitization, and workflow execution.
8. Run `npm test` and verify 100% pass rate. Ensure ESLint cleanliness and 0 TypeScript errors.
9. Write your detailed handoff report to `/Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/m2_worker_1/handoff.md`.
10. Send a message to parent when done.
