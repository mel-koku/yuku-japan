import type { Location } from "@/types/location";
import type { LocationScoringCriteria, ScoringResult, ScoringAdjustmentResult } from "@/lib/scoring/types";
import { MONTH_TO_SEASON_TAGS } from "@/lib/utils/seasonUtils";
import { getCrowdLevel } from "@/data/crowdPatterns";
import { DIETARY_CATEGORIES as DIETARY_CATEGORIES_LIST } from "@/data/mealCategories";
import { GATING_SEASONAL_TYPES } from "@/lib/scoring/seasonalTypes";

/**
 * Food-related categories where dietary preferences apply.
 */
const DIETARY_CATEGORIES = new Set<string>(DIETARY_CATEGORIES_LIST);

/**
 * Score seasonal match: +7 when location has a seasonal tag matching the trip month,
 * -3 when location has a seasonal tag that doesn't match, 0 for year-round.
 * For real availability gates (snow_winter, seasonal_attraction, winter_festival),
 * valid_months is enforced as a -15 penalty when out of window.
 */
export function scoreSeasonalMatch(
  location: Location,
  tripMonth?: number,
): ScoringAdjustmentResult {
  if (!tripMonth) {
    return { scoreAdjustment: 0, reasoning: "No seasonal data" };
  }

  // Only apply the hard gate for seasonal types that represent real closures.
  // Hero-marker types (cherry_blossom, autumn_foliage, etc.) had valid_months
  // cleared in the 2026-05-13 batch; any residual is safe to ignore here.
  if (
    location.validMonths &&
    location.validMonths.length > 0 &&
    GATING_SEASONAL_TYPES.has(location.seasonalType ?? "")
  ) {
    if (!location.validMonths.includes(tripMonth)) {
      return {
        scoreAdjustment: -15,
        reasoning: `Closed in month ${tripMonth} (operates ${location.validMonths.join(",")})`,
      };
    }
  }

  if (!location.tags) {
    return { scoreAdjustment: 0, reasoning: "No seasonal data" };
  }

  const seasonalTags = location.tags.filter((t) =>
    ["cherry-blossom", "autumn-foliage", "winter-illumination", "summer-flowers",
      "winter-festival", "summer-festival", "plum-blossom", "festival", "seasonal"].includes(t)
  );

  if (seasonalTags.length === 0 || location.tags.includes("year-round")) {
    return { scoreAdjustment: 0, reasoning: "Year-round location" };
  }

  const matchingTags = MONTH_TO_SEASON_TAGS[tripMonth] ?? [];
  const hasMatch = seasonalTags.some((t) => matchingTags.includes(t));

  if (hasMatch) {
    return {
      scoreAdjustment: 7,
      reasoning: `Seasonal match: ${seasonalTags.join(", ")} in month ${tripMonth}`,
    };
  }

  return {
    scoreAdjustment: -3,
    reasoning: `Out of season: ${seasonalTags.join(", ")} not ideal in month ${tripMonth}`,
  };
}

/**
 * Score content fit: +10 when the location is referenced by a guide or experience.
 */
export function scoreContentFit(
  location: Location,
  contentLocationIds?: Set<string>,
): ScoringResult {
  if (!contentLocationIds || contentLocationIds.size === 0) {
    return { score: 0, reasoning: "" };
  }
  if (contentLocationIds.has(location.id)) {
    return { score: 10, reasoning: "Featured in editorial content" };
  }
  return { score: 0, reasoning: "" };
}

/**
 * Score dietary fit for food locations.
 * Range: -5 to +5 points. Non-food categories always return 0.
 *
 * Only `servesVegetarianFood` has real Google Places data backing.
 * Other restrictions (halal, kosher, gluten-free) return neutral (0)
 * because we have no location data to match against.
 */
export function scoreDietaryFit(
  location: Location,
  dietaryRestrictions?: string[],
): ScoringResult {
  if (!dietaryRestrictions || dietaryRestrictions.length === 0) {
    return { score: 0, reasoning: "" };
  }

  const category = location.category?.toLowerCase() ?? "";
  if (!DIETARY_CATEGORIES.has(category)) {
    return { score: 0, reasoning: "" };
  }

  const restrictions = dietaryRestrictions.map((r) => r.toLowerCase());
  const needsVegetarian = restrictions.includes("vegetarian") || restrictions.includes("vegan");

  if (needsVegetarian) {
    const serves = location.dietaryOptions?.servesVegetarianFood;
    if (serves === true) {
      return { score: 5, reasoning: "Serves vegetarian food" };
    }
    if (serves === false) {
      return { score: -5, reasoning: "No vegetarian options reported" };
    }
    // No data — stay neutral, don't penalize missing info
    return { score: 0, reasoning: "Vegetarian options unknown" };
  }

  // Other restrictions (halal, kosher, GF) — no location data to match
  return { score: 0, reasoning: "" };
}

/**
 * Score crowd fit — prefer less crowded times, penalize peak crowds.
 * Range: -8 to +8 points
 */
export function scoreCrowdFit(
  location: Location,
  criteria: LocationScoringCriteria,
): ScoringResult {
  if (!criteria.timeSlot || !location.category) {
    return { score: 0, reasoning: "" };
  }

  // Map time slot to approximate hour
  const SLOT_TO_HOUR: Record<string, number> = {
    morning: 9,
    afternoon: 14,
    evening: 19,
  };
  const hour = SLOT_TO_HOUR[criteria.timeSlot] ?? 12;

  // Parse date for weekend/holiday detection
  let month: number | undefined;
  let dayOfMonth: number | undefined;
  if (criteria.date) {
    const parts = criteria.date.split("-");
    month = parseInt(parts[1] ?? "0", 10);
    dayOfMonth = parseInt(parts[2] ?? "0", 10);
  }

  const crowdLevel = getCrowdLevel(location.category, hour, {
    locationId: location.id,
    month,
    day: dayOfMonth,
    isWeekend: criteria.isWeekend,
  });

  // Score: low crowds = bonus, high crowds = penalty
  if (crowdLevel <= 1) return { score: 8, reasoning: "Very low crowds expected" };
  if (crowdLevel === 2) return { score: 4, reasoning: "Light crowds expected" };
  if (crowdLevel === 3) return { score: 0, reasoning: "Moderate crowds expected" };
  if (crowdLevel === 4) return { score: -4, reasoning: "Busy. Consider off-peak timing" };
  return { score: -8, reasoning: "Peak crowds. Expect long queues" };
}
