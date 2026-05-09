import "server-only";

import { generateItinerary } from "@/lib/itineraryGenerator";
import { planItinerary } from "@/lib/itineraryPlanner";
import { buildTravelerProfile } from "@/lib/domain/travelerProfile";
import type { Trip, TripDay, TripActivity } from "@/types/tripDomain";
import type { TripBuilderData } from "@/types/trip";
import type { Itinerary, ItineraryActivity } from "@/types/itinerary";
import type { Location } from "@/types/location";
import { logger } from "@/lib/logger";
import { fetchAllLocations } from "@/lib/locations/locationService";
import { formatLocalDateISO } from "@/lib/utils/dateUtils";
import { optimizeRouteOrder } from "@/lib/routeOptimizer";
import { getCityCenterCoordinates } from "@/data/entryPoints";
import { extractTripIntent } from "./intentExtractor";
import { generateGuideProse } from "./guideProseGenerator";
import { refineDays } from "./dayRefinement";
import { generateDailyBriefings } from "./dailyBriefingGenerator";
import { getDayTripsFromCity } from "@/data/dayTrips";
import { getSeasonalHighlightForDate } from "@/lib/utils/seasonUtils";
import { pickDayIntroOpener } from "@/lib/guide/templateMatcher";
import { computeEffectiveArrivalStart, computeEffectiveDepartureEnd, computeRawEffectiveArrival, getArrivalProcessing, getDepartureProcessing, EARLY_ARRIVAL_THRESHOLD, LATE_ARRIVAL_THRESHOLD } from "@/lib/utils/airportBuffer";
import { applyLateArrivalStrip } from "@/lib/itinerary/lateArrival";
import { applyEarlyArrivalStrip } from "@/lib/itinerary/earlyArrival";
import { parseTimeToMinutes, formatMinutesToTime } from "@/lib/utils/timeUtils";
import { fetchCommunityRatings } from "@/lib/ratings/communityRatings";
import { inferPersonaId } from "@/lib/selection/personaInference";
import type { GeneratedGuide, GeneratedBriefings } from "@/types/llmConstraints";
import { assembleBriefing } from "@/lib/briefing/briefingAssembler";
import { getCulturalPillars } from "@/lib/sanity/contentService";
import type { CulturalBriefing } from "@/types/culturalBriefing";

function deriveTimeSlotFromStart(startTime: string | undefined): "morning" | "afternoon" | "evening" | null {
  if (!startTime) return null;
  const mins = parseTimeToMinutes(startTime);
  if (mins == null) return null;
  if (mins < 12 * 60) return "morning";
  if (mins < 17 * 60) return "afternoon";
  return "evening";
}

/**
 * Converts an Itinerary (legacy format) to Trip (domain model)
 */
