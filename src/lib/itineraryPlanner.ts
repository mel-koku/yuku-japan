import { getCoordinatesForLocationId, getCoordinatesForName } from "@/data/locationCoordinates";
import { findLocationsForActivities } from "@/lib/itineraryLocations";
import { resolveTimezone } from "@/lib/utils/timezoneUtils";
import type {
  Itinerary,
  ItineraryActivity,
  ItineraryCityTransition,
  ItineraryDay,
  ItineraryTravelMode,
  ItineraryTravelSegment,
  TransitStep,
} from "@/types/itinerary";
import type { Location, LocationOperatingHours, LocationOperatingPeriod, Weekday } from "@/types/location";
import type { CityId } from "@/types/trip";
import { travelMinutes } from "./travelTime";
import { getCategoryDefaultDuration } from "./durationExtractor";
import { logger } from "./logger";

import { requestRoute } from "./routing";
import { toItineraryMode } from "./routing/types";
import type { RoutingResult } from "./routing/types";
import { haversineDistance, estimateHeuristicRoute } from "./routing/heuristic";
import { parseTimeToMinutes as parseTime } from "@/lib/utils/timeUtils";
import {
  TRANSIT_DISTANCE_THRESHOLD_KM,
  SHORT_DISTANCE_TRAIN_THRESHOLD_MIN,
  LONG_DISTANCE_TRAIN_THRESHOLD_MIN,
  MAX_INTER_STOP_WALK_FALLBACK_MIN,
} from "@/lib/constants/planning";
import { LAST_TRAIN_TIMES } from "@/lib/constants/lastTrainTimes";
import { computeDayPace } from "@/lib/itinerary/energyBudget";

type PlannerOptions = {
  defaultDayStart?: string;
  defaultDayEnd?: string;
  defaultVisitMinutes?: number;
  transitionBufferMinutes?: number;
};

const DEFAULT_OPTIONS: Required<PlannerOptions> = {
  defaultDayStart: "09:00",
  defaultDayEnd: "21:00",
  defaultVisitMinutes: 90, // Matches DEFAULT_DURATION in durationExtractor.ts
  transitionBufferMinutes: 10,
};

type Coordinates = {
  lat: number;
  lng: number;
} | null;

const MINUTES_IN_DAY = 24 * 60;

/** @internal Exported for testing */
export function formatTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  const hours = Math.floor(normalized / 60);
  const minutes = Math.round(normalized % 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

/**
 * Re-derive `timeOfDay` from a fresh scheduled arrival in minutes-since-midnight.
 * Necessary because the field is set at generation and would otherwise stay
 * stale after a re-plan, mis-bucketing activities for downstream consumers
 * (meal slot positions, lifestyle/timing detectors, route grouping).
 */
function inferTimeOfDay(
  arrivalMinutes: number,
): "morning" | "afternoon" | "evening" {
  if (arrivalMinutes < 12 * 60) return "morning";
  if (arrivalMinutes < 18 * 60) return "afternoon";
  return "evening";
}

/**
 * Returns true when an activity is a user-authored custom stop with no resolvable address.
 * These activities should advance the cursor by durationMin but skip routing and operating-window evaluation.
 */
function isAddresslessCustom(
  activity: Extract<ItineraryActivity, { kind: "place" }>,
): boolean {
  return activity.isCustom === true && !activity.coordinates && !activity.locationId;
}

function lookupCoordinates(activity: Extract<ItineraryActivity, { kind: "place" }>, location: Location | null): Coordinates {
  // First check if activity has embedded coordinates (entry points, external places)
  if (activity.coordinates) {
    return activity.coordinates;
  }
  if (location?.coordinates) {
    return location.coordinates;
  }
  if (activity.locationId) {
    const coordinates = getCoordinatesForLocationId(activity.locationId);
    if (coordinates) {
      return coordinates;
    }
  }
  const byName = getCoordinatesForName(activity.title);
  if (byName) {
    return byName;
  }
  if (location?.name) {
    return getCoordinatesForName(location.name);
  }
  return null;
}

/** @internal Exported for testing */
export function parseEstimatedDuration(text?: string | null): number | null {
  if (!text) {
    return null;
  }
  // Bare integer (minutes) — most common format after normalization
  const trimmed = text.trim();
  const asInt = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(asInt) && String(asInt) === trimmed && asInt > 0) {
    return asInt;
  }
  // Legacy text formats ("2 hours", "90 min", "1.5 hr 30 min")
  const hoursMatch = text.match(/([\d.]+)\s*(hour|hr)/i);
  const minutesMatch = text.match(/(\d+)\s*min/i);
  let totalMinutes = 0;
  if (hoursMatch && hoursMatch[1]) {
    totalMinutes += Number.parseFloat(hoursMatch[1]) * 60;
  }
  if (minutesMatch && minutesMatch[1]) {
    totalMinutes += Number.parseInt(minutesMatch[1], 10);
  }
  if (totalMinutes === 0) {
    return null;
  }
  return Math.round(totalMinutes);
}

async function determineVisitDuration(
  activity: Extract<ItineraryActivity, { kind: "place" }>,
  location: Location | null,
  options: Required<PlannerOptions>,
): Promise<number> {
  // 1. Prefer explicit activity duration
  if (activity.durationMin) {
    return activity.durationMin;
  }

  // 2. Prefer structured recommendation from location data
  if (location?.recommendedVisit?.typicalMinutes) {
    return location.recommendedVisit.typicalMinutes;
  }
  if (location?.recommendedVisit?.minMinutes) {
    return location.recommendedVisit.minMinutes;
  }

  // 3. Parse estimatedDuration string from database (pre-enriched) or activity notes
  const parsed = parseEstimatedDuration(location?.estimatedDuration ?? activity.notes);
  if (parsed) {
    logger.debug("Using estimated duration from database", {
      locationId: location?.id,
      locationName: location?.name,
      duration: parsed,
    });
    return parsed;
  }

  // 4. Use category-based default if available
  if (location?.category) {
    return getCategoryDefaultDuration(location.category);
  }

  // 5. Fall back to options default (90 minutes)
  return options.defaultVisitMinutes;
}

