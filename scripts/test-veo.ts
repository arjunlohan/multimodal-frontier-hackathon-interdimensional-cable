/* eslint-disable no-console, node/no-process-env */
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const GEMINI_TEXT_MODEL = "gemini-3.7-flash";
const OMNI_VIDEO_MODEL = "gemini-omni-1.1-flash";

function getApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

async function testApiKey(): Promise<boolean> {
  console.log("\n── Step 1/5: API Key ──────────────────────────────────");
  const key = getApiKey();
  if (!key) {
    console.log("  FAIL  No GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY found in .env.local");
    return false;
  }
  console.log(`  PASS  Key found (${key.slice(0, 8)}...${key.slice(-4)})`);
  return true;
}

async function testGeminiText(): Promise<boolean> {
  console.log("\n── Step 2/5: Gemini Text (%s) ─────────────────────", GEMINI_TEXT_MODEL);
  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey: getApiKey()! });

  const start = Date.now();
  try {
    const response = await client.models.generateContent({
      config: { maxOutputTokens: 64 },
      contents: [{ parts: [{ text: "Reply with only the word PONG" }], role: "user" }],
      model: GEMINI_TEXT_MODEL,
    });

    const text = response.candidates?.[0]?.content?.parts
      ?.filter((p: { text?: string }) => p.text)
      .map((p: { text?: string }) => p.text)
      .join("")
      .trim() ||
      response.text?.trim();
    const elapsed = Date.now() - start;
    if (text) {
      console.log(`  PASS  Response: "${text}" (${elapsed}ms)`);
      return true;
    }
    console.log(`  FAIL  Empty response after ${elapsed}ms`);
    return false;
  } catch (err) {
    const elapsed = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  FAIL  ${msg} (${elapsed}ms)`);
    return false;
  }
}

async function testOmniVideo(): Promise<boolean> {
  console.log("\n── Step 3/5: Gemini Omni 1.1 Flash Video (%s) ──────────", OMNI_VIDEO_MODEL);
  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey: getApiKey()! });

  const start = Date.now();
  try {
    console.log("  ...  Requesting video generation (this may take 1-3 minutes)...");
    let operation = await client.models.generateVideos({
      config: {
        aspectRatio: "16:9",
        durationSeconds: 8,
        numberOfVideos: 1,
        resolution: "720p",
      },
      model: OMNI_VIDEO_MODEL,
      prompt: "A solid blue background with a small white circle in the center",
    });

    const elapsed = Date.now() - start;
    // If we get here without a 429, the request was accepted
    if (operation.error) {
      console.log(`  FAIL  API error: ${JSON.stringify(operation.error)} (${elapsed}ms)`);
      return false;
    }

    console.log(`  PASS  Video generation request accepted (${elapsed}ms)`);
    console.log("  ...  Polling for completion...");

    let pollCount = 0;
    while (!operation.done) {
      pollCount++;
      const pollElapsed = Date.now() - start;
      console.log(`  ...  Poll #${pollCount} (${Math.round(pollElapsed / 1000)}s elapsed)`);
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await client.operations.getVideosOperation({ operation });
    }

    const totalElapsed = Date.now() - start;
    if (operation.error) {
      console.log(`  FAIL  Generation error: ${JSON.stringify(operation.error)} (${totalElapsed}ms)`);
      return false;
    }

    const videoCount = operation.response?.generatedVideos?.length ?? 0;
    console.log(`  PASS  Video generated successfully (${videoCount} video(s), ${Math.round(totalElapsed / 1000)}s)`);
    return true;
  } catch (err) {
    const elapsed = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
      console.log(`  FAIL  Quota exceeded — your API key does not have Gemini Omni quota available (${elapsed}ms)`);
      console.log("        Check: https://ai.dev/rate-limit");
    } else {
      console.log(`  FAIL  ${msg} (${elapsed}ms)`);
    }
    return false;
  }
}

