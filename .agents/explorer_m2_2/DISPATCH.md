# Explorer M2-2: Multi-Turn Scene Extensions & Duration Routing

## 2026-08-30T06:14:46Z
Investigate Milestone M2 multi-turn scene extensions and duration routing in `workflows/generate-show.ts`:
1. Formulate the implementation plan for utilizing Omni 1.1's 10-second prior context window (`previous_interaction_id` / `extend: true`) for continuous extensions up to 40s total video length.
2. Verify format duration routing (<=40s video shows vs >40s audio podcast via Gemini 3.1 Flash TTS).
3. Detail how interaction IDs are captured from clip N and passed to clip N+1.

Write your findings to /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/explorer_m2_2/handoff.md and report back via send_message.
