import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { wavDurationSeconds } from "./stitch";

/**
 * Builds a minimal PCM WAV header for a given duration so the probe is checked
 * against an independently computed length rather than against itself.
 */
function makeWav(seconds: number, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const dataSize = Math.round(byteRate * seconds);

  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE((channels * bitsPerSample) / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, Buffer.alloc(dataSize)]);
}

describe("wavDurationSeconds", () => {
  it("reads the duration of a PCM WAV", () => {
    const d = wavDurationSeconds(makeWav(7.35));
    expect(d).not.toBeNull();
    expect(d!).toBeCloseTo(7.35, 2);
  });

  it("is independent of sample rate and channel count", () => {
    expect(wavDurationSeconds(makeWav(12, 44100, 2))!).toBeCloseTo(12, 2);
    expect(wavDurationSeconds(makeWav(3.5, 16000, 1))!).toBeCloseTo(3.5, 2);
  });

  it("handles a streamed WAV whose data chunk declares size 0", () => {
    const wav = makeWav(5);
    wav.writeUInt32LE(0, 40); // some encoders leave this unset
    expect(wavDurationSeconds(wav)!).toBeCloseTo(5, 1);
  });

  it("returns null rather than a wrong number for non-WAV input", () => {
    expect(wavDurationSeconds(Buffer.from("this is definitely not a wav file at all"))).toBeNull();
    expect(wavDurationSeconds(Buffer.alloc(10))).toBeNull();
  });
});

describe("transcript retiming", () => {
  // Mirrors the word-count distribution in the audio synthesis step. The bug it
  // fixes: uniform planned slots drift against real speech, so by the end of a
  // show the highlighted line runs several segments ahead of the audio.
  function retime(segments: { text: string }[], actualDuration: number) {
    const weights = segments.map(s => Math.max(1, s.text.trim().split(/\s+/).filter(Boolean).length));
    const total = weights.reduce((a, b) => a + b, 0);
    let cursor = 0;
    return segments.map((seg, i) => {
      const share = (weights[i] / total) * actualDuration;
      const startTimeSeconds = cursor;
      const endTimeSeconds = i === segments.length - 1 ? actualDuration : cursor + share;
      cursor = endTimeSeconds;
      return { ...seg, startTimeSeconds, endTimeSeconds };
    });
  }

  const SEGMENTS = [
    { text: "one two three four five six seven eight nine ten" }, // 10 words
    { text: "one two three four five" }, // 5
    { text: "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen" }, // 15
  ];

  it("spans exactly the real audio duration with no gaps", () => {
    const out = retime(SEGMENTS, 47.5);
    expect(out[0].startTimeSeconds).toBe(0);
    expect(out[out.length - 1].endTimeSeconds).toBe(47.5);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].startTimeSeconds).toBeCloseTo(out[i - 1].endTimeSeconds, 6);
    }
  });

  it("gives longer lines proportionally more time", () => {
    const out = retime(SEGMENTS, 30);
    const dur = (s: { startTimeSeconds: number; endTimeSeconds: number }) => s.endTimeSeconds - s.startTimeSeconds;
    // 10 / 5 / 15 words out of 30 => 10s / 5s / 15s
    expect(dur(out[0])).toBeCloseTo(10, 5);
    expect(dur(out[1])).toBeCloseTo(5, 5);
    expect(dur(out[2])).toBeCloseTo(15, 5);
  });

  it("corrects the drift that caused the highlight to jump ahead", () => {
    // What the bug looked like: eight uniform 8s slots claiming 64s of audio
    // that actually runs 47s. At the old timings the line shown at t=40 was
    // segment 5; against real audio the listener is still inside segment 6 of 8.
    const eight = Array.from({ length: 8 }, () => ({ text: "word ".repeat(20).trim() }));
    const planned = eight.map((_, i) => ({ start: i * 8, end: (i + 1) * 8 }));
    const actual = retime(eight, 47);

    const atForty = (segs: { start?: number; end?: number; startTimeSeconds?: number; endTimeSeconds?: number }[]) =>
      segs.findIndex(s => (s.start ?? s.startTimeSeconds!) <= 40 && (s.end ?? s.endTimeSeconds!) > 40);

    expect(atForty(planned)).toBe(5);
    expect(atForty(actual)).toBe(6);
    // The point of the fix: these disagree, and only the retimed one matches
    // the audio a listener actually hears.
    expect(atForty(planned)).not.toBe(atForty(actual));
  });
});
