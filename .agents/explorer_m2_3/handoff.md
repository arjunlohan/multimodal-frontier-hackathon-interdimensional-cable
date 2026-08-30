# Explorer M2-3 Handoff: Multimodal Reference Conditioning, RAI Safety Loops & Workflow Tests

## 1. Observation

### 1.1 Multimodal Reference Conditioning (`<IMAGE_REF_0>` .. `<IMAGE_REF_N>`)
- **`app/lib/veo.ts:26-39`**: `VideoClipOptions` interface defines `referenceImages?: string[]` (accepting file paths, slugs like `"john-oliver"`, or base64 data URIs).
- **`app/lib/veo.ts:208-223`**: `buildVeoPrompt` supports prepending `<IMAGE_REF_0>` or custom index lists `<IMAGE_REF_N>`:
  ```typescript
  if (opts.hasImageRef || (opts.imageRefIndices && opts.imageRefIndices.length > 0)) {
    const indices = opts.imageRefIndices && opts.imageRefIndices.length > 0 ? opts.imageRefIndices : [0];
    indices.forEach(idx => tags.push(`<IMAGE_REF_${idx}>`));
  }
  ```
- **`app/lib/veo.ts:229-297`**: `loadReferenceImage` and `resolveReferenceImages` load assets from `assets/reference-images/` (such as `john-oliver.jpeg`, `seth-meyers.jpeg`, `snl-weekend-update.jpeg`), encode to base64, and structure payload as `{ image: { imageBytes, mimeType }, referenceType: VideoGenerationReferenceType.ASSET }`.
- **`app/lib/veo.ts:357`**: `config` passed to `@google/genai` `client.models.generateVideos` includes `referenceImages` and sets `personGeneration: "allow_adult"` when `refCount > 0`.
- **`workflows/generate-show.ts:380,404,427,462`**: Currently extracts `refImageSlug` from `template.referenceImageUrl` and passes it to `generateVideoClip`. However, the prompt generator in `workflows/generate-show.ts:601-632` is a duplicate definition that does not invoke the shared `buildVeoPrompt` from `app/lib/veo.ts` to prepend `<IMAGE_REF_0>` to the generated prompt.

### 1.2 Autonomous RAI Filter Retry Loops & Sanitization
- **`app/lib/veo.ts:78-93`**:
  - `OmniRAIFilterError` inherits from `Error` with `reasons: string[]`.
  - `VeoRAIFilterError` subclasses `OmniRAIFilterError` for backwards compatibility.
- **`app/lib/veo.ts:403-414`**: `callOmniOnce` checks `operation.response?.raiMediaFilteredCount > 0`. When true, it extracts `operation.response?.raiMediaFilteredReasons` and throws `new VeoRAIFilterError(raiReasons)`.
- **`workflows/generate-show.ts:455-506`**:
  - Catches `VeoRAIFilterError` in clip loop (up to `maxRAIRetries = 2`, total 3 attempts).
  - Invokes `reviseSegmentText(segment.text, err.reasons)` to prompt Gemini 3.7 Flash to rewrite the dialogue into a generic equivalent without celebrity/trademark names.
  - Updates DB transcript segments (`db.update(schema.generatedShows).set({ transcriptSegments })`).
  - Gaps observed:
    1. The catch block tests `err instanceof VeoRAIFilterError`. If `OmniRAIFilterError` is thrown directly, `err instanceof VeoRAIFilterError` is false (since `OmniRAIFilterError` is the parent class).
    2. If `segment.visualPrompt` was present, `buildVeoPrompt` prioritizes `segment.visualPrompt` over `segment.text`, meaning the retry would re-send the original blocked visual prompt unless `segment.visualPrompt` is sanitized/cleared upon revision.
    3. `reviseSegmentText` lacks a deterministic fallback if the LLM call fails.
- **`app/lib/dramaturgy/pass3-voice-prune.ts:34-89`**: `sanitizeForVeoRai` pre-filters living celebrity names, network trademarks, and deepfake terms (`"photorealistic identical clone of"` $\to$ `"stylized broadcast caricature in the rhetorical style of"`).

### 1.3 Workflow Test Harnesses
- **`npm test` Execution**: All 13 test files currently pass (305 tests passing in ~834ms).
- **`workflows/generate-show.test.ts`**: Currently only tests pure string manipulation (`buildVeoPrompt`, `sanitizeNotesForVeo`, `parseScriptJson`). It lacks tests for:
  - `<IMAGE_REF_0>` and `<IMAGE_REF_N>` token injection and multi-tag combinations.
  - `reviseSegmentText` prompt formatting, quote stripping, and generic substitution.
  - Autonomous RAI retry execution flow (1st attempt blocked by `OmniRAIFilterError` $\to$ text revised $\to$ 2nd attempt succeeds).
  - Error exhaustion boundary (after 2 retries, fails gracefully).
  - Format duration routing ($\le 40$s video vs $> 40$s podcast).
