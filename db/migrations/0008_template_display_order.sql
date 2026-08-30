-- Migration: 0008_template_display_order.sql
-- Templates were ordered by (is_default, created_at), so the catalogue order was
-- an accident of seeding time. An explicit rank lets the product decide which
-- formats lead.

ALTER TABLE "show_templates"
  ADD COLUMN IF NOT EXISTS "display_order" integer DEFAULT 100;
