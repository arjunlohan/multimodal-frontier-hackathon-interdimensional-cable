# Milestone M1 Supporting Files Implementation Strategy

## 1. Observation

Direct examination of the codebase revealed the exact touchpoints, lines of code, and configurations required for the supporting files in Milestone M1:

### A. Test Scripts (`scripts/test-veo.ts` & `scripts/test-reference-image.ts`)
- **`scripts/test-veo.ts`**:
  - Line 7: `const VEO_VIDEO_MODEL = "veo-3.1-generate-preview";`
  - Lines 58–116 (`testVeoVideo`): invokes `client.models.generateVideos` with `model: VEO_VIDEO_MODEL`, `config: { aspectRatio: "16:9", numberOfVideos: 1, durationSeconds: 8 }`.
  - Lines 118–189 (`testVeoWithReferenceImage`): loads `public/templates/john-oliver.png` and calls `generateVideos` with `referenceImages: [{ image: { imageBytes, mimeType: "image/png" }, referenceType: VideoGenerationReferenceType.ASSET }]`.
  - Lines 245–273: logs banners and summaries citing `"Veo / Gemini Connectivity Test"`, `"Veo Video"`, and `"Veo + Reference Image"`.
- **`scripts/test-reference-image.ts`**:
  - Line 9: `const VEO_MODEL = "veo-3.1-generate-preview";`
  - Lines 46–127 (`testVeoWithReferenceImage`): calls `generateVideos` with `resolution: "1080p"`, `personGeneration: "allow_adult"`, and JPEG reference images from `assets/reference-images/`.
- **`package.json`**:
  - Line 23: `"test:veo": "tsx scripts/test-veo.ts"`

### B. UI Form (`app/create/create-form.tsx`)
- **`app/create/create-form.tsx`**:
  - Line 199: `<div className="text-xs opacity-75 mt-1">Powered by Google Veo 3.1 video generation + multi-speaker TTS.</div>`
  - Step 3 (Configure, lines 168–286): provides options for `mediaFormat` ("video" vs "audio"), `durationSeconds` (`VIDEO_DURATION_OPTIONS`: 8s, 16s, 24s, 32s, 40s), `familiarity` ("beginner", "familiar", "expert"), and `useFrameChaining` toggle. Currently lacks direct selectors for output resolution (`360p`, `720p`, `1080p`, `4k`) and aspect ratio (`16:9`, `9:16`).
  - Step 4 (Review, lines 288–377): summarizes Template, Topic, Duration, Familiarity, and Frame Chaining.
- **`app/create/actions.ts`**:
  - Lines 36–43 (`CreateShowInput`): defines fields passed from client to server action and DB insertion.

### C. Documentation (`README.md`, `DOCS/`, etc.)
- **`README.md`**:
  - Line 8: `[![Google Veo 3.1](https://img.shields.io/badge/Google%20Veo-3.1%20Video%20Gen-34A853?logo=google&logoColor=white)](https://ai.google.dev/)`
  - Line 18: `...Google Veo 3.1 video generation...`
  - Lines 62, 79, 81: Mermaid diagram node `VeoVideoGen["Google Veo 3.1 (Face-Consistent Video Generation)"]`
  - Line 99: `| **Video Clip Generation** | **Google Veo 3.1** (\`veo-3.1-generate-preview\`) | High-definition AI video generation (capped at 40s) with reference asset anchoring. |`
  - Line 162: mentions `...Veo video generators...`
  - Line 176: demo script mentions `...Veo 3.1 video clip generation...`

### D. Environment Configuration (`app/lib/env.ts` & `.env.example`)
- **`app/lib/env.ts`**:
  - Lines 32–36:
    ```typescript
    GOOGLE_GENERATIVE_AI_API_KEY: optionalString("Google Generative AI API key for Gemini-backed workflows."),
    // Gemini API key (for VEO video generation and LLM)
    GEMINI_API_KEY: optionalString("Gemini API key for VEO video generation and research/scripting."),
    ```
  - Both keys are optional strings in Zod schema to allow either environment variable name.
- **`app/lib/veo.ts`** (Line 17): `const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY;`
- **`.env.example`** (Line 15): documents `GOOGLE_GENERATIVE_AI_API_KEY=`.

---

## 2. Logic Chain

