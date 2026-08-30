-- Migration: 0005_memory_bank_and_tangents.sql
-- Parity for 4-tier cognitive memory bank, show tangents, and 768d Google text-embedding-004 pgvector

-- 1. Upgrade video_chunks embedding dimensions from 1536 to 768 (Google text-embedding-004)
DROP INDEX IF EXISTS "video_chunks_embedding_idx";

ALTER TABLE "video_chunks" 
  ALTER COLUMN "embedding" TYPE vector(768);

CREATE INDEX "video_chunks_embedding_idx" 
  ON "video_chunks" 
  USING hnsw ("embedding" vector_cosine_ops);

-- 2. Agent Memory Bank (Cross-session knowledge, interests & mental model)
CREATE TABLE IF NOT EXISTS "user_memories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "memory_type" text NOT NULL,
  "key" text NOT NULL,
  "value" text NOT NULL,
  "confidence" real DEFAULT 1.0,
  "source_show_id" uuid REFERENCES "generated_shows"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "user_memories_user_id_idx" ON "user_memories" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "user_memories_type_idx" ON "user_memories" USING btree ("memory_type");

-- 3. Show Tangents (On-the-fly generated interactive deep-dives & audio clips)
CREATE TABLE IF NOT EXISTS "show_tangents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "show_id" uuid NOT NULL REFERENCES "generated_shows"("id") ON DELETE CASCADE,
  "user_id" text,
  "question" text NOT NULL,
  "host_name" text NOT NULL,
  "script_text" text NOT NULL,
  "audio_url" text,
  "audio_data" text,
  "duration_seconds" integer,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "show_tangents_show_id_idx" ON "show_tangents" USING btree ("show_id");
