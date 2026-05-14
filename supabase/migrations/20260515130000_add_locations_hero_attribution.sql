-- Phase 3 of the Wikimedia photo mirror plan.
-- Plan doc: docs/superpowers/plans/2026-05-07-wikimedia-photo-mirror.md (§Phase 3)
--
-- Background: Phase 1 (PR #246) and Phase 2 (PR #248) shipped license metadata
-- onto `location_photos` and mirrored 143 wikimedia hero photos to the
-- `editorial-photos` bucket. The next surface is per-card attribution UI.
--
-- LocationCard listing queries (places lanes, search, similar-places, saved,
-- hierarchy, planner output) do not JOIN `location_photos` — they project
-- columns directly from `locations`. Adding a join on every listing path
-- would cost a query plan rewrite for ~10 hot-path call sites and bloat
-- the row payload for the 4699 google-source hero rows that do not need
-- the structured fields (their attribution is satisfied by the existing
-- `/api/places/photo` proxy which carries Google's `htmlAttributions`).
--
-- Denormalize the hero attribution as a sparse jsonb column on `locations`.
-- Null for google heroes; populated for wikimedia heroes. Listing projections
-- pick it up via the `"key in r" guard pattern in transformDbRowToLocation.
--
-- Sync contract (load-bearing):
--   `locations.hero_attribution` is a READ-CACHE of the wikimedia
--   `location_photos` row where `is_hero=true AND source='wikimedia'`.
--   Any mutation to that row's license/attribution fields must propagate
--   to `hero_attribution` to keep the read-cache coherent. The companion
--   script `scripts/_rebuild-hero-attribution-from-photos.mjs` (gitignored,
--   main checkout) enforces this idempotently and should be re-run after
--   any Phase 2 re-ingestion, license audit correction, or hero swap that
--   touches a wikimedia row. Same coupling pattern as the
--   `primary_photo_url` read-cache documented in 20260514120000_*.sql.

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS hero_attribution jsonb;

COMMENT ON COLUMN locations.hero_attribution IS
  'Sparse read-cache of the wikimedia hero row''s attribution metadata. '
  'Populated only for locations whose hero photo is sourced from Wikimedia '
  'Commons (source=wikimedia in location_photos). Null for google heroes — '
  'those use Google''s htmlAttributions returned by /api/places/photo. '
  'Shape: { author: string, authorUri: string|null, licenseShort: string, '
  'licenseUri: string, licenseNotice: string|null, sourceUri: string }. '
  'Read-cache of location_photos — see Phase 3 plan and the sync contract '
  'comment in 20260514120000_wikimedia_mirror_schema.sql.';

-- No new RLS policies needed — `locations` already has SELECT-anon and
-- SELECT-authenticated covering this column.
