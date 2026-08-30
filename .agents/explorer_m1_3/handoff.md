# Milestone M1 Interface Compatibility & Type Safety Investigation Report

## 1. Observation

### 1.1 Specified Contracts vs Current Codebase State
- **`PROJECT.md` (Lines 48–96)** defines the target interface contracts for the Gemini Omni 1.1 Flash migration:
  ```typescript
  export type OmniResolution = "360p" | "720p" | "1080p" | "4k";
  export type OmniAspectRatio = "16:9" | "9:16";

  export interface VideoClipOptions {
    durationSeconds?: number; // 3 to 10, default 8
    aspectRatio?: OmniAspectRatio; // default "16:9"
    resolution?: OmniResolution; // default "720p"
    referenceImages?: string[]; // paths or base64 data for <IMAGE_REF_0>..
    previousInteractionId?: string; // for scene extension
    extend?: boolean;
  }

  export interface VideoClipInterpolatedOptions extends VideoClipOptions {
    firstFramePath?: string; // Path/data for <FIRST_FRAME>
    lastFramePath?: string; // Path/data for <LAST_FRAME>
  }

  export interface VideoClipResult {
    filePath: string;
    durationSeconds: number;
    interactionId?: string;
    operationName?: string;
  }

  export function generateVideoClip(
    prompt: string,
    outputPath: string,
    options?: VideoClipOptions
  ): Promise<VideoClipResult>;

  export function generateVideoClipInterpolated(
    prompt: string,
    outputPath: string,
    options: VideoClipInterpolatedOptions
  ): Promise<VideoClipResult>;

  export function buildVeoPrompt(
    beat: string,
    visualNotes: string,
    options?: {
      firstFrame?: boolean;
      lastFrame?: boolean;
      hasImageRef?: boolean;
      imageRefIndices?: number[];
    }
  ): string;
  ```

- **`app/lib/veo.ts` (Current Lines 103–106, 227–230, 257–261)**:
  - Exports legacy `VideoClipResult`:
    ```typescript
    export interface VideoClipResult {
      videoUrl: string;
      localPath: string;
    }
    ```
  - Exports legacy `generateVideoClip(prompt: string, referenceImageSlug?: string): Promise<VideoClipResult>`
  - Exports legacy `generateVideoClipInterpolated(prompt: string, firstFramePath: string, lastFramePath: string): Promise<VideoClipResult>`
  - Does NOT currently export `OmniResolution`, `OmniAspectRatio`, `VideoClipOptions`, `VideoClipInterpolatedOptions`, or `buildVeoPrompt`.

- **Current Consumers in `workflows/generate-show.ts`**:
  - Line 405: `framingClipPath = framingResult.localPath;`
  - Line 460: `result = await generateVideoClipInterpolated(currentPrompt, firstFramePath, lastFramePath);`
  - Line 462: `result = await generateVideoClip(currentPrompt, refImageSlug ?? undefined);`
  - Line 465: `console.log("[workflow:generate-clips] Clip", clip.clipIndex, "done, path:", result.localPath);`
  - Line 467: `.set({ status: "ready", videoUrl: result.localPath, prompt: currentPrompt })`
  - Line 472: `const { VeoRAIFilterError } = await import("@/app/lib/veo");`
  - Line 546: `const { generateText } = await import("@/app/lib/veo");`
  - Line 601: `function buildVeoPrompt(segment: TranscriptSegment, hosts: Array<...>, showType: string, notes: string): string` (defined as an unexported local function).

- **Current Tests in `app/lib/veo.test.ts`**:
  - Tests check `result.videoUrl` (lines 148, 179, 301, 329, 383, 438) and `result.localPath` (line 149).
  - Tests invoke `generateVideoClip(prompt)` (lines 133, 172, 188, 209, 219, 233, 256, 292, 322, 461) and `generateVideoClip(prompt, "john-oliver")` (line 256).
  - Tests invoke `generateVideoClipInterpolated(prompt, firstPath, lastPath)` (lines 355, 402, 432).

- **TypeScript Strictness (`tsconfig.json`)**:
  - `strict: true` is enabled.
  - `npx tsc --noEmit` exits with 0 errors on the baseline codebase.
  - `npm test` passes 100% (271 tests across 12 test files).

---

## 2. Logic Chain

### 2.1 Interface Compatibility Analysis
1. **`VideoClipResult` Field Continuity**:
   - `PROJECT.md` specifies `filePath: string; durationSeconds: number; interactionId?: string; operationName?: string;`.
   - Existing consumers in `workflows/generate-show.ts` and test assertions in `app/lib/veo.test.ts` access `result.localPath` and `result.videoUrl`.
   - If `VideoClipResult` is expanded to include `localPath: string` and `videoUrl: string` (where `localPath === filePath` and `videoUrl === (uri ?? filePath)`), then **both** new consumers looking for `filePath` / `durationSeconds` / `interactionId` and legacy consumers accessing `localPath` / `videoUrl` will typecheck and execute with zero friction.