- **`workflows/workflow-media-challenger.test.ts`**: Contains route branching and prompt sanitization tests, but uses legacy "Veo 3.1" framing and lacks tests for:
  - `<IMAGE_REF_0>` / `<IMAGE_REF_N>` multi-host character conditioning.
  - `OmniRAIFilterError` & `VeoRAIFilterError` error polymorphism.
  - Multi-turn scene extension interaction ID chaining across 40s (5 $\times$ 8s clips).

---

## 2. Logic Chain

### 2.1 Character Reference Conditioning Formulation
1. **Single-Host Monologue Conditioning**:
   - For single-host templates (e.g. `investigative-desk`, `closer-look`, `variety-monologue`), the host image from `assets/reference-images/` is loaded into `referenceImages[0]`.
   - The prompt must start with `<IMAGE_REF_0>`.
   - Gemini Omni 1.1 Flash binds `<IMAGE_REF_0>` to `config.referenceImages[0]` and enforces consistent host facial structure, hair, and wardrobe across all segments.
2. **Multi-Host Dual-Anchor Conditioning**:
   - For multi-host conversation templates (e.g. `satirical-news` / SNL Weekend Update), two reference images are loaded: `[leftHostImage, rightHostImage]`.
   - In segment generation:
     - Left speaker turns tag `<IMAGE_REF_0>`.
     - Right speaker turns tag `<IMAGE_REF_1>`.
     - Dual-anchor wide framing shots tag `<IMAGE_REF_0> <IMAGE_REF_1>`.
   - Combined tag ordering:
     `[<IMAGE_REF_0> ... <IMAGE_REF_N>] [<FIRST_FRAME>] [<LAST_FRAME>] <Description>`
3. **Workflow Unification**:
   - Replace the duplicate `buildVeoPrompt` in `workflows/generate-show.ts` with the unified `buildVeoPrompt` from `app/lib/veo.ts`.
   - When building prompts in `frameChainAndGenerateClipsStep`, supply `{ hasImageRef: Boolean(refImageSlug), imageRefIndices: [0] }`.

### 2.2 Autonomous RAI Filter Retry Loop Formulation
1. **Error Catching**:
   - Check `err instanceof OmniRAIFilterError || err instanceof VeoRAIFilterError || (err as any)?.name === "OmniRAIFilterError" || (err as any)?.name === "VeoRAIFilterError"`.
2. **Self-Healing Revision**:
   - Call `reviseSegmentText(segment.text, err.reasons)`.
   - If `segment.visualPrompt` is present, sanitize it via `sanitizeForVeoRai` / `sanitizeNotesForOmni` or reset it so the revised dialogue takes effect.
   - If `generateText` fails during revision, fall back to deterministic regex sanitization (`sanitizeForVeoRai(segment.text)`).
3. **Transcript Synchronization**:
   - Update `segments[clip.clipIndex]` with the revised text.
   - Write updated segments to Postgres (`generatedShows.transcriptSegments`) so the UI transcript matches the spoken audio synthesized by Gemini Omni 1.1 Flash.
4. **Retry Execution**:
   - Re-attempt `generateVideoClip` / `generateVideoClipInterpolated` with `currentPrompt`.
   - Allow up to `maxRAIRetries = 2` (3 total attempts). If still failing, mark clip status as `failed` and continue or escalate.

### 2.3 Required Test Updates

#### In `workflows/generate-show.test.ts`:
1. **`<IMAGE_REF_N>` prompt construction**:
   - Single reference: `buildVeoPrompt("Beat", "Notes", { hasImageRef: true })` $\to$ contains `<IMAGE_REF_0>`.
   - Multiple references: `buildVeoPrompt("Beat", "Notes", { imageRefIndices: [0, 1] })` $\to$ contains `<IMAGE_REF_0> <IMAGE_REF_1>`.
   - Full tag combination: `{ hasImageRef: true, firstFrame: true, lastFrame: true }` $\to$ `<IMAGE_REF_0> <FIRST_FRAME> <LAST_FRAME> Beat. Notes`.
   - Overload with `TranscriptSegment` and host reference configurations.
