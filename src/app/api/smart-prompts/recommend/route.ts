import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Location, LocationAvailability } from "@/types/location";
import type { ItineraryActivity } from "@/types/itinerary";
import type { TripBuilderData } from "@/types/trip";
import { vibesToInterests } from "@/data/vibes";
import type { GapAction } from "@/lib/smartPrompts/gapDetection";
import { findMealRecommendation } from "@/lib/mealPlanning";
import { scoreLocation } from "@/lib/scoring/locationScoring";
import { logger } from "@/lib/logger";
import { internalError, badRequest } from "@/lib/api/errors";
import { RATE_LIMITS, DAILY_QUOTAS } from "@/lib/api/rateLimits";
import { withApiHandler } from "@/lib/api/withApiHandler";
import { validateRequestBody, recommendRequestSchema } from "@/lib/api/schemas";
import { LOCATION_ITINERARY_COLUMNS, type LocationDbRow } from "@/lib/supabase/projections";
import {
  isSeasonalLocationRelevant,
  transformAvailabilityRow,
  type LocationAvailabilityRow,
} from "@/lib/availability/seasonalFilter";
import { transformDbRowToLocation } from "@/lib/locations/locationService";
import { parseLocalDateWithOffset, formatLocalDateISO } from "@/lib/utils/dateUtils";
import { filterByMealType } from "@/lib/mealFiltering";
import { createKonbiniActivity } from "@/lib/itinerary/konbiniNote";

/**
 * Default durations for different meal types in minutes
 */
const MEAL_DURATIONS: Record<string, number> = {
  breakfast: 45,
  lunch: 60,
  dinner: 90,
  snack: 30,
};

/**
 * Generate a unique activity ID
 */
