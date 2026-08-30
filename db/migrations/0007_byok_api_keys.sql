-- Migration: 0007_byok_api_keys.sql
-- A run's Google API keys must outlive the request that started it, because the
-- durable workflow resumes across separate invocations. They are stored here
-- encrypted (AES-256-GCM, see app/lib/api-keys.ts) and wiped when the run ends,
-- so a database dump alone never exposes a visitor's credentials.

ALTER TABLE "generated_shows"
  ADD COLUMN IF NOT EXISTS "encrypted_api_keys" text;
