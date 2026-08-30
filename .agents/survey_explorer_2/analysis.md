# Media Engine & Multimodal Architecture Survey Report

**Explorer**: Survey Explorer 2  
**Date**: 2026-08-30  
**Target System**: Interdimensional Cable Comedy Show & Podcast Orchestrator  
**Mission**: Investigate existing media generation and workflow infrastructure, R3 Dual-Modality Media Engine (5m Audio Podcast via Gemini 3.1 Flash TTS vs 40s Video Show via Google Veo 3.1), audio processing (48 kHz broadcast normalization, multi-track stitching, silence handling, circuit breakers), and Vercel Workflow orchestration patterns.

---

## 1. Executive Summary

The Interdimensional Cable system implements a **Dual-Modality Media Engine (R3)** designed to solve the fundamental speed/cost tension in generative multimodal AI:

1. **Short-Form Video Shows (8s–40s)**: High-production desk/monologue shows powered by **Google Veo 3.1** (`veo-3.1-generate-preview`) with face-anchored reference image conditioning, frame interpolation chaining, RAI filter rewriting resilience, and FFmpeg broadcast stitching with 48 kHz normalization. Strictly capped at 40s (max 5 clips × 8s) via hard circuit breakers to respect Veo's 2 RPM tier-1 limits and generation latency.
2. **Long-Form Audio Podcasts (60s–300s / Up to 5 min)**: Rich multi-speaker comedic conversational podcasts powered by **Gemini 3.1 Flash TTS** (`gemini-3.1-flash-tts-preview`). Generates full conversational turn-taking, laughter cues, and natural backchannels across distinct host voices in a single non-blocking pass—completely bypassing Veo video compute.

Both pipelines are durably orchestrated via **Vercel Workflows** (`"use workflow"`, `"use step"`) with real-time SSE progress streaming (`getWritable`), direct Mux upload ingestion, and Postgres persistence (Drizzle ORM).

---

## 2. Infrastructure Inventory & Ecosystem Map

| Component | Library / Package | Version / Model | Location | Primary Role |
| :--- | :--- | :--- | :--- | :--- |
| **Video Generation** | `@google/genai` | `veo-3.1-generate-preview` | `app/lib/veo.ts` | 8s 1080p 16:9 video clip generation with reference image and interpolation modes |
| **Audio / TTS Engine** | `@google/genai` | `gemini-3.1-flash-tts-preview` | `app/lib/tts.ts` | Multi-speaker dialogue synthesis (24 kHz 16-bit mono PCM) |
| **Text LLM / Grounding** | `@google/genai` | `gemini-3.7-flash` | `app/lib/veo.ts` | Research (Google Search Grounding), multi-pass scripting, RAI text rewriting |
| **Video Platform & Streaming** | `@mux/mux-node`, `@mux/ai` | `12.8.1`, `0.3.1` | `app/lib/mux.ts` | Direct upload ingestion, asset/playback management, static renditions, instant clips |
| **Video Rendering & Preview** | `remotion`, `@remotion/player`, `@remotion/lambda` | `4.0.390` | `remotion/`, `app/lib/remotion/` | Client-side reactive preview, serverless Lambda MP4 rendering with audiogram visuals |
| **Durable Orchestration** | `workflow` | `^4.0.1-beta.29` | `workflows/`, `app/api/workflows/` | Deterministic multi-step execution, progress streaming (`getWritable`), error recovery |
| **Audio/Video Processing** | `ffmpeg` (child_process) | CLI | `app/lib/stitch.ts` | Concat demuxer, 48 kHz AAC re-encoding fallback, video frame extraction |
| **Cloud Storage** | AWS S3 / Cloudflare R2 | S3 API | `app/lib/env.ts` | Object storage for translation artifacts and Remotion render outputs |
| **Database & Vector Memory** | `drizzle-orm`, `pg` | PostgreSQL + pgvector | `db/schema.ts`, `db/index.ts` | `generated_shows`, `video_clips`, `show_templates`, `user_memories`, `video_chunks` (768d) |
| **Audio Localization** | ElevenLabs API / `@mux/ai` | External API | `workflows/translate-audio.ts` | Multilingual audio dubbing for Mux video assets |

---

## 3. R3 Dual-Modality Media Engine Deep Dive

