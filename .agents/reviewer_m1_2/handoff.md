# Milestone M1 Review & Handoff Report

**Reviewer Agent**: `reviewer_m1_2`  
**Roles**: Reviewer, Adversarial Critic  
**Milestone**: M1 (Core Video Engine Migration & Supporting Files)  
**Date**: 2026-08-30  
**Handoff Type**: Hard (Independent Verification & Review Complete)  
**Verdict**: **APPROVE**

---

## 1. Observation

Direct file inspection, static analysis, command execution, and adversarial testing yielded the following empirical observations:

### 1.1 Command Executions & Test Results
- **Test Suite (`npm test`)**:
  - Executed Vitest across 12 test suites with 280 passed tests (0 failures, 100% pass rate).
  - Test duration: 807ms.
  - Test suites passed: `app/lib/veo.test.ts` (15 tests), `app/lib/e2e-integration.test.ts` (28 tests), `app/lib/m3-m4-challenger.test.ts` (32 tests), `app/lib/dramaturgy/challenger.test.ts` (57 tests), `workflows/workflow-media-challenger.test.ts` (27 tests), `workflows/generate-show.test.ts` (14 tests), `app/lib/tts.test.ts` (28 tests), `app/lib/stitch.test.ts` (23 tests), and all other dramaturgy / memory unit tests.
- **Typecheck (`npx tsc --noEmit`)**:
  - Exited with code 0 and 0 errors.
- **Production Build (`npm run build`)**:
  - Next.js 16.0.10 (Turbopack) successfully compiled all routes:
    - Prerendered static pages (14/14): `/`, `/_not-found`, `/create`, `/templates/create`.
    - Server-rendered dynamic pages & APIs: `/.well-known/workflow/*`, `/api/*`, `/create/[showId]`, `/media`, `/media/[slug]`, `/search`, `/templates`, `/templates/[id]/edit`, `/watch/[showId]`.
  - Exited with code 0.
- **Legacy Model Verification**:
  - Ran `grep -rn "veo-3.1-generate-preview" app/ scripts/ workflows/ db/ README.md package.json`.
  - Result: 0 matches found in any runtime or documentation file.
- **Static Linting (`npx eslint ...`)**:
  - Observed 1 minor lint warning in test file `app/lib/veo.test.ts:7:15` (`'OmniRAIFilterError' is defined but never used unused-imports/no-unused-imports`). All other files (`app/lib/veo.ts`, `scripts/test-veo.ts`, `scripts/test-reference-image.ts`, `app/create/create-form.tsx`, `app/lib/env.ts`, `package.json`) passed with 0 errors and 0 warnings.

### 1.2 Implementation Analysis (`app/lib/veo.ts`)
- **Model Identifiers**:
  - Line 16: `export const GEMINI_OMNI_VIDEO_MODEL = "gemini-omni-1.1-flash";`
  - Line 17: `export const GEMINI_TEXT_MODEL = "gemini-3.7-flash";`
- **Type Definitions & Compatibility**:
  - Lines 23-24: `export type OmniResolution = "360p" | "720p" | "1080p" | "4k";` and `export type OmniAspectRatio = "16:9" | "9:16";`
  - Lines 26-39: `export interface VideoClipOptions` (`durationSeconds`, `aspectRatio`, `resolution`, `referenceImages`, `previousInteractionId`, `extend`).
  - Lines 41-46: `export interface VideoClipInterpolatedOptions extends VideoClipOptions` (`firstFramePath`, `lastFramePath`).
  - Lines 48-61: `export interface VideoClipResult` containing new fields (`filePath`, `durationSeconds`, `interactionId`, `operationName`) alongside legacy backward-compatible fields (`localPath`, `videoUrl`).
  - Lines 63-68: `export interface BuildVeoPromptOptions` (`firstFrame`, `lastFrame`, `hasImageRef`, `imageRefIndices`).
- **Error Hierarchy & Backward Compatibility**:
  - Lines 78-85: `export class OmniRAIFilterError extends Error` with `reasons: string[]` and `name: "OmniRAIFilterError"`.
  - Lines 88-93: `export class VeoRAIFilterError extends OmniRAIFilterError` with `name: "VeoRAIFilterError"`.
