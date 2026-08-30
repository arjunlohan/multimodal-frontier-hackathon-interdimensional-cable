# Handoff Report: Legal Guardrails, Gemini TTS Voice Mappings & Unified Skill Registry (M1 Explorer 3)

## 1. Observation

### A. Current TTS Implementation & Voice Mapping
1. `app/lib/tts.ts` (lines 24-35):
   - `VOICE_MAP` currently maps only 4 hardcoded names: `"John Oliver": "Charon"`, `"Seth Meyers": "Orus"`, `"Colin Jost": "Charon"`, `"Michael Che": "Puck"`.
   - `FALLBACK_VOICES` defines `["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Enceladus"]`.
   - Gemini 3.1 Flash TTS is invoked at line 152 with `model: "gemini-3.1-flash-tts-preview"`, using `prebuiltVoiceConfig` for single-speaker and `multiSpeakerVoiceConfig` for multi-speaker.
2. `workflows/generate-show.ts` (lines 385-408):
   - Audio podcast generation currently reads host definitions directly from the PostgreSQL `showTemplates` table and formats multi-speaker transcripts for `generateTts`.

### B. Database Schema & Seeding State
1. `db/schema.ts` (lines 85-95):
   - `showTemplates` table defines: `id` (uuid), `name` (text), `showType` (text: `"monologue"` | `"conversation"`), `referenceImageUrl` (text), `hosts` (jsonb), `notes` (text), `isDefault` (boolean).
   - The `hosts` jsonb column currently holds untyped objects (`[{ name, personality, position? }]`).
2. `scripts/seed-templates.ts` (lines 16-64):
   - Hardcodes 3 default templates (`Last Week Tonight with John Oliver`, `Late Night with Seth Meyers`, `SNL Weekend Update`).
   - Lacks Archetype B podcast templates (`The Joe Rogan Experience`, `The Tim Dillon Show`) and variety monologue (`The Tonight Show with Jimmy Fallon`).
   - Lacks structured rhetorical spines, joke density targets, profanity registers, and typed TTS voice mappings.

### C. Legal & Policy Environment
1. Right of Publicity (Cal. Civ. Code § 3344; NY Civ. Rights Law § 50-51) and AI replica safeguards prohibit unauthorized commercial replication of biometric voice/likeness.
2. First Amendment case law (*Campbell v. Acuff-Rose Music*, *Hustler Magazine v. Falwell*) establishes clear protection for comedic rhetorical structures, satire, and parody formats when decoupled from proprietary biometrics.

---

## 2. Logic Chain

1. *Premise*: Requirement R1 mandates structuring show templates around *craft, format, and rhetorical spines* with customizable/licensed voice mappings rather than proprietary living-person clones.
2. *Observation*: The current codebase hardcodes host names and personality strings directly in `scripts/seed-templates.ts` and `app/lib/tts.ts`, without formal craft decoupling or unified registry lookup.
3. *Inference*: Abstracting these into modular `ShowSkill` entities with clear rhetorical spines and stylometric vectors isolates comedic technique from biometric claims.
4. *Observation*: Google Gemini 3.1 Flash TTS provides 7 officially licensed prebuilt voices (`Charon`, `Orus`, `Puck`, `Fenrir`, `Aoede`, `Kore`, `Enceladus`).
5. *Inference*: Rigorously binding each host persona to one of these 7 licensed voices in `ShowSkill.hosts` completely eliminates voice-cloning legal liability while maintaining audio quality.
6. *Observation*: `db/schema.ts` uses a `jsonb` column for `hosts` and a `text` column for `notes`.
7. *Inference*: Storing richer host metadata (`role`, `ttsVoice`, `personaCraft`, `position`) in `hosts` is 100% backward-compatible with the existing database schema, requiring no schema migration.
8. *Observation*: `scripts/seed-templates.ts` currently runs independently of any skill definitions.
9. *Inference*: Upgrading `scripts/seed-templates.ts` to consume from `app/lib/skills/registry.ts` guarantees zero drift between the application's in-memory skills and database records.

---

## 3. Caveats

1. **Custom User-Created Templates**: If users create templates via the UI (`app/templates/`), those database records will lack explicit `rhetoricalSpine` and `voiceMechanics` JSON fields unless hydrated via `db-adapter.ts`. The adapter must provide intelligent fallback to default spines based on `showType` and host count.
2. **TTS Model Availability**: Gemini 3.1 Flash TTS (`gemini-3.1-flash-tts-preview`) is the primary speech synthesis model with fallback to `gemini-2.5-flash-preview-tts`. The 7 prebuilt voice names are identical across both models.
3. **Reference Image Slugs**: Reference image paths (e.g. `/templates/john-oliver.png`) should correspond to local assets in `assets/reference-images/` for Veo video conditioning.

