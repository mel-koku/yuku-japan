import type { Location } from "@/types/location";
import type { InterestId } from "@/types/trip";
import type { ScoringResult } from "@/lib/scoring/types";

/**
 * Category to interest mapping for scoring.
 *
 * Maps location categories to user interests for scoring relevance.
 * Includes both specific categories (shrine, temple, museum) and
 * generic fallback categories (culture, food, nature) for backwards
 * compatibility with legacy data.
 */
export const CATEGORY_TO_INTERESTS: Record<string, InterestId[]> = {
  // Specific categories (preferred)
  shrine: ["culture", "history"],
  temple: ["culture", "history"],
  landmark: ["culture", "photography"],
  historic: ["culture", "history"],
  restaurant: ["food"],
  cafe: ["food"],
  market: ["food", "shopping"],
  park: ["nature", "wellness", "photography"],
  garden: ["nature", "wellness", "photography"],
  bar: ["nightlife"],
  onsen: ["wellness", "nature"],
  entertainment: ["nightlife", "nature"],
  shopping: ["shopping"],
  museum: ["craft", "culture", "history"],
  viewpoint: ["photography", "nature"],
  nature: ["nature", "photography", "wellness"],
  castle: ["culture", "history"],
  theater: ["culture", "nightlife"],
  aquarium: ["nature"],
  zoo: ["nature"],
  beach: ["nature", "photography"],
  historic_site: ["history", "culture"],
  craft: ["craft", "culture", "shopping"],

  // Generic fallback categories (for legacy data)
  // These map to broad interests when specific category is unknown
  culture: ["culture", "history"],
  view: ["photography", "nature"],
};


/**
 * Score how well a location matches user interests.
 * Range: 0-40 points (base 0-30 + up to 10 rotation bonus)
 */
export function scoreInterestMatch(
  location: Location,
  interests: InterestId[],
  currentInterest?: InterestId,
): ScoringResult {
  const locationCategory = location.category;
  if (!locationCategory) {
    return { score: 10, reasoning: "No category information available" };
  }

  // Find matching interests
  const matchingInterests = CATEGORY_TO_INTERESTS[locationCategory] ?? [];
  const matchedInterests = interests.filter((interest) =>
    matchingInterests.includes(interest),
  );

  let score: number;
  let reasoning: string;

  if (matchedInterests.length === 0) {
    score = 5;
    reasoning = `Category "${locationCategory}" doesn't match any selected interests`;
  } else if (matchedInterests.length === interests.length) {
    // Perfect match gets full points
    score = 30;
    reasoning = `Perfect match: "${locationCategory}" aligns with all interests (${matchedInterests.join(", ")})`;
  } else {
    // Partial match gets proportional score
    const matchRatio = matchedInterests.length / interests.length;
    score = Math.round(15 + matchRatio * 15); // 15-30 range
    reasoning = `Partial match: "${locationCategory}" aligns with ${matchedInterests.length} of ${interests.length} interests (${matchedInterests.join(", ")})`;
  }

  // Rotation bonus: +10 when the location's category matches the current
  // rotation interest. This favors the interest being rotated without
  // overwhelming rating (0-25) or logistical fit (-100 to 20).
  if (currentInterest && matchingInterests.includes(currentInterest)) {
    score += 10;
    reasoning += ` +rotation bonus for "${currentInterest}"`;
  }

  return { score, reasoning };
}
