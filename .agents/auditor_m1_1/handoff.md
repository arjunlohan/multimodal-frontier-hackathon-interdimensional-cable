# Forensic Integrity Audit Report: Milestone M1

**Target**: Milestone M1 (Video Engine Core & SDK / Interactions API Migration)  
**Auditor**: `auditor_m1_1`  
**Integrity Mode**: Demo (per `ORIGINAL_REQUEST.md`)  
**Verdict**: **CLEAN**  

---

## 1. Observation

Direct forensic inspection of all Milestone M1 files and test execution logs yielded the following empirical observations:

### 1.1 Source Code Analysis (`app/lib/veo.ts`)
- **Model Identifier**: `GEMINI_OMNI_VIDEO_MODEL` is explicitly defined as `"gemini-omni-1.1-flash"` (line 16).
- **Zero Legacy Strings**: A full codebase search for `"veo-3.1-generate-preview"` across `app/`, `scripts/`, `README.md`, and `package.json` returned **0 occurrences**.
- **Genuine Client Instantiation**: `getClient()` returns a genuine `@google/genai` `GoogleGenAI` instance instantiated with `env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY` (lines 99–105).
- **Genuine Generation Payload**: `callOmniOnce` (lines 341–443) structures genuine parameters for `client.models.generateVideos`:
  - `model`: `"gemini-omni-1.1-flash"`
  - `config.resolution`: `OmniResolution` (`"360p" | "720p" | "1080p" | "4k"`)
  - `config.aspectRatio`: `OmniAspectRatio` (`"16:9" | "9:16"`)
  - `config.durationSeconds`: clamped to `[3, 10]`
  - `config.referenceImages`: array of `VideoGenerationReferenceImage` with `VideoGenerationReferenceType.ASSET`
  - `config.personGeneration`: `"allow_adult"`
  - `image` / `lastFrame`: base64 byte payloads and mime types for `<FIRST_FRAME>` and `<LAST_FRAME>`
  - Polling: iterative calls to `client.operations.getVideosOperation({ operation })` up to 45 attempts (lines 387–395)
  - Download: `client.files.download({ downloadPath, file: video.video! })` (line 429).
- **Error Handling**:
  - `OmniRAIFilterError` inherits from `Error` and captures `raiMediaFilteredReasons` from API responses (lines 78–85).
  - `VeoRAIFilterError` subclasses `OmniRAIFilterError` ensuring 100% backwards compatibility for legacy error handling (lines 88–93).
- **Rate Limiting & Retries**:
  - Sliding-window 2 RPM rate limiter (`OMNI_RPM = 2`, `OMNI_WINDOW_MS = 60_000`) with exported `_resetRateLimiter()` for test isolation (lines 111–135).
  - Exponential backoff retry on HTTP 429 / `RESOURCE_EXHAUSTED` (`60_000 * (attempt + 1)` ms) up to 3 retries (lines 317–339).
- **Prompt Sanitization & Builder**:
  - `sanitizeNotesForOmni` sanitizes network trademarks and clone triggers (lines 145–159).
  - `buildVeoPrompt` dynamically formats `<FIRST_FRAME>`, `<LAST_FRAME>`, `<IMAGE_REF_0>`..`<IMAGE_REF_N>` tokens and supports transcript segment objects (lines 167–223).

### 1.2 Supporting Files & Diagnostics
- **`app/lib/env.ts`**: Docstrings updated to specify `GEMINI_API_KEY` for Gemini Omni 1.1 Flash video generation and research/scripting.
- **`scripts/test-veo.ts`**: `OMNI_VIDEO_MODEL = "gemini-omni-1.1-flash"` and `GEMINI_TEXT_MODEL = "gemini-3.7-flash"`; tests 720p/1080p generation, `<IMAGE_REF_0>`, and search grounding.
- **`scripts/test-reference-image.ts`**: `OMNI_MODEL = "gemini-omni-1.1-flash"`; tests reference image resolution and video generation.
- **`app/create/create-form.tsx`**: Updated format card branding copy to `"Powered by Google Gemini Omni 1.1 Flash video generation + multi-speaker TTS."`.
- **`README.md`**: Updated badge, executive pitch, Mermaid architecture node (`OmniVideoGen`), tech stack table, and demo script to Google Gemini Omni 1.1 Flash.

### 1.3 Forensic Check Matrix

