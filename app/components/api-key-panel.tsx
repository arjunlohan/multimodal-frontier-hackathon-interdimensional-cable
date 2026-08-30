"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Bring-your-own-key entry.
 *
 * Model inference is the dominant running cost, so a public deployment asks the
 * visitor for their own Google key and Google bills them directly. The key stays
 * in this browser; it is sent to the server only to run the visitor's own
 * generation, stored encrypted for the lifetime of that run, and wiped when the
 * run finishes.
 */

const STORAGE_KEY = "ic:google-api-keys";

export interface StoredKeys {
  vertexKey: string;
  geminiKey?: string;
}

/** Reads saved keys. Returns null whenever storage is unavailable or empty. */
export function readStoredKeys(): StoredKeys | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredKeys;
    return parsed.vertexKey ? parsed : null;
  } catch {
    // Private windows, cleared site data, or storage disabled entirely.
    return null;
  }
}

function writeStoredKeys(keys: StoredKeys | null): void {
  try {
    if (keys) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Nothing useful to do; the caller still holds the value in memory.
  }
}

function looksLikeGoogleKey(key: string): boolean {
  const k = key.trim();
  return (k.startsWith("AQ.") || k.startsWith("AIza")) && k.length >= 30;
}

function mask(key: string): string {
  const k = key.trim();
  return k.length <= 12 ? "•".repeat(k.length) : `${k.slice(0, 6)}…${k.slice(-4)}`;
}

interface ApiKeyPanelProps {
  /** True when this deployment refuses to fall back to the server's own key. */
  required: boolean;
  onChange?: (keys: StoredKeys | null) => void;
}

export function ApiKeyPanel({ required, onChange }: ApiKeyPanelProps) {
  const [keys, setKeys] = useState<StoredKeys | null>(null);
  const [editing, setEditing] = useState(false);
  const [vertexInput, setVertexInput] = useState("");
  const [geminiInput, setGeminiInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredKeys();
    setKeys(stored);
    setHydrated(true);
    onChange?.(stored);
    if (!stored && required) {
      setEditing(true);
    }
    // Runs once on mount; onChange identity is not a meaningful dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(() => {
    const vertexKey = vertexInput.trim();
    if (!looksLikeGoogleKey(vertexKey)) {
      setError("Vertex keys start with \"AQ.\" and Gemini API keys with \"AIza\".");
      return;
    }
    const geminiKey = geminiInput.trim() || undefined;
    if (geminiKey && !looksLikeGoogleKey(geminiKey)) {
      setError("That second key does not look like a Google API key.");
      return;
    }
    const next = { vertexKey, geminiKey };
    writeStoredKeys(next);
    setKeys(next);
    setEditing(false);
    setError(null);
    setVertexInput("");
    setGeminiInput("");
    onChange?.(next);
  }, [vertexInput, geminiInput, onChange]);

  const handleCancel = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  const clear = useCallback(() => {
    writeStoredKeys(null);
    setKeys(null);
    onChange?.(null);
    setEditing(true);
  }, [onChange]);

  // Avoid rendering a "no key" state during hydration when one is in fact saved.
  if (!hydrated) {
    return null;
  }

  if (keys && !editing) {
    return (
      <div className="card-brutal flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
        <span
          className="badge"
          style={{ fontFamily: "var(--font-space-mono)", background: "var(--surface-elevated)" }}
        >
          Key saved
        </span>
        <code className="text-sm" style={{ fontFamily: "var(--font-space-mono)" }}>
          {mask(keys.vertexKey)}
        </code>
        {keys.geminiKey ?
            (
              <code className="text-sm text-foreground-muted" style={{ fontFamily: "var(--font-space-mono)" }}>
                + video key
                {" "}
                {mask(keys.geminiKey)}
              </code>
            ) :
          null}
        <button
          type="button"
          onClick={clear}
          className="ml-auto border-2 border-border px-3 py-1 text-xs font-bold uppercase tracking-wider transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
          style={{ fontFamily: "var(--font-space-mono)" }}
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="card-brutal flex flex-col gap-4 p-5">
      <div>
        <h3 className="text-lg font-extrabold" style={{ fontFamily: "var(--font-syne)" }}>
          {required ? "Add your Google API key to generate" : "Use your own Google API key (optional)"}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-foreground-muted">
          Generation runs on your key and Google bills your account directly. The key is
          stored in this browser, sent only to run your own show, held encrypted while
          that run is in flight, and deleted when it finishes. It is never logged and
          never shared.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span
          className="text-xs font-bold uppercase tracking-[0.15em] text-foreground-muted"
          style={{ fontFamily: "var(--font-space-mono)" }}
        >
          Vertex AI key · required
        </span>
        <input
          type="password"
          value={vertexInput}
          onChange={e => setVertexInput(e.target.value)}
          placeholder="AQ.… or AIza…"
          autoComplete="off"
          spellCheck={false}
          className="border-3 border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:shadow-[3px_3px_0_var(--accent)]"
          style={{ fontFamily: "var(--font-space-mono)" }}
        />
        <span className="text-xs text-foreground-muted">
          Drives research, scripting, voices and video.
          {" "}
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Get a key
          </a>
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span
          className="text-xs font-bold uppercase tracking-[0.15em] text-foreground-muted"
          style={{ fontFamily: "var(--font-space-mono)" }}
        >
          Gemini Developer key · optional
        </span>
        <input
          type="password"
          value={geminiInput}
          onChange={e => setGeminiInput(e.target.value)}
          placeholder="AIza…"
          autoComplete="off"
          spellCheck={false}
          className="border-3 border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:shadow-[3px_3px_0_var(--accent)]"
          style={{ fontFamily: "var(--font-space-mono)" }}
        />
        <span className="text-xs text-foreground-muted">
          Only needed to route video through Gemini Omni instead of Veo 3.1.
        </span>
      </label>

      {error ?
          (
            <p className="border-3 border-border bg-surface-elevated px-3 py-2 text-sm font-bold">
              {error}
            </p>
          ) :
        null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!vertexInput.trim()}
          className="btn-action disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save key
        </button>
        {keys ?
            (
              <button
                type="button"
                onClick={handleCancel}
                className="text-sm font-bold underline"
                style={{ fontFamily: "var(--font-space-mono)" }}
              >
                Cancel
              </button>
            ) :
          null}
      </div>
    </div>
  );
}
