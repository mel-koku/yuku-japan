-- Widen the locations.deactivation_reason CHECK enum with a 9th value:
-- `closed_long_term`.
--
-- Background: migration 20260518130000 added deactivation_reason with 8 values.
-- The 2026-05-18 closed_temporarily re-verification found 4 venues closed for
-- *years* (multi-year renovation / preservation), not the short-term closure
-- `closed_temporarily` implies — yet they WILL reopen on announced dates, so
-- `closed_permanently` would be factually wrong (and risky: the cleanup plan
-- treats `closed_permanently` as the one bucket where hard-deletion is
-- defensible — a future cleanup could delete a venue that is merely closed
-- for renovation). `closed_long_term` records the honest middle state:
-- closed for an extended period, reopening expected.
--
-- Purely additive: widens a CHECK constraint, no data change, no column change.
-- A separate apply step retags the 4 rows from `closed_temporarily` to
-- `closed_long_term`.

ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_deactivation_reason_check;

ALTER TABLE locations ADD CONSTRAINT locations_deactivation_reason_check
  CHECK (
    deactivation_reason IN (
      'duplicate',            -- same place as an active row (see superseded_by_id)
      'closed_permanently',   -- venue permanently closed
      'closed_temporarily',   -- venue temporarily closed (Google flag — noisy)
      'closed_long_term',     -- closed for years (multi-year renovation etc.); reopening expected
      'wrong_table',          -- a tour/activity/accommodation; belongs in `experiences`
      'sub_feature_folded',   -- a sub-feature promoted into the `sub_experiences` table
      'data_quality_reject',  -- Frankenstein / misassigned place_id
      'unresolved_import',    -- imported but never matched to a Google place
      'editorial_prune'       -- editorially removed for another reason
    )
  );

COMMENT ON COLUMN locations.deactivation_reason IS
  'Why this row has is_active = false. CHECK-constrained enum: duplicate, '
  'closed_permanently, closed_temporarily, closed_long_term, wrong_table, '
  'sub_feature_folded, data_quality_reject, unresolved_import, editorial_prune. '
  'NULL for active rows and for inactive rows not yet triaged. Does NOT gate '
  'visibility — is_active does that; this only records the reason.';
