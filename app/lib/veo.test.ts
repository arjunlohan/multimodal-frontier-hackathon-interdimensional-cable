import fs from "node:fs";
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
    ThinkingLevel: { HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW", MINIMAL: "MINIMAL" },
    VideoGenerationReferenceType: { ASSET: "ASSET", STYLE: "STYLE" },
  };
});

describe("veo", () => {
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
    it("calls Gemini with correct model and returns text", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: "This is the research output.",
      });

      const { generateText } = await import("./veo");
      const result = await generateText("Research AI", "You are a researcher");

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gemini-3-flash-preview",
          contents: [{ role: "user", parts: [{ text: "Research AI" }] }],
          config: expect.objectContaining({
            temperature: 0.9,
            maxOutputTokens: 8192,
            thinkingConfig: { thinkingLevel: "HIGH" },
          }),
        }),
      );

      expect(result).toBe("This is the research output.");
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
    it("calls Veo 3.1 with correct config", async () => {
      mockGenerateVideos.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [
            { video: { uri: "gs://bucket/video.mp4" } },
          ],
        },
      });
      mockDownload.mockImplementationOnce(({ downloadPath }: { downloadPath: string }) => {
        fs.mkdirSync(require("node:path").dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "fake-video-data");
        return Promise.resolve();
      });

      const { generateVideoClip } = await import("./veo");
      const result = await generateVideoClip("A talk show host speaking");

      expect(mockGenerateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "veo-3.1-generate-preview",
          config: expect.objectContaining({
            aspectRatio: "16:9",
            numberOfVideos: 1,
            durationSeconds: 8,
            resolution: "1080p",
          }),
        }),
      );

      expect(result.videoUrl).toBe("gs://bucket/video.mp4");
      expect(result.localPath).toContain("clip-");
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
        fs.mkdirSync(require("node:path").dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "fake-video-data");
        return Promise.resolve();
      });

      const { generateVideoClip } = await import("./veo");
      // Use fake timers to avoid waiting 10s
      vi.useFakeTimers();
      const promise = generateVideoClip("test prompt");
      // Advance past the two polling intervals
      await vi.advanceTimersByTimeAsync(10001);
      await vi.advanceTimersByTimeAsync(10001);
      vi.useRealTimers();

      const result = await promise;
      expect(mockGetVideosOperation).toHaveBeenCalledTimes(2);
      expect(result.videoUrl).toBe("gs://bucket/video.mp4");
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

    it("includes referenceImages and personGeneration when slug provided and file exists", async () => {
      // Mock fs.existsSync to return true for the reference image path
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
        fs.mkdirSync(require("node:path").dirname(downloadPath), { recursive: true });
        // Restore readFileSync before writing
        readFileSyncSpy.mockRestore();
        fs.writeFileSync(downloadPath, "fake-video-data");
        return Promise.resolve();
      });

      const { generateVideoClip } = await import("./veo");
      await generateVideoClip("A talk show host", "john-oliver");

      expect(mockGenerateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            referenceImages: expect.arrayContaining([
              expect.objectContaining({
                referenceType: "ASSET",
              }),
            ]),
            personGeneration: "allow_adult",
          }),
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
        fs.mkdirSync(require("node:path").dirname(downloadPath), { recursive: true });
        fs.writeFileSync(downloadPath, "fake-video-data");
        return Promise.resolve();
      });

      const { generateVideoClip } = await import("./veo");
      const result = await generateVideoClip("A talk show host", "nonexistent-slug");

      // Should succeed without reference images in config
      expect(mockGenerateVideos).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.not.objectContaining({
            referenceImages: expect.anything(),
          }),
        }),
      );
      expect(result.videoUrl).toBe("gs://bucket/video.mp4");
    });
  });
});
