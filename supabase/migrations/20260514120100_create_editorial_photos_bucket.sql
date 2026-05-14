-- Wikimedia photo mirror — editorial-photos bucket.
-- Plan doc: docs/superpowers/plans/2026-05-07-wikimedia-photo-mirror.md (Q3)
--
-- Creates a NEW storage bucket for free-license editorial photos (Wikimedia
-- Commons today, anticipated future sources: Flickr CC, public-domain archives).
-- The bucket name is intentionally broader than `wikimedia-mirror` because the
-- `source` column on `location_photos` already distinguishes origins; bucket
-- naming should outlive any single source.
--
-- IMPORTANT: do NOT reuse the existing `location-photos` bucket.
-- That bucket was locked on 2026-04-14 (migration 20260414000000) when 663
-- Google Places photo binaries violated TOS §3.2.3. Its binaries are still in
-- place and re-publicising the bucket would resurrect orphaned URLs. Cleanup
-- of those binaries is separate follow-up work, not part of this plan.
--
-- Limits mirror the original `location-photos` config: 5MB max, jpeg/png/webp.
-- We pre-generate 5 widths (250/500/960/1280/1920) per photo into this bucket
-- with a `{location_id}/{width}.{ext}` key pattern via the Phase 2 ingest
-- script.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'editorial-photos',
  'editorial-photos',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- RLS policies — scoped tightly to bucket_id = 'editorial-photos'
-- =============================================================================
-- Public read: photos render via direct Supabase Storage URLs (no signed URL
-- overhead on the card/drawer hot path). License-compatible photos only —
-- gating happens at the audit + ingest stage, not the bucket policy stage.
CREATE POLICY "Public read access for editorial photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'editorial-photos');

-- Service role writes: ingest pipeline only. Authenticated users cannot upload
-- here — community uploads go to the `location-photos` bucket via the
-- community Phase 3 flow (separate from this work).
CREATE POLICY "Service role upload for editorial photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'editorial-photos');

CREATE POLICY "Service role update for editorial photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'editorial-photos')
  WITH CHECK (bucket_id = 'editorial-photos');

-- Service role deletes: takedown compliance. If a Wikimedia file is deleted
-- upstream and the quarterly recheck flags it, we remove our mirrored copy.
CREATE POLICY "Service role delete for editorial photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'editorial-photos');