export function convertItineraryToTrip(
  itinerary: Itinerary,
  builderData: TripBuilderData,
  tripId: string,
  allLocations: Location[],
): Trip {
  const travelerProfile = builderData.travelerProfile ?? buildTravelerProfile(builderData);

  // Missing start date used to silently fall back to today via the `??`
  // chain, which masked frontend bugs. Log a warn so it's visible in prod.
  if (!builderData.dates.start) {
    logger.warn("[engine] convertItineraryToTrip called without dates.start — falling back to today", {
      tripId,
    });
  }
  const startDate = builderData.dates.start ?? formatLocalDateISO(new Date());
  const duration = builderData.duration ?? itinerary.days.length;

  if (!startDate) {
    throw new Error("Start date is required");
  }

  // Use local-date constructor to avoid UTC midnight timezone bugs
  const [sy, sm, sd] = startDate.split("-").map(Number);
  if (!sy || !sm || !sd) {
    throw new Error(`Invalid start date: ${startDate}`);
  }
  const startDateObj = new Date(sy, sm - 1, sd);
  if (Number.isNaN(startDateObj.getTime())) {
    throw new Error(`Invalid start date: ${startDate}`);
  }

  const endDateObj = new Date(sy, sm - 1, sd + duration - 1);
  const endDate = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, "0")}-${String(endDateObj.getDate()).padStart(2, "0")}`;

  // O(1) lookup maps. id is unique; name is NOT — the ~5,874-row DB has
  // duplicate names across cities, so name-keyed lookups previously picked
  // the last-seen location and could link a Kyoto activity to an Osaka
  // location.id. Prefer id; fall back to name only when the activity has no
  // locationId. The Map still keeps last-wins on name collision, but that
  // path is now only exercised for free-form activities without an id.
  const locationById = new Map(allLocations.map((loc) => [loc.id, loc]));
  const locationByName = new Map(allLocations.map((loc) => [loc.name, loc]));

  const days: TripDay[] = itinerary.days.map((day, index) => {
    const dayDate = new Date(sy, sm - 1, sd + index);
    const dateStr = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, "0")}-${String(dayDate.getDate()).padStart(2, "0")}`;

    if (!dateStr) {
      throw new Error(`Failed to generate date string for day ${index}`);
    }

    const activities: TripActivity[] = day.activities
      .filter((activity): activity is Extract<ItineraryActivity, { kind: "place" }> => activity.kind === "place")
      .map((activity) => {
        const location =
          (activity.locationId ? locationById.get(activity.locationId) : undefined) ??
          locationByName.get(activity.title);
        return {
          id: activity.id,
          locationId: activity.locationId ?? location?.id ?? `unknown-${activity.id}`,
          location: location,
          timeSlot: deriveTimeSlotFromStart(activity.schedule?.arrivalTime) ?? activity.timeOfDay,
          duration: activity.durationMin ?? 90,
          startTime: activity.schedule?.arrivalTime,
          endTime: activity.schedule?.departureTime,
          mealType: activity.mealType ?? (activity.tags?.includes("dining") ? "lunch" : undefined),
          isAnchor: activity.isAnchor,
          coordinates: activity.coordinates,
        };
      });

    // Ensure cityId is set - use first city from builderData or default
    const cityId = day.cityId ?? builderData.cities?.[0] ?? "kyoto";

    return {
      id: day.id,
      date: dateStr,
      cityId,
      activities,
      explanation: generateDayExplanation(day, index, travelerProfile.pace),
    };
  });

  // NOTE: itinerary.planningWarnings is intentionally NOT propagated to Trip.
  // Today the only consumer (TripConfidenceDashboard) reads warnings from the
  // Itinerary directly, so the field doesn't need to live on Trip. If you add
  // a Trip consumer that needs warnings, add `planningWarnings: itinerary.planningWarnings`
  // here AND add an optional `planningWarnings?: PlanningWarning[]` field to
  // the Trip type.
  return {
    id: tripId,
    travelerProfile,
    dates: {
      start: startDate,
      end: endDate,
    },
    regions: builderData.regions ?? [],
    cities: builderData.cities ?? [],
    entryPoint: builderData.entryPoint,
    status: "planned",
    days,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Generates explanation text for a day
 */
function generateDayExplanation(
  day: Itinerary["days"][number],
  dayIndex: number,
  pace: string,
): string {
  const activityCount = day.activities.length;
  const cityName = day.cityId ?? "the area";

  if (dayIndex === 0) {
    return `Day 1 is ${pace === "relaxed" ? "light" : pace === "fast" ? "packed" : "balanced"} to help with ${pace === "relaxed" ? "easing into" : "getting started in"} ${cityName}.`;
  }

  if (activityCount <= 2) {
    return `Day ${dayIndex + 1} is relaxed with fewer activities to allow for rest and exploration.`;
  }

  if (activityCount >= 5) {
    return `Day ${dayIndex + 1} is packed with activities to maximize your time in ${cityName}.`;
  }

  return `Day ${dayIndex + 1} offers a balanced mix of activities in ${cityName}.`;
}

/**
 * Optimize activity order for each day independently using nearest-neighbor algorithm.
 * Each day is optimized starting from the trip's entry point (airport/station).
 * Days are independent because users typically return to hotels at end of each day.
 */
function optimizeItineraryRoutes(
  itinerary: Itinerary,
  builderData: TripBuilderData
): Itinerary {
  // Use entry point as start for all days (airport/station where trip begins)
  const startPoint = builderData.entryPoint;

  const optimizedDays = itinerary.days.map((day, dayIndex) => {
    // Day 1: start from entry point. Days 2+: start from city center (hotel proxy).
    let dayStartPoint = startPoint;
    if (dayIndex > 0 && day.cityId) {
      const cityCoords = getCityCenterCoordinates(day.cityId);
      // Only coordinates are used by optimizeRouteOrder, so we can safely cast
      dayStartPoint = { coordinates: cityCoords } as typeof startPoint;
    }
    const result = optimizeRouteOrder(day.activities, dayStartPoint, dayStartPoint);

    if (!result.orderChanged) {
      return day;
    }

    const activityMap = new Map(day.activities.map(a => [a.id, a]));
    const reorderedActivities = result.order
      .map(id => activityMap.get(id))
      .filter((a): a is ItineraryActivity => a !== undefined);

    return { ...day, activities: reorderedActivities };
  });

  return { ...itinerary, days: optimizedDays };
}

/**
 * Result from generating a trip, including both domain model and storage format
 */
export type GeneratedTripResult = {
  trip: Trip;
  itinerary: Itinerary;
  dayIntros?: Record<string, string>;
  guideProse?: GeneratedGuide;
  dailyBriefings?: GeneratedBriefings;
  culturalBriefing?: CulturalBriefing;
};

/**
 * Supabase calls in this pipeline (fetchAllLocations, fetchCommunityRatings)
 * have no native timeout. A degraded database would otherwise hang the entire
 * pipeline past the 55s route timeout. These wrappers enforce an upper bound
 * at the call site: the downstream promise keeps running (no true
 * cancellation), but the pipeline moves on.
 */
const LOCATIONS_FETCH_TIMEOUT_MS = 20_000;
const COMMUNITY_RATINGS_TIMEOUT_MS = 8_000;

/** @internal Exported for testing */
export class PipelineTimeoutError extends Error {
  constructor(stage: string, timeoutMs: number) {
    super(`[engine] ${stage} exceeded ${timeoutMs}ms timeout`);
    this.name = "PipelineTimeoutError";
  }
}

/** @internal Exported for testing */
export function raceWithTimeout<T>(
  stage: string,
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const sentinel = Symbol("timeout");
  return Promise.race<T | typeof sentinel>([
    promise,
    new Promise<typeof sentinel>((resolve) => setTimeout(() => resolve(sentinel), timeoutMs)),
  ]).then((result) => {
    if (result === sentinel) {
      throw new PipelineTimeoutError(stage, timeoutMs);
    }
    return result as T;
  });
}

/**
 * Generates an itinerary from TripBuilderData
 * Returns both a Trip domain model and the raw Itinerary for storage
 *
 * @param builderData - Trip configuration data
 * @param tripId - Unique identifier for the trip
 * @param savedIds - Optional array of saved location IDs to include in generation
 */
type GenerationOptions = {
  /** When true, only return prose/briefings for Day 1. Days 2-N deferred to unlock. */
  deferProse?: boolean;
};

export async function generateTripFromBuilderData(
  builderData: TripBuilderData,
  tripId: string,
  savedIds?: string[],
  options?: GenerationOptions,
): Promise<GeneratedTripResult> {
  const t0 = Date.now();

  // Per-stage timing: lets us see which pass is blowing the 55s budget.
  // Every significant async step is wrapped so we can log a full breakdown
  // at the end, plus a per-stage-completed line so a hang reveals the culprit.
  const stageTimings: Record<string, number> = {};
  const timeStage = async <T>(name: string, p: Promise<T>): Promise<T> => {
    const start = Date.now();
    try {
      const result = await p;
      const elapsed = Date.now() - start;
      stageTimings[name] = elapsed;
      logger.info(`[engine:stage] ${name}`, { elapsedMs: elapsed });
      return result;
    } catch (err) {
      const elapsed = Date.now() - start;
      stageTimings[name] = elapsed;
      logger.warn(`[engine:stage-fail] ${name}`, {
        elapsedMs: elapsed,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };

  // Run intent extraction in parallel with location fetching — zero added latency.
  // Intent extraction uses Gemini to reason about vibes, notes, group, pace holistically.
  const intentPromise = timeStage(
    "intentExtraction",
    extractTripIntent(builderData).catch(() => null),
  );

  // Compute day trip cities upfront (synchronous) for 1-2 city trips
  const dayTripCityIds = new Set<string>();
  if (builderData.cities && builderData.cities.length <= 2) {
    for (const cityId of builderData.cities) {
      getDayTripsFromCity(cityId).forEach((t) => dayTripCityIds.add(t.cityId));
    }
    builderData.cities.forEach((c) => dayTripCityIds.delete(c));
  }

  // Fire main + day-trip location fetches in parallel. Both are bounded by
  // LOCATIONS_FETCH_TIMEOUT_MS so a degraded Supabase cannot hang the pipeline.
  // On timeout, we throw — the pipeline cannot usefully continue without locations.
  const [mainLocations, dayTripLocations] = await Promise.all([
    timeStage(
      "fetchMainLocations",
      raceWithTimeout(
        "fetchMainLocations",
        fetchAllLocations({ cities: builderData.cities }),
        LOCATIONS_FETCH_TIMEOUT_MS,
      ),
    ),
    dayTripCityIds.size > 0
      ? timeStage(
          "fetchDayTripLocations",
          raceWithTimeout(
            "fetchDayTripLocations",
            fetchAllLocations({ cities: Array.from(dayTripCityIds) }),
            LOCATIONS_FETCH_TIMEOUT_MS,
          ),
        )
      : Promise.resolve([]),
  ]);
  const allLocations = dayTripLocations.length > 0
    ? [...mainLocations, ...dayTripLocations]
    : mainLocations;

  // Await intent extraction + community ratings in parallel. Ratings are
  // non-fatal — on timeout or error, fall back to an empty Map so scoring
  // simply uses base ratings.
  const [intentResult, communityRatingsMap] = await Promise.all([
    intentPromise,
    timeStage(
      "fetchCommunityRatings",
      raceWithTimeout(
        "fetchCommunityRatings",
        fetchCommunityRatings(allLocations.map((l) => l.id)),
        COMMUNITY_RATINGS_TIMEOUT_MS,
      ).catch((err) => {
        logger.warn("[engine] fetchCommunityRatings failed, using empty ratings", {
          error: err instanceof Error ? err.message : String(err),
        });
        return new Map();
      }),
    ),
  ]);
  const t1 = Date.now();
  const communityRatings = communityRatingsMap.size > 0
    ? new Map([...communityRatingsMap.entries()].map(([k, v]) => [k, v.avgRating]))
    : undefined;

  // Generate itinerary using existing generator, including saved locations
  // Pass pre-fetched locations to avoid duplicate Supabase call inside generator.
  // personaId activates the post-scoring canonical-coverage layer (Direction 4)
  // when shape is clearly diagnostic; undefined falls through to no-op.
  const personaId = inferPersonaId(builderData);
  const rawItinerary = await timeStage(
    "generateItinerary",
    generateItinerary(builderData, {
      savedIds,
      locations: allLocations,
      communityRatings,
      intentConstraints: intentResult ?? undefined,
      personaId,
    }),
  );
  const t2 = Date.now();

  // Optimize route order before planning times
  const optimizedItinerary = optimizeItineraryRoutes(rawItinerary, builderData);

  // Build dayEntryPoints so the planner knows where each day starts
  // Day 1: entry point (airport/station). Days 2+: city center (hotel proxy).
  const dayEntryPoints: Record<string, { startPoint?: { coordinates: { lat: number; lng: number } }; endPoint?: { coordinates: { lat: number; lng: number } } }> = {};
  for (let i = 0; i < optimizedItinerary.days.length; i++) {
    const day = optimizedItinerary.days[i];
    if (!day) continue;
    if (i === 0 && builderData.entryPoint?.coordinates) {
      // Day 1: start from airport/station, end at city center (hotel proxy)
      const endCoords = day.cityId
        ? getCityCenterCoordinates(day.cityId)
        : builderData.entryPoint.coordinates;
      dayEntryPoints[day.id] = {
        startPoint: { coordinates: builderData.entryPoint.coordinates },
        endPoint: { coordinates: endCoords },
      };
    } else if (day.cityId) {
      // Days 2+: start and end at city center (hotel proxy)
      const cityCoords = getCityCenterCoordinates(day.cityId);
      dayEntryPoints[day.id] = {
        startPoint: { coordinates: cityCoords },
        endPoint: { coordinates: cityCoords },
      };
    }
  }

  // Overlay builder accommodations — use hotel coordinates instead of city center
  if (builderData.accommodations) {
    for (let i = 0; i < optimizedItinerary.days.length; i++) {
      const day = optimizedItinerary.days[i];
      if (!day) continue;
      const cityId = day.baseCityId ?? day.cityId;
      const accom = cityId ? builderData.accommodations[cityId] : undefined;
      if (!accom) continue;

      if (i === 0 && builderData.entryPoint?.coordinates) {
        // Day 1: start from airport, end at hotel
        dayEntryPoints[day.id] = {
          startPoint: { coordinates: builderData.entryPoint.coordinates },
          endPoint: { coordinates: accom.coordinates },
        };
      } else {
        // Days 2+: start and end at hotel
        dayEntryPoints[day.id] = {
          startPoint: { coordinates: accom.coordinates },
          endPoint: { coordinates: accom.coordinates },
        };
      }
    }
  }

  // ── Inject airport arrival activity on Day 1 ──
  // Only requires entryPoint — arrivalTime is optional (planner uses default day start when absent)
  const arrivalMins = parseTimeToMinutes(builderData.arrivalTime);
  if (builderData.entryPoint && optimizedItinerary.days[0]) {
    const ep = builderData.entryPoint;
    const iata = ep.iataCode;
    const processingMin = getArrivalProcessing(iata);

    // Determine timeOfDay from arrival time if available, otherwise default to morning
    const refMins = arrivalMins ?? parseTimeToMinutes(builderData.dayStartTime ?? "09:00") ?? 540;
    const timeOfDay: "morning" | "afternoon" | "evening" =
      refMins < 720 ? "morning" : refMins < 1020 ? "afternoon" : "evening";

    const arrivalActivity: Extract<ItineraryActivity, { kind: "place" }> = {
      kind: "place",
      id: `anchor-arrival-${ep.id}`,
      title: `Arrive at ${ep.name}`,
      isAnchor: true,
      coordinates: ep.coordinates,
      durationMin: processingMin,
      tags: ["airport"],
      timeOfDay,
    };

    // Prepend airport activity to Day 1
    optimizedItinerary.days[0].activities = [
      arrivalActivity,
      ...optimizedItinerary.days[0].activities,
    ];

    // Reframe Day 1's `startPoint` after the anchor is in place:
    //   - With a real hotel accommodation: promote endPoint (hotel) →
    //     startPoint so the planner routes airport→hotel as a real travel
    //     segment, then hotel→first activity for the day's stops. Without
    //     this, the planner silently jumps `prevCoords` from the anchor to
    //     the hotel without consuming the day clock or rendering a map line.
    //   - Without accommodation: drop startPoint (anchor coords serve as the
    //     routing origin for the first real stop). The city-center fallback
    //     used as `endPoint` is a synthetic proxy — promoting it would
    //     fabricate a routing leg the user didn't ask for.
    const day0Entry = dayEntryPoints[optimizedItinerary.days[0].id];
    const day0CityId = optimizedItinerary.days[0].baseCityId ?? optimizedItinerary.days[0].cityId;
    const hasDay0Accommodation = Boolean(
      builderData.accommodations && day0CityId && builderData.accommodations[day0CityId],
    );
    if (day0Entry) {
      if (hasDay0Accommodation && day0Entry.endPoint) {
        day0Entry.startPoint = day0Entry.endPoint;
      } else {
        delete day0Entry.startPoint;
      }
    }

    // Set Day 1 bounds based on arrival time availability
    if (arrivalMins !== null) {
      // Raw arrival time — the airport activity + planner travel accounts for buffer
      optimizedItinerary.days[0].bounds = {
        ...optimizedItinerary.days[0].bounds,
        startTime: builderData.arrivalTime,
      };
    } else {
      // No arrival time — use effective start if available, otherwise leave default
      const effectiveArrivalStart = computeEffectiveArrivalStart(
        builderData.arrivalTime, iata,
      );
      if (effectiveArrivalStart) {
        optimizedItinerary.days[0].bounds = {
          ...optimizedItinerary.days[0].bounds,
          startTime: effectiveArrivalStart,
        };
      }
    }
  } else {
    // No entry point — fall back to effective arrival start for bounds only
    const effectiveArrivalStart = computeEffectiveArrivalStart(
      builderData.arrivalTime, builderData.entryPoint?.iataCode,
    );
    if (effectiveArrivalStart && optimizedItinerary.days[0]) {
      optimizedItinerary.days[0].bounds = {
        ...optimizedItinerary.days[0].bounds,
        startTime: effectiveArrivalStart,
      };
    }
  }

  // ── Inject airport departure activity on last day ──
  // Only requires exitPoint — departureTime is optional
  const departureMins = parseTimeToMinutes(builderData.departureTime);
  const exitPoint = builderData.sameAsEntry !== false
    ? builderData.entryPoint
    : (builderData.exitPoint ?? builderData.entryPoint);
  const exitIata = exitPoint?.iataCode;
  const lastIdx = optimizedItinerary.days.length - 1;

  if (exitPoint && optimizedItinerary.days[lastIdx]) {
    const processingMin = getDepartureProcessing(exitIata);

    // Build departure activity — pre-set schedule only when departureTime is known
    const departureActivity: Extract<ItineraryActivity, { kind: "place" }> = {
      kind: "place",
      id: `anchor-departure-${exitPoint.id}`,
      title: `Depart from ${exitPoint.name}`,
      isAnchor: true,
      coordinates: exitPoint.coordinates,
      durationMin: processingMin,
      tags: ["airport"],
      timeOfDay: "afternoon" as const,
      ...(departureMins !== null
        ? {
            timeOfDay: (departureMins - processingMin < 720 ? "morning" : departureMins - processingMin < 1020 ? "afternoon" : "evening") as "morning" | "afternoon" | "evening",
            schedule: {
              arrivalTime: formatMinutesToTime(departureMins - processingMin),
              departureTime: builderData.departureTime!,
              status: "scheduled" as const,
            },
          }
        : {}),
    };

    // Append airport activity to last day
    optimizedItinerary.days[lastIdx].activities = [
      ...optimizedItinerary.days[lastIdx].activities,
      departureActivity,
    ];

    // Remove endPoint from dayEntryPoints — airport activity serves as routing destination
    const lastDayEntry = dayEntryPoints[optimizedItinerary.days[lastIdx].id];
    if (lastDayEntry) {
      delete lastDayEntry.endPoint;
    }

    // Set last day bounds based on departure time availability
    if (departureMins !== null) {
      // Raw departure time — include full airport time in day window
      optimizedItinerary.days[lastIdx].bounds = {
        ...optimizedItinerary.days[lastIdx].bounds,
        endTime: builderData.departureTime,
      };
    } else {
      const effectiveDepartureEnd = computeEffectiveDepartureEnd(
        builderData.departureTime, exitIata,
      );
      if (effectiveDepartureEnd) {
        optimizedItinerary.days[lastIdx].bounds = {
          ...optimizedItinerary.days[lastIdx].bounds,
          endTime: effectiveDepartureEnd,
        };
      }
    }
  } else {
    // No exit point — fall back to effective departure end for bounds only
    const effectiveDepartureEnd = computeEffectiveDepartureEnd(
      builderData.departureTime, exitIata,
    );
    if (effectiveDepartureEnd && optimizedItinerary.days[lastIdx]) {
      optimizedItinerary.days[lastIdx].bounds = {
        ...optimizedItinerary.days[lastIdx].bounds,
        endTime: effectiveDepartureEnd,
      };
    }
  }

  // ── Late / early arrival: strip Day 1 activities when effective arrival is
  // outside the usable window. Late (>= 19:00) leaves <1h before default day
  // end. Early (< 08:00) lands before shrines/museums/shops open. The two
  // strips are mutually exclusive — late takes precedence if both somehow
  // qualified, and `applyEarlyArrivalStrip` no-ops when `isLateArrival` is set.
  if (builderData.arrivalTime && optimizedItinerary.days[0]) {
    const entryIata = builderData.entryPoint?.iataCode;
    const rawEffective = computeRawEffectiveArrival(builderData.arrivalTime, entryIata);
    if (rawEffective !== null && rawEffective >= LATE_ARRIVAL_THRESHOLD) {
      applyLateArrivalStrip(optimizedItinerary.days[0]);
      logger.info("[engine] Late arrival detected — Day 1 activities stripped", {
        rawEffective,
        threshold: LATE_ARRIVAL_THRESHOLD,
      });
    } else if (rawEffective !== null && rawEffective < EARLY_ARRIVAL_THRESHOLD) {
      applyEarlyArrivalStrip(optimizedItinerary.days[0]);
      logger.info("[engine] Pre-dawn arrival detected — Day 1 activities stripped", {
        rawEffective,
        threshold: EARLY_ARRIVAL_THRESHOLD,
      });
    }
  }

  // Run planItinerary (routing), guide prose, daily briefings, and
  // getCulturalPillars in parallel. Guide prose replaces both day intros and
  // template-based guide text. Daily briefings replace per-day tip cards with
  // concise prose. getCulturalPillars is a Sanity fetch that was previously
  // sequential after the parallel block — it has no data dependency on the
  // LLM output (the assembly step uses `guideProse?.culturalBriefingIntro`
  // with optional chaining), so running it in parallel reclaims ~3s off the
  // sequential budget. All four fall back gracefully on failure.
  // When deferring prose (free users), skip Passes 3 & 4 entirely to save cost.
  // Only run them for Day 1 by filtering the itinerary input.
  // At unlock time, the complete-generation endpoint re-runs them for all days.
  const day1Only = options?.deferProse && optimizedItinerary.days.length > 1;
  const proseItinerary = day1Only
    ? { ...optimizedItinerary, days: optimizedItinerary.days.slice(0, 1) }
    : optimizedItinerary;

  const [plannedItinerary, guideProse, dailyBriefings, pillars] = await Promise.all([
    timeStage(
      "planItinerary",
      planItinerary(optimizedItinerary, {
        defaultDayStart: builderData.dayStartTime ?? "09:00",
        defaultDayEnd: builderData.accommodationStyle === "ryokan" ? "17:00" : undefined,
      }, dayEntryPoints),
    ),
    timeStage(
      "generateGuideProse",
      generateGuideProse(proseItinerary, builderData, intentResult ?? undefined).catch(() => null),
    ),
    timeStage(
      "generateDailyBriefings",
      generateDailyBriefings(proseItinerary, builderData).catch(() => null),
    ),
    timeStage(
      "getCulturalPillars",
      getCulturalPillars().catch(() => null),
    ),
  ]);

  const effectiveGuideProse = guideProse;
  const effectiveDailyBriefings = dailyBriefings;

  // Assemble cultural briefing from Sanity pillars + trip categories.
  // Pillars are already fetched in the parallel block above, so this is a
  // pure synchronous transform — no I/O.
  // culturalBriefingIntro is trip-level, so use full guideProse (not filtered)
  let culturalBriefing: CulturalBriefing | undefined;
  if (pillars && pillars.length > 0) {
    try {
      const locationMap = new Map(allLocations.map((l) => [l.id, l]));
      const tripCategories = [
        ...new Set(
          optimizedItinerary.days.flatMap((d) =>
            d.activities
              .filter((a): a is Extract<typeof a, { kind: "place" }> => a.kind === "place")
              .map((a) => a.locationId ? locationMap.get(a.locationId)?.category : undefined)
              .filter((c): c is string => Boolean(c)),
          ),
        ),
      ];
      culturalBriefing = assembleBriefing(
        pillars,
        tripCategories,
        guideProse?.culturalBriefingIntro,
      );
    } catch {
      // Non-blocking: briefing is optional enhancement
    }
  }

  // Extract day intros from effective guide prose when present. When guideProse is
  // null (aborted or rejected), do NOT fall through to generateDayIntros —
  // that path runs another full Vertex call against the same slow provider
  // that just failed, with no effective timeout, and it compounded the wait
  // up to 55s on a 13-day trip (see incident req_1775916704399_jeo2x94nkx).
  // Downstream guideBuilder already has a three-tier fallback:
  //   guideProse.intro → dayIntros → DAY_INTRO_TEMPLATES
  // so undefined here just drops to the template layer.
  const proseIntros = effectiveGuideProse
    ? Object.fromEntries(effectiveGuideProse.days.map(d => [d.dayId, d.intro]))
    : {};

  // Backfill template-tier intro for any day missing prose (LLM failure,
  // timeout, or deferred generation). Guarantees every day has editorial
  // intro copy so the chapter header is never empty.
  const dayIntros: Record<string, string> = {};
  for (const day of plannedItinerary.days) {
    const proseIntro = proseIntros[day.id];
    if (proseIntro && proseIntro.trim().length > 0) {
      dayIntros[day.id] = proseIntro;
      continue;
    }
    const cityName = day.cityId ? day.cityId.replace(/_/g, " ") : "Japan";
    dayIntros[day.id] = pickDayIntroOpener(cityName, `${day.id}-intro`);
  }

  // Day refinement: holistic quality pass — can swap, reorder, or flag activities.
  // Runs sequentially after planning since it needs scheduled times.
  const itinerary = await timeStage(
    "refineDays",
    refineDays(plannedItinerary, builderData, allLocations, intentResult ?? undefined),
  );
  const t3 = Date.now();

  logger.info("Itinerary generation timing", {
    locationsFetchMs: t1 - t0,
    generatorMs: t2 - t1,
    planningAndIntrosMs: t3 - t2,
    totalMs: t3 - t0,
    daysCount: itinerary.days.length,
    locationCount: allLocations.length,
    dayStartTime: builderData.dayStartTime ?? "09:00",
    hasIntentConstraints: !!intentResult,
    hasGuideProse: !!(guideProse?.tripOverview || guideProse?.days.length),
    hasDailyBriefings: !!dailyBriefings,
    stages: stageTimings,
  });

  // Attach seasonal highlight if trip dates overlap a known event
  const startDate = builderData.dates.start;
  if (startDate) {
    const parts = startDate.split("-").map(Number);
    const startMonth = parts[1];
    const startDay = parts[2];
    if (startMonth && startDay) {
      const highlight = getSeasonalHighlightForDate(startMonth, startDay);
      if (highlight) {
        itinerary.seasonalHighlight = {
          id: highlight.id,
          label: highlight.label,
          description: highlight.description,
        };
      }
    }
  }

  // Convert to Trip domain model
  const trip = convertItineraryToTrip(itinerary, builderData, tripId, allLocations);

  return {
    trip,
    itinerary,
    dayIntros: dayIntros ?? undefined,
    guideProse: effectiveGuideProse ?? undefined,
    dailyBriefings: effectiveDailyBriefings ?? undefined,
    culturalBriefing,
  };
}

/**
 * Parse price level from minBudget string.
 * Returns numeric value or symbol count.
 * @internal Exported for testing
 */
export function parsePriceLevel(minBudget?: string): { level: number; type: "numeric" | "symbol" } {
  if (!minBudget) {
    return { level: 0, type: "numeric" };
  }

  // Try to parse numeric value (e.g., "¥400")
  const numericMatch = minBudget.match(/¥?\s*(\d+)/);
  if (numericMatch) {
    return { level: parseInt(numericMatch[1] ?? "0", 10), type: "numeric" };
  }

  // Count symbols (e.g., "¥¥¥" = 3)
  const symbolCount = (minBudget.match(/¥/g) || []).length;
  if (symbolCount > 0) {
    return { level: symbolCount, type: "symbol" };
  }

  return { level: 0, type: "numeric" };
}

/**
 * Maximum activity duration per day in minutes (12 hours)
 */
const MAX_DAY_DURATION_MINUTES = 12 * 60;

/**
 * Budget tolerance threshold (10% over budget is acceptable)
 */
const BUDGET_TOLERANCE = 1.1;

/**
 * Validates that a day doesn't exceed the maximum activity duration
 * @internal Exported for testing
 */
export function validateDayDuration(day: TripDay, dayIndex: number): string[] {
  const issues: string[] = [];
  const totalDuration = day.activities.reduce((sum, activity) => sum + activity.duration, 0);

  if (totalDuration > MAX_DAY_DURATION_MINUTES) {
    issues.push(
      `Day ${dayIndex + 1} is overpacked (${Math.round(totalDuration / 60)} hours of activities)`,
    );
  }

  return issues;
}

/**
 * Calculates the cost of a day's activities and validates against per-day budget
 */
/** @internal Exported for testing */
export function validateDayBudget(
  day: TripDay,
  dayIndex: number,
  perDayBudget: number | undefined,
): { issues: string[]; cost: number } {
  const issues: string[] = [];
  let dayCost = 0;

  day.activities.forEach((activity) => {
    if (activity.location?.minBudget) {
      const priceInfo = parsePriceLevel(activity.location.minBudget);
      if (priceInfo.type === "numeric" && priceInfo.level > 0) {
        dayCost += priceInfo.level;
      }
    }
  });

  if (perDayBudget !== undefined && dayCost > perDayBudget * BUDGET_TOLERANCE) {
    const percentOver = Math.round((dayCost / perDayBudget - 1) * 100);
    issues.push(
      `Day ${dayIndex + 1} exceeds per-day budget (¥${dayCost} vs ¥${perDayBudget} budget, ${percentOver}% over)`,
    );
  }

  return { issues, cost: dayCost };
}

/**
 * Validates that total trip cost doesn't exceed total budget
 */
/** @internal Exported for testing */
export function validateTotalBudget(totalCost: number, totalBudget: number | undefined): string[] {
  const issues: string[] = [];

  if (totalBudget !== undefined && totalCost > totalBudget * BUDGET_TOLERANCE) {
    const percentOver = Math.round((totalCost / totalBudget - 1) * 100);
    issues.push(
      `Total trip cost (¥${totalCost}) exceeds total budget (¥${totalBudget}, ${percentOver}% over)`,
    );
  }

  return issues;
}

/**
 * Validates that activities don't conflict with typical nap times (1pm-3pm)
 * Only applies when children are present in the travel group
 */
/** @internal Exported for testing */
export function validateNapScheduling(day: TripDay, dayIndex: number): string[] {
  const issues: string[] = [];

  const conflictingActivities = day.activities.filter((activity) => {
    if (!activity.startTime) return false;
    const parts = activity.startTime.split(":");
    if (parts.length < 1) return false;
    const hours = Number(parts[0]);
    if (Number.isNaN(hours)) return false;
    return hours >= 13 && hours < 15;
  });

  if (conflictingActivities.length > 0) {
    issues.push(`Day ${dayIndex + 1} has activities during typical nap time (1pm-3pm)`);
  }

  return issues;
}

/**
 * Validates that a trip meets soft constraints
 */
export function validateTripConstraints(trip: Trip): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check for overpacked days
  trip.days.forEach((day, index) => {
    issues.push(...validateDayDuration(day, index));
  });

  // Check budget constraints
  const budget = trip.travelerProfile.budget;
  if (budget.perDay !== undefined || budget.total !== undefined) {
    let totalCost = 0;

    trip.days.forEach((day, index) => {
      const { issues: dayIssues, cost } = validateDayBudget(day, index, budget.perDay);
      issues.push(...dayIssues);
      totalCost += cost;
    });

    issues.push(...validateTotalBudget(totalCost, budget.total));
  }

  // Check for backtracking (simplified - would need routing data)
  // This is a placeholder for future implementation

  // Check nap windows only if a nap-aged child (≤4) is present. A 12-year-old
  // doesn't need a 1–3pm rest window just because the group is flagged "family".
  const hasNapAgedChild = (trip.travelerProfile.group.childrenAges ?? []).some(
    (age) => age <= 4,
  );
  if (trip.travelerProfile.group.type === "family" && hasNapAgedChild) {
    trip.days.forEach((day, index) => {
      issues.push(...validateNapScheduling(day, index));
    });
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}


