-- One-hero-per-location invariant — DB-level enforcement.
--
-- Background: `location_photos.is_hero=true` is the source-of-truth marker for
-- which photo represents a location. The wikimedia mirror schema
-- (20260514120000) documents the sync contract:
--
--   "`locations.primary_photo_url` is a READ-CACHE of the `location_photos`
--    row where `is_hero=true AND source IN ('google','wikimedia')`."
--
-- That contract assumed at most one hero row per location, but nothing in the
-- DB enforced it. The `scripts/enrich-all-locations.js#writeLocationPhotos`
-- upsert silently created dup-heroes whenever Google Places returned a new
-- lead photo on re-enrich: the new lead row was inserted at is_hero=true via
-- `i === 0`, while the old hero row kept is_hero=true (the upsert's
-- `onConflict: 'location_id,photo_name'` does not collide on different
-- photo_names). 17 locations carried 2 hero rows by 2026-05-14, audited
-- via `scripts/_dup-hero-audit.mjs` and cleaned via
-- `docs/superpowers/data-writes/2026-05-14-fix-dup-heroes.json`.
--
-- The companion script fix in `writeLocationPhotos` pre-clears
-- `is_hero=true` for the target location BEFORE the upsert, so this index
-- never throws on the happy path. The index is the safety net for other
-- ingest paths (apply scripts, future writers) that aren't aware of the
-- invariant — making the bug crash loudly instead of silently corrupting.
--
-- Re-probe 2026-05-14 (this session) before adding the index:
--   total is_hero=true rows: 4842
--   locations with >1 hero row: 0
-- Index creation will not violate. If a future drift re-introduces dups,
-- the audit script above is the diagnostic.
--
-- Index choice: partial unique on (location_id) WHERE is_hero. Plain
-- `CREATE UNIQUE INDEX` (not CONCURRENTLY) because supabase migrations run
-- inside a transaction and `location_photos` is small enough (~25k rows)
-- that the brief lock is acceptable.

CREATE UNIQUE INDEX IF NOT EXISTS location_photos_one_hero_per_location
  ON location_photos (location_id)
  WHERE is_hero = true;

COMMENT ON INDEX location_photos_one_hero_per_location IS
  'Enforces at most one is_hero=true row per location_id. Companion to the writeLocationPhotos pre-clear pattern in scripts/enrich-all-locations.js. See migration 20260515120000 for context.';
