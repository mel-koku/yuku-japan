import type { Location } from "@/types/location";
import { parseTimeToMinutes } from "@/lib/utils/timeUtils";

/**
 * Categories appropriate for scheduling after 6 PM.
 * All other categories are considered daytime-only and will be
 * hard-filtered from evening slots unless they have operating
 * hours explicitly confirming evening availability.
 *
 * `landmark`, `historic_site`, and `viewpoint` are intentionally
 * excluded — most members (kofun, castles, gardens, mountain viewpoints)
 * are daytime-only. The famous night exceptions (Tokyo Tower, Skytree,
 * Dotonbori, etc.) are admitted via NIGHT_FRIENDLY_LOCATION_IDS below.
 */
export const EVENING_APPROPRIATE_CATEGORIES = new Set([
  "restaurant",
  "bar",
  "entertainment",
  "theater",
  "onsen",
  "wellness",
  "shopping",
]);

/**
 * Per-location allowlist for famous evening exceptions whose category
 * (landmark / viewpoint / shrine / temple) would otherwise be filtered
 * out of evening slots. Slugs verified against Supabase 2026-05-07.
 *
 * Adding a location: append its DB id, run scripts/_verify-night-friendly-slugs.mjs.
 * See docs/superpowers/handoffs/2026-05-07-night-friendly-data-gaps.md for
 * known-missing rows (Shibuya Sky, Golden Gai, Kobe Port Tower, etc.).
 */
export const NIGHT_FRIENDLY_LOCATION_IDS = new Set<string>([
  // Observation decks (city night views)
  "tokyo-tower-kanto-db632e17",
  "tokyo-skytree-kanto-50a21c40",
  "umeda-sky-kanto-8cb2909e",
  "tsutenkaku-kanto-21dc0783",
  "fukuoka-tower-kyushu-c1f3236a",
  // Entertainment / nightlife districts
  "dotonbori-kansai-31988d77",
  "shibuya-crossing-kanto-e5b09a41",
  "susukino-sapporo-21f3c7",
  "pontocho-alley-kansai-7944d880",
  "denden-town-kanto-2a125b41",
  "amerika-mura-osaka-41fd3f",
  "amerikamura-kanto-ed603e2d",
  "rainbow-bridge-kanto-6fe41eec",
  "sakai-city-hall-observation-lobby-osaka-ef4833",
  // Cultural sites famous as night experiences
  "okunoin-yamanashi-315efa",
]);

export function isNightFriendly(loc: { id: string }): boolean {
  return NIGHT_FRIENDLY_LOCATION_IDS.has(loc.id);
}

/**
 * Detects whether a location has hours that confirm it's a genuine evening
 * venue — at least one period closes between 19:30 and 23:59. This filters
 * out three categories of false positives that the basic hours-fit check
 * would otherwise admit into evening slots:
 *
 * 1. The "00:00–23:59 sentinel" used for parks, gates, monument plaques
 *    and other publicly-accessible spaces with no formal hours.
 * 2. Early-closing daytime venues that technically overlap the start of
 *    the evening slot (e.g., Koshien Stadium 10:00–18:00, Warner Bros
 *    Studio Tokyo Mon-Sat 8:30–19:00).
 * 3. Locations missing hours data entirely.
 *
 * Used in `pickLocationForTimeSlot` for daytime-category locations that
 * aren't on the night-friendly allowlist — they need confirmed late hours
 * to be admitted to an evening slot.
 */
export function hasGenuineEveningHours(loc: Location): boolean {
  const periods = loc.operatingHours?.periods;
  if (!periods || periods.length === 0) return false;
  return periods.some((p) => {
    const close = parseTimeToMinutes(p.close);
    if (close == null) return false;
    // Real evening venues close between 19:30 and 23:59 exclusive.
    // 23:59 is the "always open" sentinel — semantically "no formal hours."
    return close >= 19 * 60 + 30 && close < 23 * 60 + 59;
  });
}

/**
 * Optimal time of day for different location categories
 */
const OPTIMAL_TIMES_BY_CATEGORY: Record<string, Array<"morning" | "afternoon" | "evening">> = {
  viewpoint: ["morning", "evening"], // Best at sunrise/sunset
  park: ["morning", "afternoon"], // Less crowded in morning
  garden: ["morning", "afternoon"], // Best lighting
  shrine: ["morning", "evening"], // Less crowded, peaceful
  temple: ["morning", "evening"], // Less crowded, peaceful
  restaurant: ["afternoon", "evening"], // Meal times
  market: ["morning", "afternoon"], // Fresh produce, less crowded
  museum: ["afternoon"], // Indoor, good for afternoon
  shopping: ["afternoon", "evening"], // Afternoon/evening shopping
  bar: ["evening"], // Evening/nightlife
  entertainment: ["evening"], // Evening entertainment
  landmark: ["morning", "afternoon"], // Better lighting, less crowds
  historic_site: ["morning", "afternoon"], // Better visibility
  nature: ["morning", "afternoon"], // Best lighting, cooler temps
  culture: ["morning", "afternoon"], // Indoor cultural sites
  cafe: ["morning", "afternoon"], // Coffee/tea times
  wellness: ["morning", "evening"], // Relaxation before/after activities
  onsen: ["afternoon", "evening"], // Post-sightseeing soak
  aquarium: ["morning", "afternoon"], // Indoor, good for daytime
  beach: ["morning", "afternoon"], // Best before peak heat
  castle: ["morning", "afternoon"], // Better lighting, cooler temps
  theater: ["afternoon", "evening"], // Show times
  zoo: ["morning", "afternoon"], // Animals more active early
  craft: ["morning", "afternoon"], // Workshop hours
};

