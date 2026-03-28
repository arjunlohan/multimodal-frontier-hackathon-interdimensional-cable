import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Concatenates video clips into a single output file using ffmpeg.
 * Uses the concat demuxer for fast, lossless concatenation when codecs match.
 *
 * @param clipPaths - Array of local file paths to video clips, in order
 * @param outputPath - Optional output path. Defaults to a temp file.
 * @returns Path to the stitched output video
 */
export async function stitchClips(
  clipPaths: string[],
  outputPath?: string,
): Promise<string> {
  if (clipPaths.length === 0) {
    throw new Error("No clips to stitch");
  }

  // Single clip — just copy it
  if (clipPaths.length === 1) {
    const dest = outputPath ?? generateOutputPath();
    fs.copyFileSync(clipPaths[0], dest);
    return dest;
  }

  const tmpDir = path.join(os.tmpdir(), "interdimensional-cable");
  fs.mkdirSync(tmpDir, { recursive: true });

  // Write concat list file
  const listPath = path.join(tmpDir, `concat-${Date.now()}.txt`);
  const listContent = clipPaths
    .map(p => `file '${p.replace(/'/g, "'\\''")}'`)
    .join("\n");
  fs.writeFileSync(listPath, listContent);

  const output = outputPath ?? generateOutputPath();

  try {
    // First try lossless concat (fast, works when codecs match)
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-c", "copy",
      output,
    ], { timeout: 120_000 });
  } catch {
    // Fallback: re-encode if codecs don't match
    console.warn("Lossless concat failed, falling back to re-encode...");
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-c:a", "aac",
      "-b:a", "128k",
      output,
    ], { timeout: 300_000 });
  }

  // Clean up list file
  try {
    fs.unlinkSync(listPath);
  } catch {
    // ignore
  }

  return output;
}

function generateOutputPath(): string {
  const tmpDir = path.join(os.tmpdir(), "interdimensional-cable");
  fs.mkdirSync(tmpDir, { recursive: true });
  return path.join(tmpDir, `stitched-${Date.now()}.mp4`);
}

/**
 * Cleans up temporary video files.
 */
export function cleanupTempFiles(paths: string[]): void {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      // ignore
    }
  }
}
