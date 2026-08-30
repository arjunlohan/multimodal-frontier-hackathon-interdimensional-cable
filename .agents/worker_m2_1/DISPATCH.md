## 2026-08-30T06:17:14Z
You are worker_m2_1.
Your working directory is: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/worker_m2_1
Master project file: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/PROJECT.md
Original request file: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/ORIGINAL_REQUEST.md

Read the M2 Explorer handoff reports before implementing:
- /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/explorer_m2_1/handoff.md
- /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/explorer_m2_2/handoff.md
- /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/explorer_m2_3/handoff.md

You have exclusive write ownership over:
- workflows/generate-show.ts
- workflows/generate-show.test.ts
- workflows/workflow-media-challenger.test.ts

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. An auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Tasks for Milestone M2 (Transitions, Extensions & Reference Conditioning):
1. In `workflows/generate-show.ts`:
   - Import `buildVeoPrompt`, `OmniRAIFilterError`, `VeoRAIFilterError`, `OmniResolution`, `OmniAspectRatio`, `VideoClipOptions`, `VideoClipInterpolatedOptions`, `VideoClipResult` from `@/app/lib/veo`.
   - Implement Dynamic Rolling Tail-Frame Chaining in `frameChainAndGenerateClipsStep`:
     - When `show.useFrameChaining` is active, generate anchor clip with `<IMAGE_REF_0>` and extract initial frame at 0s (`currentFirstFramePath`) and anchor last frame at 7.5s (`anchorLastFramePath`).
     - For each content clip $i$:
       - Set `hasFirstFrame = Boolean(show.useFrameChaining && currentFirstFramePath)` and `hasLastFrame = Boolean(show.useFrameChaining && isLastClip && anchorLastFramePath)`.
       - Build prompt using `buildVeoPrompt` with `{ firstFrame: hasFirstFrame, lastFrame: hasLastFrame, hasImageRef: Boolean(refImageSlug), imageRefIndices: [0], notes: template.notes, showType: template.showType }`.
       - If frame conditioning is active, call `generateVideoClipInterpolated(currentPrompt, { firstFramePath: currentFirstFramePath, lastFramePath: hasLastFrame ? anchorLastFramePath : undefined, referenceImages: refImageSlug ? [refImageSlug] : undefined, durationSeconds: clip.durationSeconds ?? 8, previousInteractionId: lastInteractionId, extend: Boolean(lastInteractionId) })`.
       - If not frame conditioning, call `generateVideoClip(currentPrompt, { referenceImages: refImageSlug ? [refImageSlug] : undefined, durationSeconds: clip.durationSeconds ?? 8, previousInteractionId: lastInteractionId, extend: Boolean(lastInteractionId) })`.
       - After clip $i$ succeeds, capture `lastInteractionId = result.interactionId` and extract tail frame at `(clip.durationSeconds ?? 8) - 0.5`s as `currentFirstFramePath` for clip $i+1$.
     - Track all temporary frame PNGs and clip MP4s and clean up via `stitch.cleanupTempFiles` upon completion or error.
   - Implement Autonomous RAI Safety Retry Loop:
     - Catch `err instanceof OmniRAIFilterError || err instanceof VeoRAIFilterError || (err as any)?.name === "OmniRAIFilterError" || (err as any)?.name === "VeoRAIFilterError"`.
     - In retry block (up to 2 retries), call `reviseSegmentText(segment.text, filterReasons)` using `gemini-3.7-flash`, sanitize dialogue and visualPrompt, update Postgres transcript (`generatedShows.transcriptSegments`), rebuild prompt with active frame tags, and retry generation while preserving `lastInteractionId`.
   - Maintain format duration routing: `<= 40`s video show vs `> 40`s audio podcast up to 5m (`gemini-3.1-flash-tts-preview`).
2. In `workflows/generate-show.test.ts` & `workflows/workflow-media-challenger.test.ts`:
   - Update tests to validate rolling frame chaining, `<FIRST_FRAME>` / `<LAST_FRAME>` tags, `<IMAGE_REF_0>` references, `OmniRAIFilterError` / `VeoRAIFilterError` retry handling, 40s scene extensions, and duration routing.
3. Verify your implementation:
   - Run `npm test` (all test suites must pass).
   - Run `npx tsc --noEmit` (0 TypeScript errors).

Write your completion report to /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable/.agents/worker_m2_1/handoff.md and report back via send_message.