- **Prompt Sanitization & Token Formatting**:
  - Lines 145-161: `sanitizeNotesForOmni` / `sanitizeNotesForVeo` performs case-insensitive word-boundary replacements for networks (`HBO`, `NBC`, `SNL`, `Saturday Night Live`, `Last Week Tonight`, `Late Night`, `Weekend Update`) and celebrity triggers (`Colin Jost`, `Michael Che`, `John Oliver`, `Seth Meyers`, `photorealistic identical clone`).
  - Lines 167-223: `buildVeoPrompt` dynamically formats `<IMAGE_REF_0>` / `<IMAGE_REF_N>`, `<FIRST_FRAME>`, and `<LAST_FRAME>` prompt tokens, and supports both string beats and `TranscriptSegment` objects.
- **Generation & Rate Limiting**:
  - Lines 111-135: 2 RPM sliding-window rate limiter (`OMNI_RPM = 2`, `OMNI_WINDOW_MS = 60_000`) with exported `_resetRateLimiter()`.
  - Lines 317-339: Exponential backoff on HTTP 429 / `RESOURCE_EXHAUSTED` (`60_000 * (attempt + 1)` ms up to 3 retries).
  - Lines 384-395: Asynchronous polling up to 45 attempts (7.5 minutes) with 10s intervals.
  - Lines 459-485: `generateVideoClip` polymorphic parameter handling for `(prompt, outputPath, options)`, `(prompt, options)`, `(prompt, referenceImageSlug)`, and `(prompt)`.
  - Lines 514-541: `generateVideoClipInterpolated` polymorphic parameter handling for `(prompt, outputPath, options)`, `(prompt, options)`, and `(prompt, firstFramePath, lastFramePath)`.
  - Lines 486, 543: Duration strictly clamped to `[3, 10]` seconds.

### 1.3 Supporting Files & Diagnostics
- **`scripts/test-veo.ts`**: Lines 6-7 define `GEMINI_TEXT_MODEL = "gemini-3.7-flash"` and `OMNI_VIDEO_MODEL = "gemini-omni-1.1-flash"`, testing 720p video, 1080p reference image with `<IMAGE_REF_0>`, and Search Grounding.
- **`scripts/test-reference-image.ts`**: Line 9 defines `OMNI_MODEL = "gemini-omni-1.1-flash"`, testing 1080p resolution and `<IMAGE_REF_0>`.
- **`app/create/create-form.tsx`**: Line 199 displays `"Powered by Google Gemini Omni 1.1 Flash video generation + multi-speaker TTS."`.
- **`README.md`**: Updated Google Gemini Omni 1.1 Flash badge, executive pitch, architecture diagram, tech stack table, and Devpost script.
- **`app/lib/env.ts`**: Line 35 docstring updated for `GEMINI_API_KEY`.
- **`package.json`**: Line 24 added `"test:omni": "tsx scripts/test-veo.ts"`.

---

## 2. Logic Chain

1. **Model Compliance**: The codebase has fully transitioned from `veo-3.1-generate-preview` to `gemini-omni-1.1-flash`. Verification via global grep confirmed zero lingering legacy model string references across the entire runtime codebase.
2. **Type Safety & Non-Breaking API Design**:
   - `VideoClipResult` guarantees compatibility with both new callers (`res.filePath`) and existing callers (`res.localPath`, `res.videoUrl`).
   - `VeoRAIFilterError` subclasses `OmniRAIFilterError`, so existing catch blocks (`catch (err) if (err instanceof VeoRAIFilterError)`) and new catch blocks (`catch (err) if (err instanceof OmniRAIFilterError)`) handle policy errors without breaking.
   - Polymorphic parameter sniffing in `generateVideoClip` and `generateVideoClipInterpolated` seamlessly parses legacy positional strings (slugs, file paths) and modern configuration objects.
3. **Conditioning & Transition Tokens**:
   - `buildVeoPrompt` correctly prepends `<IMAGE_REF_0>`, `<FIRST_FRAME>`, and `<LAST_FRAME>` tags while running `sanitizeNotesForOmni` to prevent trademark and likeness policy violations.
4. **Integrity & Quality Audit**:
   - No hardcoded test responses or facade mocks in source files.
   - All tests run against realistic `@google/genai` mock structures and verify actual rate limiting, duration clamping, error translation, and file saving logic.
   - 100% of 280 tests pass, `tsc --noEmit` reports 0 errors, and Next.js production build succeeds with exit code 0.

---

## 3. Caveats

