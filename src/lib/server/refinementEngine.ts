import "server-only";

import type { Trip, TripActivity, TripDay } from "@/types/tripDomain";
import { fetchLocationsByCity, fetchLocationsByCategories } from "@/lib/locations/locationService";
import { scoreLocation, type LocationScoringCriteria } from "@/lib/scoring/locationScoring";
import { parseTimeToMinutes } from "@/lib/utils/timeUtils";

/** Default day window: 09:00 to 21:00 = 720 minutes */
const DEFAULT_DAY_START = 540;
const DEFAULT_DAY_END = 1260;
/** Minimum activity duration worth inserting */
export const MIN_ACTIVITY_DURATION = 45;
/** Transition buffer between activities (minutes) */
export const TRANSITION_BUFFER = 15;

/**
 * Calculate available minutes remaining on a day.
 * Uses anchor startTime/endTime when available for precision,
 * falls back to activity.duration otherwise.
 */
export function getAvailableMinutesForDay(day: TripDay): number {
  const totalWindow = DEFAULT_DAY_END - DEFAULT_DAY_START;
  const activities = day.activities;
  if (activities.length === 0) return totalWindow;

  let occupied = 0;
  for (const activity of activities) {
    if (activity.startTime && activity.endTime) {
      const start = parseTimeToMinutes(activity.startTime);
      const end = parseTimeToMinutes(activity.endTime);
      if (start !== null && end !== null) {
        occupied += end - start;
        continue;
      }
    }
    occupied += activity.duration || 90;
  }

  const transitionTime = Math.max(0, activities.length - 1) * TRANSITION_BUFFER;
  return Math.max(0, totalWindow - occupied - transitionTime);
}

/**
 * Refinement types
 */
export type RefinementType =
  | "too_busy"
  | "too_light"
  | "more_food"
  | "more_culture"
  | "more_kid_friendly"
  | "more_rest"
  | "more_craft";

/**
 * Refinement request
 */
export type RefinementRequest = {
  trip: Trip;
  dayIndex: number;
  type: RefinementType;
};

/**
 * Refines a specific day based on the refinement type.
 * Now async because it fetches locations from the database.
 */
export async function refineDay(request: RefinementRequest): Promise<TripDay> {
  const { trip, dayIndex, type } = request;
  const day = trip.days[dayIndex];

  if (!day) {
    throw new Error(`Day ${dayIndex} not found`);
  }

  switch (type) {
    case "too_busy":
      return refineTooBusy(day, trip);
    case "too_light":
      return await refineTooLight(day, trip);
    case "more_food":
      return await refineMoreFood(day, trip);
    case "more_culture":
      return await refineMoreCulture(day, trip);
    case "more_kid_friendly":
      return await refineMoreKidFriendly(day, trip);
    case "more_rest":
      return refineMoreRest(day, trip);
    case "more_craft":
      return await refineMoreCraft(day, trip);
    default:
      return day;
  }
}

/**
 * Removes some activities to make the day less busy
 * Considers TravelerProfile pace preference when determining how many to remove
 */
/**
 * Activities placed by `applyCanonicalCoverage` carry `isCanonical: true`
 * (see canonicalCoverage.ts; propagated through `convertItineraryToTrip`).
 * They represent editor-curated brand-promise icons (Sensoji, Fushimi Inari,
 * Kinkaku-ji, etc.) and "too busy" should treat them as protected — the same
 * first-timer who clicked refine still wants to visit Kinkaku-ji.
 */
function isCanonicalInjected(activity: TripActivity): boolean {
  return activity.isCanonical === true;
}

function refineTooBusy(day: TripDay, trip: Trip): TripDay {
  const activities = [...day.activities];
  // Separate protected (anchors + canonical-injected) from removable activities
  const protectedActs = activities.filter((a) => a.isAnchor || isCanonicalInjected(a));
  const removable = activities.filter((a) => !a.isAnchor && !isCanonicalInjected(a));

  if (removable.length <= 2) {
    return { ...day, message: "This day already has the minimum number of activities." };
  }

  // Adjust removal based on pace preference
  const paceMultiplier = {
    relaxed: 0.7,
    balanced: 0.5,
    fast: 0.3,
  }[trip.travelerProfile.pace] ?? 0.5;

  // Remove middle activities (keep first and last removable)
  const removableCount = removable.length - 2;
  const toRemove = Math.max(1, Math.floor(removableCount * paceMultiplier));
  const keptRemovable = [
    removable[0],
    ...removable.slice(1 + toRemove, removable.length - 1),
    removable[removable.length - 1],
  ].filter((a): a is typeof removable[0] => a !== undefined);

  // Reconstruct: preserve original order by keeping protected activities in position
  const keptIds = new Set([...protectedActs.map((a) => a.id), ...keptRemovable.map((a) => a.id)]);
  const newActivities = activities.filter((a) => keptIds.has(a.id));

  return {
    ...day,
    activities: newActivities,
    explanation: generateRefinementExplanation(day, "too_busy"),
  };
}

