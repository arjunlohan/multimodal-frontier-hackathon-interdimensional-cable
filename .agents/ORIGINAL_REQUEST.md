# Original User Request

## Initial Request — 2026-08-30T06:01:09Z

Upgrade the video generation and visual synthesis pipeline of **Interdimensional Cable** from legacy Veo to **Google Gemini Omni 1.1 Flash** (`gemini-omni-1.1-flash`), integrating the Interactions API, native first/last frame transitions (`<FIRST_FRAME>`, `<LAST_FRAME>`), scene extensions (up to 40s total duration), reference asset binding (`<IMAGE_REF_N>`), and configurable output resolutions (360p draft, 720p default, 1080p broadcast, 4K UHD).

Working directory: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable
Integrity mode: demo

## Requirements

### R1. Complete Video Engine Migration to Gemini Omni 1.1 Flash
- Replace all references and SDK calls to `veo-3.1-generate-preview` with **`gemini-omni-1.1-flash`** across the entire codebase (`app/lib/veo.ts`, `workflows/generate-show.ts`, tests, scripts, README, and docs).
- Integrate native Gemini Omni 1.1 Flash generation parameters:
  - Output resolutions: `360p`, `720p` (default), `1080p`, `4k`.
  - Aspect ratios: `16:9` (landscape broadcast default) and `9:16` (shorts/reels).
  - Target clip durations: configurable between 3s and 10s per generation turn.

### R2. First/Last Frame Interpolation & Scene Extension Workflows
- **First & Last Frame Transitions**: Utilize `<FIRST_FRAME>` and `<LAST_FRAME>` tags / starting & ending anchor images to generate smooth, continuous transitions between show beats without jump cuts.
- **Scene Extensions**: Utilize Omni 1.1's 10-second prior context window to perform continuous scene extensions (`extend` / `previous_interaction_id`) up to the 40-second maximum video length.
- **Multimodal Reference Conditioning**: Support `<IMAGE_REF_0>` character/anchor conditioning for consistent host appearances across segments.

### R3. Audio Integration & FFmpeg Broadcast Pipeline
- Maintain 48 kHz broadcast audio resampling (`-ar 48000`) and stereo AAC normalization for multi-clip stitching and audio-only podcast feeds.
- Ensure audio podcast workflow (up to 5m via `gemini-3.1-flash-tts-preview`) seamlessly coexists with the new Omni 1.1 video pipeline.

### R4. Automated Testing & Verification
- Update all unit, integration, and challenger test suites to validate Gemini Omni 1.1 Flash model calls, parameter payloads, mock responses, and error recovery.
- Confirm 0 TypeScript compilation errors (`npx tsc --noEmit`) and successful Next.js production build (`npm run build`).

## Acceptance Criteria

### Model Migration & API Compliance
- [ ] All video generation logic strictly uses `gemini-omni-1.1-flash` via the official `@google/genai` SDK / Interactions API with no references to legacy Veo models.
- [ ] First-frame and first/last-frame transition logic uses official `<FIRST_FRAME>` and `<LAST_FRAME>` prompt tags and image references.
- [ ] Multi-turn scene extension and 10-second increment logic are fully supported up to 40s.

### System Stability & Test Verification
- [ ] All unit, integration, and challenger tests pass cleanly (`npm test`).
- [ ] TypeScript compilation (`npx tsc --noEmit`) exits with 0 errors.
- [ ] Next.js production build (`npm run build`) compiles successfully across all routes.