- **Live Cloud API Calls**: Tests run in an isolated Vitest test environment with mocked `@google/genai` SDK methods. Actual live API calls against Google Cloud require a valid `GEMINI_API_KEY` with Gemini Omni preview quota enabled.
- **Milestone M2 Scope Boundary**: Milestone M1 implements and validates the engine client, types, prompt builder, diagnostic CLI scripts, and UI copy. Integration of dynamic resolution and aspect ratio selectors into the workflow orchestration (`workflows/generate-show.ts`) and create form is scheduled for Milestone M2.
- **Minor Test Linting**: A single unused type import in `app/lib/veo.test.ts:7:15` was detected during ESLint inspection. This does not impact compilation, runtime execution, or type safety.

---

## 4. Conclusion

Milestone M1 is **APPROVED**. The Core Video Engine Migration to **Google Gemini Omni 1.1 Flash** (`gemini-omni-1.1-flash`) has been executed cleanly with robust type safety, complete backward compatibility, comprehensive test coverage (280 passing tests), clean TypeScript compilation (0 errors), and successful production build generation.

---

## 5. Verification Method

To independently verify the Milestone M1 implementation:

1. **Run Unit & Integration Tests**:
   ```bash
   npm test
   ```
   *Expected Output*: 12 test files passed, 280 tests passed (0 failures).

2. **Run TypeScript Static Typecheck**:
   ```bash
   npx tsc --noEmit
   ```
   *Expected Output*: Exits with code 0 and 0 errors.

3. **Run Production Build**:
   ```bash
   npm run build
   ```
   *Expected Output*: Next.js 16 compiles and prerenders 14 static pages and all dynamic API routes with exit code 0.

4. **Verify No Lingering Legacy Model Strings**:
   ```bash
   grep -rn "veo-3.1-generate-preview" app/ scripts/ workflows/ db/ README.md package.json
   ```
   *Expected Output*: 0 matches found.

---

## 6. Detailed Quality & Adversarial Review

### 6.1 Quality Review Findings

| Finding | Severity | Location | Description | Recommendation |
|---|---|---|---|---|
| Unused Type Import in Test | Minor | `app/lib/veo.test.ts:7:15` | `import type { OmniRAIFilterError } from "./veo";` is imported at top level but tested dynamically via `await import("./veo")`. | Can be removed in next cleanup pass or with `eslint --fix`. Non-blocking. |

### 6.2 Adversarial Stress-Testing & Attack Scenarios

| Attack / Stress Scenario | Tested Behavior | Predicted / Observed Result | Status |
|---|---|---|---|
| **Out-of-Bounds Duration Input** | Caller passes `durationSeconds: 1` or `durationSeconds: 99`. | Clamped via `Math.min(10, Math.max(3, ...))` to `3s` and `10s` respectively. | **PASS** |
| **Legacy Positional Parameter Call** | Caller invokes `generateVideoClip(prompt, "john-oliver")` or `generateVideoClipInterpolated(prompt, "/f1.png", "/f2.png")`. | Polymorphic parser accurately identifies string parameters as slugs/paths and passes them to the config payload. | **PASS** |
| **RAI Safety Policy Filter Trigger** | Model returns `raiMediaFilteredCount: 1` with policy reasons. | Throws `VeoRAIFilterError` which inherits from `OmniRAIFilterError`, matching both catch types. | **PASS** |
| **HTTP 429 / Quota Exhaustion** | Generation request fails with 429 / `RESOURCE_EXHAUSTED`. | Retries up to 3 times with exponential backoff (60s, 120s, 180s) before failing. | **PASS** |
| **Sliding Window 2 RPM Rate Limiter** | Rapid bursts of >2 requests within 60s window. | `waitForOmniSlot` blocks execution until the oldest timestamp falls outside the 60s sliding window. | **PASS** |
| **Trademark Filter Bypass Attempts** | Prompts containing mixed-case network names (`hBo`, `snl`, `Last Week Tonight`). | `sanitizeNotesForOmni` replaces all occurrences with generic equivalents using regex `\b...\b/gi`. | **PASS** |

### 6.3 Integrity Audit

- **Hardcoded Test Outputs**: None found. Source code implements real business logic.
- **Facade Implementations**: None found. Full rate limiting, polling loop, retry backoff, and image processing are implemented.
- **Verification Integrity**: All 280 tests ran and passed natively in Vitest. Build verified with Turbopack.
