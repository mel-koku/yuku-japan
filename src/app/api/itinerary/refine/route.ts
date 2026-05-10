import crypto from "crypto";
import { NextResponse } from "next/server";
import { refineDay, type RefinementType } from "@/lib/server/refinementEngine";
import { convertItineraryToTrip } from "@/lib/server/itineraryEngine";
import { badRequest } from "@/lib/api/errors";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api/withApiHandler";
import { RATE_LIMITS, DAILY_QUOTAS } from "@/lib/api/rateLimits";
import { gateOnDailyCost } from "@/lib/api/costGate";
import { validateRequestBody, tripBuilderDataSchema } from "@/lib/api/schemas";
import { getRedisClient } from "@/lib/cache/itineraryCache";
import { z } from "zod";
import type { Itinerary, ItineraryActivity, ItineraryDay } from "@/types/itinerary";
import type { TripBuilderData } from "@/types/trip";
import type { Trip, TripActivity, TripDay } from "@/types/tripDomain";
import type { Location } from "@/types/location";
import { convertTripReasonToItineraryReason } from "@/lib/utils/recommendationAdapter";
import { createClient } from "@/lib/supabase/server";
import { LOCATION_ITINERARY_COLUMNS, type LocationDbRow } from "@/lib/supabase/projections";
import { transformDbRowToLocation } from "@/lib/locations/locationService";
import { escapePostgrestValue } from "@/lib/supabase/sanitize";
import { MAX_FREE_REFINEMENTS, MAX_PAID_REFINEMENTS } from "@/lib/billing/access";
import { isFullAccessEnabled } from "@/lib/billing/accessServer";
import { getServiceRoleClient } from "@/lib/supabase/serviceRole";

export const maxDuration = 60;

/** Build a cache key from day activities + refinement type */
function buildRefineCacheKey(dayActivities: string[], refinementType: string, cityId?: string): string {
  const payload = JSON.stringify({ activities: dayActivities.sort(), refinementType, cityId });
  const hash = crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
  return `@yuku-japan/refine:${hash}`;
}

/** Refinement cache TTL: 12 hours */
const REFINE_CACHE_TTL = 12 * 60 * 60;

// Simple stub request format (as specified in plan)
type RefineRequestBody = {
  trip: Trip;
  refinementType: RefinementType;
  dayIndex?: number;
};

// Legacy request format (for backward compatibility)
type RefinementRequest = {
  tripId: string;
  dayIndex: number;
  refinementType: RefinementType;
  itinerary: Itinerary;
  builderData: TripBuilderData;
};

type RefinementResponse = {
  refinedDay: ItineraryDay;
  updatedTrip: Trip;
  /** Set when refinement made no changes (day already suited for the adjustment). */
  message?: string;
};

const VALID_REFINEMENT_TYPES: RefinementType[] = [
  "too_busy",
  "too_light",
  "more_food",
  "more_culture",
  "more_kid_friendly",
  "more_rest",
  "more_craft",
];

/**
 * Fetches locations from Supabase database, optionally filtered by cities.
 *
 * Exported (rather than file-local) so the OR-fallback strict-clause shape
 * can be guarded by `__tests__/refineFetchAllLocationsStrict.test.ts`. The
 * Next.js router only treats HTTP-verb exports as handlers; named exports
 * like this one are ignored by the routing layer.
 *
 * @param cities - Optional array of city names to filter by (reduces memory usage)
 */
