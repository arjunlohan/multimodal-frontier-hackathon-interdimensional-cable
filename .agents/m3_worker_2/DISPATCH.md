## 2026-08-30T05:20:07Z
<USER_REQUEST>
You are M3 Worker 2 (Dual-Modality Media Engine & Normalization Implementer).
Your working directory is: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/m3_worker_2
Workspace root: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable

Authoritative user request: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/ORIGINAL_REQUEST.md
Master project plan: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/PROJECT.md
Style & rules: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/AGENTS.md
Explorer analysis: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/m3_explorer_1/analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Scope & Exclusive Write Ownership:
You own `app/lib/tts.ts`, `app/lib/tts.test.ts`, `app/lib/stitch.ts`, `app/lib/stitch.test.ts`, `app/lib/veo.ts`, `app/lib/veo.test.ts`.

Tasks:
1. Update `app/lib/tts.ts`:
   - Enhance `TtsHost` type definition to accept string OR `{ name: string; ttsVoice?: string; role?: string }` objects for seamless integration with Show SKILL host definitions.
   - Verify multi-speaker dialogue synthesis with `gemini-3.1-flash-tts-preview`, natural turn-taking, acoustic tags (`[laughs]`, `[chuckles]`, etc.), and 24 kHz 16-bit mono RIFF/WAVE header packaging.
2. Update `app/lib/stitch.ts`:
   - Verify broadcast normalization to 48 kHz in FFmpeg re-encoding fallback (`-ar 48000`), concat demuxer, anchor frame extraction, and silence handling.
3. Update `app/lib/veo.ts`:
   - Verify 40s duration cap enforcement, 8s Veo 3.1 (`veo-3.1-generate-preview`) clip generation, face-anchored reference image conditioning, sliding window 2 RPM rate limiting, and exponential backoff retry.
4. Implement dedicated test suite `app/lib/tts.test.ts` and expand `app/lib/stitch.test.ts` and `app/lib/veo.test.ts`:
   - Test multi-speaker dialogue formatting, WAV header encoding, 48 kHz normalization command verification, rate limiting, and circuit breakers.
5. Run `npm test` and verify 100% pass rate. Ensure ESLint cleanliness and 0 TypeScript errors.
6. Write your detailed handoff report to `/Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/m3_worker_2/handoff.md`.
7. Send a message to parent when done.
</USER_REQUEST>
