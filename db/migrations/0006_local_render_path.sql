-- Migration: 0006_local_render_path.sql
-- The finished render path was previously stashed in `error` as "__stitched:<path>".
-- That collided with real error messages and was cleared before upload succeeded,
-- so any upload retry failed permanently with "Stitched video path not found".

ALTER TABLE "generated_shows"
  ADD COLUMN IF NOT EXISTS "local_render_path" text;
