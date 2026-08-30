import { and, cosineDistance, desc, eq, gt, sql } from "drizzle-orm";

import { MissingApiKeyError, resolveVertexKey } from "@/app/lib/api-keys";
import { getPlaybackIdForAsset } from "@/app/lib/mux";
import { checkRateLimit, getClientIp } from "@/app/lib/rate-limit";

import { buildGenAIClient } from "../app/lib/genai";

import { db, videoChunks, videos } from "./index";

import type { GoogleGenAI } from "@google/genai";

// ─────────────────────────────────────────────────────────────────────────────
// Client & Embedding Helper
// ─────────────────────────────────────────────────────────────────────────────

function getClient(): GoogleGenAI {
  const apiKey = resolveVertexKey();
  if (!apiKey) {
    throw new MissingApiKeyError();
  }
  return buildGenAIClient(apiKey);
}

export async function getGoogleEmbedding(text: string): Promise<number[]> {
  const client = getClient();
  const response = await client.models.embedContent({
    model: "text-embedding-004",
    contents: [{ role: "user", parts: [{ text }] }],
  });
  const values = response.embeddings?.[0]?.values;
  if (!values) {
    throw new Error("Failed to generate Google text-embedding-004 embedding");
  }
  return values;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Result from the video chunk search */
export interface VideoChunkResult {
  chunk_id: string;
  mux_asset_id: string;
  parent_video_tags: string[] | null;
  similarity_score: number;
  video_id: string;
  playback_id: string | null;
  title: string | null;
  summary: string | null;
  start_time: number | null;
  end_time: number | null;
}

/** Result from searching within a specific video's transcript */
export interface ChunkWithinVideoResult {
  chunkId: string;
  startTime: number | null;
  similarityScore: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Search Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rate limit error for search operations.
 */
export class SearchRateLimitError extends Error {
  constructor(
    message: string,
    public readonly resetAt: Date,
    public readonly retryAfterSeconds: number,
  ) {
    super(message);
    this.name = "SearchRateLimitError";
  }
}

/**
 * Performs semantic search on video chunks using Google text-embedding-004 vector similarity.
 * @throws {SearchRateLimitError} When rate limit is exceeded.
 */
export async function searchVideoChunks(
  query: string,
  limit: number = 10,
): Promise<VideoChunkResult[]> {
  if (!query.trim()) {
    return [];
  }

  // Check rate limit for search
  const clientIp = await getClientIp();
  const rateLimitResult = await checkRateLimit(clientIp, "search");

  if (!rateLimitResult.allowed) {
    const retryAfterSeconds = Math.ceil((rateLimitResult.resetAt.getTime() - Date.now()) / 1000);
    throw new SearchRateLimitError(
      `Search rate limit exceeded. Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
      rateLimitResult.resetAt,
      retryAfterSeconds,
    );
  }

  // Generate embedding using Google text-embedding-004
  const embedding = await getGoogleEmbedding(query);

  // Calculate similarity (1 - cosine distance)
  const similarity = sql<number>`1 - (${cosineDistance(videoChunks.embedding, embedding)})`;

  // Perform vector similarity search
  const results = await db
    .select({
      chunkId: videoChunks.id,
      videoId: videoChunks.videoId,
      startTime: videoChunks.startTime,
      endTime: videoChunks.endTime,
      muxAssetId: videos.muxAssetId,
      title: videos.title,
      summary: videos.summary,
      tags: videos.tags,
      similarity,
    })
    .from(videoChunks)
    .innerJoin(videos, eq(videoChunks.videoId, videos.id))
    .orderBy(desc(similarity))
    .limit(limit);

  // Fetch playback IDs from Mux (in parallel)
  const uniqueAssetIds = [...new Set(results.map(r => r.muxAssetId))];
  const playbackResults = await Promise.all(
    uniqueAssetIds.map(async (assetId) => {
      try {
        const result = await getPlaybackIdForAsset(assetId);
        return { assetId, playbackId: result.playbackId };
      } catch {
        return { assetId, playbackId: null };
      }
    }),
  );
  const playbackMap = new Map(playbackResults.map(r => [r.assetId, r.playbackId]));

  // Map to expected format
  return results.map(result => ({
    chunk_id: result.chunkId,
    mux_asset_id: result.muxAssetId,
    parent_video_tags: result.tags,
    similarity_score: result.similarity,
    video_id: result.videoId,
    playback_id: playbackMap.get(result.muxAssetId) ?? null,
    title: result.title,
    summary: result.summary,
    start_time: result.startTime,
    end_time: result.endTime,
  }));
}

/**
 * Performs semantic search within a specific video's transcript chunks using Google text-embedding-004.
 * Returns matching chunks with start times for transcript scrolling.
 */
export async function searchChunksWithinVideo(
  query: string,
  muxAssetId: string,
  limit: number = 10,
): Promise<ChunkWithinVideoResult[]> {
  if (!query.trim()) {
    return [];
  }

  // Generate embedding using Google text-embedding-004
  const embedding = await getGoogleEmbedding(query);

  // Calculate similarity (1 - cosine distance)
  const similarity = sql<number>`1 - (${cosineDistance(videoChunks.embedding, embedding)})`;

  // Perform vector similarity search within the specific video
  const results = await db
    .select({
      chunkId: videoChunks.id,
      startTime: videoChunks.startTime,
      similarity,
    })
    .from(videoChunks)
    .innerJoin(videos, eq(videoChunks.videoId, videos.id))
    .where(and(
      eq(videos.muxAssetId, muxAssetId),
      gt(similarity, 0.1), // Only return reasonably similar results
    ))
    .orderBy(desc(similarity))
    .limit(limit);

  return results.map(result => ({
    chunkId: result.chunkId,
    startTime: result.startTime,
    similarityScore: result.similarity,
  }));
}
