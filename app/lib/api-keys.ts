import { AsyncLocalStorage } from "node:async_hooks";
import { Buffer } from "node:buffer";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { env } from "./env";

/**
 * Bring-your-own-key support.
 *
 * Model inference is the overwhelming majority of this product's running cost,
 * so a public deployment cannot spend the owner's Google credits on strangers.
 * Visitors supply their own keys and are billed by Google directly.
 *
 * The keys are scoped with AsyncLocalStorage rather than threaded through every
 * function signature: ten modules build their own client, and each one only
 * needs to prefer the context key over the environment key.
 *
 * Durable workflow steps do not share one async context — a run can span several
 * invocations — so a run's keys are also encrypted onto its show row and the
 * context is re-established at the top of each step. `clearShowKeys` wipes them
 * when the run finishes.
 */

export interface UserApiKeys {
  /** Vertex / Agent Platform key. Drives research, scripting, TTS, embeddings, Veo. */
  vertexKey: string;
  /** Optional Gemini Developer API key, used only for the Omni video path. */
  geminiKey?: string;
}

const keyStore = new AsyncLocalStorage<UserApiKeys>();

/** Runs `fn` with these keys visible to every client factory beneath it. */
export function withUserApiKeys<T>(keys: UserApiKeys, fn: () => T): T {
  return keyStore.run(keys, fn);
}

/** The caller-supplied keys for the current async scope, if any. */
export function getUserApiKeys(): UserApiKeys | undefined {
  return keyStore.getStore();
}

/**
 * True when this deployment refuses to spend the owner's own credits.
 *
 * Left off by default so local development keeps working from `.env.local`;
 * set `REQUIRE_USER_API_KEYS=true` on any public deployment.
 */
export function requiresUserApiKeys(): boolean {
  return env.REQUIRE_USER_API_KEYS === "true";
}

/**
 * The Vertex key to use right now: the caller's if present, otherwise the
 * server's — unless this deployment has opted out of using the server's.
 */
export function resolveVertexKey(): string | undefined {
  const supplied = keyStore.getStore()?.vertexKey;
  if (supplied) {
    return supplied;
  }
  if (requiresUserApiKeys()) {
    return undefined;
  }
  return env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY;
}

/** The Gemini Developer API key for the Omni video path, same precedence. */
export function resolveGeminiDeveloperKey(): string | undefined {
  const supplied = keyStore.getStore()?.geminiKey;
  if (supplied) {
    return supplied;
  }
  if (requiresUserApiKeys()) {
    return undefined;
  }
  return env.GEMINI_VIDEO_API_KEY;
}

/** Thrown when generation is attempted with no usable key. */
export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "This deployment requires your own Google API key. Add one in Settings — " +
      "it is used only for your own generations and billed to your Google account.",
    );
    this.name = "MissingApiKeyError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// At-rest encryption
// ─────────────────────────────────────────────────────────────────────────────
//
// A run's keys must outlive a single request, so they sit on the show row until
// the run ends. Encrypting them means a database dump alone does not leak a
// visitor's credentials.

const ALGORITHM = "aes-256-gcm";

function encryptionKey(): Buffer {
  const secret = env.KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      "KEY_ENCRYPTION_SECRET is required when REQUIRE_USER_API_KEYS is enabled. " +
      "Generate one with: openssl rand -base64 32",
    );
  }
  // Normalises any passphrase to the 32 bytes AES-256 needs.
  return createHash("sha256").update(secret).digest();
}

/** Encrypts keys for storage. Returns `iv:tag:ciphertext`, all base64url. */
export function encryptApiKeys(keys: UserApiKeys): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const plaintext = JSON.stringify(keys);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map(b => b.toString("base64url")).join(":");
}

/** Reverses `encryptApiKeys`. Returns undefined for anything unreadable. */
export function decryptApiKeys(payload: string | null | undefined): UserApiKeys | undefined {
  if (!payload) {
    return undefined;
  }
  try {
    const [ivPart, tagPart, dataPart] = payload.split(":");
    if (!ivPart || !tagPart || !dataPart) {
      return undefined;
    }
    const decipher = createDecipheriv(
      ALGORITHM,
      encryptionKey(),
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(plaintext) as UserApiKeys;
  } catch {
    // Wrong secret, tampering, or a legacy row. Never surface the reason.
    return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

/** Shape check only — cheap, and catches the common paste mistakes. */
export function looksLikeGoogleKey(key: string): boolean {
  const k = key.trim();
  // Vertex/Agent Platform express keys start "AQ.", Developer API keys "AIza".
  return (k.startsWith("AQ.") || k.startsWith("AIza")) && k.length >= 30;
}

/** Redacts a key for display: keeps enough to recognise, never enough to use. */
export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 12) {
    return "•".repeat(k.length);
  }
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}