/**
 * Adds more activities to make the day less light
 */
async function refineTooLight(day: TripDay, trip: Trip): Promise<TripDay> {
  const activities = [...day.activities];

  const available = getAvailableMinutesForDay(day);
  if (available < MIN_ACTIVITY_DURATION) {
    return { ...day, message: "This day is fully scheduled. Remove an activity first to make room." };
  }

  const usedLocationIds = new Set(activities.map((a) => a.locationId));

  // Find available locations in the same city from the database
  const availableLocations = await fetchLocationsByCity(day.cityId, {
    limit: 50,
    excludeIds: Array.from(usedLocationIds).filter((id): id is string => Boolean(id)),
    requirePlaceId: false,
  });

  if (availableLocations.length === 0) {
    return { ...day, message: `No additional locations available in ${day.cityId}.` };
  }

  // Score and pick best locations using comprehensive TravelerProfile
  const criteria: LocationScoringCriteria = {
    interests: trip.travelerProfile.interests,
    travelStyle: trip.travelerProfile.pace,
    budgetLevel: trip.travelerProfile.budget.level,
    budgetTotal: trip.travelerProfile.budget.total,
    budgetPerDay: trip.travelerProfile.budget.perDay,
    accessibility: trip.travelerProfile.mobility.required
      ? {
          wheelchairAccessible: trip.travelerProfile.mobility.required,
          elevatorRequired: trip.travelerProfile.mobility.needs?.includes("elevator") ?? false,
        }
      : undefined,
    group: trip.travelerProfile.group,
    availableMinutes: 120, // 2 hours for new activity
    recentCategories: day.activities.map((a) => a.location?.category ?? "").filter(Boolean),
  };

  const scored = availableLocations.map((loc) => scoreLocation(loc, criteria));
  scored.sort((a, b) => b.score - a.score);

  // Deduplicate by location ID (same location can appear via multiple sources)
  const seenIds = new Set<string>();
  const uniqueScored = scored.filter((s) => {
    if (seenIds.has(s.location.id)) return false;
    seenIds.add(s.location.id);
    return true;
  });

  // Add 1-2 new activities — insert before any departure anchor at the end
  const maxByCapacity = Math.floor(available / (90 + TRANSITION_BUFFER));
  const toAdd = Math.min(maxByCapacity, 2, uniqueScored.length);
  if (toAdd === 0) {
    return { ...day, message: "This day is fully scheduled. Remove an activity first to make room." };
  }
  const newItems = uniqueScored.slice(0, toAdd).map((scoredLoc, index) => ({
    id: `${day.id}-added-${Date.now()}-${index}`,
    locationId: scoredLoc.location.id,
    location: scoredLoc.location,
    timeSlot: "afternoon" as const,
    duration: 90,
  }));

  // Find insertion point: before the last anchor (departure) if present
  const lastAnchorIndex = activities.findLastIndex((a) => a.isAnchor);
  const insertIndex = lastAnchorIndex >= 0 && activities[lastAnchorIndex]?.id.startsWith("anchor-departure")
    ? lastAnchorIndex
    : activities.length;
  const newActivities = [
    ...activities.slice(0, insertIndex),
    ...newItems,
    ...activities.slice(insertIndex),
  ];

  return {
    ...day,
    activities: newActivities,
    explanation: generateRefinementExplanation(day, "too_light"),
  };
}

/**
 * Adds more food-related activities
 */
