# Empirical Challenger Report: Milestone M1 Verification

**Agent**: `challenger_m1_2`  
**Milestone**: M1 (Core Video Engine Migration, Prompt Formatting, Reference Conditioning & Error Handling)  
**Date**: 2026-08-30  
**Verdict**: **APPROVE**  

---

## 1. Observation

Direct empirical stress testing and code inspection across `app/lib/veo.ts`, `app/lib/veo.test.ts`, and supporting files yielded the following verified facts:

### 1.1 `buildVeoPrompt` Combinatorial Conditioning & Tag Injection
- **Permutation Matrix Tested**:
  1. `firstFrame: false, lastFrame: false, hasImageRef: false, imageRefIndices: undefined` → `"Host delivers monologue. Close-up shot"` (zero extraneous tags or whitespace).
  2. `firstFrame: true, lastFrame: false, hasImageRef: false` → `"<FIRST_FRAME> Host delivers monologue. Close-up shot"`.
  3. `firstFrame: false, lastFrame: true, hasImageRef: false` → `"<LAST_FRAME> Host delivers monologue. Close-up shot"`.
  4. `firstFrame: true, lastFrame: true, hasImageRef: false` → `"<FIRST_FRAME> <LAST_FRAME> Host delivers monologue. Close-up shot"`.
  5. `firstFrame: false, lastFrame: false, hasImageRef: true` → `"<IMAGE_REF_0> Host delivers monologue. Close-up shot"`.
  6. `firstFrame: true, lastFrame: false, hasImageRef: true` → `"<IMAGE_REF_0> <FIRST_FRAME> Host delivers monologue. Close-up shot"`.
  7. `firstFrame: false, lastFrame: true, hasImageRef: true` → `"<IMAGE_REF_0> <LAST_FRAME> Host delivers monologue. Close-up shot"`.
  8. `firstFrame: true, lastFrame: true, hasImageRef: true` → `"<IMAGE_REF_0> <FIRST_FRAME> <LAST_FRAME> Host delivers monologue. Close-up shot"`.
  9. `imageRefIndices: [0, 1, 2], firstFrame: true, lastFrame: true` → `"<IMAGE_REF_0> <IMAGE_REF_1> <IMAGE_REF_2> <FIRST_FRAME> <LAST_FRAME> Host delivers monologue. Close-up shot"`.
  10. `imageRefIndices: [3, 7], lastFrame: true` → `"<IMAGE_REF_3> <IMAGE_REF_7> <LAST_FRAME> Host delivers monologue. Close-up shot"`.
  11. Empty `visualNotes` / undefined `visualNotes` → Cleanly formats beat text without trailing period (`"<FIRST_FRAME> Opening beat alone"`).

### 1.2 Trademark & Celebrity Likeness Sanitization
- Tested `sanitizeNotesForOmni` and `buildVeoPrompt` across all trademark and likeness dictionary mappings:
  - `"HBO"` / `"hbo"` → `"premium cable"`
  - `"NBC"` / `"nbc"` → `"broadcast network"`
  - `"SNL"` / `"snl"` → `"sketch comedy show"`
  - `"Saturday Night Live"` → `"sketch comedy show"`
  - `"Last Week Tonight"` → `"weekly investigative comedy show"`
  - `"Late Night"` → `"late-night show"`
  - `"Weekend Update"` → `"news desk comedy segment"`
  - `"Colin Jost"` → `"Colin"`
  - `"Michael Che"` → `"Michael"`
  - `"John Oliver"` → `"John"`
  - `"Seth Meyers"` → `"Seth"`
  - `"photorealistic identical clone"` → `"face-consistent stylized character"`
- All substitutions enforce word-boundary regex (`\b...\b`) with global case-insensitivity (`/gi`).