1. **Model Identifier Migration**:
   - Because `ORIGINAL_REQUEST.md` §R1 strictly requires replacing all references to `veo-3.1-generate-preview` with `gemini-omni-1.1-flash`, all model constants across diagnostic scripts (`scripts/test-veo.ts`, `scripts/test-reference-image.ts`) must be updated to `"gemini-omni-1.1-flash"`.

2. **Diagnostic Script Parameter Hardening**:
   - `gemini-omni-1.1-flash` supports configurable output resolutions (`360p`, `720p`, `1080p`, `4k`), aspect ratios (`16:9`, `9:16`), durations (3s to 10s), and multimodal reference binding (`<IMAGE_REF_0>` / `referenceImages`).
   - The test scripts must validate these parameter payloads against the `@google/genai` SDK and verify proper polling with timeouts.
   - Adding a `"test:omni"` script alias in `package.json` while keeping `"test:veo"` guarantees CLI convenience and backwards compatibility.

3. **UI Consistency and Form Controls**:
   - In `app/create/create-form.tsx`, updating the model banner copy from "Google Veo 3.1" to "Google Gemini Omni 1.1 Flash" directly reflects the upgraded video engine to the user.
   - Aligning the form to support resolution selection (`360p`, `720p`, `1080p`, `4k`) and aspect ratio selection (`16:9`, `9:16`) exposes Gemini Omni 1.1 Flash's native capabilities directly in the UI.
   - Review cards in Step 4 must reflect these selected settings before submission.

4. **Documentation Accuracy & Hackathon Presentation**:
   - `README.md` serves as the primary evaluation surface for judges and developers. Upgrading badges, architecture diagrams, technology stack tables, and Devpost walkthrough scripts to highlight Google Gemini Omni 1.1 Flash ensures 100% fidelity with the system implementation.

5. **Environment Variable Robustness**:
   - `app/lib/env.ts` already implements robust fallback between `GEMINI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY`. Updating the descriptive metadata to cite Gemini Omni 1.1 Flash maintains schema clarity without breaking runtime execution or build-time static checks.

---

## 3. Implementation Strategy & Concrete Proposals

### Target 1: `scripts/test-veo.ts`
```typescript
// Proposed updates in scripts/test-veo.ts:
const GEMINI_TEXT_MODEL = "gemini-3.7-flash";
const OMNI_VIDEO_MODEL = "gemini-omni-1.1-flash";

// In testOmniVideo (formerly testVeoVideo):
let operation = await client.models.generateVideos({
  model: OMNI_VIDEO_MODEL,
  prompt: "A solid blue background with a small white circle in the center",
  config: {
    aspectRatio: "16:9",
    numberOfVideos: 1,
    durationSeconds: 8,
    resolution: "720p", // Support 360p, 720p, 1080p, 4k
  },
});

// In testOmniWithReferenceImage:
let operation = await client.models.generateVideos({
  model: OMNI_VIDEO_MODEL,
  prompt: "A late-night talk show host sitting behind a desk, delivering a monologue to camera <IMAGE_REF_0>",
  config: {
    aspectRatio: "16:9",
    numberOfVideos: 1,
    durationSeconds: 8,
    resolution: "1080p",
    referenceImages: [{
      image: { imageBytes, mimeType: "image/png" },
      referenceType: VideoGenerationReferenceType.ASSET,
    }],
  },
});

// Update CLI logs and banners:
console.log("║   Gemini Omni 1.1 Flash / Gemini Connectivity Test  ║");
```

### Target 2: `scripts/test-reference-image.ts`
```typescript
// Proposed updates in scripts/test-reference-image.ts:
const OMNI_MODEL = "gemini-omni-1.1-flash";

// Update generation call to gemini-omni-1.1-flash with resolution parameters:
let operation = await client.models.generateVideos({
  model: OMNI_MODEL,
  prompt: "A professional late-night talk show segment. A single host behind a desk delivering a monologue <IMAGE_REF_0>. The host is animated, expressive, and natural. Studio lighting, broadcast TV quality.",
  config: {
    aspectRatio: "16:9",
    numberOfVideos: 1,
    durationSeconds: 8,
    resolution: "1080p", // 720p default, 1080p broadcast
    personGeneration: "allow_adult",
    referenceImages: [{
      image: { imageBytes, mimeType: "image/jpeg" },
      referenceType: VideoGenerationReferenceType.ASSET,
    }],
  },
});
```

