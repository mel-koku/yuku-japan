/**
 * Location selection utilities for itinerary generation.
 *
 * This module provides functions to pick the best locations for time slots
 * based on scoring, diversity, and availability constraints.
 */

import type { Location } from "@/types/location";
import type { InterestId, TripBuilderData } from "@/types/trip";
import type { WeatherForecast } from "@/types/weather";
import { scoreLocation, type LocationScoringCriteria, type ScoreBreakdown } from "@/lib/scoring/locationScoring";
import { applyDiversityFilter, type DiversityContext } from "@/lib/scoring/diversityRules";
import { checkOpeningHoursFit, EVENING_APPROPRIATE_CATEGORIES, MORNING_BLOCKED_CATEGORIES, isNightFriendly, hasGenuineEveningHours } from "@/lib/scoring/timeOptimization";
import { isLocationAvailableOnDate } from "@/lib/scoring/seasonalAvailability";
import { logger } from "@/lib/logger";

/**
 * Extended location type with scoring metadata.
 */
export type ScoredLocation = Location & {
  _scoringReasoning?: string[];
  _scoreBreakdown?: ScoreBreakdown;
  _isReturnVisit?: boolean;
  _runnerUps?: { name: string; id: string }[];
};

/**
 * Pick a location that fits within the available time budget.
 * Uses intelligent scoring system to select the best location.
 *
 * @param list - List of available locations
 * @param interest - Current interest to match
 * @param usedLocations - Set of already used location IDs
 * @param availableMinutes - Available time in the slot
 * @param travelTime - Estimated travel time to add
 * @param currentLocation - Current location coordinates
 * @param recentCategories - Recently visited categories for diversity
 * @param travelStyle - User's travel pace preference
 * @param interests - All user interests for matching
 * @param budget - User's budget preferences
 * @param accessibility - User's accessibility requirements
 * @param weatherForecast - Weather forecast for the day
 * @param weatherPreferences - User's weather preferences
 * @param timeSlot - Target time slot
 * @param date - Target date
 * @param group - User's group information
 * @param recentNeighborhoods - Recently visited neighborhoods for diversity
 * @param usedLocationNames - Set of already used location names
 * @returns Selected location with scoring metadata, or undefined if none available
 */