async function testOmniWithReferenceImage(): Promise<boolean> {
  console.log("\n── Step 4/5: Gemini Omni + Reference Image (<IMAGE_REF_0>) ────");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { GoogleGenAI, VideoGenerationReferenceType } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey: getApiKey()! });

  const imagePath = path.join(process.cwd(), "public", "templates", "john-oliver.png");
  if (!fs.existsSync(imagePath)) {
    console.log(`  FAIL  Reference image not found: ${imagePath}`);
    return false;
  }

  const imageBytes = fs.readFileSync(imagePath).toString("base64");
  const imageSizeKB = Math.round(imageBytes.length * 0.75 / 1024);
  console.log(`  ...  Loaded reference image: john-oliver.png (${imageSizeKB} KB)`);

  const start = Date.now();
  try {
    console.log("  ...  Requesting video generation with reference image...");
    let operation = await client.models.generateVideos({
      config: {
        aspectRatio: "16:9",
        durationSeconds: 8,
        numberOfVideos: 1,
        personGeneration: "allow_adult",
        referenceImages: [{
          image: { imageBytes, mimeType: "image/png" },
          referenceType: VideoGenerationReferenceType.ASSET,
        }],
        resolution: "1080p",
      },
      model: OMNI_VIDEO_MODEL,
      prompt: "A late-night talk show host sitting behind a desk, delivering a monologue to camera <IMAGE_REF_0>",
    });

    const elapsed = Date.now() - start;
    if (operation.error) {
      console.log(`  FAIL  API error: ${JSON.stringify(operation.error)} (${elapsed}ms)`);
      return false;
    }

    console.log(`  PASS  Request accepted with reference image (${elapsed}ms)`);
    console.log("  ...  Polling for completion...");

    let pollCount = 0;
    while (!operation.done) {
      pollCount++;
      const pollElapsed = Date.now() - start;
      console.log(`  ...  Poll #${pollCount} (${Math.round(pollElapsed / 1000)}s elapsed)`);
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await client.operations.getVideosOperation({ operation });
    }

    const totalElapsed = Date.now() - start;
    if (operation.error) {
      console.log(`  FAIL  Generation error: ${JSON.stringify(operation.error)} (${totalElapsed}ms)`);
      return false;
    }

    const videoCount = operation.response?.generatedVideos?.length ?? 0;
    console.log(`  PASS  Video with reference image generated (${videoCount} video(s), ${Math.round(totalElapsed / 1000)}s)`);
    return true;
  } catch (err) {
    const elapsed = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
      console.log(`  FAIL  Quota exceeded (${elapsed}ms)`);
    } else {
      console.log(`  FAIL  ${msg} (${elapsed}ms)`);
    }
    return false;
  }
}

async function testGoogleSearchGrounding(): Promise<boolean> {
  console.log("\n── Step 5/5: Gemini + Google Search Grounding ──────────");
  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey: getApiKey()! });

  const today = new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear().toString();

  const start = Date.now();
  try {
    const response = await client.models.generateContent({
      config: {
        maxOutputTokens: 512,
        tools: [{ googleSearch: {} }],
      },
      contents: [{ parts: [{ text: `What is the top news headline for ${today}? Be specific with dates.` }], role: "user" }],
      model: GEMINI_TEXT_MODEL,
    });

    const elapsed = Date.now() - start;
    const text = response.text?.trim();
    if (!text) {
      console.log(`  FAIL  Empty response after ${elapsed}ms`);
      return false;
    }

    console.log(`  PASS  Response: "${text.slice(0, 150)}${text.length > 150 ? "..." : ""}" (${elapsed}ms)`);

    // The model's knowledge cutoff is Jan 2025 — if it references the current year,
    // Google Search grounding is providing real-time data
    const hasCurrentYear = text.includes(year);
    if (hasCurrentYear) {
      console.log(`  INFO  Response references ${year} — Google Search grounding is active`);
    } else {
      console.log(`  WARN  Response does not reference ${year} — grounding may not have triggered`);
    }

    const metadata = response.candidates?.[0]?.groundingMetadata;
    const searchQueries = metadata?.webSearchQueries ?? [];
    if (searchQueries.length > 0) {
      console.log(`  INFO  Search queries: ${searchQueries.length}`);
      searchQueries.forEach((q: string, i: number) => console.log(`         [${i + 1}] "${q}"`));
    }

    return true;
  } catch (err) {
    const elapsed = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  FAIL  ${msg} (${elapsed}ms)`);
    return false;
  }
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║     Gemini Omni 1.1 Flash / Gemini Connectivity      ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  const results: boolean[] = [];

  results.push(await testApiKey());
  if (!results[0]) {
    console.log("\n✗ Aborting — no API key configured.\n");
    process.exit(1);
  }

  results.push(await testGeminiText());
  results.push(await testOmniVideo());
  results.push(await testOmniWithReferenceImage());
  results.push(await testGoogleSearchGrounding());

  console.log("\n── Summary ────────────────────────────────────────────");
  const labels = [
    "API Key",
    `Gemini Text (${GEMINI_TEXT_MODEL})`,
    `Gemini Omni Video (${OMNI_VIDEO_MODEL})`,
    `Gemini Omni + Reference Image`,
    `Gemini + Google Search Grounding`,
  ];
  for (let i = 0; i < results.length; i++) {
    console.log(`  ${results[i] ? "PASS" : "FAIL"}  ${labels[i]}`);
  }

  const allPassed = results.every(Boolean);
  console.log(allPassed ?
    "\n✓ All checks passed — ready to generate shows.\n" :
    "\n✗ Some checks failed — see above for details.\n",
  );
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
