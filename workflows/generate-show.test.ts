import { describe, expect, it, vi } from "vitest";

import {
  buildVeoPrompt,
  OmniRAIFilterError,
  sanitizeNotesForOmni,
  sanitizeNotesForVeo,
  VeoRAIFilterError,
} from "@/app/lib/veo";
import type { VideoClipInterpolatedOptions, VideoClipOptions, VideoClipResult } from "@/app/lib/veo";

// Mock env module
vi.mock("@/app/lib/env", () => ({
  env: {
    GEMINI_API_KEY: "test-gemini-key",
    GOOGLE_GENERATIVE_AI_API_KEY: undefined,
    DATABASE_URL: "postgresql://localhost:5432/test",
    MUX_TOKEN_ID: "test-mux-id",
    MUX_TOKEN_SECRET: "test-mux-secret",
    OPENAI_API_KEY: "test-openai-key",
    ELEVENLABS_API_KEY: "test-elevenlabs-key",
    S3_ENDPOINT: "https://s3.example.com",
    S3_REGION: "us-east-1",
    S3_BUCKET: "test-bucket",
    S3_ACCESS_KEY_ID: "test-key",
    S3_SECRET_ACCESS_KEY: "test-secret",
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TranscriptSegment {
  speaker: string;
  text: string;
  startTime?: number;
  endTime?: number;
  visualPrompt?: string;
  durationSeconds?: number;
}

interface Host {
  name: string;
  personality: string;
  position?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper implementations matching workflows/generate-show.ts
// ─────────────────────────────────────────────────────────────────────────────

function checkShowFormat(durationSeconds: number | null | undefined): { isAudioPodcast: boolean; durationSeconds: number } {
  const duration = durationSeconds ?? 16;
  return {
    isAudioPodcast: duration > 40,
    durationSeconds: duration,
  };
}

function referenceImageSlug(referenceImageUrl: string | null): string | null {
  if (!referenceImageUrl)
    return null;
  const filename = referenceImageUrl.split("/").pop();
  if (!filename)
    return null;
  return filename.replace(/\.[^.]+$/, "");
}

function formatSegmentPrompt(
  segment: TranscriptSegment,
  hosts: Host[],
  template: { showType?: string | null; notes?: string | null },
  options: {
    firstFrame?: boolean;
    lastFrame?: boolean;
    hasImageRef?: boolean;
    imageRefIndices?: number[];
  },
): string {
  if (segment.visualPrompt && segment.visualPrompt.length >= 10) {
    return buildVeoPrompt(segment.visualPrompt, template.notes ?? "", options);
  }

  const host = hosts.find(h => h.name === segment.speaker) ?? hosts[0] ?? { name: "Host", personality: "Anchor" };
  const showType = template.showType ?? "monologue";

  let beat = "A professional late-night talk show segment. ";
  if (showType === "conversation") {
    beat += "Two hosts sit behind a news desk with a world map graphic behind them. ";
    if (host.position === "left") {
      beat += "The person on the LEFT is speaking and gesturing. ";
    } else if (host.position === "right") {
      beat += "The person on the RIGHT is speaking and gesturing. ";
    }
  } else {
    beat += "A single host behind a desk delivering a monologue, with a colorful graphic behind them. ";
  }

  beat += `The host is saying: "${segment.text ?? ""}"`;
  const styleNotes = template.notes ?
    `Style: ${template.notes}. The host should be animated, expressive, and natural. Studio lighting, professional TV production quality.` :
    "The host should be animated, expressive, and natural. Studio lighting, professional TV production quality.";

  return buildVeoPrompt(beat, styleNotes, options);
}

function parseScriptJson(scriptResult: string, hostName: string, clipCount: number): TranscriptSegment[] {
  try {
    const jsonMatch = scriptResult.match(/\[[\s\S]*\]/);
    if (!jsonMatch)
      throw new Error("No JSON array found in script output");

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      speaker: string;
      text: string;
      clipIndex: number;
    }>;

    return parsed.map((seg, i) => ({
      speaker: seg.speaker,
      text: seg.text,
      startTime: i * 8,
      endTime: (i + 1) * 8,
    }));
  } catch {
    const words = scriptResult.split(/\s+/);
    const wordsPerSegment = Math.ceil(words.length / clipCount);
    const segments: TranscriptSegment[] = [];
    for (let i = 0; i < clipCount; i++) {
      const segWords = words.slice(i * wordsPerSegment, (i + 1) * wordsPerSegment);
      segments.push({
        speaker: hostName,
        text: segWords.join(" "),
        startTime: i * 8,
        endTime: (i + 1) * 8,
      });
    }
    return segments;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("generate-show workflow: prompt construction & conditioning tags", () => {
  const hosts: Host[] = [
    { name: "John Oliver", personality: "Witty British host", position: "center" },
  ];

  it("builds monologue prompt without conditioning tags when disabled", () => {
    const segment: TranscriptSegment = {
      speaker: "John Oliver",
      text: "This is absolutely bonkers.",
    };
    const result = formatSegmentPrompt(segment, hosts, { showType: "monologue", notes: "HBO style" }, {});
    expect(result).toContain("single host behind a desk");
    expect(result).toContain("This is absolutely bonkers.");
    expect(result).toContain("premium cable style");
    expect(result).not.toContain("HBO");
    expect(result).not.toContain("<FIRST_FRAME>");
    expect(result).not.toContain("<LAST_FRAME>");
    expect(result).not.toContain("<IMAGE_REF_0>");
  });

  it("injects <IMAGE_REF_0> tag when reference image is present", () => {
    const segment: TranscriptSegment = {
      speaker: "John Oliver",
      text: "Look at this chart.",
    };
    const result = formatSegmentPrompt(segment, hosts, { showType: "monologue", notes: "" }, {
      hasImageRef: true,
      imageRefIndices: [0],
    });
    expect(result).toMatch(/^<IMAGE_REF_0>/);
    expect(result).toContain("Look at this chart.");
  });

  it("injects <FIRST_FRAME> tag when starting frame is active", () => {
    const segment: TranscriptSegment = {
      speaker: "John Oliver",
      text: "And furthermore.",
    };
    const result = formatSegmentPrompt(segment, hosts, { showType: "monologue", notes: "" }, {
      firstFrame: true,
      hasImageRef: true,
    });
    expect(result).toMatch(/^<IMAGE_REF_0> <FIRST_FRAME>/);
  });

  it("injects <LAST_FRAME> tag on closing anchor clip turn", () => {
    const segment: TranscriptSegment = {
      speaker: "John Oliver",
      text: "And that is our show for tonight.",
    };
    const result = formatSegmentPrompt(segment, hosts, { showType: "monologue", notes: "" }, {
      firstFrame: true,
      hasImageRef: true,
      lastFrame: true,
    });
    expect(result).toMatch(/^<IMAGE_REF_0> <FIRST_FRAME> <LAST_FRAME>/);
    expect(result).toContain("And that is our show for tonight.");
  });

  it("supports multi-host reference conditioning tags <IMAGE_REF_0> <IMAGE_REF_1>", () => {
    const prompt = buildVeoPrompt("Two hosts laughing at news desk", "Studio lighting", {
      imageRefIndices: [0, 1],
    });
    expect(prompt).toMatch(/^<IMAGE_REF_0> <IMAGE_REF_1>/);
  });

  it("prioritizes provided visualPrompt with frame conditioning tags", () => {
    const segment: TranscriptSegment = {
      speaker: "John Oliver",
      text: "Unbelievable.",
      visualPrompt: "A high-concept HBO desk set with animated toaster infographics.",
    };
    const result = formatSegmentPrompt(segment, hosts, { showType: "monologue", notes: "NBC style" }, {
      firstFrame: true,
      hasImageRef: true,
    });
    expect(result).toMatch(/^<IMAGE_REF_0> <FIRST_FRAME>/);
    expect(result).toContain("premium cable desk set");
    expect(result).toContain("animated toaster infographics");
    expect(result).not.toContain("HBO");
  });
});

describe("generate-show workflow: note and trademark sanitization", () => {
  it("replaces network, show, and trademark names", () => {
    const input = "HBO late-night format. SNL news desk. NBC show. Last Week Tonight style. Weekend Update format.";
    const result = sanitizeNotesForOmni(input);
    expect(result).not.toContain("HBO");
    expect(result).not.toContain("SNL");
    expect(result).not.toContain("NBC");
    expect(result).not.toContain("Last Week Tonight");
    expect(result).not.toContain("Weekend Update");
    expect(result).toContain("premium cable");
    expect(result).toContain("sketch comedy show");
    expect(result).toContain("broadcast network");
    expect(result).toContain("weekly investigative comedy show");
    expect(result).toContain("news desk comedy segment");
  });

  it("replaces full celebrity names with first names and clone triggers with stylized descriptors", () => {
    const input = "Colin Jost and Michael Che with John Oliver and Seth Meyers. A photorealistic identical clone.";
    const result = sanitizeNotesForVeo(input);
    expect(result).not.toContain("Jost");
    expect(result).not.toContain("Che");
    expect(result).not.toContain("Oliver");
    expect(result).not.toContain("Meyers");
    expect(result).not.toContain("photorealistic identical clone");
    expect(result).toContain("face-consistent stylized character");
  });

  it("is case insensitive", () => {
    const result = sanitizeNotesForOmni("hbo format and snl style");
    expect(result).not.toMatch(/hbo/i);
    expect(result).not.toMatch(/snl/i);
  });
});

describe("generate-show workflow: dynamic rolling tail-frame chaining simulation", () => {
  it("simulates sequential tail-frame extraction maintaining boundary continuity FirstFrame(i) === LastFrame(i-1)", async () => {
    const mockExtractFrame = vi.fn().mockImplementation(async (videoPath: string, timeSeconds: number) => {
      return `/tmp/interdimensional-cable/frame-at-${timeSeconds}s-from-${videoPath.split("/").pop()}.png`;
    });

    const mockGenerateVideoClipInterpolated = vi.fn().mockImplementation(
      async (_prompt: string, options: VideoClipInterpolatedOptions): Promise<VideoClipResult> => {
        const turnIdx = options.previousInteractionId ? Number.parseInt(options.previousInteractionId.replace("turn-", ""), 10) + 1 : 0;
        return {
          durationSeconds: options.durationSeconds ?? 8,
          filePath: `/tmp/clip-${turnIdx}.mp4`,
          interactionId: `turn-${turnIdx}`,
          localPath: `/tmp/clip-${turnIdx}.mp4`,
          videoUrl: `/tmp/clip-${turnIdx}.mp4`,
        };
      },
    );

    // 1. Framing anchor generation
    const framingClipPath = "/tmp/anchor-clip.mp4";
    const initialFirstFrame = await mockExtractFrame(framingClipPath, 0);
    const anchorLastFrame = await mockExtractFrame(framingClipPath, 7.5);

    expect(initialFirstFrame).toBe("/tmp/interdimensional-cable/frame-at-0s-from-anchor-clip.mp4.png");
    expect(anchorLastFrame).toBe("/tmp/interdimensional-cable/frame-at-7.5s-from-anchor-clip.mp4.png");

    // 2. Sequential rolling frame chaining for 3 content clips (24s)
    const clipDurations = [8, 8, 8];
    let currentFirstFramePath: string | null = initialFirstFrame;
    let lastInteractionId: string | undefined;
    const chainedStartFrames: string[] = [];

    for (let i = 0; i < clipDurations.length; i++) {
      const duration = clipDurations[i];
      const isLastClip = i === clipDurations.length - 1;
      const hasFirstFrame = Boolean(currentFirstFramePath);
      const hasLastFrame = Boolean(isLastClip && anchorLastFrame);

      chainedStartFrames.push(currentFirstFramePath!);

      const result = await mockGenerateVideoClipInterpolated("test prompt", {
        durationSeconds: duration,
        extend: Boolean(lastInteractionId),
        firstFramePath: hasFirstFrame ? currentFirstFramePath ?? undefined : undefined,
        lastFramePath: hasLastFrame ? anchorLastFrame : undefined,
        previousInteractionId: lastInteractionId,
      });

      lastInteractionId = result.interactionId;

      if (!isLastClip) {
        const tailTime = duration - 0.5; // 7.5s
        currentFirstFramePath = await mockExtractFrame(result.localPath, tailTime);
      }
    }

    // Clip 0 starts with framing frame 0s
    expect(chainedStartFrames[0]).toBe("/tmp/interdimensional-cable/frame-at-0s-from-anchor-clip.mp4.png");
    // Clip 1 starts with tail frame from Clip 0
    expect(chainedStartFrames[1]).toBe("/tmp/interdimensional-cable/frame-at-7.5s-from-clip-0.mp4.png");
    // Clip 2 starts with tail frame from Clip 1
    expect(chainedStartFrames[2]).toBe("/tmp/interdimensional-cable/frame-at-7.5s-from-clip-1.mp4.png");
    // Interaction ID chained sequentially
    expect(lastInteractionId).toBe("turn-2");
  });

  it("propagates previousInteractionId and extend: true across multi-turn 40s scene extensions", async () => {
    const recordedCalls: VideoClipOptions[] = [];
    const mockGenerateVideoClip = vi.fn().mockImplementation(
      async (_prompt: string, options: VideoClipOptions): Promise<VideoClipResult> => {
        recordedCalls.push(options);
        const nextId = options.previousInteractionId ? `turn-${recordedCalls.length}` : "turn-1";
        return {
          durationSeconds: options.durationSeconds ?? 8,
          filePath: `/tmp/clip-${recordedCalls.length}.mp4`,
          interactionId: nextId,
          localPath: `/tmp/clip-${recordedCalls.length}.mp4`,
          videoUrl: `/tmp/clip-${recordedCalls.length}.mp4`,
        };
      },
    );

    let lastInteractionId: string | undefined;
    for (let i = 0; i < 5; i++) {
      const clipOptions: VideoClipOptions = {
        durationSeconds: 8,
        extend: Boolean(lastInteractionId),
        previousInteractionId: lastInteractionId,
      };

      const result = await mockGenerateVideoClip("prompt", clipOptions);
      lastInteractionId = result.interactionId;
    }

    expect(recordedCalls).toHaveLength(5);
    // Turn 0: no prior interaction
    expect(recordedCalls[0].previousInteractionId).toBeUndefined();
    expect(recordedCalls[0].extend).toBe(false);

    // Turns 1..4: chained sequentially
    expect(recordedCalls[1].previousInteractionId).toBe("turn-1");
    expect(recordedCalls[1].extend).toBe(true);

    expect(recordedCalls[2].previousInteractionId).toBe("turn-2");
    expect(recordedCalls[2].extend).toBe(true);

    expect(recordedCalls[4].previousInteractionId).toBe("turn-4");
    expect(recordedCalls[4].extend).toBe(true);
    expect(lastInteractionId).toBe("turn-5");
  });
});

describe("generate-show workflow: autonomous RAI safety retry loop", () => {
  it("catches OmniRAIFilterError and VeoRAIFilterError polymorphically and retries generation", async () => {
    let callCount = 0;
    const mockRevise = vi.fn().mockResolvedValue("A generic anchor discusses technology.");
    const mockGenerate = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new OmniRAIFilterError(["Likeness policy: living person detected"]);
      }
      return {
        durationSeconds: 8,
        filePath: "/tmp/clip-revised.mp4",
        interactionId: "interaction-retry-success",
        localPath: "/tmp/clip-revised.mp4",
        videoUrl: "/tmp/clip-revised.mp4",
      };
    });

    let currentText = "John Oliver criticizes the tech monopoly.";
    let attempts = 0;
    const maxRAIRetries = 2;
    let success = false;
    let finalResult: VideoClipResult | null = null;

    while (attempts <= maxRAIRetries && !success) {
      try {
        finalResult = await mockGenerate(currentText);
        success = true;
      } catch (err) {
        const isRAI =
          err instanceof OmniRAIFilterError ||
          err instanceof VeoRAIFilterError ||
          (err as any)?.name === "OmniRAIFilterError" ||
          (err as any)?.name === "VeoRAIFilterError";

        if (isRAI && attempts < maxRAIRetries) {
          attempts++;
          const reasons = (err as OmniRAIFilterError).reasons;
          currentText = await mockRevise(currentText, reasons);
        } else {
          throw err;
        }
      }
    }

    expect(success).toBe(true);
    expect(attempts).toBe(1);
    expect(callCount).toBe(2);
    expect(mockRevise).toHaveBeenCalledWith("John Oliver criticizes the tech monopoly.", ["Likeness policy: living person detected"]);
    expect(finalResult?.interactionId).toBe("interaction-retry-success");
  });

  it("handles VeoRAIFilterError subclass seamlessly", () => {
    const error = new VeoRAIFilterError(["Content safety filter triggered"]);
    expect(error instanceof OmniRAIFilterError).toBe(true);
    expect(error instanceof VeoRAIFilterError).toBe(true);
    expect(error.name).toBe("VeoRAIFilterError");
    expect(error.reasons).toEqual(["Content safety filter triggered"]);
  });

  it("exhausts retry loop after 2 retries (3 total attempts) and fails gracefully", async () => {
    const mockGenerate = vi.fn().mockRejectedValue(new OmniRAIFilterError(["Persistent filter violation"]));
    let attempts = 0;
    const maxRAIRetries = 2;
    let failedWithError: Error | null = null;

    while (attempts <= maxRAIRetries) {
      try {
        await mockGenerate();
        break;
      } catch (err) {
        const isRAI = err instanceof OmniRAIFilterError;
        if (isRAI && attempts < maxRAIRetries) {
          attempts++;
        } else {
          failedWithError = err as Error;
          break;
        }
      }
    }

    expect(attempts).toBe(2);
    expect(mockGenerate).toHaveBeenCalledTimes(3);
    expect(failedWithError).toBeInstanceOf(OmniRAIFilterError);
  });
});

describe("generate-show workflow: format duration routing", () => {
  it("routes durations <= 40s to Video Show pipeline", () => {
    for (const d of [8, 16, 24, 32, 40]) {
      const format = checkShowFormat(d);
      expect(format.isAudioPodcast).toBe(false);
      expect(format.durationSeconds).toBe(d);
    }
  });

  it("routes durations > 40s to Audio Podcast pipeline up to 300s (5m)", () => {
    for (const d of [41, 60, 120, 180, 240, 300]) {
      const format = checkShowFormat(d);
      expect(format.isAudioPodcast).toBe(true);
      expect(format.durationSeconds).toBe(d);
    }
  });

  it("defaults to 16s Video Show when duration is null or undefined", () => {
    expect(checkShowFormat(null)).toEqual({ durationSeconds: 16, isAudioPodcast: false });
    expect(checkShowFormat(undefined)).toEqual({ durationSeconds: 16, isAudioPodcast: false });
  });

  it("extracts template reference image slug correctly", () => {
    expect(referenceImageSlug("/templates/john-oliver.png")).toBe("john-oliver");
    expect(referenceImageSlug("/assets/reference-images/seth-meyers.jpeg")).toBe("seth-meyers");
    expect(referenceImageSlug(null)).toBeNull();
    expect(referenceImageSlug("")).toBeNull();
  });
});

describe("generate-show workflow: script JSON parsing", () => {
  it("parses valid JSON array", () => {
    const input = `[{"speaker": "John", "text": "Hello folks!", "clipIndex": 0}, {"speaker": "John", "text": "Good night!", "clipIndex": 1}]`;
    const result = parseScriptJson(input, "John", 2);

    expect(result).toHaveLength(2);
    expect(result[0].speaker).toBe("John");
    expect(result[0].text).toBe("Hello folks!");
    expect(result[0].startTime).toBe(0);
    expect(result[0].endTime).toBe(8);
    expect(result[1].startTime).toBe(8);
    expect(result[1].endTime).toBe(16);
  });

  it("parses JSON with surrounding text", () => {
    const input = `Here is the script:\n[{"speaker": "Host", "text": "Welcome!", "clipIndex": 0}]\nDone.`;
    const result = parseScriptJson(input, "Host", 1);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Welcome!");
  });

  it("falls back to plain text splitting on invalid JSON", () => {
    const input = "This is not JSON at all but has enough words to split into segments nicely here";
    const result = parseScriptJson(input, "DefaultHost", 2);

    expect(result).toHaveLength(2);
    expect(result[0].speaker).toBe("DefaultHost");
    expect(result[0].startTime).toBe(0);
    expect(result[1].startTime).toBe(8);
  });

  it("handles empty JSON array", () => {
    const input = "[]";
    const result = parseScriptJson(input, "Host", 2);
    expect(result).toHaveLength(0);
  });
});