async function refineMoreFood(day: TripDay, trip: Trip): Promise<TripDay> {
  const activities = [...day.activities];

  const available = getAvailableMinutesForDay(day);
  if (available < MIN_ACTIVITY_DURATION) {
    return { ...day, message: "This day is fully scheduled. Remove an activity first to make room." };
  }

  const usedLocationIds = new Set(activities.map((a) => a.locationId));

  // Find food locations from the database
  const foodLocations = await fetchLocationsByCategories(
    ["restaurant", "food", "market"],
    {
      city: day.cityId,
      limit: 30,
      excludeIds: Array.from(usedLocationIds).filter((id): id is string => Boolean(id)),
      requirePlaceId: false,
    },
  );

  if (foodLocations.length === 0) {
    return { ...day, message: `No additional food locations available in ${day.cityId}.` };
  }

  // Score food locations using TravelerProfile for better selection
  const criteria: LocationScoringCriteria = {
    interests: trip.travelerProfile.interests,
    travelStyle: trip.travelerProfile.pace,
    budgetLevel: trip.travelerProfile.budget.level,
    budgetTotal: trip.travelerProfile.budget.total,
    budgetPerDay: trip.travelerProfile.budget.perDay,
    accessibility: trip.travelerProfile.mobility.required
      ? {
          wheelchairAccessible: trip.travelerProfile.mobility.required,
          elevatorRequired: trip.travelerProfile.mobility.needs?.includes("elevator") ?? false,
        }
      : undefined,
    group: trip.travelerProfile.group,
    availableMinutes: 90, // 1.5 hours for meal
    recentCategories: day.activities.map((a) => a.location?.category ?? "").filter(Boolean),
    timeSlot: "afternoon",
  };

  const scored = foodLocations.map((loc) => scoreLocation(loc, criteria));
  scored.sort((a, b) => b.score - a.score);

  // Add best-scoring food activity
  const bestFoodLocation = scored[0];
  if (!bestFoodLocation) {
    return day;
  }

  const newFoodActivity = {
    id: `${day.id}-food-${Date.now()}`,
    locationId: bestFoodLocation.location.id,
    location: bestFoodLocation.location,
    timeSlot: "afternoon" as const,
    duration: 60,
    mealType: "lunch" as const,
  };

  // Insert before afternoon activities or at the end
  const afternoonIndex = activities.findIndex((a) => a.timeSlot === "afternoon");
  const insertIndex = afternoonIndex >= 0 ? afternoonIndex : activities.length;

  const newActivities = [
    ...activities.slice(0, insertIndex),
    newFoodActivity,
    ...activities.slice(insertIndex),
  ];

  return {
    ...day,
    activities: newActivities,
    explanation: generateRefinementExplanation(day, "more_food"),
  };
}

/**
 * Adds more culture-related activities
 */
async function refineMoreCulture(day: TripDay, trip: Trip): Promise<TripDay> {
  const activities = [...day.activities];

  const available = getAvailableMinutesForDay(day);
  if (available < MIN_ACTIVITY_DURATION) {
    return { ...day, message: "This day is fully scheduled. Remove an activity first to make room." };
  }

  const usedLocationIds = new Set(activities.map((a) => a.locationId));

  // Find culture locations from the database
  const cultureLocations = await fetchLocationsByCategories(
    ["shrine", "temple", "museum", "historic", "craft"],
    {
      city: day.cityId,
      limit: 30,
      excludeIds: Array.from(usedLocationIds).filter((id): id is string => Boolean(id)),
      requirePlaceId: false,
    },
  );

  if (cultureLocations.length === 0) {
    return { ...day, message: `No additional cultural locations available in ${day.cityId}.` };
  }

  // Score and pick best culture location using comprehensive TravelerProfile
  const criteria: LocationScoringCriteria = {
    interests: trip.travelerProfile.interests.filter((i) => i === "culture" || i === "history"),
    travelStyle: trip.travelerProfile.pace,
    budgetLevel: trip.travelerProfile.budget.level,
    budgetTotal: trip.travelerProfile.budget.total,
    budgetPerDay: trip.travelerProfile.budget.perDay,
    accessibility: trip.travelerProfile.mobility.required
      ? {
          wheelchairAccessible: trip.travelerProfile.mobility.required,
          elevatorRequired: trip.travelerProfile.mobility.needs?.includes("elevator") ?? false,
        }
      : undefined,
    group: trip.travelerProfile.group,
    availableMinutes: 120,
    recentCategories: day.activities.map((a) => a.location?.category ?? "").filter(Boolean),
    timeSlot: "morning",
  };

  const scored = cultureLocations.map((loc) => scoreLocation(loc, criteria));
  scored.sort((a, b) => b.score - a.score);

  const bestCultureLocation = scored[0];
  if (!bestCultureLocation) {
    return day;
  }

  const newCultureActivity = {
    id: `${day.id}-culture-${Date.now()}`,
    locationId: bestCultureLocation.location.id,
    location: bestCultureLocation.location,
    timeSlot: "morning" as const,
    duration: 90,
  };

  // Insert after any leading anchor (airport arrival)
  const firstNonAnchorIndex = activities.findIndex((a) => !a.isAnchor);
  const insertIndex = firstNonAnchorIndex >= 0 ? firstNonAnchorIndex : 0;
  const newActivities = [
    ...activities.slice(0, insertIndex),
    newCultureActivity,
    ...activities.slice(insertIndex),
  ];

  return {
    ...day,
    activities: newActivities,
    explanation: generateRefinementExplanation(day, "more_culture"),
  };
}

