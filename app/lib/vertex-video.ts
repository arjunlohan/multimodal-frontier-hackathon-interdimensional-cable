/* eslint-disable no-console */
import { Buffer } from "node:buffer";

import { MissingApiKeyError, resolveVertexKey } from "./api-keys";
import { env } from "./env";

/**
 * Vertex long-running video generation over REST.
 *
 * The @google/genai SDK cannot do this with an express-mode (`AQ.*`) API key:
 * `generateVideos` resolves to PredictLongRunning, which needs an explicit
 * project resource path, and express keys reject `project`/`location` in the
 * client initializer. Every attempt failed with RESOURCE_PROJECT_INVALID.
 *
 * Calling the REST endpoint directly with the project path in the URL and the
 * key in the header works, so video generation goes through here instead.
 */

export interface VertexVideoParams {
  prompt: string;
  durationSeconds: number;
  aspectRatio: string;
  resolution: string;
  /** First frame, base64 — used for frame chaining. */
  firstFrameBytes?: string;
  firstFrameMimeType?: string;
  /** Last frame, base64 — used for interpolation between clips. */
  lastFrameBytes?: string;
  lastFrameMimeType?: string;
}

export interface VertexVideoResult {
  videoBuffer: Buffer;
  mimeType: string;
  operationName: string;
}

export class VertexVideoRAIError extends Error {
  constructor(public reasons: string[]) {
    super(`Video generation blocked by safety filters: ${reasons.join("; ")}`);
    this.name = "VertexVideoRAIError";
  }
}

const DEFAULT_MODEL = "veo-3.1-generate-001";
const DEFAULT_LOCATION = "us-central1";
const POLL_INTERVAL_MS = 10_000;
const MAX_POLLS = 45;

function config() {
  const apiKey = resolveVertexKey();
  const project = env.GOOGLE_CLOUD_PROJECT;
  if (!apiKey) {
    throw new MissingApiKeyError();
  }
  if (!project) {
    throw new Error(
      "GOOGLE_CLOUD_PROJECT is required for video generation: Vertex long-running " +
      "video operations cannot be addressed by an express-mode API key alone.",
    );
  }
  const location = env.GOOGLE_CLOUD_LOCATION ?? DEFAULT_LOCATION;
  const model = env.VERTEX_VIDEO_MODEL ?? DEFAULT_MODEL;
  const base = `https://aiplatform.googleapis.com/v1beta1/projects/${project}/locations/${location}/publishers/google/models/${model}`;
  return { apiKey, base, model };
}

async function post(url: string, apiKey: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });
  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Vertex video ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
}

export async function generateVideoViaVertex(params: VertexVideoParams): Promise<VertexVideoResult> {
  const { apiKey, base, model } = config();

  const instance: Record<string, unknown> = { prompt: params.prompt };
  if (params.firstFrameBytes) {
    instance.image = {
      bytesBase64Encoded: params.firstFrameBytes,
      mimeType: params.firstFrameMimeType ?? "image/png",
    };
  }
  if (params.lastFrameBytes) {
    instance.lastFrame = {
      bytesBase64Encoded: params.lastFrameBytes,
      mimeType: params.lastFrameMimeType ?? "image/png",
    };
  }

  console.log(`[vertex-video] ${model} · ${params.resolution} ${params.aspectRatio} ${params.durationSeconds}s` +
    `${params.firstFrameBytes ? " · chained from previous frame" : ""}`);

  const started = await post(`${base}:predictLongRunning`, apiKey, {
    instances: [instance],
    parameters: {
      durationSeconds: params.durationSeconds,
      sampleCount: 1,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution,
    },
  });

  const operationName = started.name as string | undefined;
  if (!operationName) {
    throw new Error(`Vertex video did not return an operation name: ${JSON.stringify(started).slice(0, 200)}`);
  }

  for (let poll = 1; poll <= MAX_POLLS; poll++) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    const op = await post(`${base}:fetchPredictOperation`, apiKey, { operationName });

    if (op.error) {
      throw new Error(`Vertex video generation failed: ${JSON.stringify(op.error).slice(0, 300)}`);
    }
    if (!op.done) {
      console.log(`[vertex-video] polling... ${poll}`);
      continue;
    }

    const response = (op.response ?? {}) as {
      videos?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
      raiMediaFilteredCount?: number;
      raiMediaFilteredReasons?: string[];
    };

    const filtered = response.raiMediaFilteredCount ?? 0;
    if (filtered > 0) {
      throw new VertexVideoRAIError(response.raiMediaFilteredReasons ?? ["unspecified"]);
    }

    const b64 = response.videos?.[0]?.bytesBase64Encoded;
    if (!b64) {
      throw new Error(`Vertex video completed but returned no video: ${JSON.stringify(response).slice(0, 200)}`);
    }

    console.log(`[vertex-video] complete after ${poll} polls`);
    return {
      videoBuffer: Buffer.from(b64, "base64"),
      mimeType: response.videos?.[0]?.mimeType ?? "video/mp4",
      operationName,
    };
  }

  throw new Error(`Vertex video generation timed out after ${MAX_POLLS} polls`);
}
