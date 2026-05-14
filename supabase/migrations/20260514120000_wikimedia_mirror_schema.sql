-- Wikimedia photo mirror — Phase 1 schema.
-- Plan doc: docs/superpowers/plans/2026-05-07-wikimedia-photo-mirror.md
-- (Open questions resolved 2026-05-14.)
--
-- Background: 143 active locations carry a `upload.wikimedia.org/...` URL on
-- `locations.primary_photo_url`. 134 of them already have a matching
-- `location_photos` row tagged `source='curated'`, where `photo_name` stores
-- the raw Wikimedia URL and `attribution` is a human-readable string like
-- "Author, CC BY-SA 4.0, via Wikimedia Commons". Those rows pre-date this
-- plan (created 2026-05-03) and should be reclassified to `source='wikimedia'`
-- with the license fields decomposed into structured columns.
--
-- This migration is data-shape-only. It does not move any row; reclassification
-- runs out-of-band via scripts/_wikimedia-license-audit.mjs (read-only audit)
-- and a follow-up apply script after mel reviews the audit CSV.
--
-- Sync contract (LOAD-BEARING — read before touching photo writes):
--   `locations.primary_photo_url` is a READ-CACHE of the `location_photos`
--   row where `is_hero=true AND source IN ('google','wikimedia')`. The hero
--   row is the source of truth for the chosen photo identity; any mutation
--   to it (URL change, source reclassification, deletion) must propagate to
--   `primary_photo_url` so the read-cache stays coherent.
--
--   The re-derivation script
--   `scripts/_rebuild-primary-photo-url-from-photos.mjs` enforces this
--   contract idempotently FOR source='wikimedia' rows. source='google'
--   rows are intentionally out of scope for that script: the existing
--   pre-rendered proxy URL `/api/places/photo?photoName=...&maxWidthPx=N`
--   convention varies per call site (N=400/1200/1600) and needs a
--   separate design pass to canonicalize before bulk re-derivation is safe.
--   The narrower scope is documented at the top of that script.
--
--   Why this matters: the same coupling pattern was the proximate cause of
--   the 2026-04 Google bucket TOS incident — primary_photo_url went stale
--   when location_photos was mutated, then served orphaned URLs externally.
--   The lock migration (20260414000000) was the cleanup. This time we ship
--   the re-derivation tool alongside the schema so the next photo source
--   doesn't reopen the same gap.

-- =============================================================================
-- 1. Extend location_photos with attribution + license + source provenance
-- =============================================================================
ALTER TABLE location_photos
  ADD COLUMN IF NOT EXISTS license_short  text,
  ADD COLUMN IF NOT EXISTS license_uri    text,
  ADD COLUMN IF NOT EXISTS license_notice text,
  ADD COLUMN IF NOT EXISTS source_uri     text,
  ADD COLUMN IF NOT EXISTS source_sha1    text;

COMMENT ON COLUMN location_photos.license_short IS
  'Short license identifier, e.g. "CC BY-SA 4.0", "CC0", "Public domain". Used as the visible license badge in attribution UI.';

COMMENT ON COLUMN location_photos.license_uri IS
  'Canonical URL of the license deed, e.g. https://creativecommons.org/licenses/by-sa/4.0/. Powers the license link in attribution UI.';

COMMENT ON COLUMN location_photos.license_notice IS
  'Full license text or attribution notice carried verbatim when the license requires it (GFDL, certain CC variants, MLIT terms). Null for standard CC where short + uri suffice.';

COMMENT ON COLUMN location_photos.source_uri IS
  'Link back to the source file page (Wikimedia Commons file page, Flickr page, etc.) so users can verify provenance. Distinct from attribution_uri which links to the author profile.';

COMMENT ON COLUMN location_photos.source_sha1 IS
  'Upstream file SHA-1 captured at ingest time. Lets a quarterly recheck job detect source-file replacement (sha1 mismatch) for editorial review. No auto re-ingest in v1 (see plan §4b).';

-- =============================================================================
-- 2. Widen the source CHECK constraint to admit 'wikimedia'
-- =============================================================================
-- Constraint name confirmed by violating-write probe on 2026-05-14:
--   `location_photos_source_check`. DROP IF EXISTS is still defensive.
ALTER TABLE location_photos
  DROP CONSTRAINT IF EXISTS location_photos_source_check;

ALTER TABLE location_photos
  ADD CONSTRAINT location_photos_source_check
  CHECK (source IN ('google', 'curated', 'community', 'wikimedia'));

-- =============================================================================
-- 3. Update the photo_name comment to reflect reality + post-Phase-1 future
-- =============================================================================
-- The 20260413010000 comment claimed source=curated stores a "Supabase Storage
-- path within location-photos bucket". That is already wrong: the 134 existing
-- curated rows store raw `upload.wikimedia.org/...` URLs. After Phase 2 ingest,
-- source='wikimedia' rows will carry a Supabase Storage path within the new
-- editorial-photos bucket. Document both interpretations honestly.
COMMENT ON COLUMN location_photos.photo_name IS
  'Identifier whose meaning depends on `source`: source=google → opaque Google Places photo resource name (places/{place_id}/photos/{ref}); source=curated → either a Supabase Storage path within location-photos (pre-2026-04 lock) OR a raw external URL (historical Wikimedia rows from the 2026-05-03 ingest); source=community → Supabase Storage path within location-photos; source=wikimedia → Supabase Storage path within editorial-photos bucket after Phase 2 ingest, OR a raw upload.wikimedia.org URL during the transition window. The /api/places/photo proxy and the editorial-photos loader branch on this format.';