export async function fetchAllLocations(cities?: string[]): Promise<Location[]> {
  const supabase = await createClient();
  const pageSize = 1000; // Larger pages = fewer round trips

  // Build base query
  const buildQuery = () => {
    let query = supabase
      .from("locations")
      .select(LOCATION_ITINERARY_COLUMNS)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (cities && cities.length > 0) {
      // Strict planner picker (mirrors locationService.fetchAllLocations as of 2026-05-10):
      // planning_city is authoritative; city.ilike only fires for planning_city IS NULL rows.
      const planningFilters = cities
        .map((c) => `planning_city.eq.${escapePostgrestValue(c.toLowerCase())}`)
        .join(",");
      const cityFilters = cities
        .map((c) => `and(planning_city.is.null,city.ilike.${escapePostgrestValue(c)})`)
        .join(",");
      query = query.or(`${planningFilters},${cityFilters}`);
    }
    return query;
  };

  // Fetch first page
  const { data: firstPage, error: firstError } = await buildQuery().range(0, pageSize - 1);

  if (firstError) {
    const msg = `Failed to fetch locations from database: ${firstError.message}`;
    logger.error(msg, firstError);
    throw new Error(msg);
  }

  if (!firstPage || firstPage.length === 0) {
    const msg = "No locations found in database. Please ensure locations are seeded.";
    logger.error(msg);
    throw new Error(msg);
  }

  const allLocations: Location[] = (firstPage as unknown as LocationDbRow[]).map(transformDbRowToLocation);

  // Fetch remaining pages with batched concurrency (3 at a time) and total cap
  const maxTotalLocations = 5000;
  if (firstPage.length === pageSize && allLocations.length < maxTotalLocations) {
    const maxPages = 10;
    const tasks = Array.from({ length: maxPages }, (_, i) => {
      const page = i + 1;
      return () =>
        buildQuery()
          .range(page * pageSize, (page + 1) * pageSize - 1)
          .then(({ data, error }) => {
            if (error || !data || data.length === 0) return [];
            return (data as unknown as LocationDbRow[]).map(transformDbRowToLocation);
          });
    });

    // Execute in batches of 3 concurrent requests to avoid overwhelming the DB
    for (let i = 0; i < tasks.length && allLocations.length < maxTotalLocations; i += 3) {
      const batch = tasks.slice(i, i + 3);
      const results = await Promise.all(batch.map((fn) => fn()));
      for (const locations of results) {
        if (locations.length === 0) break;
        allLocations.push(...locations);
        if (allLocations.length >= maxTotalLocations) break;
      }
    }
  }

  return allLocations;
}

// Conversion function moved to @/lib/utils/recommendationAdapter

const mapTripActivityToItineraryActivity = (
  activity: TripActivity,
  originalTitle?: string,
): Extract<ItineraryActivity, { kind: "place" }> => {
  const location = activity.location;
  return {
    kind: "place",
    id: activity.id,
    title: location?.name ?? originalTitle ?? activity.locationId,
    timeOfDay: activity.timeSlot,
    durationMin: activity.duration,
    locationId: activity.locationId,
    neighborhood: undefined, // Location type doesn't have neighborhood property
    tags: undefined, // Location type doesn't have tags property
    notes: activity.reasoning?.primaryReason,
    recommendationReason: convertTripReasonToItineraryReason(activity.reasoning),
    schedule:
      activity.startTime && activity.endTime
        ? {
            arrivalTime: activity.startTime,
            departureTime: activity.endTime,
          }
        : undefined,
    mealType: activity.mealType === "snack" ? undefined : activity.mealType,
    coordinates: activity.coordinates ?? location?.coordinates,
    isAnchor: activity.isAnchor,
  };
};

const mapTripDayToItineraryDay = (
  day: TripDay,
  originalDay?: ItineraryDay,
): ItineraryDay => ({
  // Preserve metadata from the original day that the refinement engine doesn't touch
  ...(originalDay
    ? {
        dateLabel: originalDay.dateLabel,
        timezone: originalDay.timezone,
        bounds: originalDay.bounds,
        weekday: originalDay.weekday,
        cityTransition: originalDay.cityTransition,
        isDayTrip: originalDay.isDayTrip,
        baseCityId: originalDay.baseCityId,
        dayTripTravelMinutes: originalDay.dayTripTravelMinutes,
        paceLabel: originalDay.paceLabel,
        isLateArrival: originalDay.isLateArrival,
        isEarlyArrival: originalDay.isEarlyArrival,
      }
    : {}),
  id: day.id,
  cityId: day.cityId,
  activities: day.activities.map((activity) => {
    // Recover original title for anchor activities (airports) that have no DB location
    const originalActivity = originalDay?.activities.find(
      (a) => a.kind === "place" && a.id === activity.id,
    );
    const originalTitle = originalActivity?.kind === "place" ? originalActivity.title : undefined;
    return mapTripActivityToItineraryActivity(activity, originalTitle);
  }),
});

/**
 * POST /api/itinerary/refine
 *
 * Refines a specific day in an itinerary based on refinement type.
 *
 * @throws Returns 400 if request body is invalid
 * @throws Returns 429 if rate limit exceeded
 * @throws Returns 500 for server errors
 */