/**
 * Score adjustment based on time-of-day optimization
 * Returns a score adjustment (-5 to +10) based on how well the time slot matches optimal times
 */
export function scoreTimeOfDayFit(
  location: Location,
  timeSlot: "morning" | "afternoon" | "evening",
  _date?: string, // ISO date string (yyyy-mm-dd) for weekday calculation
): { scoreAdjustment: number; reasoning: string } {
  const category = location.category?.toLowerCase() ?? "";
  const optimalTimes = OPTIMAL_TIMES_BY_CATEGORY[category];

  if (!optimalTimes || optimalTimes.length === 0) {
    return {
      scoreAdjustment: 0,
      reasoning: "No specific time preference for this category",
    };
  }

  // Perfect match gets highest score
  if (optimalTimes.includes(timeSlot)) {
    return {
      scoreAdjustment: 8,
      reasoning: `${timeSlot} is an optimal time to visit ${category} (less crowded, better experience)`,
    };
  }

  // Stronger penalty for daytime categories scheduled in evening slot
  // This check runs before the adjacent-optimal boost so it takes priority.
  // Per-location night-friendly allowlist bypasses the penalty.
  const isEveningDaytimeMismatch =
    timeSlot === "evening"
    && !EVENING_APPROPRIATE_CATEGORIES.has(category)
    && !NIGHT_FRIENDLY_LOCATION_IDS.has(location.id);
  if (isEveningDaytimeMismatch) {
    return {
      scoreAdjustment: -15,
      reasoning: `${category} is a daytime activity, not suitable for evening scheduling`,
    };
  }

  // Check if it's close to optimal (e.g., afternoon when morning/evening are optimal)
  // This gives a small boost for adjacent time slots
  const timeSlots: Array<"morning" | "afternoon" | "evening"> = ["morning", "afternoon", "evening"];
  const currentIndex = timeSlots.indexOf(timeSlot);
  const hasAdjacentOptimal = optimalTimes.some((optimal) => {
    const optimalIndex = timeSlots.indexOf(optimal);
    return Math.abs(currentIndex - optimalIndex) === 1;
  });

  if (hasAdjacentOptimal) {
    return {
      scoreAdjustment: 3,
      reasoning: `${timeSlot} is acceptable for ${category}, though ${optimalTimes.join(" or ")} would be better`,
    };
  }

  // Not optimal - small penalty
  return {
    scoreAdjustment: -3,
    reasoning: `${timeSlot} is not ideal for ${category} (optimal times: ${optimalTimes.join(", ")})`,
  };
}

const MINUTES_IN_DAY = 24 * 60;

// parseTimeToMinutes imported from @/lib/utils/timeUtils

/**
 * Check if location has opening hours that allow a meaningful visit in the time slot.
 *
 * Uses minute-level overlap to ensure the location is open long enough
 * for at least `minVisitMinutes` (default 30) within the slot.
 */
export function checkOpeningHoursFit(
  location: Location,
  timeSlot: "morning" | "afternoon" | "evening",
  date?: string, // ISO date string for weekday calculation
  minVisitMinutes = 30,
): { fits: boolean; reasoning: string } {
  const operatingHours = location.operatingHours;
  if (!operatingHours || !operatingHours.periods || operatingHours.periods.length === 0) {
    return {
      fits: true,
      reasoning: "No opening hours information available",
    };
  }

  // Map time slot to minute ranges
  const timeSlotRanges: Record<"morning" | "afternoon" | "evening", { start: number; end: number }> = {
    morning: { start: 9 * 60, end: 12 * 60 },
    afternoon: { start: 12 * 60, end: 17 * 60 },
    evening: { start: 17 * 60, end: 21 * 60 },
  };

  const slotRange = timeSlotRanges[timeSlot];
  if (!slotRange) {
    return {
      fits: true,
      reasoning: "Invalid time slot",
    };
  }

  // Get weekday if date provided (parse locally to avoid UTC drift)
  let weekday: string | undefined;
  if (date) {
    const parts = date.split("-");
    const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    weekday = weekdays[dateObj.getDay()];
  }

  // Check if any operating period allows a meaningful visit during the slot
  for (const period of operatingHours.periods) {
    // If weekday specified and period has a specific day, check if they match.
    // Periods without a day (generic "open every day") always match.
    if (weekday && period.day && period.day !== weekday) {
      continue;
    }

    const openMinutes = parseTimeToMinutes(period.open) ?? 0;
    let closeMinutes = parseTimeToMinutes(period.close) ?? 0;

    // Handle overnight periods
    if (period.isOvernight) {
      closeMinutes += MINUTES_IN_DAY;
    }

    // Compute actual overlap in minutes
    const overlapStart = Math.max(slotRange.start, openMinutes);
    const overlapEnd = Math.min(slotRange.end, closeMinutes);
    const overlapMinutes = Math.max(0, overlapEnd - overlapStart);

    if (overlapMinutes >= minVisitMinutes) {
      return {
        fits: true,
        reasoning: `Open during ${timeSlot} (${period.open}-${period.close}, ${overlapMinutes}min available)`,
      };
    }
  }

  // No matching period found with enough visit time
  return {
    fits: false,
    reasoning: `Insufficient opening hours during ${timeSlot} (need ${minVisitMinutes}min)`,
  };
}

