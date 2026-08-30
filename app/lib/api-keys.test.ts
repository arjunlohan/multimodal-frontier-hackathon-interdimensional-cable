import { Buffer } from "node:buffer";

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mutable so individual tests can flip REQUIRE_USER_API_KEYS and the secret.
const mockEnv: Record<string, string | undefined> = {
  GEMINI_API_KEY: "AQ.ServerOwnedKey_aaaaaaaaaaaaaaaaaaaaaaaaaa",
  GOOGLE_GENERATIVE_AI_API_KEY: undefined,
  GEMINI_VIDEO_API_KEY: undefined,
  KEY_ENCRYPTION_SECRET: "test-secret",
  REQUIRE_USER_API_KEYS: undefined,
  DATABASE_URL: "postgresql://localhost:5432/test",
};

vi.mock("./env", () => ({ get env() { return mockEnv; } }));
vi.mock("@/app/lib/env", () => ({ get env() { return mockEnv; } }));

const {
  decryptApiKeys,
  encryptApiKeys,
  looksLikeGoogleKey,
  maskKey,
  requiresUserApiKeys,
  resolveGeminiDeveloperKey,
  resolveVertexKey,
  withUserApiKeys,
} = await import("./api-keys");

const USER_KEYS = {
  vertexKey: "AQ.UserSuppliedKey_bbbbbbbbbbbbbbbbbbbbbbbbb",
  geminiKey: "AIzaUserVideoKey_ccccccccccccccccccccccccc",
};

beforeEach(() => {
  mockEnv.KEY_ENCRYPTION_SECRET = "test-secret";
  mockEnv.REQUIRE_USER_API_KEYS = undefined;
  mockEnv.GEMINI_API_KEY = "AQ.ServerOwnedKey_aaaaaaaaaaaaaaaaaaaaaaaaaa";
  mockEnv.GEMINI_VIDEO_API_KEY = undefined;
});

describe("at-rest encryption", () => {
  it("round-trips both keys", () => {
    expect(decryptApiKeys(encryptApiKeys(USER_KEYS))).toEqual(USER_KEYS);
  });

  it("never leaves the key readable in the ciphertext", () => {
    const blob = encryptApiKeys(USER_KEYS);
    expect(blob).not.toContain(USER_KEYS.vertexKey);
    expect(blob).not.toContain("AQ.UserSupplied");
    expect(blob).not.toContain(USER_KEYS.geminiKey);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptApiKeys(USER_KEYS)).not.toEqual(encryptApiKeys(USER_KEYS));
  });

  it("rejects tampered ciphertext rather than returning garbage", () => {
    const [iv, tag] = encryptApiKeys(USER_KEYS).split(":");
    const tampered = [iv, tag, Buffer.from("swapped").toString("base64url")].join(":");
    expect(decryptApiKeys(tampered)).toBeUndefined();
  });

  it("cannot be decrypted with a different secret", () => {
    const blob = encryptApiKeys(USER_KEYS);
    mockEnv.KEY_ENCRYPTION_SECRET = "some-other-secret";
    expect(decryptApiKeys(blob)).toBeUndefined();
  });

  it("treats empty or malformed payloads as absent", () => {
    expect(decryptApiKeys(null)).toBeUndefined();
    expect(decryptApiKeys(undefined)).toBeUndefined();
    expect(decryptApiKeys("")).toBeUndefined();
    expect(decryptApiKeys("not-a-payload")).toBeUndefined();
  });
});

describe("key resolution", () => {
  it("falls back to the server key when no visitor key is in scope", () => {
    expect(resolveVertexKey()).toBe(mockEnv.GEMINI_API_KEY);
  });

  it("prefers the visitor's key over the server's", () => {
    const resolved = withUserApiKeys(USER_KEYS, () => resolveVertexKey());
    expect(resolved).toBe(USER_KEYS.vertexKey);
    expect(resolved).not.toBe(mockEnv.GEMINI_API_KEY);
  });

  it("does not leak the visitor's key outside its scope", () => {
    withUserApiKeys(USER_KEYS, () => resolveVertexKey());
    expect(resolveVertexKey()).toBe(mockEnv.GEMINI_API_KEY);
  });

  it("refuses the server key when the deployment requires visitor keys", () => {
    mockEnv.REQUIRE_USER_API_KEYS = "true";
    expect(requiresUserApiKeys()).toBe(true);
    // This is the whole point: a stranger cannot spend the owner's credits.
    expect(resolveVertexKey()).toBeUndefined();
    expect(resolveGeminiDeveloperKey()).toBeUndefined();
  });

  it("still serves the visitor's own key when they supply one", () => {
    mockEnv.REQUIRE_USER_API_KEYS = "true";
    expect(withUserApiKeys(USER_KEYS, () => resolveVertexKey())).toBe(USER_KEYS.vertexKey);
    expect(withUserApiKeys(USER_KEYS, () => resolveGeminiDeveloperKey())).toBe(USER_KEYS.geminiKey);
  });

  it("keeps concurrent runs isolated from each other", async () => {
    const a = { vertexKey: "AQ.RunA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
    const b = { vertexKey: "AQ.RunB_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };

    // Deliberately interleaved: B resolves while A is still suspended.
    const [ra, rb] = await Promise.all([
      withUserApiKeys(a, async () => {
        await new Promise(r => setTimeout(r, 30));
        return resolveVertexKey();
      }),
      withUserApiKeys(b, async () => {
        await new Promise(r => setTimeout(r, 5));
        return resolveVertexKey();
      }),
    ]);

    expect(ra).toBe(a.vertexKey);
    expect(rb).toBe(b.vertexKey);
  });
});

describe("presentation and validation", () => {
  it("masks a key without revealing a usable portion", () => {
    const masked = maskKey(USER_KEYS.vertexKey);
    expect(masked).toContain("…");
    expect(masked).not.toContain(USER_KEYS.vertexKey.slice(8));
    expect(masked.length).toBeLessThan(USER_KEYS.vertexKey.length);
  });

  it("accepts both Google key formats and rejects anything else", () => {
    expect(looksLikeGoogleKey(USER_KEYS.vertexKey)).toBe(true);
    expect(looksLikeGoogleKey(USER_KEYS.geminiKey)).toBe(true);
    expect(looksLikeGoogleKey("hunter2")).toBe(false);
    expect(looksLikeGoogleKey("sk-not-a-google-key-at-all-here")).toBe(false);
    // Right prefix, too short to be real.
    expect(looksLikeGoogleKey("AQ.short")).toBe(false);
  });
});