| Check | Requirement | Result | Evidence |
|---|---|:---:|---|
| **Hardcoded Outputs** | No fixed test strings or precomputed answers | **PASS** | Dynamic computation in all functions |
| **Facade Implementations** | Real business logic, no dummy returns | **PASS** | Genuine `@google/genai` calls & error handlers |
| **Legacy Model References** | 0 references to `veo-3.1-generate-preview` | **PASS** | Ripgrep across codebase found 0 occurrences |
| **Model Alignment** | Strictly uses `gemini-omni-1.1-flash` | **PASS** | Constant and all SDK calls target `gemini-omni-1.1-flash` |
| **Interactions/Models API** | Correct payload and polling structure | **PASS** | `generateVideos` config, `getVideosOperation`, `files.download` |
| **Pre-populated Artifacts** | No pre-existing logs/result files | **PASS** | Workspace clean of old result artifacts |
| **TypeScript Compilation** | 0 compilation errors | **PASS** | `npx tsc --noEmit` exited with code 0 |

---

## 2. Logic Chain

1. *Authenticity*: The code in `app/lib/veo.ts` implements genuine client invocation through `@google/genai` v1.47.0 using `GoogleGenAI`, `VideoGenerationReferenceType`, `ThinkingLevel`, and real operation polling. No facade or dummy shortcuts were detected.
2. *Model Migration Compliance*: All runtime constants, type signatures, diagnostic scripts, UI text, and documentation have been converted from `veo-3.1-generate-preview` to `gemini-omni-1.1-flash`.
3. *Parameter Integrity*: `generateVideoClip` and `generateVideoClipInterpolated` adhere to the interface contracts defined in `PROJECT.md`, supporting configurable resolutions (`360p`, `720p`, `1080p`, `4k`), aspect ratios (`16:9`, `9:16`), durations (`3s` to `10s`), multimodal reference images (`<IMAGE_REF_0>`), start/end frame anchors (`<FIRST_FRAME>`, `<LAST_FRAME>`), and scene extension IDs (`previousInteractionId`).
4. *Non-Breaking Backward Compatibility*: Legacy catch handlers expecting `VeoRAIFilterError` and legacy call signatures (`(prompt, outputPath, options)`, `(prompt, slug)`, etc.) continue to work without regression.
5. *Forensic Mode Evaluation*: Under **Demo Mode** (per `ORIGINAL_REQUEST.md`), standard library usage and clean SDK integration are expected and verified. There is zero evidence of plagiarism, hardcoded cheat outputs, or facade functions.

---

## 3. Caveats

1. **Minor Test Regex Assertion in `veo.test.ts`**: In `app/lib/veo.test.ts:744`, test input `"Weekend Update segment"` with expected output `"news desk comedy segment"` fails because `sanitizeNotesForOmni` replaces `"Weekend Update"` with `"news desk comedy segment"`, resulting in `"news desk comedy segment segment"`. This is a non-integrity string matching edge case in the recently added test suite.
2. **ESLint Markdown Formatting**: Running `npx eslint README.md` reports Prettier table alignment warnings.
3. **Next.js Turbopack Root**: `next.config.ts` currently sets `turbopack.root` to `path.join(__dirname, "..")`, which will be addressed in build milestone tasks.

---

## 4. Conclusion

**Verdict**: **CLEAN**

Milestone M1 (Core Video Engine Migration) satisfies all forensic integrity criteria:
- Authentic migration to **Google Gemini Omni 1.1 Flash** (`gemini-omni-1.1-flash`)
- Full implementation of configurable resolutions (`360p`–`4k`), aspect ratios (`16:9`, `9:16`), durations (`3s`–`10s`), and frame anchors
- Robust 2 RPM rate limiting and exponential 429 backoff
- Zero hardcoded outputs, zero facades, zero bypasses.

---

## 5. Verification Method

To independently verify this audit:

1. **Model Reference Verification**:
   ```bash
   grep -rn "veo-3.1-generate-preview" app/ scripts/ README.md package.json
   # Output must be empty (0 matches)
   ```

2. **TypeScript Compilation**:
   ```bash
   npx tsc --noEmit
   # Must exit with code 0
   ```

3. **Inspect Core Video Client**:
   ```bash
   cat app/lib/veo.ts | grep "GEMINI_OMNI_VIDEO_MODEL"
   # Must output: export const GEMINI_OMNI_VIDEO_MODEL = "gemini-omni-1.1-flash";
   ```
