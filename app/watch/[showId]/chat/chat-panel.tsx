"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import type { ChatMessage } from "@/db/schema";

import { createShowTangentAction, getChatMessagesAction, sendChatMessageAction } from "./actions";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ChatPanelProps {
  showId: string;
  topic: string;
  transcript: string;
  researchContext: string;
  hostName?: string;
}

interface MessageWithAudio extends ChatMessage {
  audioData?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ChatPanel({ showId, topic, transcript, researchContext, hostName = "Host" }: ChatPanelProps) {
  const [messages, setMessages] = useState<MessageWithAudio[]>([]);
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isGeneratingTangent, setIsGeneratingTangent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAudio, setActiveAudio] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load existing messages on mount
  useEffect(() => {
    getChatMessagesAction(showId).then(setMessages);
  }, [showId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback((withVoice = false) => {
    const msg = input.trim();
    if (!msg || isPending)
      return;

    setInput("");
    setError(null);

    // Optimistic update — add user message immediately
    const optimisticUserMsg: MessageWithAudio = {
      id: `temp-${Date.now()}`,
      showId,
      role: "user",
      content: msg,
      createdAt: new Date(),
    };
    setMessages(prev => [...prev, optimisticUserMsg]);

    startTransition(async () => {
      const result = await sendChatMessageAction(showId, msg, {
        topic,
        transcript,
        researchContext,
        hostName,
        generateVoice: withVoice,
      });

      if (result.error) {
        setError(result.error);
        // Remove optimistic message on error
        setMessages(prev => prev.filter(m => m.id !== optimisticUserMsg.id));
        setInput(msg); // Restore input
      } else {
        // Refresh full message list to get real IDs
        const updated = await getChatMessagesAction(showId);
        const updatedWithAudio = updated.map((m) => {
          if (result.message && m.id === result.message.id && result.audioData) {
            return { ...m, audioData: result.audioData };
          }
          return m;
        });
        setMessages(updatedWithAudio);

        if (result.audioData) {
          setActiveAudio(result.audioData);
        }
      }

      inputRef.current?.focus();
    });
  }, [input, isPending, showId, topic, transcript, researchContext, hostName]);

  const handleCreateTangent = async () => {
    const question = input.trim();
    if (!question || isGeneratingTangent)
      return;

    setIsGeneratingTangent(true);
    setInput("");
    setError(null);

    try {
      const result = await createShowTangentAction(showId, question, hostName, topic);
      if (result.error) {
        setError(result.error);
        setInput(question);
      } else if (result.audioData) {
        setActiveAudio(result.audioData);
        const updated = await getChatMessagesAction(showId);
        setMessages(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate tangent");
    } finally {
      setIsGeneratingTangent(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(false);
    }
  };

  return (
    <div className="card-flat flex flex-col overflow-hidden" style={{ maxHeight: "480px" }}>
      {/* Header */}
      <div
        className="panel-brutal-header bg-background-dark text-white flex items-center justify-between"
        style={{ fontFamily: "var(--font-space-mono)" }}
      >
        <span>Live Host Q&A & Tangents</span>
        <span className="text-[10px] text-accent font-bold uppercase tracking-wider">Gemini 3 Flash</span>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && !isPending && !isGeneratingTangent && (
          <div className="py-6 text-center text-sm text-foreground-muted space-y-1">
            <p>
              Ask
              {hostName}
              {" "}
              anything about this episode.
            </p>
            <p className="text-xs text-foreground-muted/70">The host adapts in-character and updates your persistent memory bank.</p>
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] border-2 border-border px-3 py-2 text-sm ${
                msg.role === "user" ?
                  "bg-foreground text-surface" :
                  "bg-surface-elevated text-foreground"
              }`}
            >
              {msg.role === "assistant" && (
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider text-accent"
                    style={{ fontFamily: "var(--font-space-mono)" }}
                  >
                    {hostName}
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-emerald-500 font-bold">
                    ✓ Memory Adapted
                  </span>
                </div>
              )}
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>

              {msg.audioData && (
                <div className="mt-2 pt-2 border-t border-border/40">
                  <audio controls src={msg.audioData} className="w-full h-7 text-xs" autoPlay />
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Audio player for active voice reply / tangent */}
        {activeAudio && (
          <div className="border-2 border-accent bg-accent/10 p-2.5 my-2">
            <span className="block text-[10px] font-bold uppercase text-accent mb-1" style={{ fontFamily: "var(--font-space-mono)" }}>
              🎙️ Playing Host Audio Tangent (Gemini 2.5 Flash TTS)
            </span>
            <audio controls src={activeAudio} className="w-full h-8" autoPlay />
          </div>
        )}

        {/* Loading indicator */}
        {(isPending || isGeneratingTangent) && (
          <div className="flex justify-start">
            <div className="border-2 border-border bg-surface-elevated px-3 py-2">
              <span
                className="text-xs text-foreground-muted animate-pulse"
                style={{ fontFamily: "var(--font-space-mono)" }}
              >
                {isGeneratingTangent ? "🎙️ Synthesizing 30s Audio Tangent with Gemini TTS..." : "Thinking with Gemini 3 Flash..."}
              </span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="border-2 border-red-600 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input controls */}
      <div className="border-t-3 border-border bg-surface">
        <div className="flex">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask ${hostName} or request a topic tangent...`}
            disabled={isPending || isGeneratingTangent}
            className="flex-1 bg-surface px-4 py-3 text-sm placeholder:text-foreground-muted focus:outline-none disabled:opacity-50"
            style={{ fontFamily: "var(--font-space-mono)" }}
          />
          <button
            type="button"
            onClick={() => handleSend(false)}
            disabled={isPending || isGeneratingTangent || !input.trim()}
            className="border-l-3 border-border bg-foreground text-surface px-4 py-3 text-sm font-bold transition-colors hover:brightness-110 disabled:opacity-50"
            style={{ fontFamily: "var(--font-space-mono)" }}
          >
            Ask
          </button>
          <button
            type="button"
            onClick={() => handleSend(true)}
            disabled={isPending || isGeneratingTangent || !input.trim()}
            title="Generate voice speech response with Gemini TTS"
            className="border-l-3 border-border bg-accent text-foreground px-3 py-3 text-xs font-bold transition-colors hover:brightness-110 disabled:opacity-50"
            style={{ fontFamily: "var(--font-space-mono)" }}
          >
            🎙️ Voice
          </button>
        </div>

        {/* Tangent button */}
        <div className="px-3 py-1.5 bg-surface-elevated border-t border-border flex items-center justify-between text-[11px]">
          <span className="text-foreground-muted">Want an on-demand audio deep dive?</span>
          <button
            type="button"
            onClick={handleCreateTangent}
            disabled={isPending || isGeneratingTangent || !input.trim()}
            className="font-bold text-accent hover:underline disabled:opacity-40"
          >
            + Create 30s Audio Tangent ↗
          </button>
        </div>
      </div>
    </div>
  );
}