2. **Autonomous RAI Filter Revision Loop**:
   - Test `reviseSegmentText` with mocked `generateText` to verify prompt construction, quote stripping, and output sanitization.
   - Test simulated retry loop:
     - First turn throws `OmniRAIFilterError(["Celebrity likeness detected"])`.
     - `reviseSegmentText` returns sanitized line.
     - Second turn succeeds and returns valid `VideoClipResult`.
   - Test retry exhaustion:
     - 3 consecutive `OmniRAIFilterError` throws mark clip as `failed`.
   - Test `OmniRAIFilterError` vs `VeoRAIFilterError` polymorphism.
3. **Show Format Duration Routing**:
   - Verify `checkShowFormat(duration)`: $\le 40$s $\to$ `isAudioPodcast: false`, $> 40$s $\to$ `isAudioPodcast: true`, `null`/`undefined` $\to$ 16s video default.

#### In `workflows/workflow-media-challenger.test.ts`:
1. **Update test descriptions and assertions** from "Veo 3.1" to "Gemini Omni 1.1 Flash".
2. **Multimodal Reference Conditioning Suite**:
   - Verify prompt construction with `<IMAGE_REF_0>` for monologue and `<IMAGE_REF_0> <IMAGE_REF_1>` for dual-anchor desk formats.
   - Verify that reference image file paths and base64 payloads conform to `@google/genai` `VideoGenerationReferenceImage` specs.
3. **RAI Safety Loop & Error Resilience**:
   - Test that `OmniRAIFilterError` and `VeoRAIFilterError` both trigger autonomous retry.
   - Test pre-flight sanitization for clone triggers (`"photorealistic identical clone of"` $\to$ `"face-consistent stylized character"` / `"stylized broadcast caricature"`).
4. **40s Video Scene Extension Sequence**:
   - Test generation of 5 consecutive 8s clips with `previousInteractionId` chaining.

---

## 3. Caveats
1. **Live Gemini API Calls in Tests**: Tests must use Vitest mocks (`vi.mock("@/app/lib/veo")`, `vi.mock("@google/genai")`) rather than live network calls to ensure fast, deterministic CI runs without consuming API quota or triggering real 2 RPM rate limits.
2. **Backwards Compatibility**: Both `OmniRAIFilterError` and `VeoRAIFilterError` must be supported interchangeably across the codebase so existing catch blocks and diagnostic scripts continue to function seamlessly.
3. **Visual Prompt vs Spoken Text Precedence**: If a script segment includes a custom `visualPrompt`, `buildVeoPrompt` uses it. The RAI retry loop must ensure any custom `visualPrompt` is sanitized alongside `segment.text` on retry.

---

## 4. Conclusion
1. Multimodal character conditioning in Gemini Omni 1.1 Flash is achieved by placing `<IMAGE_REF_0>` .. `<IMAGE_REF_N>` tags in the prompt and supplying corresponding images in `config.referenceImages` with `personGeneration: "allow_adult"`.
2. The autonomous RAI filter retry loop must catch `OmniRAIFilterError` (and `VeoRAIFilterError`), invoke `reviseSegmentText` via Gemini 3.7 Flash, sanitize both dialogue and visual prompt, rebuild the prompt, update the Postgres transcript, and retry generation up to 2 times.
3. `workflows/generate-show.test.ts` and `workflows/workflow-media-challenger.test.ts` require comprehensive test coverage for `<IMAGE_REF_N>` tags, multi-tag combinations, RAI retry execution, retry exhaustion, and format duration routing.

---

## 5. Verification Method

### Test Commands
```bash
# 1. Run full unit and integration test suite
npm test

# 2. Run specifically the workflow and challenger tests
npx vitest run workflows/generate-show.test.ts
npx vitest run workflows/workflow-media-challenger.test.ts
npx vitest run app/lib/veo.test.ts

# 3. Verify TypeScript type safety
npx tsc --noEmit
```

### Key Files to Inspect
- `app/lib/veo.ts` (Lines 74-95, 167-223, 272-297, 345-414)
- `workflows/generate-show.ts` (Lines 443-506, 538-567, 601-632)
- `workflows/generate-show.test.ts` (Lines 43-149)
- `workflows/workflow-media-challenger.test.ts` (Lines 78-109, 267-344)
- `app/lib/dramaturgy/pass3-voice-prune.ts` (Lines 34-89)

### Invalidation Conditions
- Any failure in `npm test` or TypeScript compilation (`npx tsc --noEmit`).
- If `<IMAGE_REF_0>` tags are omitted when reference images are configured in video clip options.
- If throwing `OmniRAIFilterError` bypasses the catch block in `generate-show.ts` due to strict subclass checking.
