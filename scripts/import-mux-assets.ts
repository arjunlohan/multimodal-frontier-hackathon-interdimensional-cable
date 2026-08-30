/* eslint-disable no-console, node/no-process-env */
import Mux from "@mux/mux-node";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../db/schema";

// Load environment variables first
dotenv.config({ path: ".env.local" });

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_LANGUAGE = "en";

// Parse command line args
const args = process.argv.slice(2);
const languageIndex = args.indexOf("--language");
const languageCode = languageIndex !== -1 ? args[languageIndex + 1] : DEFAULT_LANGUAGE;

console.log(`Using language code: ${languageCode}`);

// ─────────────────────────────────────────────────────────────────────────────
// Database setup
// ─────────────────────────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema });

// ─────────────────────────────────────────────────────────────────────────────
// Mux client
// ─────────────────────────────────────────────────────────────────────────────

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID,
  tokenSecret: process.env.MUX_TOKEN_SECRET,
});

// ─────────────────────────────────────────────────────────────────────────────
// Main import function
// ─────────────────────────────────────────────────────────────────────────────

async function importMuxAssets() {
  console.log("Fetching Mux assets...");

  // Fetch all assets from Mux (paginated)
  const allAssets: Mux.Video.Asset[] = [];
  let page: Awaited<ReturnType<typeof mux.video.assets.list>> | undefined;

  do {
    page = await mux.video.assets.list({
      limit: 100,
    });
    allAssets.push(...page.data);
    console.log(`Fetched ${allAssets.length} assets so far...`);
  } while (page.data.length === 100);

  console.log(`\nTotal assets found: ${allAssets.length}`);

  // Filter to only ready assets with playback IDs
  const readyAssets = allAssets.filter(
    asset => asset.status === "ready" && asset.playback_ids && asset.playback_ids.length > 0,
  );

  console.log(`Ready assets with playback IDs: ${readyAssets.length}\n`);

  // Process each asset
  for (const asset of readyAssets) {
    console.log(`\n─────────────────────────────────────────────────────────`);
    console.log(`Processing: ${asset.meta?.title || asset.id}`);
    console.log(`Asset ID: ${asset.id}`);

    try {
      // Get the first public playback ID, or any playback ID
      const playbackId = asset.playback_ids?.find(p => p.policy === "public")?.id ||
        asset.playback_ids?.[0]?.id;

      // Fetch transcript VTT if available
      let transcriptVtt: string | null = null;
      const transcriptTrack = asset.tracks?.find(
        t => t.type === "text" && t.text_type === "subtitles" && t.status === "ready" && t.language_code === languageCode,
      );

      if (transcriptTrack && playbackId) {
        try {
          const vttUrl = `https://stream.mux.com/${playbackId}/text/${transcriptTrack.id}.vtt`;
          const vttResponse = await fetch(vttUrl);
          if (vttResponse.ok) {
            transcriptVtt = await vttResponse.text();
            console.log(`✓ Fetched transcript VTT (${transcriptVtt.length} chars)`);
          }
        } catch (e) {
          console.log(`  Could not fetch transcript: ${e}`);
        }
      }

      // Insert or update video record
      const [video] = await db
        .insert(schema.videos)
        .values({
          muxAssetId: asset.id,
          muxPlaybackId: playbackId,
          title: (asset.meta as { title?: string })?.title || null,
          meta: asset as unknown as Record<string, unknown>,
          aspectRatio: asset.aspect_ratio || null,
          duration: asset.duration || null,
          transcriptVtt,
        })
        .onConflictDoUpdate({
          target: schema.videos.muxAssetId,
          set: {
            muxPlaybackId: playbackId,
            title: (asset.meta as { title?: string })?.title || null,
            meta: asset as unknown as Record<string, unknown>,
            aspectRatio: asset.aspect_ratio || null,
            duration: asset.duration || null,
            transcriptVtt,
            updatedAt: new Date(),
          },
        })
        .returning();

      console.log(`✓ Video record saved (ID: ${video.id})`);

      // Generate embeddings using Google GenAI text-embedding-004
      console.log(`Generating Google embeddings for asset ${asset.id}...`);

      const { buildGenAIClient } = await import("../app/lib/genai");
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY required");
      }
      // Shared factory: express (`AQ.*`) keys are Vertex-only and 403 otherwise.
      const client = buildGenAIClient(apiKey);

      // Parse VTT into chunks if available
      interface ChunkData {
        text: string;
        startTime?: number;
        endTime?: number;
      }
      const rawChunks: ChunkData[] = [];

      if (transcriptVtt) {
        // Simple VTT cue parser
        const cueBlocks = transcriptVtt.split(/\n\s*\n/);
        for (const block of cueBlocks) {
          const lines = block.trim().split("\n");
          const timeLine = lines.find(l => l.includes("-->"));
          if (timeLine) {
            const [startStr, endStr] = timeLine.split("-->").map(s => s.trim());
            const parseVttTime = (t: string) => {
              const parts = t.split(":");
              if (parts.length === 3) {
                return Number.parseFloat(parts[0]) * 3600 + Number.parseFloat(parts[1]) * 60 + Number.parseFloat(parts[2]);
              }
              if (parts.length === 2) {
                return Number.parseFloat(parts[0]) * 60 + Number.parseFloat(parts[1]);
              }
              return 0;
            };
            const textLines = lines.filter(l => !l.includes("-->") && !/^\d+$/.test(l.trim())).join(" ");
            if (textLines.trim()) {
              rawChunks.push({
                text: textLines.trim(),
                startTime: parseVttTime(startStr),
                endTime: parseVttTime(endStr),
              });
            }
          }
        }
      }

      // If no transcript, use title and summary as a chunk
      if (rawChunks.length === 0) {
        rawChunks.push({
          text: `${(asset.meta as { title?: string })?.title || "Video"} - ${asset.id}`,
          startTime: 0,
          endTime: asset.duration ? Math.round(asset.duration) : 60,
        });
      }

      console.log(`✓ Prepared ${rawChunks.length} chunks for embedding`);

      // Delete existing chunks for this video (in case of re-import)
      await db
        .delete(schema.videoChunks)
        .where(eq(schema.videoChunks.videoId, video.id));

      // Embed each chunk with Google text-embedding-004
      for (let i = 0; i < rawChunks.length; i++) {
        const chunk = rawChunks[i];
        const embRes = await client.models.embedContent({
          model: "text-embedding-004",
          contents: [{ role: "user", parts: [{ text: chunk.text }] }],
        });
        const values = embRes.embeddings?.[0]?.values;
        if (values && values.length > 0) {
          const embeddingStr = `[${values.join(",")}]`;
          await pool.query(
            `INSERT INTO video_chunks (video_id, chunk_index, start_time, end_time, embedding)
             VALUES ($1, $2, $3, $4, $5::vector)`,
            [
              video.id,
              i,
              chunk.startTime ?? null,
              chunk.endTime ?? null,
              embeddingStr,
            ],
          );
        }
      }
      console.log(`✓ Saved ${rawChunks.length} chunks with Google text-embedding-004 embeddings`);
    } catch (error) {
      console.error(`✗ Error processing asset ${asset.id}:`, error);
    }
  }

  console.log(`\n─────────────────────────────────────────────────────────`);
  console.log(`Import complete!`);

  await pool.end();
}

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

importMuxAssets().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