```
                               ┌──────────────────────────────────────────────┐
                               │           User Request & Selection           │
                               │  - Template (Desk Monologue vs Podcast Desk) │
                               │  - Duration (8s-40s Video vs 1m-5m Audio)    │
                               │  - Topic & Familiarity                       │
                               └──────────────────────┬───────────────────────┘
                                                      │
                                    ┌─────────────────▼──────────────────┐
                                    │      Vercel Workflow Trigger       │
                                    │    generateShowWorkflow(showId)    │
                                    └─────────────────┬──────────────────┘
                                                      │
                                    ┌─────────────────▼──────────────────┐
                                    │   Step 1: Research (Gemini 3.7)    │
                                    │   Google Search Grounding Active   │
                                    └─────────────────┬──────────────────┘
                                                      │
                                    ┌─────────────────▼──────────────────┐
                                    │    Step 2: Scripting & Parsing     │
                                    │  Multi-speaker JSON Transcript Seg │
                                    └─────────────────┬──────────────────┘
                                                      │
                                    ┌─────────────────▼──────────────────┐
                                    │  Check Format Step (duration > 40s)│
                                    └────────┬───────────────────┬───────┘
                                             │                   │
                     duration > 40s (Audio)  │                   │ duration <= 40s (Video)
                                             ▼                   ▼
     ┌─────────────────────────────────────────┐       ┌─────────────────────────────────────────┐
     │       Audio Podcast Synthesis Step      │       │     Frame Chain & Generate Clips Step   │
     │ ─────────────────────────────────────── │       │ ─────────────────────────────────────── │
     │ Model: gemini-3.1-flash-tts-preview     │       │ Model: veo-3.1-generate-preview         │
     │ Multi-Speaker Voice Config (Charon,     │       │ 8s clips per segment (max 5 clips = 40s)│
     │   Orus, Puck, Kore, Fenrir, Aoede)      │       │ Face-Anchored Reference Conditioning    │
     │ Backchannel cues: [laughs], [chuckles]  │       │ Start/End Frame Interpolation Chaining  │
     │ Turn-taking & natural overlap           │       │ RAI Filter Catch & Prompt Rewrite Loop  │
     │ Direct WAV Encoding                     │       │ 2 RPM Rate Limiter Slot Lock            │
     └───────────────────┬─────────────────────┘       └───────────────────┬─────────────────────┘
                         │                                                 │
                         │                                                 ▼
                         │                             ┌─────────────────────────────────────────┐
                         │                             │            Stitch Clips Step            │
                         │                             │ ─────────────────────────────────────── │
                         │                             │ FFmpeg Concat Demuxer (-c copy)         │
                         │                             │ Fallback: -c:a aac -ar 48000 -b:a 128k  │
                         │                             └───────────────────┬─────────────────────┘
                         │                                                 │
                         └───────────────────────┬─────────────────────────┘
                                                 │
                                                 ▼
                               ┌──────────────────────────────────┐
                               │           Upload Step            │
                               │ ──────────────────────────────── │
                               │ Mux Direct Upload (audio/video)  │
                               │ Wait for Asset Ready & Playback  │
                               │ Update DB -> Ready for Stream    │
                               └──────────────────────────────────┘
```

### 3.1 Audio Podcasts Engine (Up to 5 min / 300s)

1. **Model**: `gemini-3.1-flash-tts-preview` invoked with `responseModalities: ["AUDIO"]`.
2. **Multi-Speaker Dialogue Orchestration**:
   - `app/lib/tts.ts` configures `multiSpeakerVoiceConfig`:
     ```typescript
     speechConfig: {
       multiSpeakerVoiceConfig: {
         speakerVoiceConfigs: hosts.map((h, i) => ({
           speaker: h.name,
           voiceConfig: {
             prebuiltVoiceConfig: { voiceName: voiceForHost(h.name, i) },
           },
         })),
       },
     }
     ```
3. **Voice Pool & Mechanics Mapping**:
   - `Charon`: John Oliver (British, passionate, indignant rants), Colin Jost (preppy, deadpan news anchor).
   - `Orus`: Seth Meyers (cerebral, dry, self-aware delivery).
   - `Puck`: Michael Che (casual, irreverent, conversational).
   - Fallback Pool: `["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Enceladus"]`.
