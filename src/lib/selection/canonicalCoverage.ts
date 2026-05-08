/**
 * Direction 4 (2026-05-08): post-scoring canonical coverage.
 *
 * Editor-curated must-includes per persona+city. Runs after the day loop
 * in generateItinerary(). For each major city in the trip, force-includes
 * canonical locations (those with the persona id in `canonicalForPersonas`)
 * by swapping them in for the algorithm's lowest-priority picks.
 *
 * Backwards-compat: empty/unknown personaId or empty `canonicalForPersonas`
 * arrays = no force-include fires (no behavior change).
 *
 * Skips activities tagged `saved`/`pinned` and any `kind === "note"` —
 * those are user/LLM/calendar load-bearing. Only swaps free picks.
 *
 * Score proxy: position-in-day. The picker pulls from top-5 score order, so
 * the last-picked place activity is the lowest-priority one. Cheap, no
 * re-scoring needed, no Itinerary type change.
 */
import type { Itinerary, ItineraryActivity, ItineraryDay } from "@/types/itinerary";
import type { Location } from "@/types/location";
import { normalizeKey } from "@/lib/utils/stringUtils";
import { logger } from "@/lib/logger";
import { getLocationDurationMinutes } from "@/lib/generation/helpers";

type PlaceActivity = Extract<ItineraryActivity, { kind: "place" }>;

export type CanonicalCoverageOptions = {
  itinerary: Itinerary;
  personaId: string;
  allLocations: Location[];
  /**
   * Max force-includes per city. UI/UX ceiling: 3-5 for first-timer, smaller
   * for honeymooner, 0 for repeat-traveler. 0 disables force-include for
   * a given persona without removing the column data.
   */
  perCityCap: number;
};

const SKIP_TAGS = new Set(["saved", "pinned"]);

function locationCityKey(loc: Location): string {
  return loc.planningCity ?? normalizeKey(loc.city);
}

/**
 * True when this place activity was freely picked by the algorithm (i.e.,
 * eligible to be swapped out). False for user-saved, LLM-pinned, or anchor
 * activities — those carry intent we must preserve.
 */
function isSwappable(activity: PlaceActivity): boolean {
  if (activity.isAnchor) return false;
  if (activity.isCustom) return false;
  if (!activity.locationId) return false;
  const tags = activity.tags ?? [];
  for (const tag of tags) {
    if (SKIP_TAGS.has(tag)) return false;
  }
  return true;
}

/**
 * Apply canonical coverage: force-include must-include locations per
 * persona+city by swapping them in for the lowest-priority picks.
 *
 * Returns a new Itinerary with the swaps applied. Original is unchanged.
 */