export function pickLocationForTimeSlot(
  list: Location[],
  interest: InterestId,
  usedLocations: Set<string>,
  availableMinutes: number,
  travelTime: number,
  currentLocation?: { lat: number; lng: number },
  recentCategories: string[] = [],
  travelStyle: TripBuilderData["style"] = "balanced",
  interests: InterestId[] = [],
  budget?: {
    level?: "budget" | "moderate" | "luxury";
    total?: number;
    perDay?: number;
  },
  accessibility?: {
    wheelchairAccessible?: boolean;
    elevatorRequired?: boolean;
  },
  weatherForecast?: WeatherForecast,
  weatherPreferences?: {
    preferIndoorOnRain?: boolean;
    minTemperature?: number;
    maxTemperature?: number;
  },
  timeSlot?: "morning" | "afternoon" | "evening",
  date?: string,
  group?: {
    size?: number;
    type?: "solo" | "couple" | "family" | "friends" | "business";
    childrenAges?: number[];
  },
  recentNeighborhoods: string[] = [],
  usedLocationNames: Set<string> = new Set(),
  contentLocationIds?: Set<string>,
  isZoneClustered?: boolean,
  communityRatings?: Map<string, number>,
  categoryWeights?: Record<string, number>,
  dietaryRestrictions?: string[],
  hasPhotographyVibe?: boolean,
  isWeekend?: boolean,
  accommodationStyle?: "hotel" | "ryokan" | "hostel" | "mix",
  preferredTags?: string[],
  hasLocalSecretsVibe?: boolean,
  hasNatureAdventureVibe?: boolean,
  hasHeritageVibe?: boolean,
  clusterContext?: { clusterPairs: Set<string>; scheduledIds: string[] },
): ScoredLocation | undefined {
  // Filter by both ID and name to prevent duplicates (including same-name different branches)
  const unused = list.filter((loc) => {
    if (usedLocations.has(loc.id)) return false;
    const normalizedName = loc.name.toLowerCase().trim();
    if (usedLocationNames.has(normalizedName)) return false;
    return true;
  });

  // CRITICAL: Return undefined when all locations are exhausted
  // The caller should handle this by suggesting day trips or reducing activities
  if (unused.length === 0) {
    return undefined;
  }

  // Pre-filter by hard constraints (opening hours)
  // Only filter if we have time slot and date information
  let candidates = unused;
  if (timeSlot && date) {
    candidates = unused.filter((loc) => {
      const openingHoursCheck = checkOpeningHoursFit(loc, timeSlot, date);
      return openingHoursCheck.fits;
    });

    // If all candidates filtered out by operating hours, return undefined.
    // The generator handles this gracefully (tries next interest, suggests day trips).
    if (candidates.length === 0) {
      logger.info("All locations filtered out by operating hours", {
        timeSlot,
        date,
        unusedCount: unused.length,
      });
      return undefined;
    }
  }

  // Evening slot: hard-exclude daytime-only categories for the entire slot,
  // not just after 60 min elapsed. The first activity of the evening slot was
  // previously bypassing this filter.
  if (timeSlot === "evening") {
    const beforeCount = candidates.length;
    candidates = candidates.filter((loc) => {
      const cat = loc.category?.toLowerCase() ?? "";
      const categoryAllowed = EVENING_APPROPRIATE_CATEGORIES.has(cat) || isNightFriendly(loc);

      if (!categoryAllowed) {
        // Daytime category — admit only with hours that confirm it's a real
        // evening venue (close between 19:30 and 23:59). This rejects the
        // 24/7 sentinel pattern used for parks/gates/monument markers AND
        // early-closing daytime venues that just overlap the slot start.
        if (!date) return false;
        return hasGenuineEveningHours(loc);
      }

      // Category-allowed — but if opening hours are present, still validate
      // them. Closes the bypass that admitted shopping at 17:00-closing markets.
      if (date && loc.operatingHours?.periods?.length) {
        const hoursCheck = checkOpeningHoursFit(loc, "evening", date);
        return hoursCheck.fits;
      }
      return true;
    });
    if (beforeCount > candidates.length) {
      logger.info("Filtered daytime-only categories from evening slot", {
        before: beforeCount,
        after: candidates.length,
        availableMinutes,
      });
    }
    if (candidates.length === 0) {
      return undefined;
    }
  }

  // Morning slot: hard-exclude bath/bar categories that are never editorially
  // appropriate before noon, regardless of opening hours.
  if (timeSlot === "morning") {
    const beforeCount = candidates.length;
    candidates = candidates.filter((loc) => {
      const cat = loc.category?.toLowerCase() ?? "";
      return !MORNING_BLOCKED_CATEGORIES.has(cat);
    });
    if (beforeCount > candidates.length) {
      logger.info("Filtered morning-inappropriate categories from morning slot", {
        before: beforeCount,
        after: candidates.length,
      });
    }
    if (candidates.length === 0) {
      return undefined;
    }
  }

  // Filter seasonal locations based on date
  // Use local-date constructor to avoid UTC midnight timezone bugs
  if (date) {
    const [dy, dm, dd] = date.split("-").map(Number);
    const dateObj = (dy && dm && dd) ? new Date(dy, dm - 1, dd) : new Date(date);
    const beforeCount = candidates.length;
    candidates = candidates.filter((loc) => {
      // Non-seasonal locations always pass
      if (!loc.isSeasonal) return true;

      // Check if seasonal location is available on this date
      const availability = isLocationAvailableOnDate(loc, dateObj, loc.availability);
      if (!availability.available) {
        logger.debug(`Filtering out seasonal location "${loc.name}": ${availability.reason}`);
      }
      return availability.available;
    });

    const filteredCount = beforeCount - candidates.length;
    if (filteredCount > 0) {
      logger.debug(`Filtered ${filteredCount} seasonal locations for date ${date}`);
    }
  }

  // Score all candidates
  const criteria: LocationScoringCriteria = {
    interests: interests.length > 0 ? interests : [interest],
    travelStyle: travelStyle ?? "balanced",
    budgetLevel: budget?.level,
    budgetTotal: budget?.total,
    budgetPerDay: budget?.perDay,
    accessibility,
    currentLocation,
    availableMinutes: availableMinutes - travelTime, // Subtract travel time from available
    recentCategories,
    recentNeighborhoods,
    weatherForecast,
    weatherPreferences,
    timeSlot,
    date,
    group,
    currentInterest: interest,
    tripMonth: date ? parseInt(date.split("-")[1]!, 10) : undefined,
    contentLocationIds,
    isZoneClustered,
    communityRatings,
    categoryWeights,
    dietaryRestrictions,
    hasPhotographyVibe,
    isWeekend,
    accommodationStyle,
    preferredTags,
    hasLocalSecretsVibe,
    hasNatureAdventureVibe,
    hasHeritageVibe,
  };

  let scored = candidates
    .map((loc) => scoreLocation(loc, criteria))
    // Filter out locations with very negative scores (e.g., -100 for >50km distance)
    // These are effectively "invalid" for this query
    .filter((locScore) => locScore.score >= -50);

  // Apply cluster bonus: +5 when candidate is near a same-day activity
  if (clusterContext && clusterContext.clusterPairs.size > 0 && clusterContext.scheduledIds.length > 0) {
    scored = scored.map((locScore) => {
      for (const scheduledId of clusterContext.scheduledIds) {
        if (clusterContext.clusterPairs.has(`${locScore.location.id}::${scheduledId}`)) {
          return {
            ...locScore,
            score: locScore.score + 5,
            reasoning: [...locScore.reasoning, "Cluster proximity bonus: +5 (near same-day activity)"],
          };
        }
      }
      return locScore;
    });
  }

  // Apply diversity filter
  const diversityContext: DiversityContext = {
    recentCategories,
    visitedLocationIds: usedLocations,
    currentDay: 0, // Not currently used in diversity scoring, but kept for future enhancements
    energyLevel: 100,
  };

  const filtered = applyDiversityFilter(scored, diversityContext);

  // Sort by score, descending
  filtered.sort((a, b) => b.score - a.score);

  // Pick from top 5 with some randomness to avoid identical itineraries
  const topCandidates = filtered.slice(0, Math.min(5, filtered.length));
  if (topCandidates.length === 0) {
    // Fallback if all filtered out - still respect usedLocations AND usedLocationNames
    const fallbackCandidates = candidates.filter((loc) => {
      if (usedLocations.has(loc.id)) return false;
      const normalizedName = loc.name.toLowerCase().trim();
      if (usedLocationNames.has(normalizedName)) return false;
      return true;
    });
    if (fallbackCandidates.length === 0) {
      return undefined; // No valid locations left
    }
    const fallback = fallbackCandidates[Math.floor(Math.random() * fallbackCandidates.length)];
    return fallback ? { ...fallback } : undefined;
  }

  const selectedIndex = Math.floor(Math.random() * topCandidates.length);
  const selected = topCandidates[selectedIndex];

  // Return location with reasoning metadata attached
  if (selected?.location) {
    // Collect runner-ups: top 3 candidates that weren't selected
    const runnerUps = topCandidates
      .filter((_, i) => i !== selectedIndex)
      .slice(0, 3)
      .map((c) => ({ name: c.location.name, id: c.location.id }));

    return {
      ...selected.location,
      _scoringReasoning: selected.reasoning,
      _scoreBreakdown: selected.breakdown,
      _runnerUps: runnerUps.length > 0 ? runnerUps : undefined,
    };
  }

  return undefined;
}

