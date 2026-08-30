import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the env module before importing veo
vi.mock("./env", () => ({
  env: {
    GEMINI_API_KEY: "test-key",
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

describe("veo / gemini omni 1.1 flash engine", () => {
  beforeEach(async () => {
    mockGenerateContent.mockReset();
    mockGenerateVideos.mockReset();
    mockGetVideosOperation.mockReset();
    mockDownload.mockReset();
    // Reset rate limiter to prevent cross-test timeout from accumulated timestamps
    const { _resetRateLimiter } = await import("./veo");
    _resetRateLimiter();
  });

  describe("generateText", () => {
    it("calls Gemini 3.7 Flash with correct model and returns text", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: "This is the research output.",
      });

      const { generateText } = await import("./veo");
      const result = await generateText("Research AI", "You are a researcher");

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            maxOutputTokens: 8192,
            temperature: 0.9,
            thinkingConfig: { thinkingLevel: "HIGH" },
          }),
          contents: [{ parts: [{ text: "Research AI" }], role: "user" }],
          model: "gemini-3.7-flash",
        }),
      );

      expect(result).toBe("This is the research output.");
    });

    it("enables Google Search grounding tool when requested", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [{
          groundingMetadata: {
            webSearchQueries: ["latest comedy news 2026"],
          },
        }],
        text: "Grounded satirical news research.",
      });

      const { generateText } = await import("./veo");
      const result = await generateText("Find news", "Researcher", true);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            tools: [{ googleSearch: {} }],
          }),
        }),
      );
      expect(result).toBe("Grounded satirical news research.");
    });

    it("throws on empty response", async () => {
      mockGenerateContent.mockResolvedValueOnce({ text: "" });

      const { generateText } = await import("./veo");
      await expect(generateText("test")).rejects.toThrow("Gemini returned empty response");
    });

    it("throws on null response", async () => {
      mockGenerateContent.mockResolvedValueOnce({ text: null });

      const { generateText } = await import("./veo");
      await expect(generateText("test")).rejects.toThrow("Gemini returned empty response");
    });
  });

  describe("generateVideoClip", () => {
    it("calls Gemini Omni 1.1 Flash with default 720p, 16:9, 8s config", async () => {
      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [
            { video: { uri: "gs://bucket/video.mp4" } },
          ],
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "fake-video-data");
        return Promise.resolve();
      });

      const { generateVideoClip } = await import("./veo");
      const result = await generateVideoClip("A talk show host speaking");

      expect(mockGenerateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            aspectRatio: "16:9",
            durationSeconds: 8,
            numberOfVideos: 1,
            resolution: "720p",
          }),
          model: "gemini-omni-1.1-flash",
          prompt: "A talk show host speaking",
        }),
      );

      expect(result.videoUrl).toBe("gs://bucket/video.mp4");
      expect(result.localPath).toContain("clip-");
      expect(result.filePath).toBe(result.localPath);
      expect(result.durationSeconds).toBe(8);
    });

    it("supports configurable resolutions (360p, 720p, 1080p, 4k)", async () => {
      const resolutions = ["360p", "720p", "1080p", "4k"] as const;

      for (const res of resolutions) {
        mockGenerateVideos.mockResolvedValueOnce({
          done: true,
          response: {
            generatedVideos: [{ video: { uri: `gs://bucket/${res}.mp4` } }],
          },
        });
        mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
          fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
          fs.writeFileSync(downloadPath, "data");
          return Promise.resolve();
        });

        const { _resetRateLimiter, generateVideoClip } = await import("./veo");
        _resetRateLimiter();
        const result = await generateVideoClip("Resolution test", { resolution: res });

        expect(mockGenerateVideos).toHaveBeenLastCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({ resolution: res }),
            model: "gemini-omni-1.1-flash",
          }),
        );
        expect(result.videoUrl).toBe(`gs://bucket/${res}.mp4`);
      }
    });

    it("supports configurable aspect ratios (16:9, 9:16)", async () => {
      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [{ video: { uri: "gs://bucket/vertical.mp4" } }],
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "data");
        return Promise.resolve();
      });

      const { generateVideoClip } = await import("./veo");
      const result = await generateVideoClip("Vertical short", { aspectRatio: "9:16" });

      expect(mockGenerateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ aspectRatio: "9:16" }),
          model: "gemini-omni-1.1-flash",
        }),
      );
      expect(result.videoUrl).toBe("gs://bucket/vertical.mp4");
    });

    it("clamps duration between 3s and 10s", async () => {
      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: { generatedVideos: [{ video: { uri: "gs://bucket/clamped-low.mp4" } }] },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "data");
        return Promise.resolve();
      });

      const { _resetRateLimiter, generateVideoClip } = await import("./veo");
      const res1 = await generateVideoClip("Too short", { durationSeconds: 1 });
      expect(mockGenerateVideos).toHaveBeenLastCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ durationSeconds: 3 }),
        }),
      );
      expect(res1.durationSeconds).toBe(3);

      _resetRateLimiter();
      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: { generatedVideos: [{ video: { uri: "gs://bucket/clamped-high.mp4" } }] },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "data");
        return Promise.resolve();
      });

      const res2 = await generateVideoClip("Too long", { durationSeconds: 25 });
      expect(mockGenerateVideos).toHaveBeenLastCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ durationSeconds: 10 }),
        }),
      );
      expect(res2.durationSeconds).toBe(10);
    });

    it("supports custom outputPath and previousInteractionId for scene extension", async () => {
      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [{ video: { uri: "gs://bucket/extended.mp4" } }],
          interactionId: "interaction-turn-456",
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "data");
        return Promise.resolve();
      });

      const { generateVideoClip } = await import("./veo");
      const customPath = "/tmp/test-output/custom-clip.mp4";
      const result = await generateVideoClip("Extended scene", customPath, {
        previousInteractionId: "interaction-turn-123",
      });

      expect(result.filePath).toBe(customPath);
      expect(result.localPath).toBe(customPath);
      expect(result.interactionId).toBe("interaction-turn-456");
    });

    it("polls until done", async () => {
      mockGenerateVideos.mockResolvedValueOnce({ done: false });
      mockGetVideosOperation
        .mockResolvedValueOnce({ done: false })
        .mockResolvedValueOnce({
          done: true,
          response: {
            generatedVideos: [
              { video: { uri: "gs://bucket/video.mp4" } },
            ],
          },
        });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "fake-video-data");
        return Promise.resolve();
      });

      const { generateVideoClip } = await import("./veo");
      vi.useFakeTimers();
      const promise = generateVideoClip("test prompt");
      await vi.advanceTimersByTimeAsync(10001);
      await vi.advanceTimersByTimeAsync(10001);
      vi.useRealTimers();

      const result = await promise;
      expect(mockGetVideosOperation).toHaveBeenCalledTimes(2);
      expect(result.videoUrl).toBe("gs://bucket/video.mp4");
    });

    it("throws timeout error when polling exceeds MAX_POLLS (45 polls)", async () => {
      mockGenerateVideos.mockResolvedValueOnce({ done: false });
      mockGetVideosOperation.mockResolvedValue({ done: false });

      const { generateVideoClip } = await import("./veo");
      vi.useFakeTimers();
      const promise = generateVideoClip("slow prompt");
      const expectation = expect(promise).rejects.toThrow(
        "Veo video generation timed out after 46 polling attempts (450s)",
      );

      // Advance through all 46 intervals
      for (let i = 0; i <= 46; i++) {
        await vi.advanceTimersByTimeAsync(10001);
      }
      vi.useRealTimers();

      await expectation;
    });

    it("throws on operation error", async () => {
      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        error: { code: 400, message: "Bad prompt" },
      });

      const { generateVideoClip } = await import("./veo");
      await expect(generateVideoClip("bad prompt")).rejects.toThrow("Video generation failed");
    });

    it("throws when no videos returned", async () => {
      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: { generatedVideos: [] },
      });

      const { generateVideoClip } = await import("./veo");
      await expect(generateVideoClip("test")).rejects.toThrow("no videos returned");
    });

    it("throws OmniRAIFilterError and matches VeoRAIFilterError when RAI filter is triggered", async () => {
      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [],
          raiMediaFilteredCount: 1,
          raiMediaFilteredReasons: ["Celebrity likeness filter triggered", "Trademark detected"],
        },
      });

      const { OmniRAIFilterError, VeoRAIFilterError, generateVideoClip } = await import("./veo");
      const promise = generateVideoClip("Controversial satirical line");
      await expect(promise).rejects.toThrow(OmniRAIFilterError);
      await expect(promise).rejects.toThrow(VeoRAIFilterError);
      await expect(promise).rejects.toMatchObject({
        reasons: ["Celebrity likeness filter triggered", "Trademark detected"],
      });
    });

    it("includes referenceImages and personGeneration when slug provided and file exists", async () => {
      const existsSyncSpy = vi.spyOn(fs, "existsSync").mockReturnValueOnce(true);
      const readFileSyncSpy = vi.spyOn(fs, "readFileSync").mockReturnValueOnce(Buffer.from("fake-image-data"));

      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [
            { video: { uri: "gs://bucket/video.mp4" } },
          ],
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        readFileSyncSpy.mockRestore();
        fs.writeFileSync(downloadPath, "fake-video-data");
        return Promise.resolve();
      });

      const { generateVideoClip } = await import("./veo");
      await generateVideoClip("A talk show host", "john-oliver");

      expect(mockGenerateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            personGeneration: "allow_adult",
            referenceImages: expect.arrayContaining([
              expect.objectContaining({
                referenceType: "ASSET",
              }),
            ]),
          }),
          model: "gemini-omni-1.1-flash",
        }),
      );

      existsSyncSpy.mockRestore();
    });

    it("proceeds without reference image when file not found", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValueOnce(false);

      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [
            { video: { uri: "gs://bucket/video.mp4" } },
          ],
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "fake-video-data");
        return Promise.resolve();
      });

      const { generateVideoClip } = await import("./veo");
      const result = await generateVideoClip("A talk show host", "nonexistent-slug");

      expect(mockGenerateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.not.objectContaining({
            referenceImages: expect.anything(),
          }),
          model: "gemini-omni-1.1-flash",
        }),
      );
      expect(result.videoUrl).toBe("gs://bucket/video.mp4");
    });

    it("retries on 429 rate limit errors with exponential backoff", async () => {
      // 1st attempt: 429 error
      mockGenerateVideos.mockRejectedValueOnce(new Error("429 RESOURCE_EXHAUSTED: Rate limit exceeded"));
      // 2nd attempt: succeeds
      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [{ video: { uri: "gs://bucket/retried.mp4" } }],
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "fake-video-data");
        return Promise.resolve();
      });

      const { generateVideoClip } = await import("./veo");
      vi.useFakeTimers();
      const promise = generateVideoClip("test retry");
      // Advance backoff time (60s)
      await vi.advanceTimersByTimeAsync(60001);
      vi.useRealTimers();

      const result = await promise;
      expect(mockGenerateVideos).toHaveBeenCalledTimes(2);
      expect(result.videoUrl).toBe("gs://bucket/retried.mp4");
    });
  });

  describe("generateVideoClipInterpolated", () => {
    it("generates clip with start and end frame conditioning via Gemini Omni 1.1 Flash", async () => {
      const readFileSyncSpy = vi.spyOn(fs, "readFileSync")
        .mockReturnValueOnce(Buffer.from("first-frame-png"))
        .mockReturnValueOnce(Buffer.from("last-frame-png"));
      const existsSyncSpy = vi.spyOn(fs, "existsSync").mockReturnValue(true);

      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [
            { video: { uri: "gs://bucket/interpolated.mp4" } },
          ],
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        readFileSyncSpy.mockRestore();
        existsSyncSpy.mockRestore();
        fs.writeFileSync(downloadPath, "fake-video-data");
        return Promise.resolve();
      });

      const { generateVideoClipInterpolated } = await import("./veo");
      const result = await generateVideoClipInterpolated(
        "Host reacts while desk camera pans",
        "/tmp/first.png",
        "/tmp/last.png",
      );

      expect(mockGenerateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            aspectRatio: "16:9",
            durationSeconds: 8,
            lastFrame: {
              imageBytes: Buffer.from("last-frame-png").toString("base64"),
              mimeType: "image/png",
            },
            numberOfVideos: 1,
            personGeneration: "allow_adult",
            resolution: "720p",
          }),
          image: {
            imageBytes: Buffer.from("first-frame-png").toString("base64"),
            mimeType: "image/png",
          },
          model: "gemini-omni-1.1-flash",
          prompt: "Host reacts while desk camera pans",
        }),
      );

      expect(result.videoUrl).toBe("gs://bucket/interpolated.mp4");
      expect(result.durationSeconds).toBe(8);
    });

    it("supports modern options format (prompt, outputPath, options)", async () => {
      const readFileSyncSpy = vi.spyOn(fs, "readFileSync")
        .mockReturnValueOnce(Buffer.from("frame1-bytes"))
        .mockReturnValueOnce(Buffer.from("frame2-bytes"));
      const existsSyncSpy = vi.spyOn(fs, "existsSync").mockReturnValue(true);

      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [{ video: { uri: "gs://bucket/interp-options.mp4" } }],
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        readFileSyncSpy.mockRestore();
        existsSyncSpy.mockRestore();
        fs.writeFileSync(downloadPath, "fake-video-data");
        return Promise.resolve();
      });

      const { generateVideoClipInterpolated } = await import("./veo");
      const result = await generateVideoClipInterpolated(
        "Modern prompt",
        "/tmp/custom-interp.mp4",
        {
          durationSeconds: 6,
          firstFramePath: "/tmp/f1.png",
          lastFramePath: "/tmp/f2.png",
          resolution: "1080p",
        },
      );

      expect(mockGenerateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            durationSeconds: 6,
            resolution: "1080p",
          }),
          model: "gemini-omni-1.1-flash",
        }),
      );
      expect(result.filePath).toBe("/tmp/custom-interp.mp4");
      expect(result.durationSeconds).toBe(6);
    });

    it("throws OmniRAIFilterError in interpolation mode when RAI filter triggers", async () => {
      const readFileSyncSpy = vi.spyOn(fs, "readFileSync")
        .mockReturnValueOnce(Buffer.from("frame1"))
        .mockReturnValueOnce(Buffer.from("frame2"));
      const existsSyncSpy = vi.spyOn(fs, "existsSync").mockReturnValue(true);

      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [],
          raiMediaFilteredCount: 1,
          raiMediaFilteredReasons: ["Visual policy violation"],
        },
      });

      const { OmniRAIFilterError, VeoRAIFilterError, generateVideoClipInterpolated } = await import("./veo");
      const promise = generateVideoClipInterpolated("Prompt", "/tmp/f1.png", "/tmp/f2.png");
      await expect(promise).rejects.toThrow(OmniRAIFilterError);
      await expect(promise).rejects.toThrow(VeoRAIFilterError);

      readFileSyncSpy.mockRestore();
      existsSyncSpy.mockRestore();
    });

    it("retries interpolated video generation on 429 rate limit", async () => {
      const readFileSyncSpy = vi.spyOn(fs, "readFileSync")
        .mockReturnValueOnce(Buffer.from("frame1"))
        .mockReturnValueOnce(Buffer.from("frame2"))
        .mockReturnValueOnce(Buffer.from("frame1"))
        .mockReturnValueOnce(Buffer.from("frame2"));
      const existsSyncSpy = vi.spyOn(fs, "existsSync").mockReturnValue(true);

      mockGenerateVideos
        .mockRejectedValueOnce(new Error("429 Too Many Requests"))
        .mockResolvedValueOnce({
          done: true,
          response: {
            generatedVideos: [{ video: { uri: "gs://bucket/interp-retried.mp4" } }],
          },
        });

      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "fake-video-data");
        return Promise.resolve();
      });

      const { generateVideoClipInterpolated } = await import("./veo");
      vi.useFakeTimers();
      const promise = generateVideoClipInterpolated("Interpolated prompt", "/tmp/f1.png", "/tmp/f2.png");
      await vi.advanceTimersByTimeAsync(60001);
      vi.useRealTimers();

      const result = await promise;
      expect(mockGenerateVideos).toHaveBeenCalledTimes(2);
      expect(result.videoUrl).toBe("gs://bucket/interp-retried.mp4");

      readFileSyncSpy.mockRestore();
      existsSyncSpy.mockRestore();
    });
  });

  describe("omniRAIFilterError and VeoRAIFilterError inheritance and properties", () => {
    it("verifies OmniRAIFilterError hierarchy and property preservation", async () => {
      const { OmniRAIFilterError, VeoRAIFilterError } = await import("./veo");

      const reasons = ["Violence/gore detected", "Safety policy violation"];
      const error = new OmniRAIFilterError(reasons);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(OmniRAIFilterError);
      expect(error).not.toBeInstanceOf(VeoRAIFilterError);
      expect(error.name).toBe("OmniRAIFilterError");
      expect(error.reasons).toEqual(reasons);
      expect(error.message).toBe("Omni RAI filter: Violence/gore detected; Safety policy violation");
      expect(error.stack).toBeDefined();
    });

    it("verifies VeoRAIFilterError subclasses OmniRAIFilterError with full backwards compatibility", async () => {
      const { OmniRAIFilterError, VeoRAIFilterError } = await import("./veo");

      const reasons = ["Celebrity likeness filter triggered", "Trademark detected"];
      const error = new VeoRAIFilterError(reasons);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(OmniRAIFilterError);
      expect(error).toBeInstanceOf(VeoRAIFilterError);
      expect(error.name).toBe("VeoRAIFilterError");
      expect(error.reasons).toEqual(reasons);
      expect(error.message).toBe("Omni RAI filter: Celebrity likeness filter triggered; Trademark detected");
      expect(error.stack).toBeDefined();
    });

    it("handles empty reasons array gracefully", async () => {
      const { OmniRAIFilterError, VeoRAIFilterError } = await import("./veo");

      const omniErr = new OmniRAIFilterError([]);
      expect(omniErr.reasons).toEqual([]);
      expect(omniErr.message).toBe("Omni RAI filter: ");

      const veoErr = new VeoRAIFilterError([]);
      expect(veoErr.reasons).toEqual([]);
      expect(veoErr.message).toBe("Omni RAI filter: ");
    });
  });

  describe("buildVeoPrompt", () => {
    it("formats prompt across all combinations of firstFrame, lastFrame, hasImageRef, and imageRefIndices", async () => {
      const { buildVeoPrompt } = await import("./veo");

      // 1. None enabled
      expect(buildVeoPrompt("Host delivers monologue", "Close-up shot", {}))
        .toBe("Host delivers monologue. Close-up shot");

      // 2. Only firstFrame
      expect(buildVeoPrompt("Host delivers monologue", "Close-up shot", { firstFrame: true }))
        .toBe("<FIRST_FRAME> Host delivers monologue. Close-up shot");

      // 3. Only lastFrame
      expect(buildVeoPrompt("Host delivers monologue", "Close-up shot", { lastFrame: true }))
        .toBe("<LAST_FRAME> Host delivers monologue. Close-up shot");

      // 4. firstFrame + lastFrame
      expect(buildVeoPrompt("Host delivers monologue", "Close-up shot", { firstFrame: true, lastFrame: true }))
        .toBe("<FIRST_FRAME> <LAST_FRAME> Host delivers monologue. Close-up shot");

      // 5. Only hasImageRef
      expect(buildVeoPrompt("Host delivers monologue", "Close-up shot", { hasImageRef: true }))
        .toBe("<IMAGE_REF_0> Host delivers monologue. Close-up shot");

      // 6. hasImageRef + firstFrame
      expect(buildVeoPrompt("Host delivers monologue", "Close-up shot", { firstFrame: true, hasImageRef: true }))
        .toBe("<IMAGE_REF_0> <FIRST_FRAME> Host delivers monologue. Close-up shot");

      // 7. hasImageRef + lastFrame
      expect(buildVeoPrompt("Host delivers monologue", "Close-up shot", { hasImageRef: true, lastFrame: true }))
        .toBe("<IMAGE_REF_0> <LAST_FRAME> Host delivers monologue. Close-up shot");

      // 8. hasImageRef + firstFrame + lastFrame (all 3)
      expect(buildVeoPrompt("Host delivers monologue", "Close-up shot", {
        firstFrame: true,
        hasImageRef: true,
        lastFrame: true,
      })).toBe("<IMAGE_REF_0> <FIRST_FRAME> <LAST_FRAME> Host delivers monologue. Close-up shot");

      // 9. Custom imageRefIndices ([0, 1, 2]) + firstFrame + lastFrame
      expect(buildVeoPrompt("Host delivers monologue", "Close-up shot", {
        firstFrame: true,
        imageRefIndices: [0, 1, 2],
        lastFrame: true,
      })).toBe("<IMAGE_REF_0> <IMAGE_REF_1> <IMAGE_REF_2> <FIRST_FRAME> <LAST_FRAME> Host delivers monologue. Close-up shot");

      // 10. Custom non-zero imageRefIndices ([3, 7]) + lastFrame
      expect(buildVeoPrompt("Host delivers monologue", "Close-up shot", {
        imageRefIndices: [3, 7],
        lastFrame: true,
      })).toBe("<IMAGE_REF_3> <IMAGE_REF_7> <LAST_FRAME> Host delivers monologue. Close-up shot");

      // 11. Empty visualNotes
      expect(buildVeoPrompt("Opening beat alone", "", { firstFrame: true }))
        .toBe("<FIRST_FRAME> Opening beat alone");

      // 12. Undefined visualNotes
      expect(buildVeoPrompt("Opening beat alone", undefined, { lastFrame: true }))
        .toBe("<LAST_FRAME> Opening beat alone");
    });

    it("comprehensively sanitizes network trademarks and celebrity clone triggers", async () => {
      const { buildVeoPrompt, sanitizeNotesForOmni } = await import("./veo");

      const testCases = [
        { input: "HBO broadcast", expected: "premium cable broadcast" },
        { input: "hbo special", expected: "premium cable special" },
        { input: "NBC studio", expected: "broadcast network studio" },
        { input: "nbc news", expected: "broadcast network news" },
        { input: "SNL parody", expected: "sketch comedy show parody" },
        { input: "Saturday Night Live cast", expected: "sketch comedy show cast" },
        { input: "Last Week Tonight episode", expected: "weekly investigative comedy show episode" },
        { input: "Late Night interview", expected: "late-night show interview" },
        { input: "Weekend Update desk", expected: "news desk comedy segment desk" },
        { input: "Colin Jost co-anchor", expected: "Colin co-anchor" },
        { input: "Michael Che joke", expected: "Michael joke" },
        { input: "John Oliver deep dive", expected: "John deep dive" },
        { input: "Seth Meyers closer look", expected: "Seth closer look" },
        { input: "photorealistic identical clone of host", expected: "face-consistent stylized character of host" },
      ];

      for (const { expected, input } of testCases) {
        expect(sanitizeNotesForOmni(input)).toBe(expected);
        expect(buildVeoPrompt(input, "")).toBe(expected);
      }

      // Multi-replacement test in one prompt
      const multi = buildVeoPrompt(
        "SNL sketch on NBC",
        "A Weekend Update set with Colin Jost and Michael Che discussing HBO, photorealistic identical clone",
      );
      expect(multi).toBe(
        "sketch comedy show sketch on broadcast network. A news desk comedy segment set with Colin and Michael discussing premium cable, face-consistent stylized character",
      );
    });

    it("supports workflow segment object overload with monologue and conversation layouts", async () => {
      const { buildVeoPrompt } = await import("./veo");

      // Case 1: Custom visualPrompt already provided (>= 10 chars)
      const seg1 = {
        speaker: "John",
        text: "Welcome back!",
        visualPrompt: "Host sits behind desk delivering energetic monologue on HBO set.",
      };
      expect(buildVeoPrompt(seg1)).toBe("Host sits behind desk delivering energetic monologue on premium cable set.");

      // Case 2: Monologue synthesis
      const seg2 = {
        speaker: "HostA",
        text: "Good evening ladies and gentlemen!",
      };
      const hosts = [{ name: "HostA", personality: "Satirical", position: "center" }];
      const monologuePrompt = buildVeoPrompt(seg2, hosts, "monologue", "Late Night vibes");
      expect(monologuePrompt).toContain("A professional late-night talk show segment.");
      expect(monologuePrompt).toContain("A single host behind a desk delivering a monologue");
      expect(monologuePrompt).toContain("Good evening ladies and gentlemen!");
      expect(monologuePrompt).toContain("Style: late-night show vibes");

      // Case 3: Conversation synthesis with left host
      const convPromptLeft = buildVeoPrompt(
        { speaker: "HostA", text: "What do you think?" },
        [{ name: "HostA", position: "left" }, { name: "HostB", position: "right" }],
        "conversation",
      );
      expect(convPromptLeft).toContain("Two hosts sit behind a news desk");
      expect(convPromptLeft).toContain("The person on the LEFT is speaking and gesturing.");

      // Case 4: Conversation synthesis with right host
      const convPromptRight = buildVeoPrompt(
        { speaker: "HostB", text: "I agree completely." },
        [{ name: "HostA", position: "left" }, { name: "HostB", position: "right" }],
        "conversation",
      );
      expect(convPromptRight).toContain("Two hosts sit behind a news desk");
      expect(convPromptRight).toContain("The person on the RIGHT is speaking and gesturing.");
    });
  });

  describe("sliding-window 2 RPM rate limiting", () => {
    it("allows up to 2 calls immediately and delays subsequent calls within 60s window", async () => {
      mockGenerateVideos.mockResolvedValue({
        done: true,
        response: {
          generatedVideos: [{ video: { uri: "gs://bucket/video.mp4" } }],
        },
      });
      mockDownload.mockImplementation(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "data");
        return Promise.resolve();
      });

      const { generateVideoClip } = await import("./veo");

      // 1st call: immediate
      await generateVideoClip("prompt 1");
      expect(mockGenerateVideos).toHaveBeenCalledTimes(1);

      // 2nd call: immediate
      await generateVideoClip("prompt 2");
      expect(mockGenerateVideos).toHaveBeenCalledTimes(2);

      // 3rd call: requires timer advance because 2 RPM is reached
      vi.useFakeTimers();
      const thirdPromise = generateVideoClip("prompt 3");
      // Advance by 61 seconds (past 60s sliding window)
      await vi.advanceTimersByTimeAsync(61001);
      vi.useRealTimers();

      await thirdPromise;
      expect(mockGenerateVideos).toHaveBeenCalledTimes(3);
    });
  });
});