/**
 * Makes the day more kid-friendly
 */
async function refineMoreKidFriendly(day: TripDay, trip: Trip): Promise<TripDay> {
  const activities = [...day.activities];
  const usedLocationIds = new Set(activities.map((a) => a.locationId));

  // Find kid-friendly locations from the database (parks, gardens, family-friendly attractions)
  const kidFriendlyLocations = await fetchLocationsByCategories(
    ["park", "garden", "museum", "entertainment"],
    {
      city: day.cityId,
      limit: 30,
      excludeIds: Array.from(usedLocationIds).filter((id): id is string => Boolean(id)),
      requirePlaceId: false,
    },
  );

  if (kidFriendlyLocations.length === 0) {
    return {
      ...day,
      message: `No additional kid-friendly locations available in ${day.cityId}.`,
    };
  }

  // Score kid-friendly locations using TravelerProfile, prioritizing group fit
  const criteria: LocationScoringCriteria = {
    interests: trip.travelerProfile.interests,
    travelStyle: trip.travelerProfile.pace,
    budgetLevel: trip.travelerProfile.budget.level,
    budgetTotal: trip.travelerProfile.budget.total,
    budgetPerDay: trip.travelerProfile.budget.perDay,
    accessibility: trip.travelerProfile.mobility.required
      ? {
          wheelchairAccessible: trip.travelerProfile.mobility.required,
          elevatorRequired: trip.travelerProfile.mobility.needs?.includes("elevator") ?? false,
        }
      : undefined,
    group: trip.travelerProfile.group, // Group info important for kid-friendly scoring
    availableMinutes: 120,
    recentCategories: day.activities.map((a) => a.location?.category ?? "").filter(Boolean),
  };

  const scored = kidFriendlyLocations.map((loc) => scoreLocation(loc, criteria));
  scored.sort((a, b) => b.score - a.score);

  // Replace one non-kid-friendly activity with a kid-friendly one, or add if day is light
  const bestKidFriendly = scored[0];
  if (!bestKidFriendly) {
    return {
      ...day,
      explanation: generateRefinementExplanation(day, "more_kid_friendly"),
    };
  }

  // If day has few activities, add the kid-friendly one
  // Otherwise, replace a less kid-friendly activity
  if (activities.length <= 2) {
    const available = getAvailableMinutesForDay(day);
    if (available < MIN_ACTIVITY_DURATION) {
      return { ...day, message: "This day is fully scheduled. Remove an activity first to make room." };
    }
    const newKidActivity = {
      id: `${day.id}-kid-friendly-${Date.now()}`,
      locationId: bestKidFriendly.location.id,
      location: bestKidFriendly.location,
      timeSlot: "afternoon" as const,
      duration: 90,
    };
    return {
      ...day,
      activities: [...activities, newKidActivity],
      explanation: generateRefinementExplanation(day, "more_kid_friendly"),
    };
  }

  // Replace a non-anchor middle activity with kid-friendly one
  const nonAnchorIndices = activities.map((a, i) => a.isAnchor ? -1 : i).filter((i) => i >= 0);
  const replaceIndex = nonAnchorIndices[Math.floor(nonAnchorIndices.length / 2)] ?? Math.floor(activities.length / 2);
  const newActivities = [...activities];
  newActivities[replaceIndex] = {
    id: `${day.id}-kid-friendly-${Date.now()}`,
    locationId: bestKidFriendly.location.id,
    location: bestKidFriendly.location,
    timeSlot: activities[replaceIndex]?.timeSlot ?? "afternoon",
    duration: 90,
  };

  return {
    ...day,
    activities: newActivities,
    explanation: generateRefinementExplanation(day, "more_kid_friendly"),
  };
}

