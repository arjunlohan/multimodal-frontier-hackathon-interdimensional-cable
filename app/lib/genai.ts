import { GoogleGenAI, ThinkingLevel } from "@google/genai";

import { MissingApiKeyError, resolveVertexKey } from "./api-keys";
import { env } from "./env";

/**
 * Builds a Google Gen AI client with the correct auth surface for the given key.
 *
 * Two surfaces exist and they are not interchangeable:
 *  - Gemini Developer API (`AIza*` keys) — billed against AI Studio prepay credits.
 *  - Vertex / Agent Platform express (`AQ.*` keys) — billed against Google Cloud.
 *
 * Express-mode keys only work with `vertexai: true`. Note that `project`/`location`
 * are mutually exclusive with `apiKey` in the client initializer, so they are omitted.
 */
export function buildGenAIClient(apiKey: string): GoogleGenAI {
  const useVertex = env.GOOGLE_GENAI_USE_VERTEX === "true" || apiKey.startsWith("AQ.");
  return useVertex ? new GoogleGenAI({ vertexai: true, apiKey }) : new GoogleGenAI({ apiKey });
}

/**
 * Forces the Gemini Developer API surface regardless of key format.
 *
 * Express (`AQ.*`) keys exist on both the Developer API and Vertex, so the key
 * prefix cannot be used to infer the surface. Video uses this when a dedicated
 * video key is configured, because gemini-omni-1.1-flash is only offered on the
 * Developer API.
 */
export function buildDeveloperApiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

/**
 * Minimal text-generation helper over the shared client.
 *
 * The chat/tangent actions previously used `@ai-sdk/google`, which always targets
 * generativelanguage.googleapis.com. A Vertex/Agent Platform express key is not
 * authorised for that host, so those calls failed with API_KEY_SERVICE_BLOCKED.
 * Routing them through the shared client keeps every Gemini call on one surface.
 */
export async function generateChatText(options: {
  system?: string;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  prompt?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  maxOutputTokens?: number;
  /**
   * Ground the answer in live Google Search results. Cannot be combined with
   *  responseMimeType: "application/json" — the API rejects that pairing.
   */
  useSearch?: boolean;
}): Promise<string> {
  const apiKey = resolveVertexKey();
  if (!apiKey) {
    throw new MissingApiKeyError();
  }

  const contents = options.messages?.length ?
      options.messages.map(m => ({
        // Vertex only accepts "user" and "model" as roles.
        role: m.role === "assistant" ? "model" as const : "user" as const,
        parts: [{ text: m.content }],
      })) :
      [{ role: "user" as const, parts: [{ text: options.prompt ?? "" }] }];

  const response = await buildGenAIClient(apiKey).models.generateContent({
    model: options.model ?? "gemini-3.7-flash",
    contents,
    config: {
      ...(options.system ? { systemInstruction: options.system } : {}),
      ...(options.useSearch ? { tools: [{ googleSearch: {} }] } : {}),
      // Explicit rather than inherited: thinking tokens draw on this budget too,
      // so a default that looks generous for prose can still starve the answer.
      maxOutputTokens: options.maxOutputTokens ?? 32768,
      thinkingConfig: { thinkingLevel: options.thinkingLevel ?? ThinkingLevel.HIGH },
    },
  });

  return response.text ?? "";
}