### Target 3: `app/create/create-form.tsx` & Actions
- **Step 3 (Configure)**:
  - Update format card copy: `"Powered by Google Gemini Omni 1.1 Flash video generation + multi-speaker TTS."`
  - Update Visual Consistency / Frame Chaining explanation to reference Gemini Omni 1.1 Flash native frame interpolation and scene extension.
  - Add resolution selector component or button group: `360p (Draft)`, `720p (Standard)`, `1080p (Broadcast)`, `4k (UHD)` (default: `720p` or `1080p`).
  - Add aspect ratio selector component or button group: `16:9 (Landscape)` and `9:16 (Vertical)` (default: `16:9`).
- **Step 4 (Review)**:
  - Add badge displays for selected Resolution and Aspect Ratio.
- **`app/create/actions.ts`**:
  - Accept `resolution` and `aspectRatio` in `CreateShowInput` with default fallback to `"720p"` and `"16:9"`.

### Target 4: `README.md`
- Replace badge on Line 8 with:
  `[![Google Gemini Omni 1.1 Flash](https://img.shields.io/badge/Google%20Gemini-Omni%201.1%20Flash%20Video-34A853?logo=google&logoColor=white)](https://ai.google.dev/)`
- Replace all occurrences of `Google Veo 3.1` and `veo-3.1-generate-preview` across pitch, feature overview, architecture diagram, tech stack table, and Devpost script with **Google Gemini Omni 1.1 Flash** (`gemini-omni-1.1-flash`).
- Add Omni 1.1 Flash capabilities to Tech Stack table:
  - First/Last frame transition anchors (`<FIRST_FRAME>`, `<LAST_FRAME>`)
  - Multi-turn scene extensions up to 40s (`previous_interaction_id`)
  - Character consistency via `<IMAGE_REF_0>` conditioning
  - Configurable resolutions (`360p`, `720p`, `1080p`, `4k`) and aspect ratios (`16:9`, `9:16`).

### Target 5: `app/lib/env.ts` & `.env.example`
- Update docstring in `app/lib/env.ts` line 34:
  `GEMINI_API_KEY: optionalString("Gemini API key for Gemini Omni 1.1 Flash video generation and research/scripting.")`
- Confirm dual-key support (`GEMINI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY`) is documented in `.env.example`.

---

## 4. Caveats

- **API Rate Limits**: The Google AI Studio preview tier for video generation models has rate limit ceilings (e.g. 2 RPM). Diagnostic scripts should continue providing clear diagnostics and exponential backoff on HTTP 429 errors.
- **Next.js Phase Check**: `app/lib/env.ts` skips environment validation during `NEXT_PHASE === "phase-production-build"`. This design pattern must be preserved to ensure `npm run build` succeeds in CI environments without live API keys.
- **Database Schema Constraints**: `db/schema.ts` currently stores `aspectRatio` on the `videos` table and `useFrameChaining` on `generatedShows`. Adding resolution/aspectRatio fields to `generatedShows` can either be persisted directly if columns exist, or passed through workflow run inputs and metadata without requiring immediate breaking DB migrations.

---

## 5. Conclusion

The supporting files for Milestone M1 (`scripts/test-veo.ts`, `scripts/test-reference-image.ts`, `app/create/create-form.tsx`, `README.md`, and `app/lib/env.ts`) are fully cataloged, scoped, and ready for clean migration to **Google Gemini Omni 1.1 Flash** (`gemini-omni-1.1-flash`). The proposed changes preserve existing developer workflows, enhance UI configuration options, and align the documentation with the upgraded video generation engine.

---

## 6. Verification Method

To verify these changes upon implementation:
1. **TypeScript Static Analysis**:
   ```bash
   npx tsc --noEmit
   ```
   Must pass with 0 type errors across all scripts, app routes, and components.

2. **Linting Check**:
   ```bash
   npm run lint
   ```
   Must pass with 0 ESLint errors and adhere to `@antfu/eslint-config` formatting and import rules.

3. **Production Build**:
   ```bash
   npm run build
   ```
   Must compile all Next.js 16 routes (`/`, `/create`, `/create/[showId]`, `/watch/[showId]`, etc.) successfully.

4. **Automated Unit & Integration Tests**:
   ```bash
   npm test
   ```
   Must execute and pass 100% of Vitest suites.

5. **Diagnostic CLI Scripts**:
   ```bash
   npx tsx scripts/test-veo.ts
   npx tsx scripts/test-reference-image.ts
   ```
   Inspect stdout to verify proper Gemini Omni 1.1 Flash model targeting and parameter serialization.