/** @internal Exported for testing */
export function getOperatingPeriodForDay(hours: LocationOperatingHours | undefined, weekday?: Weekday): LocationOperatingPeriod | null {
  if (!hours || !weekday || !Array.isArray(hours.periods)) {
    return null;
  }
  return hours.periods.find((period) => period.day === weekday) ?? null;
}

/** @internal Exported for testing */
export function evaluateOperatingWindow(
  period: LocationOperatingPeriod | null,
  arrivalMinutes: number,
  durationMinutes: number,
): {
  adjustedArrival: number;
  adjustedDeparture: number;
  effectiveVisitMinutes: number;
  arrivalBuffer?: number;
  departureBuffer?: number;
  status: "scheduled" | "tentative" | "out-of-hours" | "closed";
  window?: {
    opensAt: string;
    closesAt: string;
    isOvernight?: boolean;
    note?: string;
    status: "within" | "outside" | "unknown";
  };
} {
  if (!period) {
    return {
      adjustedArrival: arrivalMinutes,
      adjustedDeparture: arrivalMinutes + durationMinutes,
      effectiveVisitMinutes: durationMinutes,
      status: "tentative",
      window: undefined,
    };
  }

  const openMinutes = parseTime(period.open) ?? 0;
  const closeMinutesRaw = parseTime(period.close) ?? MINUTES_IN_DAY;
  const closeMinutes = period.isOvernight ? closeMinutesRaw + MINUTES_IN_DAY : closeMinutesRaw;

  let adjustedArrival = arrivalMinutes;
  let adjustedDeparture = arrivalMinutes + durationMinutes;
  let arrivalBuffer: number | undefined;
  let departureBuffer: number | undefined;
  let scheduleStatus: "scheduled" | "tentative" | "out-of-hours" | "closed" = "scheduled";
  let windowStatus: "within" | "outside" | "unknown" = "within";

  if (adjustedArrival < openMinutes) {
    arrivalBuffer = openMinutes - adjustedArrival;
    adjustedArrival = openMinutes;
    adjustedDeparture = adjustedArrival + durationMinutes;
  }

  // Arriving at or after closing — location is closed (not visitable)
  if (adjustedArrival >= closeMinutes) {
    scheduleStatus = "closed";
    windowStatus = "outside";
  } else if (adjustedDeparture > closeMinutes) {
    departureBuffer = adjustedDeparture - closeMinutes;
    adjustedDeparture = closeMinutes;
    scheduleStatus = "out-of-hours";
    windowStatus = "outside";
  }

  const effectiveVisitMinutes = Math.max(0, adjustedDeparture - adjustedArrival);

  return {
    adjustedArrival,
    adjustedDeparture,
    effectiveVisitMinutes,
    arrivalBuffer,
    departureBuffer,
    status: scheduleStatus,
    window: {
      opensAt: period.open,
      closesAt: period.close,
      isOvernight: period.isOvernight,
      status: windowStatus,
    },
  };
}

/**
 * Create a city transition segment between two days
 */
function createCityTransition(
  fromCityId: CityId,
  toCityId: CityId,
  previousDay: ItineraryDay,
  _currentDay: ItineraryDay,
): ItineraryCityTransition | undefined {
  // Get travel time between cities
  const travelTime = travelMinutes(fromCityId, toCityId);
  if (travelTime === undefined) {
    return undefined;
  }

  // Determine travel mode based on distance/time
  let mode: ItineraryTravelMode = "transit";
  if (travelTime < SHORT_DISTANCE_TRAIN_THRESHOLD_MIN) {
    mode = "train"; // Short distance, likely train
  } else if (travelTime > LONG_DISTANCE_TRAIN_THRESHOLD_MIN) {
    mode = "train"; // Long distance, likely shinkansen
  }

  // Use end of previous day or start of current day for departure
  const previousDayEnd = previousDay.bounds?.endTime ?? "21:00";
  const currentDayStart = _currentDay.bounds?.startTime ?? "09:00";
  void currentDayStart; // Intentionally unused - kept for future use

  // For inter-city travel, prefer traveling at end of previous day or start of current day
  // Use end of previous day as departure time
  const departureTime = previousDayEnd;
  const arrivalMinutes = parseTime(departureTime) ?? 0;
  const arrivalTimeMinutes = arrivalMinutes + travelTime;
  const arrivalTime = formatTime(arrivalTimeMinutes);

  return {
    fromCityId,
    toCityId,
    mode,
    durationMinutes: travelTime,
    departureTime,
    arrivalTime,
    notes: `Traveling from ${fromCityId} to ${toCityId}`,
  };
}

function mergePathSegments(paths: Array<ItineraryTravelSegment["path"] | undefined>): ItineraryTravelSegment["path"] {
  const merged: NonNullable<ItineraryTravelSegment["path"]> = [];

  paths.forEach((path) => {
    if (!path || path.length === 0) {
      return;
    }

    path.forEach((point, index) => {
      if (!point) return;
      if (merged.length > 0) {
        const last = merged[merged.length - 1];
        if (last && last.lat === point.lat && last.lng === point.lng && index === 0) {
          return;
        }
      }
      merged.push({ lat: point.lat, lng: point.lng });
    });
  });

  return merged.length > 0 ? merged : undefined;
}

/**
 * Extracts structured transit steps from a routing result.
 * Returns undefined if no structured step data is available.
 */
