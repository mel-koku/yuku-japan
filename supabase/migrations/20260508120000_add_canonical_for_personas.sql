-- Direction 4: editor-curated canonical coverage per persona.
--
-- Stores which target personas a location is "must-include" for. Read by the
-- post-scoring force-include layer in src/lib/selection/canonicalCoverage.ts;
-- empty array (or unrecognized persona) means no force-include fires.
--
-- Persona ids match scripts/simulate-planner.test.ts — currently:
--   'first-timer', 'repeat', 'honeymooner', 'family' (deferred)
-- The column accepts free-form text so editors can iterate without a schema
-- change; mismatched ids simply don't fire (backwards-compat by construction).
--
-- Curation cap (UX ceiling, enforced in code, not schema): 3-5 entries per
-- city per persona for first-timer; smaller for honeymooner; 0 default for
-- repeat-traveler. Schema permits more so editors can experiment without a
-- deploy gate.
--
-- RLS: inherited from existing `locations` policies (public read via
-- "Locations are viewable by everyone", service-role writes via bypass).
-- No new policy needed — verified against
-- supabase/migrations/20241120_create_locations_table.sql.

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS canonical_for_personas text[] DEFAULT NULL;

-- GIN index for the contains-operator (`canonical_for_personas @> ARRAY['first-timer']`)
-- used by the force-include layer to resolve must-includes per persona+city.
CREATE INDEX IF NOT EXISTS idx_locations_canonical_for_personas
  ON locations
  USING GIN (canonical_for_personas);