4. **Dialogue Performance & Script Cues**:
   - Gemini 3.1 Flash TTS natively understands speaker prefixes (`SpeakerName: ...`) and expressive performance tags:
     - Laughter & chuckles: `[laughs]`, `(laughs)`, `[chuckles]`, `[snickers]`.
     - Vocal gestures & backchannels: `[sighs]`, `[clears throat]`, `[applause]`, `[gasp]`.
     - Natural conversational pacing: ellipses `...`, em-dashes `—`, question inflection.
5. **Compute & Cost Efficiency**:
   - Full 5-minute (300s) multi-speaker conversation synthesized in a single API call (~3–8 seconds).
   - Completely avoids Veo video generation cost and latency bottlenecks.
6. **Mux Audio Streaming**:
   - The resulting PCM audio is containerized to WAV (24 kHz 16-bit mono RIFF header) and directly uploaded to Mux via `createDirectUpload()` with `Content-Type: audio/wav`.
   - Mux ingests the audio and provisions an instant audio playback ID accessible via the Mux Player.

---

### 3.2 Video Shows Engine (Capped at 40s)

1. **Model**: `veo-3.1-generate-preview` producing 8-second 1080p 16:9 MP4 clips.
2. **Duration Constraints & Clip Math**:
   - 8s = 1 clip
   - 16s = 2 clips
   - 24s = 3 clips
   - 32s = 4 clips
   - 40s = 5 clips (**HARD MAXIMUM**)
3. **Face-Anchored Reference Conditioning**:
   - Stored in `assets/reference-images/<slug>.<ext>` (`.png`, `.jpeg`, `.jpg`, `.webp`).
   - Passed via `referenceImages: [{ image: { imageBytes, mimeType }, referenceType: VideoGenerationReferenceType.ASSET }]`.
   - Requires `personGeneration: "allow_adult"` in Veo config.
4. **Frame Chaining & Interpolation**:
   - Anchor clip generated first with reference image.
   - `extractFrame(framingClipPath, 0)` extracts start frame (0s) and `extractFrame(framingClipPath, 7.5)` extracts end frame (7.5s) as PNGs.
   - Subsequent content clips use `generateVideoClipInterpolated`:
     ```typescript
     image: { imageBytes: firstFrameBytes, mimeType: "image/png" },
     config: {
       lastFrame: { imageBytes: lastFrameBytes, mimeType: "image/png" },
       personGeneration: "allow_adult",
       durationSeconds: 8,
     }
     ```
5. **Responsible AI (RAI) Resilience**:
   - Catches `VeoRAIFilterError` from API response (`raiMediaFilteredCount > 0`).
   - Calls `reviseSegmentText()` with `gemini-3.7-flash` to sanitize celebrity names, copyrighted entities, or controversial words while preserving comedic timing and sentence length.
   - Retries generation with revised prompt up to 2 times per clip.
   - Synchronizes database transcript with revised dialogue text.

---

## 4. Audio Processing & Normalization Architecture

### 4.1 Sample Rate & Audio Pipeline Comparison

| Property | Gemini TTS Output | Veo Video Native Audio | Stitching / Broadcast Output | Mux Target Ingestion |
| :--- | :--- | :--- | :--- | :--- |
| **Sample Rate** | 24,000 Hz (24 kHz) | 48,000 Hz (48 kHz) | **48,000 Hz (48 kHz)** | 48,000 Hz (48 kHz) |
| **Bit Depth** | 16-bit PCM | 16-bit AAC | 16-bit AAC / PCM | 16-bit AAC / PCM |
| **Channels** | 1 (Mono) | 2 (Stereo) | 2 (Stereo) / 1 (Mono) | Stereo / Mono |
| **Bitrate** | 384 kbps (uncompressed) | ~128 kbps AAC | 128 kbps AAC (`-b:a 128k`) | Adaptive HLS |

### 4.2 FFmpeg Stitching & 48 kHz Normalization Engine (`app/lib/stitch.ts`)

1. **Lossless Demuxer Concat**:
   ```bash
   ffmpeg -y -f concat -safe 0 -i list.txt -c copy output.mp4
   ```
