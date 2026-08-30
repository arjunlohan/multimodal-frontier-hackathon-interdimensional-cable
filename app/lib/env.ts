/* eslint-disable node/no-process-env */
import { z } from "zod";

function optionalString(description: string, message?: string) {
  return z.preprocess(
    value => typeof value === "string" && value.trim().length === 0 ? undefined : value,
    z.string().trim().min(1, message).optional(),
  ).describe(description);
}

function requiredString(description: string, message?: string) {
  return z.preprocess(
    value => typeof value === "string" ? value.trim().length > 0 ? value.trim() : undefined : value,
    z.string().trim().min(1, message),
  ).describe(description);
}

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development").describe("Runtime environment."),

  // Mux credentials (required for @mux/ai)
  MUX_TOKEN_ID: requiredString("Mux access token ID.", "Required to access Mux APIs"),
  MUX_TOKEN_SECRET: requiredString("Mux access token secret.", "Required to access Mux APIs"),

  // Mux plan capacity (free plan caps stored assets; generation is wasted if we exceed it)
  MUX_ASSET_LIMIT: optionalString("Max stored Mux assets for the current plan (default 10, the free-plan cap)."),

  // Mux signing keys (optional, for signed playback URLs)
  MUX_SIGNING_KEY: optionalString("Mux signing key ID for signed playback URLs."),
  MUX_PRIVATE_KEY: optionalString("Mux signing private key for signed playback URLs."),

  // AI provider keys (optional, depends on which provider you use but at least one is required)
  OPENAI_API_KEY: optionalString("OpenAI API key for OpenAI-backed workflows."),
  ANTHROPIC_API_KEY: optionalString("Anthropic API key for Claude-backed workflows."),
  GOOGLE_GENERATIVE_AI_API_KEY: optionalString("Google Generative AI API key for Gemini-backed workflows."),

  // Google API key for all Gemini inference and Veo video generation
  GEMINI_API_KEY: optionalString("Google API key for all Gemini inference (research, scripting, TTS, embeddings) and Veo video generation on Vertex."),
  GOOGLE_GENAI_USE_VERTEX: optionalString("Set to \"true\" when GEMINI_API_KEY is a Vertex/Agent Platform express-mode key (AQ.* prefix)."),
  GOOGLE_CLOUD_PROJECT: optionalString("GCP project ID. Required for video generation: long-running video ops cannot be addressed by an express-mode key alone."),
  GOOGLE_CLOUD_LOCATION: optionalString("Vertex location for video generation (default us-central1)."),
  VERTEX_VIDEO_MODEL: optionalString("Vertex video model id (default veo-3.1-generate-001)."),

  // Dedicated video key. Video is the one workload that can sensibly sit on a
  // different billing surface (and key) from the rest of the pipeline.
  GEMINI_VIDEO_API_KEY: optionalString("Gemini Developer API key used only for video generation. When set, video uses GEMINI_VIDEO_MODEL on the Developer API instead of Vertex."),
  GEMINI_VIDEO_MODEL: optionalString("Developer API video model (default gemini-omni-1.1-flash). Only used with GEMINI_VIDEO_API_KEY."),

  // ElevenLabs API key (optional; required only if you want to use translateAudio)
  ELEVENLABS_API_KEY: optionalString("ElevenLabs API key for translateAudio workflow."),

  // S3-compatible storage. Optional: only the legacy @mux/ai translation
  // primitives read these, and those also need ELEVENLABS_API_KEY. Requiring
  // them would block boot for anyone who only wants the show pipeline.
  S3_ENDPOINT: optionalString("S3-compatible endpoint for the legacy translation workflows."),
  S3_REGION: optionalString("S3 region for the legacy translation workflows."),
  S3_BUCKET: optionalString("S3 bucket for the legacy translation workflows."),
  S3_ACCESS_KEY_ID: optionalString("S3 access key ID for the legacy translation workflows."),
  S3_SECRET_ACCESS_KEY: optionalString("S3 secret access key for the legacy translation workflows."),

  // Database (PostgreSQL with pgvector)
  DATABASE_URL: requiredString("PostgreSQL connection string (pgvector). Required to store/search the Mux catalog metadata.", "Required to connect to the database."),

  // Remotion Lambda (optional; required only if you want to render social clips)
  REMOTION_AWS_ACCESS_KEY_ID: optionalString("Remotion AWS access key ID for rendering social clips."),
  REMOTION_AWS_SECRET_ACCESS_KEY: optionalString("Remotion AWS secret access key for rendering social clips."),

  // Base URL (optional)
  NEXT_PUBLIC_BASE_URL: optionalString("Base URL for public endpoints and workflow callbacks."),
});

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(): Env {
  // Skip validation during Next.js build phase to allow building without runtime env vars
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return process.env as unknown as Env;
  }

  const parsedEnv = EnvSchema.safeParse(process.env);

  if (!parsedEnv.success) {
    // In development, show detailed errors
    // In production, fail fast but don't leak sensitive info
    const isDev = process.env.NODE_ENV === "development";

    if (isDev) {
      console.error("❌ Invalid environment variables:");
      console.error(JSON.stringify(parsedEnv.error.flatten().fieldErrors, null, 2));
    } else {
      console.error("❌ Invalid environment configuration. Check your environment variables.");
    }

    throw new Error("Environment validation failed");
  }

  return parsedEnv.data;
}

// Parse on module load (server-side only)
const env: Env = parseEnv();

export { env };
export default env;
