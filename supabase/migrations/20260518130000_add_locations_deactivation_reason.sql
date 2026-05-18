-- Add deactivation provenance columns to `locations`.
--
-- Background: `is_active = false` is an overloaded soft-delete with no recorded
-- reason. A 2026-05-18 investigation (session friendly-jennings-134cd5;
-- docs/superpowers/inactive-locations-classification-2026-05-18.md) classified
-- all 986 inactive rows into 7 distinct situations — never-enriched imports,
-- duplicates, content-extraction errors, closures, sub-feature folds — none of
-- which were distinguishable without per-row auditing. The team already leaves
-- provenance ad-hoc in the free-text `note` column (`[DEACTIVATED YYYY-MM-DD]
-- <reason>` on 19/986 rows); this migration formalizes that habit.
--
-- This is the "Option A" schema fix from that report. It is purely ADDITIVE:
--   - no row deletions
--   - no change to `is_active` semantics (it stays the visibility gate)
--   - no change to any query path or RPC — the public corpus is still gated by
--     `is_active = true` exactly as before (the report's corpus-query audit
--     confirmed there is no leak today).
--
-- Three columns:
--   deactivation_reason  — WHY a row is inactive. CHECK-constrained enum; the
--                          values mirror the report's buckets. NULL for active
--                          rows and for inactive rows not yet triaged.
--   deactivated_at       — WHEN it was deactivated, when known. NULL otherwise
--                          (`updated_at` is unreliable for this — a 2026-05-18
--                          slug backfill touched all 6899 rows).
--   superseded_by_id     — for `deactivation_reason = 'duplicate'`, the active
--                          row this one duplicates. Self-FK to locations(id).
--
-- A separate, approved backfill step populates these from the report's bucket
-- JSON + the 92-row dupe→active CSV. This migration only adds the columns.

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS deactivation_reason text
    CHECK (
      deactivation_reason IN (
        'duplicate',            -- same place as an active row (see superseded_by_id)
        'closed_permanently',   -- venue permanently closed
        'closed_temporarily',   -- venue temporarily closed (Google flag — noisy)
        'wrong_table',          -- a tour/activity/accommodation; belongs in `experiences`
        'sub_feature_folded',   -- a sub-feature promoted into the `sub_experiences` table
        'data_quality_reject',  -- Frankenstein / misassigned place_id
        'unresolved_import',    -- imported but never matched to a Google place
        'editorial_prune'       -- editorially removed for another reason
      )
    ),
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by_id text
    REFERENCES locations(id) ON DELETE SET NULL;

-- Index the dupe-supersession pointer so "what supersedes / is superseded by
-- this row" stays cheap. Partial — only the small subset of rows that carry it.
CREATE INDEX IF NOT EXISTS idx_locations_superseded_by_id
  ON locations (superseded_by_id)
  WHERE superseded_by_id IS NOT NULL;

COMMENT ON COLUMN locations.deactivation_reason IS
  'Why this row has is_active = false. CHECK-constrained enum: duplicate, '
  'closed_permanently, closed_temporarily, wrong_table, sub_feature_folded, '
  'data_quality_reject, unresolved_import, editorial_prune. NULL for active '
  'rows and for inactive rows not yet triaged. Does NOT gate visibility — '
  'is_active does that; this only records the reason.';

COMMENT ON COLUMN locations.deactivated_at IS
  'When this row was deactivated, when known; NULL otherwise. Distinct from '
  'updated_at, which auto-bumps on any write and is unreliable as a '
  'deactivation timestamp.';

COMMENT ON COLUMN locations.superseded_by_id IS
  'For deactivation_reason = ''duplicate'': the active locations.id this row '
  'duplicates. Self-FK, ON DELETE SET NULL (if the survivor is ever deleted '
  'the pointer clears rather than cascade-deleting this tombstone). NULL for '
  'all other rows.';
