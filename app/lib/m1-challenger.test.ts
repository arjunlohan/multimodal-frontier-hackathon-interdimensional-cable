import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OmniAspectRatio, OmniResolution } from "./veo";

// Mock the env module before importing veo
vi.mock("./env", () => ({
  env: {
    GEMINI_API_KEY: "test-gemini-key",
    GOOGLE_GENERATIVE_AI_API_KEY: undefined,
  },
}));

// Mock @google/genai
const mockGenerateContent = vi.fn();
const mockGenerateVideos = vi.fn();
const mockGetVideosOperation = vi.fn();
const mockDownload = vi.fn();

vi.mock("@google/genai", () => {
  class MockGoogleGenAI {
    models = {
      generateContent: mockGenerateContent,
      generateVideos: mockGenerateVideos,
    };

    operations = {
      getVideosOperation: mockGetVideosOperation,
    };

    files = {
      download: mockDownload,
    };
  }
  return {
    GoogleGenAI: MockGoogleGenAI,
    ThinkingLevel: { HIGH: "HIGH", LOW: "LOW", MEDIUM: "MEDIUM", MINIMAL: "MINIMAL" },
    VideoGenerationReferenceType: { ASSET: "ASSET", STYLE: "STYLE" },
  };
});

describe("m1 Empirical Challenger Test Suite — Video Engine (app/lib/veo.ts)", () => {
  beforeEach(async () => {
    mockGenerateContent.mockReset();
    mockGenerateVideos.mockReset();
    mockGetVideosOperation.mockReset();
    mockDownload.mockReset();

    const { _resetRateLimiter } = await import("./veo");
    _resetRateLimiter();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Suite 1: Boundary & Clamping Inputs for Duration, Resolution, Aspect Ratio
  // ───────────────────────────────────────────────────────────────────────────
  describe("suite 1: Boundary inputs, durations, resolution fallbacks, and aspect ratios", () => {
    it("clamps duration < 3s up to 3s (e.g. -10s, 0s, 1s, 2.99s)", async () => {
      const underDurations = [-10, 0, 1, 2, 2.99];

      for (const d of underDurations) {
        mockGenerateVideos.mockResolvedValueOnce({
          done: true,
          response: {
            generatedVideos: [{ video: { uri: `gs://bucket/dur-${d}.mp4` } }],
          },
        });
        mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
          fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
          fs.writeFileSync(downloadPath, "video-data");
          return Promise.resolve();
        });

        const { _resetRateLimiter, generateVideoClip } = await import("./veo");
        _resetRateLimiter();
        const result = await generateVideoClip("Boundary duration test", { durationSeconds: d });

        expect(mockGenerateVideos).toHaveBeenLastCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              durationSeconds: 3,
            }),
          }),
        );
        expect(result.durationSeconds).toBe(3);
      }
    });

    it("clamps duration > 10s down to 10s (e.g. 10.01s, 15s, 40s, 300s)", async () => {
      const overDurations = [10.01, 15, 40, 300];

      for (const d of overDurations) {
        mockGenerateVideos.mockResolvedValueOnce({
          done: true,
          response: {
            generatedVideos: [{ video: { uri: `gs://bucket/dur-${d}.mp4` } }],
          },
        });
        mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
          fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
          fs.writeFileSync(downloadPath, "video-data");
          return Promise.resolve();
        });

        const { _resetRateLimiter, generateVideoClip } = await import("./veo");
        _resetRateLimiter();
        const result = await generateVideoClip("Boundary duration test", { durationSeconds: d });

        expect(mockGenerateVideos).toHaveBeenLastCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              durationSeconds: 10,
            }),
          }),
        );
        expect(result.durationSeconds).toBe(10);
      }
    });

    it("accepts valid intermediate durations (3s, 4s, 5s, 6s, 7s, 8s, 9s, 10s)", async () => {
      const validDurations = [3, 4, 5, 6, 7, 8, 9, 10];

      for (const d of validDurations) {
        mockGenerateVideos.mockResolvedValueOnce({
          done: true,
          response: {
            generatedVideos: [{ video: { uri: `gs://bucket/dur-${d}.mp4` } }],
          },
        });
        mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
          fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
          fs.writeFileSync(downloadPath, "video-data");
          return Promise.resolve();
        });

        const { _resetRateLimiter, generateVideoClip } = await import("./veo");
        _resetRateLimiter();
        const result = await generateVideoClip("Valid duration test", { durationSeconds: d });

        expect(mockGenerateVideos).toHaveBeenLastCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              durationSeconds: d,
            }),
          }),
        );
        expect(result.durationSeconds).toBe(d);
      }
    });

    it("defaults duration to 8s when durationSeconds is undefined or null", async () => {
      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [{ video: { uri: "gs://bucket/default-dur.mp4" } }],
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "video-data");
        return Promise.resolve();
      });

      const { generateVideoClip } = await import("./veo");
      const result = await generateVideoClip("Default duration test", {});

      expect(mockGenerateVideos).toHaveBeenLastCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            durationSeconds: 8,
          }),
        }),
      );
      expect(result.durationSeconds).toBe(8);
    });

    it("supports all 4 Omni resolution profiles (360p, 720p, 1080p, 4k) and defaults to 720p", async () => {
      const resolutions: OmniResolution[] = ["360p", "720p", "1080p", "4k"];

      for (const res of resolutions) {
        mockGenerateVideos.mockResolvedValueOnce({
          done: true,
          response: {
            generatedVideos: [{ video: { uri: `gs://bucket/${res}.mp4` } }],
          },
        });
        mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
          fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
          fs.writeFileSync(downloadPath, "video-data");
          return Promise.resolve();
        });

        const { _resetRateLimiter, generateVideoClip } = await import("./veo");
        _resetRateLimiter();
        const result = await generateVideoClip("Resolution testing", { resolution: res });

        expect(mockGenerateVideos).toHaveBeenLastCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              resolution: res,
            }),
          }),
        );
        expect(result.videoUrl).toBe(`gs://bucket/${res}.mp4`);
      }

      // Default resolution verification
      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [{ video: { uri: "gs://bucket/default-res.mp4" } }],
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "video-data");
        return Promise.resolve();
      });

      const { _resetRateLimiter, generateVideoClip } = await import("./veo");
      _resetRateLimiter();
      const defaultResResult = await generateVideoClip("Default res test", {});
      expect(mockGenerateVideos).toHaveBeenLastCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            resolution: "720p",
          }),
        }),
      );
      expect(defaultResResult.videoUrl).toBe("gs://bucket/default-res.mp4");
    });

    it("supports 16:9 and 9:16 aspect ratios and defaults to 16:9", async () => {
      const aspectRatios: OmniAspectRatio[] = ["16:9", "9:16"];

      for (const ar of aspectRatios) {
        mockGenerateVideos.mockResolvedValueOnce({
          done: true,
          response: {
            generatedVideos: [{ video: { uri: `gs://bucket/${ar.replace(":", "_")}.mp4` } }],
          },
        });
        mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
          fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
          fs.writeFileSync(downloadPath, "video-data");
          return Promise.resolve();
        });

        const { _resetRateLimiter, generateVideoClip } = await import("./veo");
        _resetRateLimiter();
        const result = await generateVideoClip("Aspect ratio test", { aspectRatio: ar });

        expect(mockGenerateVideos).toHaveBeenLastCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              aspectRatio: ar,
            }),
          }),
        );
        expect(result.videoUrl).toBe(`gs://bucket/${ar.replace(":", "_")}.mp4`);
      }

      // Default aspect ratio
      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [{ video: { uri: "gs://bucket/default-ar.mp4" } }],
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "video-data");
        return Promise.resolve();
      });

      const { _resetRateLimiter, generateVideoClip } = await import("./veo");
      _resetRateLimiter();
      const defaultArResult = await generateVideoClip("Default ar test", {});
      expect(mockGenerateVideos).toHaveBeenLastCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            aspectRatio: "16:9",
          }),
        }),
      );
      expect(defaultArResult.videoUrl).toBe("gs://bucket/default-ar.mp4");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Suite 2: Rate Limiter Resets & 429 Exponential Backoff Retries
  // ───────────────────────────────────────────────────────────────────────────
  describe("suite 2: Rate limiter sliding window and 429 exponential backoff", () => {
    it("resets rate limiter completely when _resetRateLimiter is invoked", async () => {
      mockGenerateVideos.mockResolvedValue({
        done: true,
        response: {
          generatedVideos: [{ video: { uri: "gs://bucket/rate-reset.mp4" } }],
        },
      });
      mockDownload.mockImplementation(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "video-data");
        return Promise.resolve();
      });

      const { _resetRateLimiter, generateVideoClip } = await import("./veo");

      // Execute 2 calls (saturates 2 RPM limit)
      await generateVideoClip("call 1");
      await generateVideoClip("call 2");
      expect(mockGenerateVideos).toHaveBeenCalledTimes(2);

      // Reset rate limiter
      _resetRateLimiter();

      // Immediate 3rd call should NOT block because rate limiter was reset
      await generateVideoClip("call 3 after reset");
      expect(mockGenerateVideos).toHaveBeenCalledTimes(3);
    });

    it("retries on 429 / RESOURCE_EXHAUSTED / quota error across multiple attempts with backoff", async () => {
      // 1st attempt: 429 RESOURCE_EXHAUSTED
      mockGenerateVideos.mockRejectedValueOnce(new Error("429 RESOURCE_EXHAUSTED: Quota exceeded"));
      // 2nd attempt: 429 with 'quota' keyword
      mockGenerateVideos.mockRejectedValueOnce(new Error("rate limit: quota exceeded for model"));
      // 3rd attempt: succeeds
      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [{ video: { uri: "gs://bucket/exhausted-retry.mp4" } }],
          interactionId: "interaction-recovered-429",
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "video-data");
        return Promise.resolve();
      });

      const { generateVideoClip } = await import("./veo");
      vi.useFakeTimers();

      const promise = generateVideoClip("Retry test");

      // Advance through attempt 1 backoff (60s)
      await vi.advanceTimersByTimeAsync(60001);
      // Advance through attempt 2 backoff (120s)
      await vi.advanceTimersByTimeAsync(120001);

      vi.useRealTimers();

      const result = await promise;
      expect(mockGenerateVideos).toHaveBeenCalledTimes(3);
      expect(result.videoUrl).toBe("gs://bucket/exhausted-retry.mp4");
      expect(result.interactionId).toBe("interaction-recovered-429");
    });

    it("fails and rethrows when 429 persists beyond maxRetries (3 retries = 4 total attempts)", async () => {
      // 4 consecutive 429 errors
      mockGenerateVideos
        .mockRejectedValueOnce(new Error("429 Too Many Requests"))
        .mockRejectedValueOnce(new Error("429 RESOURCE_EXHAUSTED"))
        .mockRejectedValueOnce(new Error("429 Quota Exceeded"))
        .mockRejectedValueOnce(new Error("429 Final Rate Limit Failure"));

      const { generateVideoClip } = await import("./veo");
      vi.useFakeTimers();

      let rejectionError: Error | null = null;
      const promise = generateVideoClip("Exhaustion test").catch((err) => {
        rejectionError = err;
      });

      // Attempt 1 backoff: 60s
      await vi.advanceTimersByTimeAsync(60001);
      // Attempt 2 backoff: 120s
      await vi.advanceTimersByTimeAsync(120001);
      // Attempt 3 backoff: 180s
      await vi.advanceTimersByTimeAsync(180001);

      await promise;
      vi.useRealTimers();

      expect(rejectionError).not.toBeNull();
      expect((rejectionError as unknown as Error)?.message).toContain("429 Final Rate Limit Failure");
      expect(mockGenerateVideos).toHaveBeenCalledTimes(4);
    });

    it("does NOT retry on non-429 errors (e.g. 400 Bad Request, RAI filter, invalid args)", async () => {
      mockGenerateVideos.mockRejectedValueOnce(new Error("400 Bad Request: Invalid prompt token"));

      const { generateVideoClip } = await import("./veo");
      await expect(generateVideoClip("Bad prompt")).rejects.toThrow("400 Bad Request: Invalid prompt token");

      // Only 1 attempt made, no retry backoff
      expect(mockGenerateVideos).toHaveBeenCalledTimes(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Suite 3: Polymorphic Overloads for generateVideoClip and generateVideoClipInterpolated
  // ───────────────────────────────────────────────────────────────────────────
  describe("suite 3: Polymorphic call signatures and option payloads", () => {
    it("handles generateVideoClip(prompt) with default options and tmp file path", async () => {
      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [{ video: { uri: "gs://bucket/single-arg.mp4" } }],
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "video-data");
        return Promise.resolve();
      });

      const { generateVideoClip } = await import("./veo");
      const result = await generateVideoClip("Single argument call");

      expect(mockGenerateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            aspectRatio: "16:9",
            durationSeconds: 8,
            resolution: "720p",
          }),
          model: "gemini-omni-1.1-flash",
          prompt: "Single argument call",
        }),
      );
      expect(result.localPath).toContain("clip-");
      expect(result.filePath).toBe(result.localPath);
      expect(result.videoUrl).toBe("gs://bucket/single-arg.mp4");
    });

    it("handles generateVideoClip(prompt, options) without explicit outputPath", async () => {
      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [{ video: { uri: "gs://bucket/options-only.mp4" } }],
          interactionId: "turn-int-789",
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "video-data");
        return Promise.resolve();
      });

      const { generateVideoClip } = await import("./veo");
      const result = await generateVideoClip("Options only call", {
        aspectRatio: "9:16",
        durationSeconds: 5,
        previousInteractionId: "turn-int-123",
        resolution: "1080p",
      });

      expect(mockGenerateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            aspectRatio: "9:16",
            durationSeconds: 5,
            resolution: "1080p",
          }),
          model: "gemini-omni-1.1-flash",
          prompt: "Options only call",
        }),
      );
      expect(result.interactionId).toBe("turn-int-789");
    });

    it("handles generateVideoClip(prompt, outputPath, options) with explicit destination path", async () => {
      const customDest = path.join(os.tmpdir(), "m1-challenger", "explicit-out.mp4");

      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [{ video: { uri: "gs://bucket/explicit-dest.mp4" } }],
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "video-data");
        return Promise.resolve();
      });

      const { generateVideoClip } = await import("./veo");
      const result = await generateVideoClip("Explicit dest call", customDest, {
        resolution: "4k",
      });

      expect(result.filePath).toBe(customDest);
      expect(result.localPath).toBe(customDest);
      expect(mockGenerateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            resolution: "4k",
          }),
        }),
      );
    });

    it("handles legacy positional generateVideoClip(prompt, referenceImageSlug, maybeOptions)", async () => {
      const existsSyncSpy = vi.spyOn(fs, "existsSync").mockReturnValue(true);
      const readFileSyncSpy = vi.spyOn(fs, "readFileSync").mockReturnValue(Buffer.from("ref-image-content"));

      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [{ video: { uri: "gs://bucket/legacy-slug.mp4" } }],
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "video-data");
        return Promise.resolve();
      });

      const { generateVideoClip } = await import("./veo");
      const result = await generateVideoClip("Legacy positional slug", "seth-meyers", {
        durationSeconds: 7,
      });

      expect(mockGenerateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            durationSeconds: 7,
            personGeneration: "allow_adult",
            referenceImages: expect.arrayContaining([
              expect.objectContaining({
                referenceType: "ASSET",
              }),
            ]),
          }),
        }),
      );
      expect(result.videoUrl).toBe("gs://bucket/legacy-slug.mp4");

      existsSyncSpy.mockRestore();
      readFileSyncSpy.mockRestore();
    });

    it("handles base64 data URIs in referenceImages (<IMAGE_REF_0>)", async () => {
      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [{ video: { uri: "gs://bucket/base64-ref.mp4" } }],
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "video-data");
        return Promise.resolve();
      });

      const { generateVideoClip } = await import("./veo");
      const fakeBase64 = `data:image/jpeg;base64,${Buffer.from("synthetic-jpg-bytes").toString("base64")}`;
      await generateVideoClip("<IMAGE_REF_0> Host at desk", {
        referenceImages: [fakeBase64],
      });

      expect(mockGenerateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            personGeneration: "allow_adult",
            referenceImages: [
              {
                image: {
                  imageBytes: Buffer.from("synthetic-jpg-bytes").toString("base64"),
                  mimeType: "image/jpeg",
                },
                referenceType: "ASSET",
              },
            ],
          }),
        }),
      );
    });

    it("handles generateVideoClipInterpolated(prompt, options) with base64 first and last frame anchors", async () => {
      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [{ video: { uri: "gs://bucket/interpolated-base64.mp4" } }],
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "video-data");
        return Promise.resolve();
      });

      const firstDataUri = `data:image/png;base64,${Buffer.from("start-frame-bytes").toString("base64")}`;
      const lastDataUri = `data:image/jpeg;base64,${Buffer.from("end-frame-bytes").toString("base64")}`;

      const { generateVideoClipInterpolated } = await import("./veo");
      const result = await generateVideoClipInterpolated("Interpolated prompt with base64 frames", {
        durationSeconds: 9,
        firstFramePath: firstDataUri,
        lastFramePath: lastDataUri,
        resolution: "1080p",
      });

      expect(mockGenerateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            durationSeconds: 9,
            lastFrame: {
              imageBytes: Buffer.from("end-frame-bytes").toString("base64"),
              mimeType: "image/png", // regex fallback or stripped
            },
            personGeneration: "allow_adult",
            resolution: "1080p",
          }),
          image: {
            imageBytes: Buffer.from("start-frame-bytes").toString("base64"),
            mimeType: "image/png",
          },
          model: "gemini-omni-1.1-flash",
        }),
      );
      expect(result.durationSeconds).toBe(9);
      expect(result.videoUrl).toBe("gs://bucket/interpolated-base64.mp4");
    });

    it("handles generateVideoClipInterpolated with only firstFramePath (no lastFramePath)", async () => {
      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [{ video: { uri: "gs://bucket/start-frame-only.mp4" } }],
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "video-data");
        return Promise.resolve();
      });

      const startDataUri = `data:image/png;base64,${Buffer.from("start-only-bytes").toString("base64")}`;
      const { generateVideoClipInterpolated } = await import("./veo");

      const result = await generateVideoClipInterpolated("Start anchor only prompt", {
        firstFramePath: startDataUri,
      });

      expect(mockGenerateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.not.objectContaining({
            lastFrame: expect.anything(),
          }),
          image: {
            imageBytes: Buffer.from("start-only-bytes").toString("base64"),
            mimeType: "image/png",
          },
          model: "gemini-omni-1.1-flash",
        }),
      );
      expect(result.videoUrl).toBe("gs://bucket/start-frame-only.mp4");
    });

    it("handles generateVideoClipInterpolated with only lastFramePath (no firstFramePath)", async () => {
      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [{ video: { uri: "gs://bucket/end-frame-only.mp4" } }],
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "video-data");
        return Promise.resolve();
      });

      const endDataUri = `data:image/jpeg;base64,${Buffer.from("end-only-bytes").toString("base64")}`;
      const { generateVideoClipInterpolated } = await import("./veo");

      const result = await generateVideoClipInterpolated("End anchor only prompt", {
        lastFramePath: endDataUri,
      });

      expect(mockGenerateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            lastFrame: {
              imageBytes: Buffer.from("end-only-bytes").toString("base64"),
              mimeType: "image/png",
            },
            personGeneration: "allow_adult",
          }),
          model: "gemini-omni-1.1-flash",
        }),
      );
      expect(result.videoUrl).toBe("gs://bucket/end-frame-only.mp4");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Suite 4: Model Identifiers & Error Hierarchy
  // ───────────────────────────────────────────────────────────────────────────
  describe("suite 4: Model constants & error class inheritance", () => {
    it("exports official Gemini Omni 1.1 Flash and 3.7 Flash model identifiers", async () => {
      const { GEMINI_OMNI_VIDEO_MODEL, GEMINI_TEXT_MODEL } = await import("./veo");
      expect(GEMINI_OMNI_VIDEO_MODEL).toBe("gemini-omni-1.1-flash");
      expect(GEMINI_TEXT_MODEL).toBe("gemini-3.7-flash");
    });

    it("verifies OmniRAIFilterError and VeoRAIFilterError prototype chain and properties", async () => {
      const { OmniRAIFilterError, VeoRAIFilterError } = await import("./veo");

      const reasons = ["Likeness detected", "Trademark infringement"];
      const err = new VeoRAIFilterError(reasons);

      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(OmniRAIFilterError);
      expect(err).toBeInstanceOf(VeoRAIFilterError);
      expect(err.name).toBe("VeoRAIFilterError");
      expect(err.reasons).toEqual(reasons);
      expect(err.message).toBe("Omni RAI filter: Likeness detected; Trademark infringement");
    });

    it("verifies sanitizeNotesForVeo is an identical alias to sanitizeNotesForOmni", async () => {
      const { sanitizeNotesForOmni, sanitizeNotesForVeo } = await import("./veo");
      expect(sanitizeNotesForVeo).toBe(sanitizeNotesForOmni);

      const dirty = "HBO documentary with John Oliver and Seth Meyers on Last Week Tonight, photorealistic identical clone";
      expect(sanitizeNotesForVeo(dirty)).toBe(sanitizeNotesForOmni(dirty));
      expect(sanitizeNotesForVeo(dirty)).not.toContain("HBO");
      expect(sanitizeNotesForVeo(dirty)).not.toContain("Last Week Tonight");
      expect(sanitizeNotesForVeo(dirty)).not.toContain("photorealistic identical clone");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Suite 5: Fractional Durations & Edge Input Handling
  // ───────────────────────────────────────────────────────────────────────────
  describe("suite 5: Fractional durations & edge-case prompts", () => {
    it("handles fractional durations correctly within [3, 10] range", async () => {
      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [{ video: { uri: "gs://bucket/fractional.mp4" } }],
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "video-data");
        return Promise.resolve();
      });

      const { generateVideoClip } = await import("./veo");
      const result = await generateVideoClip("Fractional clip", { durationSeconds: 6.5 });

      expect(mockGenerateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            durationSeconds: 6.5,
          }),
        }),
      );
      expect(result.durationSeconds).toBe(6.5);
    });

    it("handles missing/non-existent reference image path gracefully without crashing", async () => {
      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [{ video: { uri: "gs://bucket/missing-ref.mp4" } }],
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "video-data");
        return Promise.resolve();
      });

      const { generateVideoClip } = await import("./veo");
      const result = await generateVideoClip("Clip with missing ref", {
        referenceImages: ["/non/existent/path/to/character.png"],
      });

      expect(mockGenerateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.not.objectContaining({
            referenceImages: expect.anything(),
          }),
        }),
      );
      expect(result.videoUrl).toBe("gs://bucket/missing-ref.mp4");
    });
  });
});