function generateActivityId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `activity_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Filter locations by seasonal availability based on trip dates.
 * Non-seasonal locations are always included.
 * Seasonal locations are only included if their availability overlaps with trip dates.
 */
async function filterBySeasonalAvailability(
  locations: Location[],
  tripStart: string | undefined,
  tripEnd: string | undefined,
  supabaseClient: Awaited<ReturnType<typeof createClient>>
): Promise<Location[]> {
  // If no trip dates, exclude all seasonal locations (can't determine relevance)
  if (!tripStart || !tripEnd) {
    return locations.filter((l) => !l.isSeasonal);
  }

  // Separate seasonal and non-seasonal locations
  const nonSeasonal = locations.filter((l) => !l.isSeasonal);
  const seasonal = locations.filter((l) => l.isSeasonal);

  if (seasonal.length === 0) {
    return nonSeasonal;
  }

  // Fetch availability rules for seasonal locations
  const seasonalIds = seasonal.map((l) => l.id);
  const { data: availabilityRows, error } = await supabaseClient
    .from("location_availability")
    .select("id, location_id, availability_type, month_start, day_start, month_end, day_end, week_ordinal, day_of_week, year_start, year_end, is_available, description")
    .in("location_id", seasonalIds);

  if (error) {
    logger.warn("Failed to fetch availability data, excluding seasonal locations", { error });
    return nonSeasonal;
  }

  // Group availability by location ID
  const availabilityByLocation = new Map<string, LocationAvailability[]>();
  for (const row of availabilityRows || []) {
    const transformed = transformAvailabilityRow(row as LocationAvailabilityRow);
    const existing = availabilityByLocation.get(transformed.locationId) || [];
    existing.push(transformed);
    availabilityByLocation.set(transformed.locationId, existing);
  }

  // Filter seasonal locations by date relevance
  const relevantSeasonal = seasonal.filter((location) => {
    const availability = availabilityByLocation.get(location.id);
    return isSeasonalLocationRelevant(
      location.isSeasonal,
      availability,
      tripStart,
      tripEnd,
      location.validMonths,
      location.seasonalType,
    );
  });

  return [...nonSeasonal, ...relevantSeasonal];
}

/**
 * Calculate the insertion position for a meal activity
 */
function calculateMealPosition(
  activities: ItineraryActivity[],
  mealType: "breakfast" | "lunch" | "dinner" | "snack",
  afterActivityId?: string
): number {
  // If we have a specific activity to insert after, find it
  if (afterActivityId) {
    const index = activities.findIndex((a) => a.id === afterActivityId);
    if (index >= 0) {
      return index + 1;
    }
  }

  // Default positions based on meal type
  switch (mealType) {
    case "breakfast":
      // Insert at the start of the day
      return 0;
    case "lunch":
      // Insert after morning activities
      const lastMorningIndex = activities.findLastIndex(
        (a) => a.kind === "place" && a.timeOfDay === "morning"
      );
      return lastMorningIndex >= 0 ? lastMorningIndex + 1 : Math.floor(activities.length / 2);
    case "dinner":
      // Insert at the end of the day (or before evening activities end)
      return activities.length;
    default:
      return activities.length;
  }
}

/**
 * Calculate the insertion position for an experience activity
 */
function calculateExperiencePosition(
  activities: ItineraryActivity[],
  timeSlot: "morning" | "afternoon" | "evening"
): number {
  switch (timeSlot) {
    case "morning":
      // Insert at position 0-1 (start of day)
      const firstNonMorning = activities.findIndex(
        (a) => a.kind === "place" && a.timeOfDay !== "morning"
      );
      return firstNonMorning >= 0 ? firstNonMorning : 0;
    case "afternoon":
      // Insert in the middle of the day
      const afternoonStart = activities.findIndex(
        (a) => a.kind === "place" && a.timeOfDay === "afternoon"
      );
      if (afternoonStart >= 0) {
        return afternoonStart;
      }
      return Math.floor(activities.length / 2);
    case "evening":
      // Insert at the end
      return activities.length;
    default:
      return activities.length;
  }
}

/**
 * Create a meal activity from a restaurant recommendation
 */
function createMealActivity(
  restaurant: Location,
  mealType: "breakfast" | "lunch" | "dinner" | "snack",
  timeSlot: "morning" | "afternoon" | "evening"
): ItineraryActivity {
  return {
    kind: "place",
    id: generateActivityId(),
    title: restaurant.name,
    timeOfDay: timeSlot,
    durationMin: MEAL_DURATIONS[mealType] ?? 60,
    neighborhood: restaurant.neighborhood ?? restaurant.city,
    tags: ["dining", mealType],
    locationId: restaurant.id,
    coordinates: restaurant.coordinates,
    mealType: mealType,
    notes: `${mealType.charAt(0).toUpperCase() + mealType.slice(1)} recommendation`,
    recommendationReason: {
      primaryReason: `Suggested to fill a ${mealType} gap in your day`,
    },
  };
}

/**
 * Create an experience activity from a location
 */
function createExperienceActivity(
  location: Location,
  timeSlot: "morning" | "afternoon" | "evening"
): ItineraryActivity {
  return {
    kind: "place",
    id: generateActivityId(),
    title: location.name,
    timeOfDay: timeSlot,
    durationMin: location.recommendedVisit?.typicalMinutes ?? 90,
    neighborhood: location.neighborhood ?? location.city,
    tags: location.category ? [location.category] : undefined,
    locationId: location.id,
    coordinates: location.coordinates,
    recommendationReason: {
      primaryReason: "Suggested to fill a gap in your day",
    },
  };
}

type RefinementFilters = {
  budget?: "cheaper";
  indoor?: boolean;
  cuisineExclude?: string[];
  proximity?: "closer";
};

type RecommendRequest = {
  gap: {
    id: string;
    type: string;
    dayId: string;
    dayIndex: number;
    action: GapAction;
  };
  dayActivities: ItineraryActivity[];
  cityId: string;
  tripBuilderData: TripBuilderData;
  usedLocationIds: string[];
  excludeLocationIds?: string[];
  refinementFilters?: RefinementFilters;
};

type RecommendResponse = {
  recommendation: Location;
  activity: ItineraryActivity;
  position: number;
};

/** Categories considered indoor */
const INDOOR_CATEGORIES = new Set([
  "museum", "shopping", "restaurant", "bar", "entertainment", "market",
]);

/**
 * Apply refinement filters to a list of locations.
 * Returns a filtered/sorted subset. If a filter would eliminate all results, it's relaxed.
 */
function applyRefinementFilters(
  locations: Location[],
  filters: RefinementFilters | undefined,
  dayActivities?: ItineraryActivity[]
): Location[] {
  if (!filters) return locations;
  let result = [...locations];

  // Indoor filter — check tags first, then fall back to category
  if (filters.indoor) {
    const indoor = result.filter((l) =>
      l.tags?.includes("indoor") || (l.category && INDOOR_CATEGORIES.has(l.category))
    );
    if (indoor.length > 0) result = indoor;
  }

  // Budget filter — exclude expensive (priceLevel >= 3)
  if (filters.budget === "cheaper") {
    const cheaper = result.filter((l) => !l.priceLevel || l.priceLevel < 3);
    if (cheaper.length > 0) result = cheaper;
  }

  // Cuisine exclude filter
  if (filters.cuisineExclude && filters.cuisineExclude.length > 0) {
    const excludeSet = new Set(filters.cuisineExclude.map((c) => c.toLowerCase()));
    const filtered = result.filter(
      (l) => !l.googlePrimaryType || !excludeSet.has(l.googlePrimaryType.toLowerCase())
    );
    if (filtered.length > 0) result = filtered;
  }

  // Proximity filter — sort by distance to last activity, take top half
  if (filters.proximity === "closer" && dayActivities) {
    const lastPlace = [...dayActivities]
      .reverse()
      .find((a): a is Extract<ItineraryActivity, { kind: "place" }> =>
        a.kind === "place" && !!a.coordinates
      );
    if (lastPlace?.coordinates) {
      const { lat: refLat, lng: refLng } = lastPlace.coordinates;
      result.sort((a, b) => {
        const distA = a.coordinates
          ? Math.hypot(a.coordinates.lat - refLat, a.coordinates.lng - refLng)
          : Infinity;
        const distB = b.coordinates
          ? Math.hypot(b.coordinates.lat - refLat, b.coordinates.lng - refLng)
          : Infinity;
        return distA - distB;
      });
      result = result.slice(0, Math.max(1, Math.ceil(result.length / 2)));
    }
  }

  return result;
}

/**
 * POST /api/smart-prompts/recommend
 *
 * Fetches and scores recommendations for smart prompt suggestions.
 */
export const POST = withApiHandler(
  async (request) => {
    const validation = await validateRequestBody(request, recommendRequestSchema);
    if (!validation.success) {
      return badRequest("Invalid request body", { errors: validation.error.issues });
    }
    const body = validation.data as RecommendRequest;
    const { gap, cityId, tripBuilderData, usedLocationIds, excludeLocationIds, refinementFilters } = body;
    const dayActivities = body.dayActivities ?? [];

    if (!gap || !gap.action) {
      return badRequest("Missing required gap action");
    }

    if (!cityId) {
      return badRequest("Missing cityId");
    }

    const supabase = await createClient();
    const usedIds = new Set(usedLocationIds || []);
    // Merge excluded IDs (previously shown but rejected in preview)
    if (excludeLocationIds) {
      for (const id of excludeLocationIds) {
        usedIds.add(id);
      }
    }
    const action = gap.action;

    // Compute the actual date for this day (for operating hours lookups)
    let tripDate: string | undefined;
    if (tripBuilderData?.dates?.start && typeof gap.dayIndex === "number") {
      const d = parseLocalDateWithOffset(tripBuilderData.dates.start, gap.dayIndex);
      tripDate = d ? formatLocalDateISO(d) : undefined;
    }

    // Pre-compute scoring criteria shared across all action branches
    const isWeekend = (() => {
      if (!tripDate) return undefined;
      const [y, m, d] = tripDate.split("-").map(Number);
      const dow = (y && m && d) ? new Date(y, m - 1, d).getDay() : undefined;
      return dow === 0 || dow === 6;
    })();
    const hasPhotographyVibe = tripBuilderData?.vibes?.includes("local_secrets") || undefined;
    const accommodationStyle = tripBuilderData?.accommodationStyle;

    let recommendation: Location | null = null;
    let activity: ItineraryActivity | null = null;
    let position = 0;

    if (action.type === "add_meal") {
      // Fetch restaurants/food locations for this city (case-insensitive match)
      // Include both "restaurant" and "food" categories as data may use either
      // Note: place_id is not required - some locations may not have Google Places data
      // Note: business_status filter uses OR to include null values (SQL null != value returns null, not true)
      const { data: rows, error } = await supabase
        .from("locations")
        .select(LOCATION_ITINERARY_COLUMNS)
        .eq("is_active", true)
        .ilike("city", cityId)
        .in("category", ["restaurant", "cafe", "bar"])
        .or("business_status.is.null,business_status.neq.PERMANENTLY_CLOSED")
        .limit(100);

      if (error) {
        logger.error("Failed to fetch restaurants", error, { cityId });
        return internalError("Failed to fetch restaurant recommendations");
      }

      const restaurants = (rows || []).map((row) =>
        transformDbRowToLocation(row as unknown as LocationDbRow)
      );

      // Filter by meal type (e.g., no breweries for breakfast)
      const mealAppropriate = filterByMealType(restaurants, action.mealType, tripDate);

      // Filter out already-used locations
      let available = mealAppropriate.filter((r) => !usedIds.has(r.id));

      // Apply refinement filters (cheaper, proximity, cuisine exclude)
      available = applyRefinementFilters(available, refinementFilters, dayActivities);

      if (available.length === 0) {
        const message = restaurants.length === 0
          ? `No restaurant data available for ${cityId}. Try a different city like Kyoto or Fukuoka.`
          : refinementFilters
            ? "No more options with those filters. Try different filters or skip."
            : "All restaurants for this city have already been added to your itinerary.";
        return NextResponse.json(
          { error: message },
          { status: 404 }
        );
      }

      // Find the best meal recommendation
      recommendation = findMealRecommendation(available, action.mealType, {
        interests: tripBuilderData.vibes?.length ? vibesToInterests(tripBuilderData.vibes) : [],
        travelStyle: tripBuilderData.style ?? "balanced",
        budgetLevel: tripBuilderData.budget?.level,
        budgetTotal: tripBuilderData.budget?.total,
        budgetPerDay: tripBuilderData.budget?.perDay,
        dietaryRestrictions: tripBuilderData.accessibility?.dietary ?? [],
        usedLocationIds: usedIds,
      });

      if (!recommendation) {
        return NextResponse.json(
          { error: "Could not find a suitable restaurant" },
          { status: 404 }
        );
      }

      activity = createMealActivity(recommendation, action.mealType, action.timeSlot);
      position = calculateMealPosition(dayActivities, action.mealType, action.afterActivityId);

    } else if (action.type === "quick_meal") {
      // Konbini quick meal - no database lookup needed, just create a note activity
      activity = createKonbiniActivity(action.mealType, action.timeSlot);
      position = calculateMealPosition(dayActivities, action.mealType, action.afterActivityId);

      // Return early since there's no location recommendation for konbini
      return NextResponse.json({
        recommendation: null,
        activity,
        position,
      }, { status: 200 });

    } else if (action.type === "add_experience") {
      // Fetch locations for this city (non-restaurants, case-insensitive match)
      // Note: place_id is not required - some locations may not have Google Places data
      // Note: business_status filter uses OR to include null values
      let query = supabase
        .from("locations")
        .select(LOCATION_ITINERARY_COLUMNS)
        .eq("is_active", true)
        .ilike("city", cityId)
        .neq("category", "restaurant")
        .or("business_status.is.null,business_status.neq.PERMANENTLY_CLOSED")
        .limit(100);

      // If a specific category is requested, filter by it
      if (action.category) {
        query = query.eq("category", action.category);
      }

      const { data: rows, error } = await query;

      if (error) {
        logger.error("Failed to fetch locations", error, { cityId });
        return internalError("Failed to fetch experience recommendations");
      }

      const locations = (rows || []).map((row) =>
        transformDbRowToLocation(row as unknown as LocationDbRow)
      );

      // Filter by seasonal availability based on trip dates
      // Seasonal locations (festivals, events) are only shown if trip dates overlap
      const tripStart = tripBuilderData.dates?.start;
      const tripEnd = tripBuilderData.dates?.end;
      const dateFiltered = await filterBySeasonalAvailability(
        locations,
        tripStart,
        tripEnd,
        supabase
      );

      // Filter out already-used locations
      let available = dateFiltered.filter((l) => !usedIds.has(l.id));

      // Apply refinement filters (indoor, cheaper, proximity)
      available = applyRefinementFilters(available, refinementFilters, dayActivities);

      if (available.length === 0) {
        const message = locations.length === 0
          ? `No experience data available for ${cityId}.`
          : refinementFilters
            ? "No more options with those filters. Try different filters or skip."
            : "All experiences for this city have already been added to your itinerary.";
        return NextResponse.json(
          { error: message },
          { status: 404 }
        );
      }

      // Score and sort locations
      const scored = available.map((location) =>
        scoreLocation(location, {
          interests: tripBuilderData.vibes?.length ? vibesToInterests(tripBuilderData.vibes) : [],
          travelStyle: tripBuilderData.style ?? "balanced",
          budgetLevel: tripBuilderData.budget?.level,
          budgetTotal: tripBuilderData.budget?.total,
          budgetPerDay: tripBuilderData.budget?.perDay,
          availableMinutes: 120, // Default to 2 hours for experiences
          recentCategories: dayActivities
            .filter((a): a is Extract<ItineraryActivity, { kind: "place" }> => a.kind === "place")
            .map((a) => a.tags?.[0] ?? "")
            .filter(Boolean),
          timeSlot: action.timeSlot,
          hasPhotographyVibe,
          isWeekend,
          accommodationStyle,
        })
      );

      // Sort by score descending and pick top
      scored.sort((a, b) => b.score - a.score);
      const topScore = scored[0];

      if (!topScore) {
        return NextResponse.json(
          { error: "Could not find a suitable experience" },
          { status: 404 }
        );
      }

      recommendation = topScore.location;
      activity = createExperienceActivity(recommendation, action.timeSlot);
      position = calculateExperiencePosition(dayActivities, action.timeSlot);
    } else if (action.type === "fill_long_gap") {
      // Fetch non-food locations that fit within the gap duration
      const { data: rows, error } = await supabase
        .from("locations")
        .select(LOCATION_ITINERARY_COLUMNS)
        .eq("is_active", true)
        .ilike("city", cityId)
        .not("category", "in", '("restaurant","cafe","bar")')
        .or("business_status.is.null,business_status.neq.PERMANENTLY_CLOSED")
        .limit(100);

      if (error) {
        logger.error("Failed to fetch locations for gap fill", error, { cityId });
        return internalError("Failed to fetch gap fill recommendations");
      }

      const locations = (rows || []).map((row) =>
        transformDbRowToLocation(row as unknown as LocationDbRow)
      );

      // Filter by duration fit (activity should fit within the gap)
      let available = locations
        .filter((l) => !usedIds.has(l.id))
        .filter((l) => {
          const duration = l.recommendedVisit?.typicalMinutes ?? 90;
          return duration <= action.gapMinutes;
        });

      available = applyRefinementFilters(available, refinementFilters, dayActivities);

      if (available.length === 0) {
        return NextResponse.json(
          { error: "No suitable activities found to fill this gap." },
          { status: 404 }
        );
      }

      const scored = available.map((location) =>
        scoreLocation(location, {
          interests: tripBuilderData.vibes?.length ? vibesToInterests(tripBuilderData.vibes) : [],
          travelStyle: tripBuilderData.style ?? "balanced",
          availableMinutes: action.gapMinutes,
          recentCategories: dayActivities
            .filter((a): a is Extract<ItineraryActivity, { kind: "place" }> => a.kind === "place")
            .map((a) => a.tags?.[0] ?? "")
            .filter(Boolean),
          timeSlot: action.timeSlot,
          hasPhotographyVibe,
          isWeekend,
          accommodationStyle,
        })
      );

      scored.sort((a, b) => b.score - a.score);
      const topScore = scored[0];

      if (!topScore) {
        return NextResponse.json(
          { error: "Could not find a suitable activity for this gap." },
          { status: 404 }
        );
      }

      recommendation = topScore.location;
      activity = createExperienceActivity(recommendation, action.timeSlot);
      position = calculateExperiencePosition(dayActivities, action.timeSlot);

    } else if (action.type === "extend_day") {
      // Fetch activities for the target time slot (morning or evening extension)
      const timeSlot = action.direction === "morning" ? "morning" : "evening";
      const { data: rows, error } = await supabase
        .from("locations")
        .select(LOCATION_ITINERARY_COLUMNS)
        .eq("is_active", true)
        .ilike("city", cityId)
        .not("category", "in", '("restaurant","cafe","bar")')
        .or("business_status.is.null,business_status.neq.PERMANENTLY_CLOSED")
        .limit(100);

      if (error) {
        logger.error("Failed to fetch locations for day extension", error, { cityId });
        return internalError("Failed to fetch extension recommendations");
      }

      const locations = (rows || []).map((row) =>
        transformDbRowToLocation(row as unknown as LocationDbRow)
      );

      let available = locations.filter((l) => !usedIds.has(l.id));
      available = applyRefinementFilters(available, refinementFilters, dayActivities);

      if (available.length === 0) {
        return NextResponse.json(
          { error: `No activities found to extend your ${action.direction}.` },
          { status: 404 }
        );
      }

      const scored = available.map((location) =>
        scoreLocation(location, {
          interests: tripBuilderData.vibes?.length ? vibesToInterests(tripBuilderData.vibes) : [],
          travelStyle: tripBuilderData.style ?? "balanced",
          availableMinutes: 120,
          recentCategories: dayActivities
            .filter((a): a is Extract<ItineraryActivity, { kind: "place" }> => a.kind === "place")
            .map((a) => a.tags?.[0] ?? "")
            .filter(Boolean),
          timeSlot,
          hasPhotographyVibe,
          isWeekend,
          accommodationStyle,
        })
      );

      scored.sort((a, b) => b.score - a.score);
      const topScore = scored[0];

      if (!topScore) {
        return NextResponse.json(
          { error: `Could not find a suitable ${action.direction} activity.` },
          { status: 404 }
        );
      }

      recommendation = topScore.location;
      activity = createExperienceActivity(recommendation, timeSlot);
      position = action.direction === "morning" ? 0 : dayActivities.length;

    } else if (action.type === "diversify_categories") {
      // Fetch locations matching suggested categories
      const categories = action.suggestedCategories;
      const { data: rows, error } = await supabase
        .from("locations")
        .select(LOCATION_ITINERARY_COLUMNS)
        .eq("is_active", true)
        .ilike("city", cityId)
        .in("category", categories)
        .or("business_status.is.null,business_status.neq.PERMANENTLY_CLOSED")
        .limit(100);

      if (error) {
        logger.error("Failed to fetch locations for diversification", error, { cityId });
        return internalError("Failed to fetch diversification recommendations");
      }

      const locations = (rows || []).map((row) =>
        transformDbRowToLocation(row as unknown as LocationDbRow)
      );

      let available = locations.filter((l) => !usedIds.has(l.id));
      available = applyRefinementFilters(available, refinementFilters, dayActivities);

      if (available.length === 0) {
        return NextResponse.json(
          { error: "No alternative activities found for diversification." },
          { status: 404 }
        );
      }

      const scored = available.map((location) =>
        scoreLocation(location, {
          interests: tripBuilderData.vibes?.length ? vibesToInterests(tripBuilderData.vibes) : [],
          travelStyle: tripBuilderData.style ?? "balanced",
          availableMinutes: 120,
          recentCategories: dayActivities
            .filter((a): a is Extract<ItineraryActivity, { kind: "place" }> => a.kind === "place")
            .map((a) => a.tags?.[0] ?? "")
            .filter(Boolean),
          timeSlot: action.timeSlot,
          hasPhotographyVibe,
          isWeekend,
          accommodationStyle,
        })
      );

      scored.sort((a, b) => b.score - a.score);
      const topScore = scored[0];

      if (!topScore) {
        return NextResponse.json(
          { error: "Could not find a suitable alternative activity." },
          { status: 404 }
        );
      }

      recommendation = topScore.location;
      activity = createExperienceActivity(recommendation, action.timeSlot);
      position = calculateExperiencePosition(dayActivities, action.timeSlot);

    } else if (action.type === "add_transport") {
      // Return a note activity with transit information (no location needed)
      const fromActivity = dayActivities.find((a) => a.id === action.fromActivityId);
      const toActivity = dayActivities.find((a) => a.id === action.toActivityId);
      const fromName = fromActivity?.title ?? "previous stop";
      const toName = toActivity?.title ?? "next stop";

      activity = {
        kind: "note",
        id: generateActivityId(),
        title: "Note",
        timeOfDay: fromActivity?.timeOfDay ?? "afternoon",
        notes: `**Transit: ${fromName} → ${toName}**\n\nUse your IC card (Suica/ICOCA) for trains and buses. Check Google Maps or Navitime for the fastest route.`,
      };

      // Position after the "from" activity
      const fromIndex = dayActivities.findIndex((a) => a.id === action.fromActivityId);
      position = fromIndex >= 0 ? fromIndex + 1 : dayActivities.length;

      // Transport notes don't have a location recommendation
      return NextResponse.json({
        recommendation: null,
        activity,
        position,
      }, { status: 200 });
    } else {
      return badRequest(`Unknown action type: ${(action as { type: string }).type}`);
    }

    const response: RecommendResponse = {
      recommendation,
      activity,
      position,
    };

    return NextResponse.json(response, { status: 200 });

  },
  { rateLimit: RATE_LIMITS.SMART_PROMPTS, dailyQuota: DAILY_QUOTAS.SMART_PROMPTS, optionalAuth: true, requireJson: true },
);
