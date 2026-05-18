-- Add a human-readable `slug` column to `locations` for clean `/places/` URLs.
--
-- Background: `/places/[id]` routes by the `locations` text primary key, which
-- has the form `{normalized-name-region}-{hexhash}`, e.g.
-- `jinrui-minna-menrui-kansai-670c1958`. The trailing hex run is a collision
-- guard — two locations with the same name+region would otherwise collide —
-- so it cannot simply be stripped from the URL. (A prod audit on 2026-05-18
-- found the hash width is 8, 6, or 4 hex chars across the 6899 rows; the
-- Phase 2 backfill strips all three widths.)
--
-- This adds a SEPARATE `slug` column. The `id` PK is untouched: it stays the
-- primary key, every FK child table (location_photos, sub_experiences,
-- location_relationships, location_availability, seasonal_availability) keeps
-- referencing `locations.id`, and `parent_id` self-refs are unchanged. Only
-- the `/places/` ROUTING and URL construction move to `slug`.
--
-- Phased rollout (this is Phase 1 of 3 on the DB side):
--   Phase 1 (this file): add `slug` NULLABLE, no constraint. Ships harmless —
--     nothing reads the column yet.
--   Phase 2: backfill every row's slug from its `id` (strip the -[0-9a-f]{8}
--     suffix; deterministic `-2`/`-3` numbering for base-slug collisions).
--     Apply script: scripts/_locations-slug-backfill-2026-05-18.mjs.
--   Phase 3 (20260518120100_unique_locations_slug.sql): once the backfill has
--     populated every row, add NOT NULL + a UNIQUE index.
--
-- `slug` is left NULLABLE here precisely so this migration can deploy before
-- the Phase 2 backfill runs — the NOT NULL + UNIQUE enforcement waits for
-- Phase 3, after the data is populated.

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS slug text;

COMMENT ON COLUMN locations.slug IS
  'Human-readable URL slug for the /places/[slug] route. Derived from `id` '
  'with the trailing 4/6/8-char hex hash stripped; base-slug collisions get '
  'a deterministic -2/-3 suffix (ordered by id ASC). Distinct from the `id` '
  'primary key, which is unchanged and still the FK target for all child '
  'tables. Nullable in this migration (Phase 1); NOT NULL + UNIQUE added in '
  '20260518120100 after the Phase 2 backfill populates every row.';