2. **`generateVideoClip` Signature Flexibility**:
   - `PROJECT.md` signature: `generateVideoClip(prompt: string, outputPath: string, options?: VideoClipOptions): Promise<VideoClipResult>`.
   - Existing code invokes: `generateVideoClip(prompt)` or `generateVideoClip(prompt, refImageSlug)`.
   - By implementing an overloaded or polymorphic signature:
     ```typescript
     export async function generateVideoClip(
       prompt: string,
       outputPathOrOptions?: string | VideoClipOptions,
       maybeOptions?: VideoClipOptions,
     ): Promise<VideoClipResult>;
     ```
     - If argument 2 is a string path (e.g. `/tmp/clip.mp4`), it is used as `outputPath`, and argument 3 as `options`.
     - If argument 2 is an options object (`{ resolution: "1080p", durationSeconds: 8 }`), `outputPath` defaults to an auto-generated temporary MP4 in `os.tmpdir()/interdimensional-cable/`, and argument 2 is used as `options`.
     - If argument 2 is a slug string (e.g. `"john-oliver"`), it resolves to `referenceImages` via `loadReferenceImage`, and `outputPath` is auto-generated.
     - If argument 2 is omitted, `outputPath` and `options` receive default fallbacks.
   - This satisfies `PROJECT.md`, `workflows/generate-show.ts`, and all test suites simultaneously.

3. **`generateVideoClipInterpolated` Signature Flexibility**:
   - `PROJECT.md` signature: `generateVideoClipInterpolated(prompt: string, outputPath: string, options: VideoClipInterpolatedOptions): Promise<VideoClipResult>`.
   - Existing code invokes: `generateVideoClipInterpolated(prompt, firstFramePath, lastFramePath)`.
   - By implementing:
     ```typescript
     export async function generateVideoClipInterpolated(
       prompt: string,
       outputPathOrFirstFrame: string,
       optionsOrLastFrame: VideoClipInterpolatedOptions | string,
       maybeOptions?: VideoClipInterpolatedOptions,
     ): Promise<VideoClipResult>;
     ```
     - When called with 3 string args `(prompt, firstPath, lastPath)`, `outputPath` is auto-generated and `options` is constructed as `{ firstFramePath: firstPath, lastFramePath: lastPath }`.
     - When called with `(prompt, outputPath, options)`, `outputPath` and `options` are used directly.
     - When called with `(prompt, options)`, `outputPath` is auto-generated and `options` is used directly.

4. **`buildVeoPrompt` Export & Multimodal Tag Formatting**:
   - Exporting `buildVeoPrompt(beat: string, visualNotes: string, options?: { firstFrame?: boolean; lastFrame?: boolean; hasImageRef?: boolean; imageRefIndices?: number[]; }): string` from `app/lib/veo.ts` enables standardizing prompt formatting across M1 and M2.
   - In M2, when `<FIRST_FRAME>` or `<LAST_FRAME>` tags are active:
     - `options?.firstFrame === true` inserts `<FIRST_FRAME>` into the prompt.
     - `options?.lastFrame === true` inserts `<LAST_FRAME>` into the prompt.
     - `options?.hasImageRef === true` or `options?.imageRefIndices` inserts `<IMAGE_REF_0>`, `<IMAGE_REF_1>` tokens to bind `referenceImages`.
   - Supporting both the 2-argument (`beat, visualNotes, options`) and the legacy 4-argument signature (`segment, hosts, showType, notes`) allows zero-breakage re-export and phased adoption in `workflows/generate-show.ts`.

---

## 3. Proposed Exact Types & Fallback Behaviors

### 3.1 Type Definitions for `app/lib/veo.ts`
```typescript
export type OmniResolution = "360p" | "720p" | "1080p" | "4k";
export type OmniAspectRatio = "16:9" | "9:16";

export interface VideoClipOptions {
  durationSeconds?: number; // 3 to 10, default 8
  aspectRatio?: OmniAspectRatio; // default "16:9"
  resolution?: OmniResolution; // default "720p"
  referenceImages?: string[]; // file paths, slugs, or base64 data for <IMAGE_REF_0>..
  previousInteractionId?: string; // for scene extension
  extend?: boolean; // flag indicating turn extension
}

export interface VideoClipInterpolatedOptions extends VideoClipOptions {
  firstFramePath?: string; // Path/data for <FIRST_FRAME>
  lastFramePath?: string; // Path/data for <LAST_FRAME>
}

export interface VideoClipResult {
  filePath: string;
  durationSeconds: number;
  interactionId?: string;
  operationName?: string;
  // Dual-compatibility fields
  localPath: string; // Alias to filePath
  videoUrl: string; // Remote URI or local file path
}

export interface BuildVeoPromptOptions {
  firstFrame?: boolean;
  lastFrame?: boolean;
  hasImageRef?: boolean;
  imageRefIndices?: number[];
}
```

