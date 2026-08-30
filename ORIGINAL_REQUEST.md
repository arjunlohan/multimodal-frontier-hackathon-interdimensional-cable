# Original User Request

## 2026-08-30T02:48:16Z

Architect and implement a production-grade multi-agent comedy show & podcast orchestrator for **Interdimensional Cable** based on deep industry research across the two core comedic archetypes (Writers'-Room Desk Shows vs. Lightly-Prepped Conversational Podcasts), incorporating findings from computational humor literature (DeepMind FAccT 2024, Burrows's Delta, Incongruity Theory) and Google Cloud/Gemini multimodal infrastructure.

Working directory: /Users/lohan/Downloads/GitHub/multimodal-frontier-hackathon-interdimensional-cable
Integrity mode: demo

## Requirements

### R1. Two-Archetype Modular Show SKILL Engine

Implement modular, high-craft show definition files (`SKILL.md` / template specs) covering both major comedy production archetypes:

- **Archetype A (Writers'-Room Desk Shows)**: Encodes multi-act rhetorical structure (Thesis → Supporting Evidence + Absurdist Analogies → Conclusion/Call-to-Action), rule-of-three, tags, callbacks, and joke density formulas for John Oliver, Seth Meyers ("A Closer Look"), The Daily Show, and Fallon.
- **Archetype B (Conversational Long-Form Podcasts)**: Encodes prep-doc generation, talking point trees, dynamic tangent drift, and natural multi-speaker turn-taking for Rogan-style and Tim Dillon-style dialogue.
- **Legal & Identity Guardrails**: Structure templates around _craft, format, and rhetorical spines_ with customizable/licensed voice mappings rather than proprietary living-person clones.

### R2. Multi-Pass Scripting & Dramaturgy Orchestrator

Upgrade the scripting pipeline from single-prompt generation to a professional 3-pass writers'-room loop:

1. **Pass 1 (Grounded Research & Premise Seed)**: Gemini 3.7 Flash + Google Search Grounding gathers verified facts, obscure details, and incongruities.
2. **Pass 2 (Head-Writer Draft & Joke Construction)**: Generates structured act beats applying explicit comedic formulas (misdirection, escalating absurdist comparisons, act-outs).
3. **Pass 3 ("Sound-Like-Them" Voice Pass & Table-Read Prune)**: Evaluates rhythm, sentence cadence, profanity/outrage register, and trims weak jokes based on stylistic criteria.

### R3. Dual-Modality Media Engine (40s Video vs. 5m Audio Podcast)

- **Audio Podcasts (Up to 5 min / 300s)**: Direct multi-speaker dialogue synthesis using Gemini 3.1 Flash TTS (`gemini-3.1-flash-tts-preview`) with natural backchannels, laughter cues, and turn-taking.
- **Video Shows (Capped at 40s)**: Google Veo 3.1 (`veo-3.1-generate-preview`) video clip generation with face-anchored reference conditioning and 48 kHz broadcast audio stitching.

### R4. Persistent Agent Memory Bank & Real-Time RAG

Integrate the 4-tier cognitive memory bank (Episodic, Semantic via Google `text-embedding-004` 768d pgvector, Procedural via Show SKILLs, Working Memory via live chat) to personalize host banter and joke depth to listener knowledge across sessions.

## Acceptance Criteria

### Scripting & Dramaturgy Craft

- [ ] Show template definitions encode explicit rhetorical spines, joke-per-minute target densities, and voice mechanics vectors (sentence length, profanity, outrage vs. affability).
- [ ] Script generation pipeline executes a verified multi-pass refinement process (Research Seed → Joke Construction → Voice Polish).
- [ ] Prompts and templates maintain strict legal safety by prioritizing genre craft and format structures.

### Execution & Verification

- [ ] Audio podcast pipeline generates up to 5-minute multi-speaker audio with Gemini 3.1 Flash TTS without invoking Veo.
- [ ] Video show pipeline enforces the 40s Veo 3.1 cap with 48 kHz audio normalization and circuit breakers.
- [ ] Automated test suite (`npm run test`) and Next.js production build (`npm run build`) pass with 0 errors.