export const POST = withApiHandler(
  async (request, { context, user }) => {
    // Validate request body with size limit (2MB for trip data)
    // Note: refine endpoint accepts multiple formats (legacy and new), so we validate structure first
    // Using strip() to silently drop unknown fields for security
    // Schema must match VALID_REFINEMENT_TYPES for consistency

    // Schema for Trip object in refinement requests (loose validation, detailed validation in engine)
    // Passthrough on the outer trip and day shapes so travelerProfile,
    // dates, entryPoint, etc. survive validation — the engine needs them.
    // Inner activity objects stay strict to block injection in arrays.
    const tripForRefinementSchema = z.object({
      id: z.string().optional(),
      days: z.array(z.object({
        id: z.string(),
        cityId: z.string().optional(),
        activities: z.array(z.object({
          id: z.string(),
          locationId: z.string(),
        }).passthrough()).optional(),
      }).passthrough()).optional(),
    }).passthrough().optional();

    const refineSchema = z.object({
      trip: tripForRefinementSchema, // Trip object with basic structure validation
      refinementType: z.enum(["too_busy", "too_light", "more_food", "more_culture", "more_kid_friendly", "more_rest", "more_craft"]).optional(),
      dayIndex: z.number().int().min(0).max(30).optional(),
      tripId: z.string().max(255).regex(/^[A-Za-z0-9._-]+$/, "Trip ID contains invalid characters").optional(),
      builderData: tripBuilderDataSchema.partial().strip().optional(), // Partial TripBuilderData with proper validation
      itinerary: z.object({
        days: z.array(z.object({}).passthrough()).min(1),
      }).passthrough().optional(), // Legacy format: full itinerary for refinement
    }).strip(); // Silently drop unknown fields for security

    const bodyValidation = await validateRequestBody(
      request,
      refineSchema,
      2 * 1024 * 1024
    );

    if (!bodyValidation.success) {
      return badRequest("Invalid request body", {
        errors: bodyValidation.error.issues,
      }, {
        requestId: context.requestId,
      });
    }

    const body = bodyValidation.data;

    // Check if this is the simple stub format (trip domain model)
    if (body.trip && body.refinementType) {
      const { trip, refinementType, dayIndex } = body as RefineRequestBody;

      if (!trip || !refinementType) {
        return badRequest("Missing trip or refinementType", undefined, {
          requestId: context.requestId,
        });
      }

      if (!VALID_REFINEMENT_TYPES.includes(refinementType)) {
        return badRequest(`Invalid refinement type: ${refinementType}`, undefined, {
          requestId: context.requestId,
        });
      }

      // Engine reads trip.travelerProfile.interests unconditionally. Reject
      // upfront with 400 rather than crashing to 500 when the caller forgot it.
      if (!trip.travelerProfile?.interests) {
        return badRequest("trip.travelerProfile.interests is required", undefined, {
          requestId: context.requestId,
        });
      }

      // Default to day 0 if dayIndex not provided
      const targetDayIndex = dayIndex ?? 0;

      if (!trip.days[targetDayIndex]) {
        return badRequest(`Day index ${targetDayIndex} not found in trip`, undefined, {
          requestId: context.requestId,
        });
      }

      // Reserve a refinement slot atomically. Free users cap at MAX_FREE_REFINEMENTS;
      // unlocked trips cap at MAX_PAID_REFINEMENTS to prevent abuse. Eliminates the
      // read-check-then-increment race that previously let concurrent requests both
      // pass the cap gate. Decrement on LLM failure or no-op stub below.
      const fullAccessStub = await isFullAccessEnabled(user?.id);
      let reservedSlot = false;
      let isUnlockedTrip = false;

      if (!fullAccessStub && user) {
        const serviceClientStub = getServiceRoleClient();
        const { data: tripRowStub } = await serviceClientStub
          .from("trips")
          .select("unlocked_at")
          .eq("id", trip.id)
          .eq("user_id", user.id)
          .single();

        isUnlockedTrip = !!tripRowStub?.unlocked_at;
        const cap = isUnlockedTrip ? MAX_PAID_REFINEMENTS : MAX_FREE_REFINEMENTS;

        const { data: newCount, error: reserveError } = await serviceClientStub.rpc(
          "increment_free_refinements_if_under_cap",
          { p_trip_id: trip.id, p_user_id: user.id, p_max: cap },
        );

        if (reserveError) {
          logger.error(
            "Failed to reserve refinement slot",
            reserveError instanceof Error
              ? reserveError
              : new Error(JSON.stringify(reserveError)),
            { tripId: trip.id, userId: user.id },
          );
          return NextResponse.json(
            { error: "Internal error reserving refinement" },
            { status: 500 },
          );
        }

        if (newCount === null || newCount === undefined) {
          return NextResponse.json({
            refinedDay: null,
            updatedTrip: null,
            message: isUnlockedTrip
              ? "You've reached the refinement limit for this trip."
              : "Unlock your full trip to keep refining.",
            requiresUnlock: !isUnlockedTrip,
          });
        }
        reservedSlot = true;
      }

      // Check Redis cache for identical refinement request
      const dayActivityIds = (trip.days[targetDayIndex]?.activities ?? []).map(a => a.locationId ?? a.id);
      const cacheKey = buildRefineCacheKey(dayActivityIds, refinementType, trip.days[targetDayIndex]?.cityId);
      const redis = getRedisClient();

      if (redis) {
        try {
          const cached = await redis.get<TripDay>(cacheKey);
          if (cached) {
            logger.info("Refinement cache hit", { cacheKey, refinementType });
            const updatedDays = trip.days.map((day, index) => index === targetDayIndex ? cached : day);
            const refined: Trip = { ...trip, days: updatedDays, updatedAt: new Date().toISOString() };
            return NextResponse.json({ trip: refined, refinementType, dayIndex: targetDayIndex, message: `Successfully refined day ${targetDayIndex + 1} with ${refinementType} refinement.` }, { status: 200 });
          }
        } catch {
          // Cache miss or error, proceed with refinement
        }
      }

      // Cache missed — gate Vertex spend before LLM refinement.
      const costDenialModern = await gateOnDailyCost({
        costKey: user?.id ?? context.ip ?? "unknown",
        estimate: "itineraryRefine",
        routeName: "/api/itinerary/refine",
        requestId: context.requestId,
      });
      if (costDenialModern) return costDenialModern;

      // Perform actual refinement using refineDay function. Release the reserved
      // slot if it throws so the user isn't billed for a failed LLM call.
      let refinedDay: TripDay;
      try {
        refinedDay = await refineDay({
          trip,
          dayIndex: targetDayIndex,
          type: refinementType,
        });
      } catch (err) {
        if (reservedSlot && user) {
          const serviceClientStub = getServiceRoleClient();
          await serviceClientStub.rpc("decrement_free_refinements", {
            p_trip_id: trip.id,
            p_user_id: user.id,
          });
        }
        throw err;
      }

      // Cache the refined day
      if (redis) {
        redis.set(cacheKey, JSON.stringify(refinedDay), { ex: REFINE_CACHE_TTL }).catch(() => {});
      }

      // Update the trip with the refined day
      const updatedDays = trip.days.map((day, index) =>
        index === targetDayIndex ? refinedDay : day
      );

      const refined: Trip = {
        ...trip,
        days: updatedDays,
        updatedAt: new Date().toISOString(),
      };

      // Release the reservation if refineDay returned a no-op stub (e.g. nothing
      // to refine). Real refinements keep the slot consumed.
      const isNoOpStub = !!refinedDay.message;
      if (reservedSlot && isNoOpStub && user) {
        const serviceClientStub = getServiceRoleClient();
        await serviceClientStub.rpc("decrement_free_refinements", {
          p_trip_id: trip.id,
          p_user_id: user.id,
        });
      }

      return NextResponse.json(
        {
          trip: refined,
          refinementType,
          dayIndex: targetDayIndex,
          message: refinedDay.message ?? `Successfully refined day ${targetDayIndex + 1} with ${refinementType} refinement.`,
        },
        { status: 200 }
      );
    }

    // Legacy format (for backward compatibility)
    const { tripId, dayIndex, refinementType, builderData, itinerary } = body as RefinementRequest;

    if (!tripId || typeof dayIndex !== "number" || !refinementType) {
      return badRequest("tripId, dayIndex, and refinementType are required", undefined, {
        requestId: context.requestId,
      });
    }
    if (!VALID_REFINEMENT_TYPES.includes(refinementType)) {
      return badRequest(`Invalid refinement type: ${refinementType}`, undefined, {
        requestId: context.requestId,
      });
    }
    // Refinement is stateless: tripId is just a cache tag, not a DB lookup
    // key. The client must POST the trip body it wants to refine — either
    // via { trip } (handled by the earlier branch) or via { builderData,
    // itinerary } (handled here). Spell that out so callers don't think
    // \"trip not found\" when they pass a tripId that the server can't see.
    const missing: string[] = [];
    if (!builderData) missing.push("builderData");
    if (!itinerary || !Array.isArray(itinerary.days) || itinerary.days.length === 0) {
      missing.push("itinerary (with at least one day)");
    }
    if (missing.length > 0) {
      return badRequest(
        `Refinement is stateless. POST the trip data alongside tripId. Missing: ${missing.join(", ")}.`,
        undefined,
        { requestId: context.requestId },
      );
    }

    // Check refinement limits for free users
    const fullAccess = await isFullAccessEnabled(user?.id);
    if (!fullAccess && user) {
      const serviceClient = getServiceRoleClient();
      const { data: tripRow } = await serviceClient
        .from("trips")
        .select("unlocked_at, free_refinements_used")
        .eq("id", tripId)
        .eq("user_id", user.id)
        .single();

      if (tripRow && !tripRow.unlocked_at) {
        const used = tripRow.free_refinements_used ?? 0;
        if (used >= MAX_FREE_REFINEMENTS) {
          return NextResponse.json({
            refinedDay: null,
            updatedTrip: null,
            message: "Unlock your full trip to keep refining.",
            requiresUnlock: true,
          });
        }
      }

      // Hard cap for unlocked trips to prevent abuse
      if (tripRow && tripRow.unlocked_at) {
        const used = tripRow.free_refinements_used ?? 0;
        if (used >= MAX_PAID_REFINEMENTS) {
          return NextResponse.json({
            refinedDay: null,
            updatedTrip: null,
            message: "You've reached the refinement limit for this trip.",
          });
        }
      }
    }

    // Determine cities to filter by for optimized database queries
    const selectedCities = builderData.cities && builderData.cities.length > 0 ? builderData.cities : undefined;

    // Fetch locations from database (with fallback to mock data)
    const allLocations = await fetchAllLocations(selectedCities);
    const trip = convertItineraryToTrip(itinerary, builderData, tripId, allLocations);
    if (!trip.days[dayIndex]) {
      return badRequest(`Day index ${dayIndex} not found for trip ${tripId}`, undefined, {
        requestId: context.requestId,
      });
    }

    // Legacy path has no cache — gate Vertex spend before LLM refinement.
    const costDenialLegacy = await gateOnDailyCost({
      costKey: user?.id ?? context.ip ?? "unknown",
      estimate: "itineraryRefine",
      routeName: "/api/itinerary/refine",
      requestId: context.requestId,
    });
    if (costDenialLegacy) return costDenialLegacy;

    const originalItineraryDay = itinerary.days[dayIndex];
    const refinedDay = await refineDay({ trip, dayIndex, type: refinementType });
    const updatedDays = trip.days.map((day, index) => (index === dayIndex ? refinedDay : day));
    const updatedTrip: Trip = {
      ...trip,
      days: updatedDays,
      updatedAt: new Date().toISOString(),
    };

    // Detect if refinement made no changes (engine returned original day unchanged)
    const originalIds = (originalItineraryDay?.activities ?? []).map((a) =>
      a.kind === "place" ? a.locationId ?? a.id : a.id,
    );
    const refinedIds = refinedDay.activities.map((a) => a.locationId ?? a.id);
    const unchanged =
      originalIds.length === refinedIds.length &&
      originalIds.every((id, i) => id === refinedIds[i]);

    const isNoOp = !!(refinedDay.message || unchanged);

    const responseBody: RefinementResponse = {
      refinedDay: mapTripDayToItineraryDay(refinedDay, originalItineraryDay),
      updatedTrip,
      ...(refinedDay.message
        ? { message: refinedDay.message }
        : unchanged
          ? { message: "This day is already optimized for that adjustment." }
          : {}),
    };

    // Increment free refinement counter for non-unlocked trips
    if (!fullAccess && user && !isNoOp) {
      const serviceClient = getServiceRoleClient();
      const { data: tripRow } = await serviceClient
        .from("trips")
        .select("unlocked_at")
        .eq("id", tripId)
        .eq("user_id", user.id)
        .single();

      if (tripRow && !tripRow.unlocked_at) {
        await serviceClient.rpc("increment_free_refinements", { p_trip_id: tripId, p_user_id: user.id });
      }
    }

    return NextResponse.json(responseBody);
  },
  { rateLimit: RATE_LIMITS.ITINERARY_REFINE, dailyQuota: DAILY_QUOTAS.ITINERARY_REFINE, requireJson: true, optionalAuth: true },
);
