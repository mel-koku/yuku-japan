-- Enforce NOT NULL + UNIQUE on `locations.slug`.
--
-- Phase 3 of the slug rollout. The column was added NULLABLE in
-- 20260518120000_add_locations_slug.sql; the Phase 2 backfill
-- (scripts/_locations-slug-backfill-2026-05-18.mjs) then populated a slug for
-- every row. This migration locks the invariant in.
--
-- ORDERING CONTRACT (load-bearing): this migration MUST NOT be deployed until
-- the Phase 2 backfill has run against the same database. The backfill
-- guarantees zero NULL slugs and zero duplicate slugs; if it has not run,
-- `SET NOT NULL` throws on the NULL rows and the UNIQUE index throws on the
-- duplicates. The PR carrying this file is sequenced so the prod backfill
-- runs (and is verified: zero NULLs, zero dups) before the PR merges and
-- Vercel deploys the migrations.
--
-- Index choice: plain `CREATE UNIQUE INDEX` (not CONCURRENTLY) — Supabase
-- migrations run inside a transaction, and `locations` (~6.9k rows) is small
-- enough that the brief lock is acceptable. Same rationale as the partial
-- unique index in 20260515120000_unique_hero_per_location.sql.
--
-- The UNIQUE index doubles as the lookup index for the `/places/[slug]` route,
-- which resolves rows via `.eq("slug", param)` on every request.

ALTER TABLE locations
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS locations_slug_key
  ON locations (slug);

COMMENT ON INDEX locations_slug_key IS
  'Unique slug per location. Doubles as the lookup index for the '
  '/places/[slug] route (.eq("slug", param)). See migration 20260518120100 '
  'and the Phase 2 backfill scripts/_locations-slug-backfill-2026-05-18.mjs.';
