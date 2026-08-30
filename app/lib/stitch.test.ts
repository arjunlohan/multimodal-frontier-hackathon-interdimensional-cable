import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanupTempFiles, extractFrame, stitchClips } from "./stitch";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

describe("stitch", () => {
  let tmpDir: string;
  const createdFiles: string[] = [];

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `stitch-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    vi.mocked(execFile).mockReset();
  });

  afterEach(() => {
    cleanupTempFiles(createdFiles);
    createdFiles.length = 0;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function createDummyFile(name: string, content = "dummy"): string {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, content);
    createdFiles.push(filePath);
    return filePath;
  }

  it("throws when given empty array", async () => {
    await expect(stitchClips([])).rejects.toThrow("No clips to stitch");
  });

  it("copies single clip to output without invoking ffmpeg", async () => {
    const clip = createDummyFile("single.mp4", "video-data");
    const outputPath = path.join(tmpDir, "output.mp4");

    const result = await stitchClips([clip], outputPath);
    createdFiles.push(result);

    expect(result).toBe(outputPath);
    expect(fs.existsSync(result)).toBe(true);
    expect(fs.readFileSync(result, "utf-8")).toBe("video-data");
    expect(execFile).not.toHaveBeenCalled();
  });

  it("concatenates multiple clips via lossless fast-path when codecs match", async () => {
    const clip1 = createDummyFile("clip1.mp4", "c1");
    const clip2 = createDummyFile("clip2.mp4", "c2");
    const outputPath = path.join(tmpDir, "stitched.mp4");

    vi.mocked(execFile).mockImplementation((_file: any, _args: any, _options: any, callback?: any): any => {
      // Create fake stitched output
      fs.writeFileSync(outputPath, "stitched-binary-data");
      const cb = typeof _options === "function" ? _options : callback;
      if (cb)
        cb(null, "", "");
      return {} as any;
    });

    const result = await stitchClips([clip1, clip2], outputPath);
    createdFiles.push(result);

    expect(result).toBe(outputPath);
    expect(execFile).toHaveBeenCalledTimes(1);

    const callArgs = vi.mocked(execFile).mock.calls[0];
    expect(callArgs[0]).toBe("ffmpeg");
    expect(callArgs[1]).toEqual([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      expect.stringContaining("concat-"),
      "-c",
      "copy",
      outputPath,
    ]);
  });

  it("falls back to 48 kHz broadcast audio re-encoding when lossless concat fails", async () => {
    const clip1 = createDummyFile("clip1.mp4", "c1");
    const clip2 = createDummyFile("clip2.mp4", "c2");
    const outputPath = path.join(tmpDir, "reencoded.mp4");

    let callCount = 0;

    vi.mocked(execFile).mockImplementation((_file: any, _args: any, _options: any, callback?: any): any => {
      callCount++;
      const cb = typeof _options === "function" ? _options : callback;
      if (callCount === 1) {
        // Lossless concat fails due to codec/rate mismatch
        if (cb)
          cb(new Error("Non-monotonous DTS in output stream; sample rate mismatch"), "", "");
      } else {
        // Fallback re-encode succeeds
        fs.writeFileSync(outputPath, "reencoded-48khz-data");
        if (cb)
          cb(null, "", "");
      }
      return {} as any;
    });

    const result = await stitchClips([clip1, clip2], outputPath);
    createdFiles.push(result);

    expect(result).toBe(outputPath);
    expect(execFile).toHaveBeenCalledTimes(2);

    // Verify fallback command contains 48 kHz broadcast audio normalization
    const reencodeArgs = vi.mocked(execFile).mock.calls[1];
    expect(reencodeArgs[0]).toBe("ffmpeg");
    expect(reencodeArgs[1]).toEqual([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      expect.stringContaining("concat-"),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-b:a",
      "128k",
      outputPath,
    ]);
  });

  describe("extractFrame", () => {
    it("extracts a frame at the specified timestamp using FFmpeg", async () => {
      const videoPath = createDummyFile("source-video.mp4", "video-content");

      vi.mocked(execFile).mockImplementation((_file: any, args: any, _options: any, callback?: any): any => {
        const outPath = (args as string[])[9];
        fs.writeFileSync(outPath, "fake-png-frame-data");
        const cb = typeof _options === "function" ? _options : callback;
        if (cb)
          cb(null, "", "");
        return {} as any;
      });

      const framePath = await extractFrame(videoPath, 7.5);
      createdFiles.push(framePath);

      expect(fs.existsSync(framePath)).toBe(true);
      expect(framePath.endsWith(".png")).toBe(true);

      const callArgs = vi.mocked(execFile).mock.calls[0];
      expect(callArgs[0]).toBe("ffmpeg");
      expect(callArgs[1]).toEqual([
        "-y",
        "-ss",
        "7.5",
        "-i",
        videoPath,
        "-frames:v",
        "1",
        "-f",
        "image2",
        framePath,
      ]);
    });

    it("throws when extracted output file is not generated", async () => {
      const videoPath = createDummyFile("corrupt-video.mp4");

      vi.mocked(execFile).mockImplementation((_file: any, _args: any, _options: any, callback?: any): any => {
        // Succeeded command but didn't write file
        const cb = typeof _options === "function" ? _options : callback;
        if (cb)
          cb(null, "", "");
        return {} as any;
      });

      await expect(extractFrame(videoPath, 0)).rejects.toThrow("Frame extraction failed — output not found");
    });
  });

  describe("cleanupTempFiles", () => {
    it("removes existing files", () => {
      const f1 = createDummyFile("a.mp4");
      const f2 = createDummyFile("b.mp4");
      expect(fs.existsSync(f1)).toBe(true);
      expect(fs.existsSync(f2)).toBe(true);

      cleanupTempFiles([f1, f2]);

      expect(fs.existsSync(f1)).toBe(false);
      expect(fs.existsSync(f2)).toBe(false);
    });

    it("ignores non-existent files without throwing", () => {
      expect(() => cleanupTempFiles(["/nonexistent/file.mp4"])).not.toThrow();
    });
  });
});
