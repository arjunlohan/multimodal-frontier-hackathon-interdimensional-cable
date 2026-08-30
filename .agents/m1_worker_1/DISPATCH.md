## 2026-08-30T02:53:40Z

You are M1 Worker 1 (Two-Archetype Modular Show SKILL Engine Implementer).
Your working directory is: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/m1_worker_1
Workspace root: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable

Authoritative user request: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/ORIGINAL_REQUEST.md
Master project plan: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/PROJECT.md
Style & rules: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/AGENTS.md
Explorer analyses to synthesize:
- Archetype A Analysis: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/m1_explorer_1/analysis.md
- Archetype B Analysis: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/m1_explorer_2/analysis.md
- Guardrails & Registry Analysis: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/m1_explorer_3/analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Scope & Exclusive Write Ownership:
You own `app/lib/skills/` directory, `scripts/seed-templates.ts`, and `app/lib/skills/skills.test.ts`.

Tasks:
1. Implement `app/lib/skills/types.ts` and `app/lib/skills/schemas.ts` defining rich types and Zod schemas for ShowSkill, RhetoricalSpine, VoiceMechanics, HostSkillConfig, TalkingPointTree, TangentDriftConfig, etc.
2. Implement `app/lib/skills/guardrails.ts`:
   - Enforce craft and format spines over biometric living-person cloning.
   - Map strictly to licensed Google Cloud Gemini TTS voices (`Charon`, `Orus`, `Puck`, `Fenrir`, `Aoede`, `Kore`, `Enceladus`).
   - Satirical disclaimer generators and verification methods.
3. Implement Archetype A Show SKILLs (Writers'-Room Desk Shows):
   - `app/lib/skills/investigative-desk.ts` (John Oliver style - Investigative outrage, 3-act thesis/evidence/analogy/CTA, rule-of-three, tags, LPM ~4.2, Charon voice)
   - `app/lib/skills/closer-look.ts` (Seth Meyers style - Surgical snark, escalating analogies, LPM ~5.0, Orus voice)
   - `app/lib/skills/satirical-news.ts` (Daily Show / SNL Weekend Update style - Dual anchor punchy satirical news desk, LPM ~5.5, Charon + Puck voices)
   - `app/lib/skills/variety-monologue.ts` (Fallon style - Affable variety monologue, games/props/crowd play, LPM ~4.5, Aoede voice)
4. Implement Archetype B Show SKILLs (Conversational Long-Form Podcasts):
   - `app/lib/skills/speculative-podcast.ts` (Rogan style - Speculative wonder, talking point trees, dynamic tangent drift, conversational acoustic cues, Fenrir + Puck voices)
   - `app/lib/skills/apocalyptic-satire.ts` (Tim Dillon style - Apocalyptic cynical satire, explosive rants, dynamic derailment, Enceladus + Orus voices)
5. Implement `app/lib/skills/registry.ts`, `app/lib/skills/db-adapter.ts`, and `app/lib/skills/index.ts`:
   - Provide clean lookups by id, slug, name, or archetype.
   - Provide DB template adapters to serialize ShowSkill into `db/schema.ts` `showTemplates` records.
6. Update `scripts/seed-templates.ts` to use the unified Show SKILL registry.
7. Create comprehensive test suite `app/lib/skills/skills.test.ts` testing all archetypes, schemas, validation, LPM/sentence-length bounds, guardrails, registry lookups, and DB adapters.
8. Run `npm test` and ensure all tests pass (0 failures). Ensure strict adherence to `@antfu/eslint-config` formatting (2-space indent, semicolons, import sorting).
9. Write your detailed handoff report to `/Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/m1_worker_1/handoff.md`.
10. Send a message to parent when done.