/**
 * Adds more rest time
 */
function refineMoreRest(day: TripDay, _trip: Trip): TripDay {
  // Remove some non-anchor activities and add rest gaps
  const activities = [...day.activities];
  const nonAnchorCount = activities.filter((a) => !a.isAnchor).length;
  if (nonAnchorCount <= 1) {
    return { ...day, message: "This day already has minimal activities for adding rest time." };
  }

  // Remove non-anchor activities from the end
  const toRemove = Math.floor(nonAnchorCount / 3);
  let removed = 0;
  const newActivities = [...activities];
  for (let i = newActivities.length - 1; i >= 0 && removed < toRemove; i--) {
    if (!newActivities[i]?.isAnchor) {
      newActivities.splice(i, 1);
      removed++;
    }
  }

  return {
    ...day,
    activities: newActivities,
    constraints: {
      ...day.constraints,
      restGaps: 30, // 30 minutes between activities
    },
    explanation: generateRefinementExplanation(day, "more_rest"),
  };
}

/**
 * Adds more craft/artisan activities
 */
async function refineMoreCraft(day: TripDay, trip: Trip): Promise<TripDay> {
  const activities = [...day.activities];

  const available = getAvailableMinutesForDay(day);
  if (available < MIN_ACTIVITY_DURATION) {
    return { ...day, message: "This day is fully scheduled. Remove an activity first to make room." };
  }

  const usedLocationIds = new Set(activities.map((a) => a.locationId));

  const craftLocations = await fetchLocationsByCategories(
    ["craft", "museum"],
    {
      city: day.cityId,
      limit: 30,
      excludeIds: Array.from(usedLocationIds).filter((id): id is string => Boolean(id)),
      requirePlaceId: false,
    },
  );

  if (craftLocations.length === 0) {
    return { ...day, message: `No additional craft locations available in ${day.cityId}.` };
  }

  const criteria: LocationScoringCriteria = {
    interests: trip.travelerProfile.interests.filter((i) => i === "craft" || i === "culture"),
    travelStyle: trip.travelerProfile.pace,
    budgetLevel: trip.travelerProfile.budget.level,
    budgetTotal: trip.travelerProfile.budget.total,
    budgetPerDay: trip.travelerProfile.budget.perDay,
    accessibility: trip.travelerProfile.mobility.required
      ? {
          wheelchairAccessible: trip.travelerProfile.mobility.required,
          elevatorRequired: trip.travelerProfile.mobility.needs?.includes("elevator") ?? false,
        }
      : undefined,
    group: trip.travelerProfile.group,
    availableMinutes: 120,
    recentCategories: day.activities.map((a) => a.location?.category ?? "").filter(Boolean),
    timeSlot: "morning",
  };

  const scored = craftLocations.map((loc) => scoreLocation(loc, criteria));
  scored.sort((a, b) => b.score - a.score);

  const bestCraftLocation = scored[0];
  if (!bestCraftLocation) {
    return day;
  }

  const newCraftActivity = {
    id: `${day.id}-craft-${Date.now()}`,
    locationId: bestCraftLocation.location.id,
    location: bestCraftLocation.location,
    timeSlot: "morning" as const,
    duration: 90,
  };

  // Insert after any leading anchor (airport arrival)
  const firstNonAnchorIndex = activities.findIndex((a) => !a.isAnchor);
  const insertIndex = firstNonAnchorIndex >= 0 ? firstNonAnchorIndex : 0;
  const newActivities = [
    ...activities.slice(0, insertIndex),
    newCraftActivity,
    ...activities.slice(insertIndex),
  ];

  return {
    ...day,
    activities: newActivities,
    explanation: generateRefinementExplanation(day, "more_craft"),
  };
}

/**
 * Generates explanation text for refinement
 */
function generateRefinementExplanation(day: TripDay, type: RefinementType): string {
  switch (type) {
    case "too_busy":
      return "Reduced activities to make the day more relaxed.";
    case "too_light":
      return "Added more activities to fill out the day.";
    case "more_food":
      return "Added dining options to enhance your culinary experience.";
    case "more_culture":
      return "Added cultural sites to deepen your cultural immersion.";
    case "more_kid_friendly":
      return "Adjusted activities to be more suitable for children.";
    case "more_rest":
      return "Added more rest time between activities.";
    case "more_craft":
      return "Added craft workshops for hands-on cultural experiences.";
    default:
      return day.explanation ?? "";
  }
}
