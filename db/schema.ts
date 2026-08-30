import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────────────────────
// Videos Table
// ─────────────────────────────────────────────────────────────────────────────

export const videos = pgTable("videos", {
  id: uuid("id").primaryKey().defaultRandom(),
  muxAssetId: text("mux_asset_id").notNull().unique(),
  muxPlaybackId: text("mux_playback_id"),
  title: text("title"),
  summary: text("summary"),
  meta: jsonb("meta"), // Full Mux asset metadata
  aspectRatio: text("aspect_ratio"),
  duration: real("duration"),
  tags: text("tags").array(),
  transcriptVtt: text("transcript_vtt"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, table => [
  index("videos_mux_asset_id_idx").on(table.muxAssetId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Video Chunks Table (with embeddings)
// ─────────────────────────────────────────────────────────────────────────────

export const videoChunks = pgTable("video_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  videoId: uuid("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  startTime: real("start_time"),
  endTime: real("end_time"),
  embedding: vector("embedding", { dimensions: 768 }), // Google text-embedding-004
  createdAt: timestamp("created_at").defaultNow(),
}, table => [
  index("video_chunks_video_id_idx").on(table.videoId),
  index("video_chunks_embedding_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limits Table
// ─────────────────────────────────────────────────────────────────────────────

export const rateLimits = pgTable("rate_limits", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(), // IP address or fingerprint
  endpoint: text("endpoint").notNull(), // e.g., "translate-audio", "render"
  windowStart: timestamp("window_start").notNull(), // Start of rate limit window
  requestCount: integer("request_count").notNull().default(1),
}, table => [
  index("rate_limits_lookup_idx").on(table.identifier, table.endpoint, table.windowStart),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Feature Metrics Table
// ─────────────────────────────────────────────────────────────────────────────

export const featureMetrics = pgTable("feature_metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  feature: text("feature").notNull(), // e.g., "semantic-search-nav"
  identifier: text("identifier"), // Optional IP address or fingerprint
  metadata: jsonb("metadata"), // Optional extra info (e.g., search query, assetId)
  createdAt: timestamp("created_at").defaultNow(),
}, table => [
  index("feature_metrics_feature_idx").on(table.feature),
  index("feature_metrics_created_at_idx").on(table.createdAt),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Show Templates Table
// ─────────────────────────────────────────────────────────────────────────────

export const showTemplates = pgTable("show_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  showType: text("show_type").notNull(), // "monologue" | "conversation"
  referenceImageUrl: text("reference_image_url"),
  hosts: jsonb("hosts").notNull(), // [{name, personality, position?}]
  notes: text("notes"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Generated Shows Table
// ─────────────────────────────────────────────────────────────────────────────

export const generatedShows = pgTable("generated_shows", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateId: uuid("template_id").notNull().references(() => showTemplates.id),
  topic: text("topic").notNull(),
  topicType: text("topic_type").notNull(), // "freetext" | "news_link" | "hacker_news"
  durationSeconds: integer("duration_seconds").notNull(),
  familiarity: text("familiarity").notNull(), // "beginner" | "familiar" | "expert"
  status: text("status").notNull().default("pending"), // pending|researching|scripting|generating|stitching|uploading|ready|failed
  // Path to the finished local render, handed from the stitch/synthesis step to the
  // upload step. Previously stashed in `error`, which lost it on upload retries.
  localRenderPath: text("local_render_path"),
  researchContext: text("research_context"),
  transcript: text("transcript"),
  transcriptSegments: jsonb("transcript_segments"), // [{speaker, text, startTime, endTime}]
  muxAssetId: text("mux_asset_id"),
  muxPlaybackId: text("mux_playback_id"),
  error: text("error"),
  workflowRunId: text("workflow_run_id"),
  language: text("language").default("en"),
  useFrameChaining: boolean("use_frame_chaining").default(false),
  userId: text("user_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, table => [
  index("generated_shows_user_id_idx").on(table.userId),
  index("generated_shows_status_idx").on(table.status),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Video Clips Table (VEO-generated 10s segments)
// ─────────────────────────────────────────────────────────────────────────────

export const videoClips = pgTable("video_clips", {
  id: uuid("id").primaryKey().defaultRandom(),
  showId: uuid("show_id").notNull().references(() => generatedShows.id, { onDelete: "cascade" }),
  clipIndex: integer("clip_index").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  prompt: text("prompt").notNull(),
  status: text("status").notNull().default("pending"), // pending|generating|ready|failed
  videoUrl: text("video_url"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
}, table => [
  index("video_clips_show_id_idx").on(table.showId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Chat Messages Table
// ─────────────────────────────────────────────────────────────────────────────

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  showId: uuid("show_id").notNull().references(() => generatedShows.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, table => [
  index("chat_messages_show_id_idx").on(table.showId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// User Settings Table
// ─────────────────────────────────────────────────────────────────────────────

export const userSettings = pgTable("user_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(),
  age: integer("age"),
  location: text("location"),
  defaultLanguage: text("default_language").default("en"),
  defaultFamiliarity: text("default_familiarity").default("familiar"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Agent Memory Bank Table (Cross-session knowledge, interests & mental model)
// ─────────────────────────────────────────────────────────────────────────────

export const userMemories = pgTable("user_memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  memoryType: text("memory_type").notNull(), // "concept_mastery" | "humor_preference" | "interest_topic" | "question_pattern" | "custom_note"
  key: text("key").notNull(),
  value: text("value").notNull(),
  confidence: real("confidence").default(1.0),
  sourceShowId: uuid("source_show_id").references(() => generatedShows.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, table => [
  index("user_memories_user_id_idx").on(table.userId),
  index("user_memories_type_idx").on(table.memoryType),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Show Tangents Table (On-the-fly generated interactive deep-dives & audio clips)
// ─────────────────────────────────────────────────────────────────────────────

export const showTangents = pgTable("show_tangents", {
  id: uuid("id").primaryKey().defaultRandom(),
  showId: uuid("show_id").notNull().references(() => generatedShows.id, { onDelete: "cascade" }),
  userId: text("user_id"),
  question: text("question").notNull(),
  hostName: text("host_name").notNull(),
  scriptText: text("script_text").notNull(),
  audioUrl: text("audio_url"),
  audioData: text("audio_data"), // base64 encoded audio data when stored inline
  durationSeconds: integer("duration_seconds"),
  createdAt: timestamp("created_at").defaultNow(),
}, table => [
  index("show_tangents_show_id_idx").on(table.showId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Type exports
// ─────────────────────────────────────────────────────────────────────────────

export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
export type VideoChunk = typeof videoChunks.$inferSelect;
export type NewVideoChunk = typeof videoChunks.$inferInsert;
export type RateLimit = typeof rateLimits.$inferSelect;
export type NewRateLimit = typeof rateLimits.$inferInsert;
export type FeatureMetric = typeof featureMetrics.$inferSelect;
export type NewFeatureMetric = typeof featureMetrics.$inferInsert;
export type ShowTemplate = typeof showTemplates.$inferSelect;
export type NewShowTemplate = typeof showTemplates.$inferInsert;
export type GeneratedShow = typeof generatedShows.$inferSelect;
export type NewGeneratedShow = typeof generatedShows.$inferInsert;
export type VideoClip = typeof videoClips.$inferSelect;
export type NewVideoClip = typeof videoClips.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export type UserSetting = typeof userSettings.$inferSelect;
export type NewUserSetting = typeof userSettings.$inferInsert;
export type UserMemory = typeof userMemories.$inferSelect;
export type NewUserMemory = typeof userMemories.$inferInsert;
export type ShowTangent = typeof showTangents.$inferSelect;
export type NewShowTangent = typeof showTangents.$inferInsert;