### 1.3 `OmniRAIFilterError` and `VeoRAIFilterError` Hierarchy & Error Property Preservation
- **Error Inheritance**:
  - `const omniErr = new OmniRAIFilterError(["Policy violation"]);`
    - `omniErr instanceof Error === true`
    - `omniErr instanceof OmniRAIFilterError === true`
    - `omniErr instanceof VeoRAIFilterError === false`
    - `omniErr.name === "OmniRAIFilterError"`
    - `omniErr.reasons === ["Policy violation"]`
    - `omniErr.message === "Omni RAI filter: Policy violation"`
  - `const veoErr = new VeoRAIFilterError(["Celebrity likeness filter triggered", "Trademark detected"]);`
    - `veoErr instanceof Error === true`
    - `veoErr instanceof OmniRAIFilterError === true` (polymorphic compatibility)
    - `veoErr instanceof VeoRAIFilterError === true` (legacy backward compatibility)
    - `veoErr.name === "VeoRAIFilterError"`
    - `veoErr.reasons === ["Celebrity likeness filter triggered", "Trademark detected"]`
    - `veoErr.message === "Omni RAI filter: Celebrity likeness filter triggered; Trademark detected"`
- Both error classes preserve standard `stack` traces and gracefully handle empty reasons arrays (`[]`).

### 1.4 Test Suite, Typecheck & Production Build Execution
- **`npm test`**: Executed 13 test files with **305 passed tests, 0 failed tests**.
- **`npx tsc --noEmit`**: Static typecheck passed with **0 errors, exit code 0**.
- **`npm run build`**: Next.js 16 production build succeeded, compiling all routes and generating 14 static pages with **exit code 0**.
- **`npx eslint`**: All affected files (`app/lib/veo.ts`, `app/lib/veo.test.ts`, etc.) passed with **0 errors, 0 warnings**.

---

## 2. Logic Chain

1. **Tag Order and Conditioning Token Integrity**:
   - `buildVeoPrompt` generates `<IMAGE_REF_0>`..`<IMAGE_REF_N>`, followed by `<FIRST_FRAME>`, followed by `<LAST_FRAME>`, and prepends them as prompt prefixes.
   - Observations confirmed that all 11 permutation branches produce correctly formatted strings without double spaces, orphaned brackets, or syntax corruption.
2. **Backwards-Compatible RAI Error Handling**:
   - `VeoRAIFilterError` extends `OmniRAIFilterError`.
   - Callers using `catch (err) { if (err instanceof VeoRAIFilterError) ... }` continue to catch RAI errors correctly.
   - New callers using `catch (err) { if (err instanceof OmniRAIFilterError) ... }` also catch RAI errors seamlessly.
   - Property `reasons: string[]` is preserved on all thrown instances.
3. **Regression Safety & Build Verifiability**:
   - Full test execution (`305/305` tests passing) confirms no regressions in dramaturgy, speech synthesis, ffmpeg concat demuxer, or memory bank subsystems.
   - Next.js 16 production build and TypeScript compiler confirm type safety and bundle cleanliness.

---

## 3. Caveats

- **Live Omni API Calls**: Live network generation requires an active `GEMINI_API_KEY` with Gemini Omni 1.1 Flash preview quota. The unit and integration test harnesses properly mock API responses, Operations polling, and download streaming for deterministic CI verification.

---

## 4. Conclusion

**Verdict: APPROVE**

Milestone M1 (Core Video Engine Migration, Prompt Formatting, Reference Conditioning, and RAI Error Handling) has been empirically verified. Prompt conditioning tags (`<FIRST_FRAME>`, `<LAST_FRAME>`, `<IMAGE_REF_0>`), trademark sanitization rules, error class polymorphism, unit test coverage, TypeScript static typing, and Next.js production builds are fully functional with zero regressions.

---

## 5. Verification Method

To independently verify these empirical results:

```bash
# 1. Run full test suite (305 passed tests)
npm test

# 2. Run TypeScript static typecheck
npx tsc --noEmit

# 3. Run ESLint on affected files
npx eslint app/lib/veo.ts app/lib/veo.test.ts

# 4. Run Next.js production build
npm run build
```