function buildTransitSteps(route: RoutingResult): TransitStep[] | undefined {
  const steps: TransitStep[] = [];

  for (const leg of route.legs) {
    if (!leg.steps) continue;
    for (const step of leg.steps) {
      const durationMin = step.durationSeconds
        ? Math.max(1, Math.round(step.durationSeconds / 60))
        : undefined;

      if (step.stepMode === "walk") {
        steps.push({
          type: "walk",
          walkMinutes: durationMin,
          walkInstruction: step.instruction,
        });
      } else if (step.stepMode === "transit" && step.transitDetails) {
        const td = step.transitDetails;
        steps.push({
          type: "transit",
          lineName: td.lineName,
          lineNameRomaji: td.lineNameRomaji,
          lineShortName: td.lineShortName,
          vehicleType: td.vehicleType,
          departureStop: td.departureStop,
          arrivalStop: td.arrivalStop,
          headsign: td.headsign,
          numStops: td.numStops,
          durationMinutes: durationMin,
          lineColor: td.lineColor,
          trainType: td.trainType,
          carPosition: td.carPosition,
          departureGateway: td.departureGateway,
          arrivalGateway: td.arrivalGateway,
          fareYen: td.fareYen,
        });
      }
    }
  }

  return steps.length > 0 ? steps : undefined;
}

function buildTravelSegment(
  mode: ItineraryTravelMode,
  departureMinutes: number,
  durationSeconds: number,
  distanceMeters: number,
  path?: ItineraryTravelSegment["path"],
  instructions?: string[],
  transitSteps?: ItineraryTravelSegment["transitSteps"],
): ItineraryTravelSegment {
  const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
  const arrivalMinutes = departureMinutes + durationMinutes;
  return {
    mode,
    durationMinutes,
    distanceMeters,
    departureTime: formatTime(departureMinutes),
    arrivalTime: formatTime(arrivalMinutes),
    instructions,
    path,
    transitSteps,
  };
}

export async function planItinerary(
  itinerary: Itinerary,
  options: PlannerOptions = {},
  dayEntryPoints?: Record<string, { startPoint?: { coordinates: { lat: number; lng: number } }; endPoint?: { coordinates: { lat: number; lng: number } } }>,
): Promise<Itinerary> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  // Plan all days in parallel (each day's routing is independent)
  const rawPlannedDays = await Promise.all(
    itinerary.days.map((day) => {
      if (!day) return undefined;
      const entryPoints = dayEntryPoints?.[day.id];
      return planItineraryDay(
        day,
        itinerary,
        mergedOptions,
        entryPoints?.startPoint,
        entryPoints?.endPoint,
      );
    }),
  );

  // Add city transitions sequentially (static lookups, no API calls)
  const plannedDays: ItineraryDay[] = [];
  for (const current of rawPlannedDays) {
    if (!current) continue;
    const previous = plannedDays[plannedDays.length - 1];
    if (previous?.cityId && current.cityId && previous.cityId !== current.cityId) {
      const transition = createCityTransition(
        previous.cityId,
        current.cityId,
        previous,
        current,
      );
      if (transition) {
        current.cityTransition = transition;
      }
    }
    plannedDays.push(current);
  }

  // Compute energy pace for each day
  for (const day of plannedDays) {
    day.paceLabel = computeDayPace(day);
  }

  return {
    ...itinerary,
    days: plannedDays,
  };
}