export function applyCanonicalCoverage(opts: CanonicalCoverageOptions): Itinerary {
  const { itinerary, personaId, allLocations, perCityCap } = opts;

  // Backwards-compat: empty persona or zero cap = no-op.
  if (!personaId || perCityCap <= 0) {
    return itinerary;
  }

  // Group days by city — multiple days can share a city (city sequence).
  const dayIndicesByCity = new Map<string, number[]>();
  itinerary.days.forEach((day, idx) => {
    const cityId = day.cityId;
    if (!cityId) return;
    const list = dayIndicesByCity.get(cityId) ?? [];
    list.push(idx);
    dayIndicesByCity.set(cityId, list);
  });

  if (dayIndicesByCity.size === 0) {
    return itinerary;
  }

  // Build a set of location ids and normalized names already in the itinerary
  // so we don't double-include something the picker already chose.
  const usedIds = new Set<string>();
  const usedNames = new Set<string>();
  for (const day of itinerary.days) {
    for (const activity of day.activities) {
      if (activity.kind !== "place") continue;
      if (activity.locationId) usedIds.add(activity.locationId);
      if (activity.title) usedNames.add(activity.title.toLowerCase().trim());
    }
  }

  // Build a lookup by id for the parent-relationship dedup below.
  const locationById = new Map<string, Location>();
  for (const loc of allLocations) locationById.set(loc.id, loc);

  // Clone the days array so the caller's reference isn't mutated.
  const newDays: ItineraryDay[] = itinerary.days.map((day) => ({
    ...day,
    activities: [...day.activities],
  }));

  // Locations injected by this layer in the current call. Excluded from
  // swap candidacy so successive iterations don't trample earlier injections.
  // Kept as a runtime set, not a tag, because activity tags are rendered in
  // the UI (RouteOverview) and the UX rule says no editor-pick badging.
  const injectedIds = new Set<string>();

  for (const [cityId, dayIndices] of dayIndicesByCity) {
    // Resolve must-includes: canonical for this persona, in this city,
    // not already in the itinerary.
    const candidates = allLocations.filter((loc) => {
      if (!loc.canonicalForPersonas || loc.canonicalForPersonas.length === 0) return false;
      if (!loc.canonicalForPersonas.includes(personaId)) return false;
      if (locationCityKey(loc) !== cityId) return false;
      if (usedIds.has(loc.id)) return false;
      // Note: we do NOT skip on usedNames match. Same-named-but-different-id
      // rows (corpus duplicates like the two "Gion" rows in Kyoto) are a
      // real data hygiene issue. When the picker chose the orphan duplicate
      // and we want to inject the canonical, the swap step replaces the
      // orphan with the canonical, eliminating the double-listing as a
      // side effect of the swap. Skipping on name here causes the canonical
      // to miss force-include entirely (smoke-test 2026-05-08: Gion 15-40%).
      // Skip if this canonical is a child of an already-injected container —
      // avoids double-listing when the parent area is already in the trip.
      // We do NOT skip the symmetric case (canonical is a container, child
      // already there): editor-curated container picks ARE the area-walk
      // experience, distinct from any individual child venue. Smoke-test
      // 2026-05-08 showed Gion (container) was suppressed 86% of the time
      // because Kenninji (child) had landed via the picker — that's a
      // brand-promise failure for the first-timer Kyoto trip.
      if (loc.parentId && usedIds.has(loc.parentId)) return false;
      return true;
    });

    if (candidates.length === 0) continue;

    // Cap to UX ceiling.
    const mustIncludes = candidates.slice(0, perCityCap);

    for (const mustInclude of mustIncludes) {
      // Two-pass swap-target selection:
      //   Pass 1: prefer a same-titled activity (corpus-duplicate orphan).
      //           Replacing it eliminates the duplicate as a side effect.
      //   Pass 2: fall back to the lowest-priority swappable (latest in day).
      // The picker pulls from top-5 score-sorted; later positions are the
      // lowest-priority slots. We take the activity with the highest
      // within-day index across all days for this city.
      const canonicalNameLower = mustInclude.name.toLowerCase().trim();
      let target: { dayIdx: number; activityIdx: number } | undefined;

      // Pass 1: name-collision swap target.
      for (const dayIdx of dayIndices) {
        const day = newDays[dayIdx];
        if (!day) continue;
        for (let i = 0; i < day.activities.length; i += 1) {
          const activity = day.activities[i];
          if (!activity || activity.kind !== "place") continue;
          if (!isSwappable(activity)) continue;
          if (activity.locationId === mustInclude.id) continue;
          if (activity.title.toLowerCase().trim() === canonicalNameLower) {
            target = { dayIdx, activityIdx: i };
            break;
          }
        }
        if (target) break;
      }

      // Pass 2: lowest-priority swappable (only if Pass 1 didn't find one).
      if (!target) {
        let targetWithinDayIdx = -1;
        for (const dayIdx of dayIndices) {
          const day = newDays[dayIdx];
          if (!day) continue;
          for (let i = day.activities.length - 1; i >= 0; i -= 1) {
            const activity = day.activities[i];
            if (!activity || activity.kind !== "place") continue;
            if (!isSwappable(activity)) continue;
            if (activity.locationId && injectedIds.has(activity.locationId)) continue;
            if (i > targetWithinDayIdx) {
              target = { dayIdx, activityIdx: i };
              targetWithinDayIdx = i;
            }
            break; // only the latest swappable per day matters
          }
        }
      }

      if (!target) {
        // No swappable slot in this city — force-include can't land. Editor
        // probably curated more than the days can hold. Log and move on.
        logger.warn(
          `Canonical coverage: no swappable slot for "${mustInclude.name}" in city "${cityId}"`,
          { personaId, mustIncludeId: mustInclude.id, cityId },
        );
        break;
      }

      const day = newDays[target.dayIdx];
      if (!day) continue;
      const swapped = day.activities[target.activityIdx];
      if (!swapped || swapped.kind !== "place") continue;

      // Inherit the swapped activity's tag shape (interest + category) so the
      // canonical-injected card has the same number of tag pills as the
      // picker would have produced for that slot. The interest tag stays
      // whatever the picker chose for the slot (e.g. "cultural", "dining"),
      // and the category swaps to the canonical's category. UX rule: must
      // read as natural planner output, no editor-pick badging.
      const inheritedInterestTag = swapped.tags?.[0];
      const canonicalCategoryTag = mustInclude.category;
      const replacementTags: string[] = [];
      if (inheritedInterestTag) replacementTags.push(inheritedInterestTag);
      if (canonicalCategoryTag && canonicalCategoryTag !== inheritedInterestTag) {
        replacementTags.push(canonicalCategoryTag);
      }

      const replacement: PlaceActivity = {
        kind: "place",
        id: `${mustInclude.id}-d${target.dayIdx + 1}-canon`,
        title: mustInclude.name,
        timeOfDay: swapped.timeOfDay,
        durationMin: getLocationDurationMinutes(mustInclude),
        locationId: mustInclude.id,
        coordinates: mustInclude.coordinates,
        neighborhood: mustInclude.neighborhood,
        tags: replacementTags.length > 0 ? replacementTags : undefined,
        ...(mustInclude.description && { description: mustInclude.description }),
      };

      day.activities[target.activityIdx] = replacement;
      usedIds.add(mustInclude.id);
      usedNames.add(mustInclude.name.toLowerCase().trim());
      injectedIds.add(mustInclude.id);

      logger.info(
        `Canonical coverage: force-included "${mustInclude.name}" in "${cityId}" (replaced "${swapped.title}" on day ${target.dayIdx + 1})`,
        { personaId, replacedLocationId: swapped.locationId },
      );
    }
  }

  return { ...itinerary, days: newDays };
}