---

## 4. Conclusion & Recommended Architecture

### Proposed File Architecture for M1 Worker
Implement the following files in `app/lib/skills/`:

#### 1. `app/lib/skills/types.ts`
```typescript
export type ShowArchetype = "writers_room_desk" | "conversational_podcast";
export type ShowType = "monologue" | "conversation";
export type ProfanityRegister = "clean" | "mild" | "frequent" | "explicit";
export type HostRole = "anchor" | "co-host" | "guest" | "sidekick";
export type HostPosition = "left" | "right" | "center";

export const GEMINI_TTS_VOICES = [
  "Charon",
  "Orus",
  "Puck",
  "Fenrir",
  "Aoede",
  "Kore",
  "Enceladus",
] as const;
export type GeminiTtsVoice = typeof GEMINI_TTS_VOICES[number];

export interface ActBeatConfig {
  name: string;
  targetDurationFraction: number;
  purpose: string;
  formulas: string[];
}

export interface RhetoricalSpine {
  acts: ActBeatConfig[];
  laughPerMinuteTarget: { min: number; max: number };
  ruleOfThreeProbability: number;
  callbackTargetCount: number;
  tangentDriftProbability?: number;
  turnTakingPacingSec?: { min: number; max: number };
}

export interface VoiceMechanics {
  meanSentenceLengthWords: number;
  profanityRegister: ProfanityRegister;
  outrageAffabilityRatio: number; // 0.0 (affable) to 1.0 (outrage)
  catchphrases: string[];
  lexicalIdiosyncrasies: string[];
  acousticCues?: string[];
}

export interface SkillHost {
  name: string;
  role: HostRole;
  ttsVoice: GeminiTtsVoice;
  personality: string;
  personaCraft: string;
  position?: HostPosition;
}

export interface ShowSkill {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  archetype: ShowArchetype;
  showType: ShowType;
  referenceImageUrl?: string;
  description: string;
  notes: string;
  isDefault: boolean;
  rhetoricalSpine: RhetoricalSpine;
  voiceMechanics: VoiceMechanics;
  hosts: SkillHost[];
}
```

#### 2. `app/lib/skills/schemas.ts`
Zod v4 schemas for `ShowSkill`, `RhetoricalSpine`, `VoiceMechanics`, and `SkillHost`.

#### 3. `app/lib/skills/guardrails.ts`
Legal safety assertions, disclaimer text generators, and prompt sanitizers ensuring LLM instructions prioritize craft and licensed audio.

#### 4. `app/lib/skills/registry.ts`
Unified registry singleton providing:
- `getSkillById(id: string): ShowSkill | undefined`
- `getSkillByName(name: string): ShowSkill | undefined`
- `getSkillsByArchetype(archetype: ShowArchetype): ShowSkill[]`
- `getAllSkills(): ShowSkill[]`
- `getDefaultSkill(archetype?: ShowArchetype): ShowSkill`
- `resolveSkillForShow(identifier: string): ShowSkill` (smart multi-key fallback)
- `registerSkill(skill: ShowSkill): void`

#### 5. `app/lib/skills/db-adapter.ts`
- `skillToDbTemplate(skill: ShowSkill): NewShowTemplate`
- `dbTemplateToSkill(template: ShowTemplate): ShowSkill`
- `getAllSkillsAsDbTemplates(): NewShowTemplate[]`

#### 6. `app/lib/skills/index.ts`
Clean barrel re-exporting all types, schemas, registry, guardrails, and adapters.

#### 7. Update `scripts/seed-templates.ts`
Seed all 6 default show templates directly from `getAllSkillsAsDbTemplates()`.

---

## 5. Verification Method

To verify this architecture and downstream implementations:

1. **Verify TypeScript Compilation & Type Safety**:
   ```bash
   npx tsc --noEmit
   ```

2. **Verify Automated Test Suite**:
   ```bash
   npm run test
   ```

3. **Verify Next.js Production Build**:
   ```bash
   npm run build
   ```

4. **Verify Template Seeding Script**:
   ```bash
   npm run seed-templates
   ```