async function planItineraryDay(
  day: ItineraryDay,
  itinerary: Itinerary,
  options: Required<PlannerOptions>,
  startPoint?: { coordinates: { lat: number; lng: number } },
  endPoint?: { coordinates: { lat: number; lng: number } },
): Promise<ItineraryDay> {
  // Resolve timezone using fallback hierarchy (day > itinerary > Japan default)
  const dayTimezone = resolveTimezone({
    dayTimezone: day.timezone,
    itineraryTimezone: itinerary.timezone,
  });
  const startMinutes =
    parseTime(day.bounds?.startTime) ?? parseTime(options.defaultDayStart) ?? parseTime("09:00") ?? 540;
  const endMinutes =
    parseTime(day.bounds?.endTime) ?? parseTime(options.defaultDayEnd) ?? parseTime("21:00") ?? 1260;

  // Pre-fetch all locations at once for efficiency
  const placeActivities = day.activities.filter(
    (a): a is Extract<ItineraryActivity, { kind: "place" }> => a.kind === "place",
  );
  const locationsMap = await findLocationsForActivities(placeActivities);

  // Pre-compute metadata for all place activities
  const metaByActivityId = new Map<
    string,
    { location: Location | null; coordinates: Coordinates; visitDuration: number }
  >();
  await Promise.all(
    placeActivities.map(async (activity) => {
      const location = locationsMap.get(activity.id) ?? null;
      const coordinates = lookupCoordinates(activity, location);
      const visitDuration = await determineVisitDuration(activity, location, options);
      metaByActivityId.set(activity.id, { location, coordinates, visitDuration });
    }),
  );

  // Build routing pairs between consecutive place activities
  const routingPairs: Array<{
    origin: { lat: number; lng: number };
    destination: { lat: number; lng: number };
    activityId: string;
    explicitMode: ItineraryTravelMode | null;
    /** True when one or more preceding activities were addressless-custom (so origin is "last known location") */
    skippedOverCustom?: boolean;
  }> = [];
  // If the first place activity is an anchor (airport), it IS the start point —
  // don't route from startPoint to anchor (would be hotel→airport, wrong direction)
  const firstPlace = placeActivities[0];
  let prevCoords: Coordinates =
    firstPlace?.isAnchor ? null
    : startPoint ? { lat: startPoint.coordinates.lat, lng: startPoint.coordinates.lng }
    : null;
  // Tracks whether any addressless-custom activity was skipped since the last coordinate stop
  let pendingSkippedOverCustom = false;

  // ── Day 1 airport→hotel transit pair ──
  // When the first place activity is an arrival anchor AND the day has a
  // startPoint set (a hotel — `clearedStart` already nulls this out upstream
  // in `resolveEffectiveDayEntryPoints`), compute the airport→hotel leg as a
  // real travel segment. Without this, the planner silently jumps `prevCoords`
  // from the anchor to the hotel without consuming the day clock or rendering
  // a map line.
  //
  // We pre-compute the route here (alongside the regular pairs) so it benefits
  // from the same Phase 1 + Phase 2 parallelism. The result is keyed by a
  // synthetic id (`<anchorId>::to-hotel`) and looked up only inside the anchor
  // branch of the sequential assembly.
  // Minimum distance (m) before we treat startPoint as a real second location.
  // When startPoint is set to the airport itself (e.g. Priority 3 fallback in
  // resolveEffectiveDayEntryPoints when no accommodation is configured), the
  // synthetic pair would be airport→airport — meaningless. ~500m comfortably
  // skips that case while still firing for any nearby airport hotel.
  const ARRIVAL_TO_HOTEL_MIN_DISTANCE_M = 500;

  let arrivalToHotelKey: string | null = null;
  if (firstPlace?.isAnchor && firstPlace.id.startsWith("anchor-arrival") && startPoint) {
    // Resolve the anchor's coordinates the same way as any other place. Anchors
    // typically have `coordinates` set on the activity itself (see
    // itineraryEngine.ts), but we respect the same fallback chain to be safe.
    const anchorMeta = metaByActivityId.get(firstPlace.id);
    const anchorCoords = anchorMeta?.coordinates ?? null;
    if (anchorCoords) {
      const hotelCoords = { lat: startPoint.coordinates.lat, lng: startPoint.coordinates.lng };
      const distanceM = haversineDistance(anchorCoords, hotelCoords);
      if (distanceM >= ARRIVAL_TO_HOTEL_MIN_DISTANCE_M) {
        arrivalToHotelKey = `${firstPlace.id}::to-hotel`;
        routingPairs.push({
          origin: anchorCoords,
          destination: hotelCoords,
          activityId: arrivalToHotelKey,
          explicitMode: null,
        });
      }
    }
  }

  for (const activity of placeActivities) {
    const meta = metaByActivityId.get(activity.id);
    const coordinates = meta?.coordinates ?? null;

    // Addressless custom stops: skip routing entirely; don't advance prevCoords
    if (isAddresslessCustom(activity)) {
      pendingSkippedOverCustom = true;
      continue;
    }

    if (prevCoords && coordinates) {
      const hasExplicit =
        activity.travelFromPrevious?.mode && activity.travelFromPrevious.mode !== "walk";
      routingPairs.push({
        origin: prevCoords,
        destination: coordinates,
        activityId: activity.id,
        explicitMode: hasExplicit ? activity.travelFromPrevious?.mode ?? null : null,
        skippedOverCustom: pendingSkippedOverCustom || undefined,
      });
    }
    pendingSkippedOverCustom = false;
    // After arrival anchor with hotel set: route subsequent activities from hotel (not airport)
    // User goes airport → hotel (drop luggage) → first real activity
    if (activity.isAnchor && startPoint && activity.id.startsWith("anchor-arrival")) {
      prevCoords = { lat: startPoint.coordinates.lat, lng: startPoint.coordinates.lng };
    } else {
      prevCoords = coordinates;
    }
  }

  // --- Phase 1: Fetch walk routes + explicit-mode routes in parallel ---
  // For very short distances (< 300m), skip the API call and use a heuristic
  // estimate. At walking speed, 300m is ~4 minutes -- the API would return
  // essentially the same result with minor street-routing differences.
  const SHORT_WALK_THRESHOLD_M = 300;
  const phase1Results = await Promise.all(
    routingPairs.map((pair) => {
      const mode = pair.explicitMode ?? "walk";
      if (mode === "walk") {
        const straightLineM = haversineDistance(pair.origin, pair.destination);
        if (straightLineM < SHORT_WALK_THRESHOLD_M) {
          return estimateHeuristicRoute({
            origin: pair.origin,
            destination: pair.destination,
            mode: "walk",
          });
        }
      }
      return requestRoute({
        origin: pair.origin,
        destination: pair.destination,
        mode,
        departureTime: formatTime(startMinutes),
        timezone: dayTimezone,
      });
    }),
  );

  // --- Phase 2: Fetch transit routes for walk pairs with distance >= 1km ---
  const transitNeeded: { pairIndex: number; departureTime: string }[] = [];
  let estimatedCursor = startMinutes;

  for (let i = 0; i < routingPairs.length; i++) {
    const pair = routingPairs[i];
    const walkResult = phase1Results[i];
    if (!pair || !walkResult) continue;

    if (!pair.explicitMode) {
      const distanceKm = (walkResult.distanceMeters ?? 0) / 1000;
      if (distanceKm >= TRANSIT_DISTANCE_THRESHOLD_KM) {
        transitNeeded.push({
          pairIndex: i,
          departureTime: formatTime(estimatedCursor),
        });
      }
    }
    estimatedCursor += Math.max(1, Math.round(walkResult.durationSeconds / 60));
    const meta = metaByActivityId.get(pair.activityId);
    if (meta) {
      estimatedCursor += meta.visitDuration + options.transitionBufferMinutes;
    }
  }

  const phase2Results =
    transitNeeded.length > 0
      ? await Promise.all(
          transitNeeded.map(({ pairIndex, departureTime }) => {
            const rp = routingPairs[pairIndex]!;
            return requestRoute({
              origin: rp.origin,
              destination: rp.destination,
              mode: "transit",
              departureTime,
              timezone: dayTimezone,
            });
          }),
        )
      : [];

  // Build transit result lookup
  const transitResultMap = new Map<number, Awaited<ReturnType<typeof requestRoute>>>();
  transitNeeded.forEach(({ pairIndex }, i) => {
    const result = phase2Results[i];
    if (result) transitResultMap.set(pairIndex, result);
  });

  // Resolve final route for each pair
  const resolvedRouteByActivityId = new Map<
    string,
    {
      route: Awaited<ReturnType<typeof requestRoute>>;
      travelMode: ItineraryTravelMode;
      skippedOverCustom?: boolean;
      isEstimated?: boolean;
    }
  >();

  for (let i = 0; i < routingPairs.length; i++) {
    const pair = routingPairs[i];
    const phase1Result = phase1Results[i];
    if (!pair || !phase1Result) continue;

    const skippedOverCustom = pair.skippedOverCustom;

    if (pair.explicitMode) {
      resolvedRouteByActivityId.set(pair.activityId, {
        route: phase1Result,
        travelMode: toItineraryMode(phase1Result.mode),
        skippedOverCustom,
      });
    } else {
      const distanceKm = (phase1Result.distanceMeters ?? 0) / 1000;
      if (distanceKm >= TRANSIT_DISTANCE_THRESHOLD_KM) {
        const transitResult = transitResultMap.get(i);
        const hasTransitSteps = transitResult?.legs.some((leg) =>
          leg.steps?.some((step) => step.stepMode === "transit"),
        );
        if (transitResult && transitResult.durationSeconds > 0 && hasTransitSteps) {
          resolvedRouteByActivityId.set(pair.activityId, {
            route: transitResult,
            travelMode: "train",
            skippedOverCustom,
          });
        } else {
          // Walk fallback: both providers failed to return real transit. The
          // walk leg over a transit-distance pair is often unusable (e.g.
          // 142-min walks for ~10km Hiroshima waterfront → dinner pairs that
          // had no rail/bus answer). Cap inter-stop fallback walks: if the
          // walk would render longer than MAX_INTER_STOP_WALK_FALLBACK_MIN,
          // swap in a heuristic transit estimate so the cursor advances by a
          // defensible amount and the UI shows "X min train (est.)" instead
          // of an unreasonable walk. Genuine 30–45 min walks still render as
          // walk; only the unusable long-fallback case gets rescued.
          const walkDurationMin = Math.max(1, Math.round(phase1Result.durationSeconds / 60));
          if (walkDurationMin > MAX_INTER_STOP_WALK_FALLBACK_MIN) {
            const heuristicTransit = estimateHeuristicRoute({
              origin: pair.origin,
              destination: pair.destination,
              mode: "transit",
            });
            resolvedRouteByActivityId.set(pair.activityId, {
              route: heuristicTransit,
              travelMode: "train",
              skippedOverCustom,
              isEstimated: true,
            });
            logger.warn("Walk fallback exceeded inter-stop ceiling; using heuristic transit estimate", {
              distanceKm,
              walkDurationMin,
              heuristicMin: Math.round(heuristicTransit.durationSeconds / 60),
            });
          } else {
            resolvedRouteByActivityId.set(pair.activityId, {
              route: phase1Result,
              travelMode: "walk",
              skippedOverCustom,
            });
            if (transitResult && !hasTransitSteps) {
              logger.warn("NAVITIME returned walk-only for transit request, using walk", { distanceKm });
            } else {
              logger.warn("No train route found for distance >= 1km, using walk", { distanceKm });
            }
          }
        }
      } else {
        resolvedRouteByActivityId.set(pair.activityId, {
          route: phase1Result,
          travelMode: "walk",
          skippedOverCustom,
        });
      }
    }
  }

  // --- Sequential assembly using pre-fetched routes (no more API calls) ---
  let cursorMinutes = startMinutes;
  let lastPlaceIndex: number | null = null;
  // Tracks the index of the most recent place activity that has resolvable coordinates.
  // Addressless custom stops do NOT update this — so the next coordinate stop can route
  // from the last known location, skipping over custom stops.
  let lastCoordinateIndex: number | null = null;
  const plannedActivities: ItineraryActivity[] = [];

  for (const activity of day.activities) {
    if (activity.kind !== "place") {
      const plannedNote: ItineraryActivity = {
        ...activity,
        startTime: activity.startTime ?? formatTime(cursorMinutes),
        endTime: activity.endTime ?? formatTime(cursorMinutes + (activity.notes ? 15 : 5)),
      };
      plannedActivities.push(plannedNote);
      continue;
    }

    const meta = metaByActivityId.get(activity.id)!;

    // --- Addressless custom stop: advance cursor only, no routing or operating-window ---
    if (isAddresslessCustom(activity)) {
      const visitDuration = activity.durationMin ?? options.defaultVisitMinutes;
      // Honor user-pinned start time for reservations
      if (activity.manualStartTime) {
        const parts = activity.manualStartTime.split(":").map(Number);
        const hh = parts[0];
        const mm = parts[1];
        if (hh !== undefined && mm !== undefined && !Number.isNaN(hh) && !Number.isNaN(mm)) {
          const pinnedMinutes = hh * 60 + mm;
          // Only advance cursor; never pull it backward
          cursorMinutes = Math.max(cursorMinutes, pinnedMinutes);
        }
      }
      const plannerActivity: ItineraryActivity = {
        ...activity,
        durationMin: visitDuration,
        // Re-derive timeOfDay so meal-slot/timing detectors see fresh buckets
        // after a reorder (the field is set at generation and would otherwise
        // be stale).
        timeOfDay: inferTimeOfDay(cursorMinutes),
        // Clear stale travel segments — fresh ones (if applicable) are written
        // on the surrounding stops; stale fields would otherwise survive a
        // reorder and bleed prior arrival/departure times into the timeline.
        travelFromPrevious: undefined,
        travelToNext: undefined,
        schedule: {
          arrivalTime: formatTime(cursorMinutes),
          departureTime: formatTime(cursorMinutes + visitDuration),
          status: "scheduled",
        },
      };
      // Advance cursor by duration only. The outer planner's transitionBuffer will be
      // added as part of the next coordinate stop's travel computation (via the pre-fetched
      // routing pairs which already account for the correct origin).
      cursorMinutes += visitDuration + options.transitionBufferMinutes;
      plannedActivities.push(plannerActivity);
      lastPlaceIndex = plannedActivities.length - 1;
      // Do NOT update lastCoordinateIndex — next coordinate stop routes from the last known location
      continue;
    }

    // Pre-check: estimate arrival after travel and verify location is open
    // Skip for anchor activities (airports) — they don't have DB operating hours
    const resolvedForPreCheck = resolvedRouteByActivityId.get(activity.id);
    const estimatedTravelMin = resolvedForPreCheck
      ? Math.max(1, Math.round(resolvedForPreCheck.route.durationSeconds / 60))
      : 0;
    const estimatedArrival = cursorMinutes + estimatedTravelMin;

    if (!activity.isAnchor) {
      // Hours source: custom activity with captured hours → use those; catalog activity → use Location hours;
      // custom activity with no captured hours → undefined (skip operating-window evaluation).
      const hoursSource =
        activity.isCustom && activity.customOperatingHours
          ? activity.customOperatingHours
          : activity.isCustom
            ? undefined
            : meta.location?.operatingHours;
      const preCheckPeriod = getOperatingPeriodForDay(hoursSource, day.weekday);
      const preCheck = evaluateOperatingWindow(preCheckPeriod, estimatedArrival, meta.visitDuration);

      if (preCheck.status === "closed") {
        logger.warn("Skipping activity — location is closed at estimated arrival", {
          activity: activity.title,
          estimatedArrival: formatTime(estimatedArrival),
          closesAt: preCheck.window?.closesAt,
        });
        continue;
      }

      if (preCheck.status === "out-of-hours" && preCheck.effectiveVisitMinutes < 20) {
        logger.warn("Skipping activity — insufficient visit time before closing", {
          activity: activity.title,
          effectiveVisitMinutes: preCheck.effectiveVisitMinutes,
          closesAt: preCheck.window?.closesAt,
        });
        continue;
      }
    }

    // Spread, then clear stale travel segments. Fresh `travelFromPrevious` is
    // written below when a route resolves; fresh `travelToNext` is written on
    // the *previous* activity by the next iteration. After a reorder this
    // matters: an activity that's now first (no incoming route) or last (no
    // outgoing route) would otherwise carry stale times from its prior slot.
    const plannerActivity: ItineraryActivity = {
      ...activity,
      travelFromPrevious: undefined,
      travelToNext: undefined,
    };

    const resolved = resolvedForPreCheck;
    if (resolved) {
      const { route, travelMode } = resolved;
      const travelInstructions = route.legs.flatMap((leg) =>
        (leg.steps ?? [])
          .map((step) => step.instruction)
          .filter((instruction): instruction is string => Boolean(instruction)),
      );
      // Prefer the full route geometry when present; otherwise stitch from legs.
      // Using both double-counts the path since `geometry` already spans all legs.
      const travelPath = route.geometry && route.geometry.length > 0
        ? mergePathSegments([route.geometry])
        : mergePathSegments(route.legs.map((leg) => leg.geometry));

      // Build structured transit steps from routing leg steps
      const transitSteps = buildTransitSteps(route);

      const travelSegment = buildTravelSegment(
        travelMode,
        cursorMinutes,
        route.durationSeconds,
        route.distanceMeters,
        travelPath,
        travelInstructions.length ? travelInstructions : undefined,
        transitSteps,
      );

      // Mark the segment when it originated from a "last known location" (skipped over custom)
      if (resolved.skippedOverCustom) {
        travelSegment.skippedOverCustom = true;
      }

      // Surface heuristic-rescue segments to the UI so users see "(est.)"
      if (resolved.isEstimated) {
        travelSegment.isEstimated = true;
      }

      // Check if evening transit departs after last train
      if (day.cityId && travelSegment.departureTime && cursorMinutes >= 1200) {
        const lastTrainTime = LAST_TRAIN_TIMES[day.cityId];
        if (lastTrainTime) {
          const depMinutes = parseTime(travelSegment.departureTime);
          if (depMinutes !== null && depMinutes > lastTrainTime) {
            travelSegment.lastTrainWarning = true;
          }
        }
      }

      // Check if transit departs during rush hour (morning 7:30–9:30 or evening 17:30–19:00)
      if (
        travelSegment.departureTime &&
        travelMode !== "walk" &&
        travelMode !== "car" &&
        travelMode !== "taxi" &&
        travelMode !== "bicycle"
      ) {
        const depMinutes = parseTime(travelSegment.departureTime);
        if (depMinutes !== null && ((depMinutes >= 450 && depMinutes <= 570) || (depMinutes >= 1050 && depMinutes <= 1140))) {
          travelSegment.rushHourWarning = true;
        }
      }

      // For travelToNext: use lastCoordinateIndex when this segment skipped over custom stops,
      // otherwise use lastPlaceIndex (the immediately preceding stop)
      const prevForTravelToNext = resolved.skippedOverCustom ? lastCoordinateIndex : lastPlaceIndex;
      if (prevForTravelToNext != null) {
        const previousActivity = plannedActivities[prevForTravelToNext] as Extract<ItineraryActivity, { kind: "place" }>;
        // Don't clobber the airport→hotel transit segment we just attached to
        // an arrival anchor. The next stop is hotel→stop1, but that leg is
        // implicit (the hotel dwell/drop-bag gap between segments) and the
        // chapter spine renders the anchor's outgoing segment as the visible
        // transit between the anchor and the next stop.
        const isArrivalAnchorWithTransit =
          previousActivity.isAnchor === true &&
          previousActivity.id.startsWith("anchor-arrival") &&
          previousActivity.travelToNext !== undefined;
        if (!isArrivalAnchorWithTransit) {
          previousActivity.travelToNext = travelSegment;
        }
      }

      plannerActivity.travelFromPrevious = travelSegment;
      cursorMinutes += travelSegment.durationMinutes;
    }

    // Day 1 airport→hotel: attach the pre-computed transit leg as the
    // anchor's `travelToNext` and advance the cursor by its duration. Defined
    // here so both the pre-set-schedule branch (re-plan path) and the
    // regular-flow branch (first-plan path) can call it after the anchor's
    // schedule + cursor are settled. Map line falls out automatically via the
    // existing render layer.
    const attachArrivalToHotelTransit = (): void => {
      if (!arrivalToHotelKey || activity.id !== firstPlace?.id) return;
      const arrivalToHotelResolved = resolvedRouteByActivityId.get(arrivalToHotelKey);
      if (!arrivalToHotelResolved) return;
      const { route, travelMode } = arrivalToHotelResolved;

      // Drop unrealistic walk fallbacks for the synthetic airport→hotel pair.
      //
      // Post-#208 this is narrow-band cleanup: the inter-stop cap
      // (MAX_INTER_STOP_WALK_FALLBACK_MIN = 45 in the resolution loop around
      // line 702) already swaps any walk fallback > 45min to a heuristic
      // transit estimate upstream — including the airport→hotel pair, which
      // shares that loop. So `travelMode === "walk"` only reaches here for
      // routes ≤ 45min. The 31–45min sub-band is the only place this guard
      // can still fire; we drop those rather than render them because a
      // ~31–45min "walk" from an airport synthesized by the heuristic-walk
      // fallback (4.5 km/h × distance) is usually a misclassified transit
      // segment, not a genuine walkable hotel. The guard preserves the
      // conservative "show nothing" UX: dropping the segment falls back to
      // the existing prevCoords→hotel jump in the routing-pair loop, so
      // next-stop routing is unaffected. Genuinely walkable airport hotels
      // (≤30min walk, ~2.5km) still render.
      //
      // Verified 2026-05-10: the existing airport→hotel regression tests all
      // pass with this `if` block bypassed (the cap path catches them first),
      // so this branch is reachable only in the 31–45min sub-band — there is
      // no test fixture exercising that band today. If you're touching this,
      // consider adding one OR consolidating both thresholds into a single
      // per-pair-type table in the resolution loop.
      const segmentDurationMin = Math.max(1, Math.round(route.durationSeconds / 60));
      const MAX_AIRPORT_HOTEL_WALK_MIN = 30;
      if (travelMode === "walk" && segmentDurationMin > MAX_AIRPORT_HOTEL_WALK_MIN) {
        logger.warn("Skipping airport→hotel segment: walk fallback duration unrealistic", {
          activityId: firstPlace.id,
          durationMinutes: segmentDurationMin,
        });
        return;
      }

      const travelInstructions = route.legs.flatMap((leg) =>
        (leg.steps ?? [])
          .map((step) => step.instruction)
          .filter((instruction): instruction is string => Boolean(instruction)),
      );
      const travelPath = route.geometry && route.geometry.length > 0
        ? mergePathSegments([route.geometry])
        : mergePathSegments(route.legs.map((leg) => leg.geometry));
      const transitSteps = buildTransitSteps(route);

      const transitSegment = buildTravelSegment(
        travelMode,
        cursorMinutes,
        route.durationSeconds,
        route.distanceMeters,
        travelPath,
        travelInstructions.length ? travelInstructions : undefined,
        transitSteps,
      );

      // Last-train + rush-hour warnings, mirroring the regular routing path
      // so the same heuristics surface on this leg.
      if (day.cityId && transitSegment.departureTime && cursorMinutes >= 1200) {
        const lastTrainTime = LAST_TRAIN_TIMES[day.cityId];
        if (lastTrainTime) {
          const depMinutes = parseTime(transitSegment.departureTime);
          if (depMinutes !== null && depMinutes > lastTrainTime) {
            transitSegment.lastTrainWarning = true;
          }
        }
      }
      if (
        transitSegment.departureTime &&
        travelMode !== "walk" &&
        travelMode !== "car" &&
        travelMode !== "taxi" &&
        travelMode !== "bicycle"
      ) {
        const depMinutes = parseTime(transitSegment.departureTime);
        if (
          depMinutes !== null &&
          ((depMinutes >= 450 && depMinutes <= 570) ||
            (depMinutes >= 1050 && depMinutes <= 1140))
        ) {
          transitSegment.rushHourWarning = true;
        }
      }

      plannerActivity.travelToNext = transitSegment;
      cursorMinutes += transitSegment.durationMinutes;
    };

    // Preserve pre-set schedule on anchor activities (e.g. departure airport)
    if (activity.isAnchor && activity.schedule?.arrivalTime) {
      plannerActivity.schedule = activity.schedule;
      plannerActivity.durationMin = meta.visitDuration;
      const depMin = parseTime(activity.schedule.departureTime);
      if (depMin !== null) {
        cursorMinutes = depMin + options.transitionBufferMinutes;
      }
      attachArrivalToHotelTransit();

      plannedActivities.push(plannerActivity);
      lastPlaceIndex = plannedActivities.length - 1;
      lastCoordinateIndex = plannedActivities.length - 1;
      continue;
    }

    // Honor user-pinned start time for reservations
    if (activity.manualStartTime) {
      const parts = activity.manualStartTime.split(":").map(Number);
      const hh = parts[0];
      const mm = parts[1];
      if (hh !== undefined && mm !== undefined && !Number.isNaN(hh) && !Number.isNaN(mm)) {
        const pinnedMinutes = hh * 60 + mm;
        // Only advance cursor; never pull it backward
        cursorMinutes = Math.max(cursorMinutes, pinnedMinutes);
      }
    }

    // Hours source: custom activity with captured hours → use those; catalog activity → use Location hours;
    // custom activity with no captured hours → undefined (skip operating-window evaluation).
    const finalHoursSource =
      activity.isCustom && activity.customOperatingHours
        ? activity.customOperatingHours
        : activity.isCustom
          ? undefined
          : meta.location?.operatingHours;
    const operatingPeriod = getOperatingPeriodForDay(finalHoursSource, day.weekday);

    // For custom activities with no captured hours, skip operating-window evaluation entirely
    // and treat arrival as always valid (status "scheduled", no window adjustment).
    const evaluation =
      activity.isCustom && !activity.customOperatingHours
        ? {
            adjustedArrival: cursorMinutes,
            adjustedDeparture: cursorMinutes + meta.visitDuration,
            effectiveVisitMinutes: meta.visitDuration,
            arrivalBuffer: undefined,
            departureBuffer: undefined,
            status: "scheduled" as const,
            window: undefined,
          }
        : evaluateOperatingWindow(operatingPeriod, cursorMinutes, meta.visitDuration);

    plannerActivity.durationMin = meta.visitDuration;

    plannerActivity.schedule = {
      arrivalTime: formatTime(evaluation.adjustedArrival),
      departureTime: formatTime(evaluation.adjustedDeparture),
      arrivalBufferMinutes: evaluation.arrivalBuffer,
      departureBufferMinutes: evaluation.departureBuffer,
      status: evaluation.status,
      operatingWindow: evaluation.window
        ? {
            opensAt: evaluation.window.opensAt,
            closesAt: evaluation.window.closesAt,
            note: finalHoursSource?.notes,
            status: evaluation.window.status,
          }
        : undefined,
    };
    // Re-derive timeOfDay from the fresh schedule. Otherwise the field stays
    // at its generation-time value and mis-buckets the activity for downstream
    // consumers (meal-slot positioning, timing/lifestyle detectors, etc.).
    plannerActivity.timeOfDay = inferTimeOfDay(evaluation.adjustedArrival);

    if (evaluation.window) {
      plannerActivity.operatingWindow = {
        opensAt: evaluation.window.opensAt,
        closesAt: evaluation.window.closesAt,
        status: evaluation.window.status,
        note: finalHoursSource?.notes,
      };
    }

    cursorMinutes = evaluation.adjustedDeparture + options.transitionBufferMinutes;

    // First-plan path for the arrival anchor (no pre-set schedule). The cursor
    // is now at "anchor-processing-done + buffer"; attach the airport→hotel
    // transit and advance the cursor by its duration. The pre-set-schedule
    // branch above handles the re-plan path.
    if (activity.isAnchor) {
      attachArrivalToHotelTransit();
    }

    plannerActivity.notes = plannerActivity.notes ?? meta.location?.recommendedVisit?.summary;

    plannedActivities.push(plannerActivity);

    lastPlaceIndex = plannedActivities.length - 1;
    lastCoordinateIndex = plannedActivities.length - 1;
  }

  // Clamp final cursor to end of day
  if (cursorMinutes > endMinutes) {
    const lastActivity = plannedActivities[lastPlaceIndex ?? plannedActivities.length - 1];
    if (lastActivity && lastActivity.kind === "place" && lastActivity.schedule) {
      lastActivity.schedule.status = "out-of-hours";
      lastActivity.schedule.departureTime = formatTime(endMinutes);
    }
  }

  // Return-to-hotel: add travel segment from last activity back to endPoint (accommodation)
  // Skip when last activity is an anchor (departure airport) — no return trip needed
  if (endPoint && lastPlaceIndex != null) {
    const lastActivity = plannedActivities[lastPlaceIndex];
    if (lastActivity && lastActivity.kind === "place" && !lastActivity.isAnchor) {
      const lastCoords = metaByActivityId.get(lastActivity.id)?.coordinates;
      if (lastCoords) {
        try {
          // Use heuristic estimate for return-to-hotel instead of API calls.
          // This segment is informational only (doesn't affect scheduling).
          // Saves 1-2 NAVITIME calls per day.
          const distanceM = haversineDistance(lastCoords, endPoint.coordinates);
          const distanceKm = distanceM / 1000;
          const returnMode: "walk" | "transit" = distanceKm >= TRANSIT_DISTANCE_THRESHOLD_KM ? "transit" : "walk";
          const finalRoute = estimateHeuristicRoute({
            origin: lastCoords,
            destination: endPoint.coordinates,
            mode: returnMode,
          });
          const finalMode: ItineraryTravelMode = returnMode === "transit" ? "train" : "walk";

          const returnPath = mergePathSegments([
            finalRoute.geometry,
            ...finalRoute.legs.map((leg) => leg.geometry),
          ]);

          const returnTransitSteps = buildTransitSteps(finalRoute);

          const returnSegment = buildTravelSegment(
            finalMode,
            cursorMinutes,
            finalRoute.durationSeconds,
            finalRoute.distanceMeters,
            returnPath,
            undefined,
            returnTransitSteps,
          );

          // Check if return departure is after last train
          const cityId = day.cityId;
          if (cityId && returnSegment.departureTime) {
            const lastTrainTime = LAST_TRAIN_TIMES[cityId];
            if (lastTrainTime) {
              const depMinutes = parseTime(returnSegment.departureTime);
              if (depMinutes !== null && depMinutes > lastTrainTime) {
                returnSegment.lastTrainWarning = true;
              }
            }
          }

          // Check if return transit departs during rush hour
          if (
            returnSegment.departureTime &&
            finalMode !== "walk"
          ) {
            const depMinutes = parseTime(returnSegment.departureTime);
            if (depMinutes !== null && ((depMinutes >= 450 && depMinutes <= 570) || (depMinutes >= 1050 && depMinutes <= 1140))) {
              returnSegment.rushHourWarning = true;
            }
          }

          (lastActivity as Extract<ItineraryActivity, { kind: "place" }>).travelToNext = returnSegment;
        } catch (err) {
          logger.warn("Failed to calculate return-to-hotel route", { error: err });
        }
      }
    }
  }

  return {
    ...day,
    timezone: dayTimezone,
    bounds: {
      ...(day.bounds ?? {}),
      startTime: formatTime(startMinutes),
      endTime: formatTime(endMinutes),
    },
    activities: plannedActivities,
  };
}