2. **Broadcast Normalization Re-Encode Fallback**:
   When codecs, sample rates, or frame timestamps differ between clips, FFmpeg executes a fallback pass:
   ```bash
   ffmpeg -y -f concat -safe 0 -i list.txt -c:v libx264 -preset fast -crf 23 -c:a aac -ar 48000 -b:a 128k output.mp4
   ```
   - `-ar 48000`: Resamples audio to standard 48 kHz broadcast sample rate.
   - `-c:a aac -b:a 128k`: High-fidelity AAC stereo encoding.
   - `-c:v libx264 -preset fast -crf 23`: Standard H.264 visual encoding.

---

## 5. Circuit Breakers & Fault Tolerance

| Circuit Breaker | Threshold / Constraint | Enforcement Layer | Failure Action / Handling |
| :--- | :--- | :--- | :--- |
| **Duration Cap (Video)** | 40s (5 clips max) | UI, Action, Workflow | `checkShowFormatStep` routes >40s to TTS Podcast; UI clamps at 40s |
| **Veo API Rate Limiter** | 2 RPM (Paid Tier 1) | `app/lib/veo.ts` | Sliding window lock (`waitForVeoSlot`), waits until window clears |
| **Veo Quota Exhaustion (429)** | 429 / RESOURCE_EXHAUSTED | `app/lib/veo.ts` | Exponential backoff (60s, 120s, 180s) up to 3 retries |
| **RAI Content Filter** | Filter trigger | `workflows/generate-show.ts` | LLM dialogue sanitizer (`reviseSegmentText`) + 2 retries |
| **Veo Polling Timeout** | 45 polls × 10s (450s / 7.5m) | `app/lib/veo.ts` | Throws explicit timeout error, marks step failed |
| **FFmpeg Concat Timeout** | 120s (copy) / 300s (encode) | `app/lib/stitch.ts` | Aborts hanging child process with timeout rejection |
| **IP Request Rate Limit** | 5 shows / 24h per IP | `app/lib/rate-limit.ts` | Returns HTTP 429 with `Retry-After` and `X-RateLimit-*` headers |
| **Workflow Step Failure** | Any unhandled exception | `workflows/generate-show.ts` | `markFailedStep` updates DB status to `failed` and closes stream |

---

## 6. Integration Architecture: Vercel Workflows + API + Storage

### 6.1 Workflow Orchestration (`workflows/generate-show.ts`)
- **Directives**: `"use workflow"` inside `generateShowWorkflow`, `"use step"` inside all execution steps (`researchStep`, `scriptStep`, `checkShowFormatStep`, `audioPodcastSynthesisStep`, `frameChainAndGenerateClipsStep`, `stitchStep`, `uploadStep`, `markFailedStep`).
- **Progress Streaming**: Uses `workflow`'s `getWritable<ProgressEvent>({ namespace: "progress" })` and `writeToStream` to send discrete events (`research` -> `script` -> `frame-chain` -> `generate-clips` -> `stitch` -> `upload`).
- **Resumability**: If any step fails, Vercel Workflow can retry the specific step without losing previous step artifacts.

### 6.2 Storage & Mux Handoff
- Intermediate clips and audio files are stored in `os.tmpdir()/interdimensional-cable/`.
- Once stitched, the master MP4/WAV is uploaded to Mux via direct upload (`createDirectUpload()`).
- Workflow polls `waitForUploadAssetId()` and `waitForAssetReady()` before deleting local temp files (`cleanupTempFiles`).
- Database records are updated with `muxAssetId` and `muxPlaybackId`.

---

## 7. Strategic Recommendations for Implementation

1. **Audio Podcast Expansion**:
   - Ensure the template system fully populates the multi-speaker voice mappings for podcast archetypes (e.g. Rogan/Tim Dillon style hosts).
   - Add explicit laughter and backchannel tags in the Pass 3 voice refinement prompt to take full advantage of Gemini 3.1 Flash TTS expressiveness.
2. **Audio Sample Rate Consistency**:
   - For standalone audio podcasts, optionally add an FFmpeg 48 kHz resample pass if broadcast-grade 48 kHz WAV/AAC is required prior to Mux ingestion.
3. **Hard Circuit Breaker Safeguard**:
   - Keep the duration check in `checkShowFormatStep` and ensure any video request exceeding 40s is gracefully clamped or routed to audio.
4. **Remotion Social Clips Synergy**:
   - Remotion's audiogram visualizer (`useAudioData` + `visualizeAudio`) can be directly composed with Gemini TTS podcast audio for generating shareable social video clips from long-form podcasts.