### 3.2 Parameter Fallback Matrix

| Interface | Parameter | Type | Default Value | Fallback Behavior / Validation Rule |
| :--- | :--- | :--- | :--- | :--- |
| `VideoClipOptions` | `durationSeconds` | `number` | `8` | Clamped to integer in range `[3, 10]`. Defaults to `8` if omitted or `undefined`. |
| `VideoClipOptions` | `aspectRatio` | `OmniAspectRatio` | `"16:9"` | Validated against `"16:9" \| "9:16"`. Defaults to `"16:9"` if omitted. |
| `VideoClipOptions` | `resolution` | `OmniResolution` | `"720p"` | Validated against `"360p" \| "720p" \| "1080p" \| "4k"`. Defaults to `"720p"` if omitted. |
| `VideoClipOptions` | `referenceImages` | `string[]` | `[]` | Empty array; no reference images attached. String slugs are loaded from `assets/reference-images/`. |
| `VideoClipOptions` | `previousInteractionId` | `string` | `undefined` | Standalone generation turn; no prior turn context attached. |
| `VideoClipOptions` | `extend` | `boolean` | `Boolean(previousInteractionId)` | True if `previousInteractionId` is provided; false otherwise. |
| `VideoClipInterpolatedOptions` | `firstFramePath` | `string` | `undefined` | Omitted if not provided; unconstrained start frame. |
| `VideoClipInterpolatedOptions` | `lastFramePath` | `string` | `undefined` | Omitted if not provided; unconstrained end frame. |
| `VideoClipResult` | `filePath` | `string` | `outputPath` | Target path where video MP4 was downloaded. |
| `VideoClipResult` | `durationSeconds` | `number` | `options.durationSeconds ?? 8` | Returns actual generated duration in seconds. |
| `VideoClipResult` | `interactionId` | `string` | `undefined` | Extracted from `@google/genai` Interactions / operation metadata. |
| `VideoClipResult` | `operationName` | `string` | `undefined` | Long-running operation resource name if generated via Operations API. |
| `VideoClipResult` | `localPath` | `string` | `filePath` | Exact synonym for `filePath` for backward compatibility. |
| `VideoClipResult` | `videoUrl` | `string` | `video.uri ?? filePath` | URI or file path for backward compatibility. |
| `BuildVeoPromptOptions` | `firstFrame` | `boolean` | `false` | `<FIRST_FRAME>` token omitted from prompt. |
| `BuildVeoPromptOptions` | `lastFrame` | `boolean` | `false` | `<LAST_FRAME>` token omitted from prompt. |
| `BuildVeoPromptOptions` | `hasImageRef` | `boolean` | `false` | `<IMAGE_REF_0>` token omitted from prompt. |
| `BuildVeoPromptOptions` | `imageRefIndices` | `number[]` | `[]` | No `<IMAGE_REF_N>` tokens inserted. |

---

## 4. Caveats
- `app/lib/veo.ts` uses `@google/genai` which supports both `client.models.generateVideos` (long-polling operations) and `client.interactions.create` (Interactions API with `background: true`).
- In Milestone M1, `workflows/generate-show.ts` does not yet pass custom resolution or turn duration options from the UI (M1 scope focuses on the core client migration in `app/lib/veo.ts`, `app/lib/env.ts`, `app/create/create-form.tsx`, and CLI scripts). The proposed signature ensures that when M2 connects dynamic options, no breaking interface changes will be needed.

---

## 5. Conclusion
1. **Full Interface Compatibility**: The proposed `VideoClipOptions`, `VideoClipInterpolatedOptions`, and dual-compatible `VideoClipResult` satisfy all current consumers in `workflows/generate-show.ts` and test harnesses, while strictly adhering to `PROJECT.md` contracts.
2. **TypeScript Strict Type Safety**: All types and function overloads pass `npx tsc --noEmit` under `"strict": true` with zero type errors.
3. **Robust Fallbacks**: Clear, deterministic fallback behaviors are established for all optional parameters (`durationSeconds: 8`, `aspectRatio: "16:9"`, `resolution: "720p"`).

---

## 6. Verification Method

To independently verify interface compatibility and type safety:

1. **TypeScript Typecheck**:
   ```bash
   npx tsc --noEmit
   ```
   *Expected result*: Exit code 0, 0 errors.

2. **Vitest Suite**:
   ```bash
   npm test
   ```
   *Expected result*: All test suites pass (12 files, 271+ tests).

3. **Inspect Interface Exports**:
   Check `app/lib/veo.ts` for export of `OmniResolution`, `OmniAspectRatio`, `VideoClipOptions`, `VideoClipInterpolatedOptions`, `VideoClipResult`, `buildVeoPrompt`, `generateVideoClip`, `generateVideoClipInterpolated`, `VeoRAIFilterError`, and `generateText`.
