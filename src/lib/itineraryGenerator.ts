import { shouldSuggestDayTrip, getDayTripsFromCity, type DayTripConfig } from "@/data/dayTrips";
import type { Itinerary, ItineraryActivity } from "@/types/itinerary";
import type { Location } from "@/types/location";
import type { CityId, InterestId, TripBuilderData } from "@/types/trip";
import type { TripWeatherContext, WeatherForecast } from "@/types/weather";
import { fetchWeatherForecast } from "./weather/weatherService";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/utils/errorUtils";
import { fetchAllLocations } from "@/lib/locations/locationService";
import { normalizeKey } from "@/lib/utils/stringUtils";
import type { IntentExtractionResult } from "@/types/llmConstraints";
import { vibesToCategoryWeights } from "@/data/vibeFilterMapping";
import { parseLocalDate, parseLocalDateWithOffset, formatLocalDateISO } from "@/lib/utils/dateUtils";

// Import from extracted modules
import { isLocationValidForCity } from "@/lib/geo/validation";
import {
  clusterCityLocations,
  selectZoneForDay,
  getExpandedZoneLocationIds,
  type CityZoneMap,
} from "@/lib/geo/zoneClustering";
import {
  TIME_OF_DAY_SEQUENCE,
  CITY_TRANSITION_MINUTES,
  getAvailableTimeForSlot,
  getTravelTime,
} from "@/lib/scheduling/timeSlots";
import {
  CITY_INFO_BY_KEY,
  expandCitySequenceForDays,
  resolveCitySequence,
} from "@/lib/routing/citySequence";
import { pickLocationForTimeSlot } from "@/lib/selection/locationPicker";
import { applyCanonicalCoverage } from "@/lib/selection/canonicalCoverage";
import { fetchRelationshipLookup, reorderByTransitLine } from "@/lib/itinerary/relationshipBonus";
import { formatRecommendationReason } from "@/lib/scoring/reasonFormatter";
import { detectPlanningWarnings } from "@/lib/planning/tripWarnings";
import { calculateDistance } from "@/lib/utils/geoUtils";

// Import from generation sub-modules
import {
  DEFAULT_TOTAL_DAYS,
  isFoodCategory,
  inferMealTypeFromTimeSlot,
  pickTimeSlotForSaved,
  resolveInterestSequence,
  buildTags,
  buildDayTitle,
  capitalize,
  getLocationDurationMinutes,
} from "@/lib/generation/helpers";
import { buildLocationMaps } from "@/lib/generation/locationFetcher";
import { resolveMustIncludeFestivals, type ResolvedFestivalNote } from "@/lib/generation/festivalResolver";


/**
 * Options for generating an itinerary
 */
export type GenerateItineraryOptions = {
  /**
   * Optional locations array for testing or when locations are pre-fetched.
   * When provided, skips database fetch.
   */
  locations?: Location[];
  /**
   * Location IDs that the user has saved from the Places page.
   * These locations will be prioritized and included in the generated itinerary.
   */
  savedIds?: string[];
  /**
   * Community ratings map (locationId → avg rating 1-5) for scoring blend.
   */
  communityRatings?: Map<string, number>;
  /**
   * LLM-extracted intent constraints from Pass 1.
   * Provides pinned locations, excluded categories, category weights, pacing hints.
   */
  intentConstraints?: IntentExtractionResult;
  /**
   * Persona id for the post-scoring canonical-coverage layer (Direction 4).
   * When set + matched against `locations.canonical_for_personas`, swaps in
   * editor-curated must-includes for the lowest-priority picks. Currently
   * passed only by the simulation harness; production runtime leaves this
   * undefined (no force-include fires).
   */
  personaId?: string;
  /**
   * Per-city force-include cap for the canonical-coverage layer. Defaults
   * apply per persona — see `DEFAULT_PER_CITY_CAP_BY_PERSONA` below.
   */
  canonicalCoverageCap?: number;
};

/**
 * UI/UX ceiling on force-includes per city. First-timer brand-promise needs
 * 3-5 canonical icons per major city; honeymooner medium; repeat-traveler
 * disabled by default (their algorithm output is already editorially sound).
 * Family persona deferred. Unrecognized persona = 0 = no force-include.
 */
const DEFAULT_PER_CITY_CAP_BY_PERSONA: Record<string, number> = {
  "first-timer": 5,
  honeymooner: 3,
  repeat: 0,
  family: 0,
};

function resolveTotalDays(data: TripBuilderData): number {
  if (typeof data.duration === "number" && data.duration > 0) {
    return data.duration;
  }
  if (Array.isArray(data.cityDays) && data.cityDays.length > 0) {
    const sum = data.cityDays.reduce((acc, n) => acc + (typeof n === "number" && n > 0 ? n : 0), 0);
    if (sum > 0) return sum;
  }
  const { start, end } = data.dates ?? {};
  if (typeof start === "string" && typeof end === "string") {
    // Use the project's local-date parser to stay consistent with
    // dayLabel / weatherService / seasonUtils. new Date("YYYY-MM-DD")
    // parses as UTC midnight, which is fine for diff math but leaks
    // the wrong style into the codebase.
    const s = parseLocalDate(start);
    const e = parseLocalDate(end);
    if (s && e && e >= s) {
      return Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
    }
  }
  return DEFAULT_TOTAL_DAYS;
}

export async function generateItinerary(
  data: TripBuilderData,
  options?: GenerateItineraryOptions,
): Promise<Itinerary> {
  const totalDays = resolveTotalDays(data);

  // Use provided locations or fetch from database
  let allLocations: Location[];
  if (options?.locations && options.locations.length > 0) {
    allLocations = options.locations;
  } else {
    // Fetch locations filtered by selected cities (after ward consolidation)
    allLocations = await fetchAllLocations({ cities: data.cities });

    // Expand fetch to include day trip target cities for small selections
    // (1-2 cities) where location exhaustion is likely on longer trips
    if (data.cities && data.cities.length <= 2) {
      const dayTripCityIds = new Set<string>();
      for (const cityId of data.cities) {
        const trips = getDayTripsFromCity(cityId);
        trips.forEach((t) => dayTripCityIds.add(t.cityId));
      }
      // Remove already-fetched cities
      data.cities.forEach((c) => dayTripCityIds.delete(c));
      if (dayTripCityIds.size > 0) {
        const dayTripLocations = await fetchAllLocations({
          cities: Array.from(dayTripCityIds),
        });
        allLocations = [...allLocations, ...dayTripLocations];
      }
    }
  }
  const { locationsByCityKey, locationsByRegionId } = buildLocationMaps(allLocations);

  // Build content location ID set for editorial scoring boost
  const contentLocationIds = data.contentContext?.locationIds?.length
    ? new Set(data.contentContext.locationIds)
    : undefined;

  // ── Intent constraints (Pass 1 output) ──────────────────────────
  const intent = options?.intentConstraints;
  const excludedCategories = intent?.excludedCategories?.length
    ? new Set(intent.excludedCategories.map(c => c.toLowerCase()))
    : undefined;
  const categoryWeights = intent?.categoryWeights
    ?? (data.vibes?.length ? vibesToCategoryWeights(data.vibes) : undefined);
  const preferredTags = intent?.preferredTags ?? undefined;

  // Resolve pinned locations by fuzzy-matching names against allLocations
  const pinnedLocationMap = new Map<string, { location: Location; preferredDay?: number; preferredTimeSlot?: "morning" | "afternoon" | "evening" }>();
  if (intent?.pinnedLocations?.length) {
    for (const pinned of intent.pinnedLocations) {
      const searchName = pinned.locationName.toLowerCase().trim();
      // Try exact match first, then prefix/contains
      const match = allLocations.find(loc => loc.name.toLowerCase().trim() === searchName)
        ?? allLocations.find(loc => loc.name.toLowerCase().trim().includes(searchName))
        ?? allLocations.find(loc => searchName.includes(loc.name.toLowerCase().trim()));
      if (match) {
        pinnedLocationMap.set(match.id, {
          location: match,
          preferredDay: pinned.preferredDay,
          preferredTimeSlot: pinned.preferredTimeSlot,
        });
        logger.info(`Pinned location resolved: "${pinned.locationName}" → "${match.name}" (${match.id})`);
      } else {
        logger.warn(`Pinned location not found: "${pinned.locationName}"`);
      }
    }
  }

  // Pacing modifier from intent
  const pacingModifier = intent?.pacingHint === "very_relaxed" ? 0.8
    : intent?.pacingHint === "intense" ? 1.15
    : intent?.pacingHint === "active" ? 1.1
    : intent?.pacingHint === "relaxed" ? 0.9
    : 1.0;

  const citySequence = resolveCitySequence(data, locationsByCityKey, allLocations);
  const expandedCitySequence = expandCitySequenceForDays(citySequence, totalDays, data.cityDays);

  // Resolve mustIncludeFestivals (KOK-32). User opted into festivals via the
  // "include this festival" CTA on the warning card. Pin the festival's
  // suggested location if we can match it; otherwise drop a dated note on
  // the festival day. Only consider days where the trip is actually in the
  // festival's city. Region-keyed festivals warn once and skip.
  const dayCityKeys = expandedCitySequence.map((c) => c.key);
  const festivalResolution = data.mustIncludeFestivals?.length
    ? resolveMustIncludeFestivals(
        data.mustIncludeFestivals,
        data.dates.start,
        totalDays,
        data.cities ?? [],
        allLocations,
        dayCityKeys,
      )
    : { pins: [], notes: [] };

  // Group festival notes by day for injection in the day loop.
  const festivalNotesByDay = new Map<number, ResolvedFestivalNote[]>();
  for (const note of festivalResolution.notes) {
    const list = festivalNotesByDay.get(note.dayIndex) ?? [];
    list.push(note);
    festivalNotesByDay.set(note.dayIndex, list);
  }

  // Merge resolved festival pins into pinnedLocationMap so the existing
  // pinned-injection loop handles them. Festival pins always carry the
  // exact dayIndex, which means the loop's preferredDay branch fires.
  for (const pin of festivalResolution.pins) {
    if (!pinnedLocationMap.has(pin.location.id)) {
      pinnedLocationMap.set(pin.location.id, {
        location: pin.location,
        preferredDay: pin.dayIndex,
      });
      logger.info(
        `Festival auto-include: pinned "${pin.location.name}" for "${pin.festivalId}" on day ${pin.dayIndex + 1}`,
      );
    }
  }

  const interestSequence = resolveInterestSequence(data);
  const usedLocations = new Set<string>();
  const usedLocationNames = new Set<string>(); // Track names to prevent same-name duplicates
  const pace = data.style ?? "balanced";
  const travelTime = getTravelTime(pace);

  // Pre-compute trip-level scoring criteria (constant across all days/slots)
  const hasPhotographyVibe = data.vibes?.includes("local_secrets") || undefined;
  const hasLocalSecretsVibe = data.vibes?.includes("local_secrets") || undefined;
  const hasNatureAdventureVibe = data.vibes?.includes("nature_adventure") || undefined;
  const hasHeritageVibe = data.vibes?.includes("history_buff") || data.vibes?.includes("temples_tradition") || undefined;
  const accommodationStyle = data.accommodationStyle;

  // Fetch weather forecasts for all cities and dates
  const weatherContext: TripWeatherContext = {
    forecasts: new Map(),
    cityForecasts: new Map(),
  };

  if (data.dates.start && data.dates.end) {
    // Get unique cities from the expanded sequence
    const uniqueCities = new Set<CityId>();
    for (const cityInfo of expandedCitySequence) {
      const cityId = cityInfo.key as CityId;
      if (cityId) {
        uniqueCities.add(cityId);
      }
    }

    // Fetch weather for all cities in parallel (was sequential — major bottleneck)
    const cityIds = Array.from(uniqueCities);
    const weatherResults = await Promise.allSettled(
      cityIds.map((cityId) => fetchWeatherForecast(cityId, data.dates.start!, data.dates.end!)),
    );
    for (let i = 0; i < cityIds.length; i++) {
      const result = weatherResults[i];
      if (!result || result.status === "rejected") {
        logger.warn(`Failed to fetch weather for ${cityIds[i]}`, {
          error: result ? getErrorMessage(result.reason) : "unknown",
        });
        continue;
      }
      const forecasts = result.value;
      weatherContext.cityForecasts.set(cityIds[i]!, forecasts);
      for (const [date, forecast] of forecasts.entries()) {
        weatherContext.forecasts.set(date, forecast);
      }
    }
  }

  // Pre-compute geographic zones for each city
  const cityZoneMaps = new Map<string, CityZoneMap>();
  for (const [cityKey, cityLocs] of locationsByCityKey) {
    const zoneMap = clusterCityLocations(cityLocs, cityKey);
    if (zoneMap) {
      cityZoneMaps.set(cityKey, zoneMap);
    }
  }
  const usedZonesByCity = new Map<string, Set<string>>();

  const days: Itinerary["days"] = [];

  // Build map of saved locations by city for prioritization
  const savedIdSet = new Set(options?.savedIds ?? []);
  const savedByCity = new Map<string, Location[]>();
  if (savedIdSet.size > 0) {
    for (const loc of allLocations) {
      if (savedIdSet.has(loc.id)) {
        const cityKey = loc.planningCity ?? normalizeKey(loc.city);
        const list = savedByCity.get(cityKey) ?? [];
        list.push(loc);
        savedByCity.set(cityKey, list);
      }
    }
    logger.info("Saved locations to include", {
      totalSaved: savedIdSet.size,
      foundInData: Array.from(savedByCity.entries()).map(([city, locs]) => ({
        city,
        count: locs.length,
        names: locs.map((l) => l.name),
      })),
    });
  }

  // Pre-count total days per city for zone rotation
  const totalDaysPerCity = new Map<string, number>();
  for (const ci of expandedCitySequence) {
    totalDaysPerCity.set(ci.key, (totalDaysPerCity.get(ci.key) ?? 0) + 1);
  }

  // Track consecutive days in each city for day trip suggestions
  const cityDayCounter = new Map<string, number>();
  let lastCityKey = "";

  // Day trip limits: scale with trip length, capped to stay supplementary
  // 5d→1, 7d→2, 10d→3, 14d→4
  const MAX_DAY_TRIPS = Math.min(4, Math.ceil(totalDays / 4));
  let dayTripCount = 0;

  for (let dayIndex = 0; dayIndex < totalDays; dayIndex += 1) {
    let cityInfo = expandedCitySequence[dayIndex];
    if (!cityInfo) {
      throw new Error(`City info not found for day ${dayIndex}`);
    }

    // Update city day counter for day trip logic
    if (cityInfo.key === lastCityKey) {
      cityDayCounter.set(cityInfo.key, (cityDayCounter.get(cityInfo.key) ?? 0) + 1);
    } else {
      cityDayCounter.set(cityInfo.key, 1);
      lastCityKey = cityInfo.key;
    }
    const daysInCurrentCity = cityDayCounter.get(cityInfo.key) ?? 1;

    // Check if we should suggest a day trip (for extended single-city stays)
    let activeDayTrip: DayTripConfig | undefined;
    const baseCityLocations = locationsByCityKey.get(cityInfo.key) ?? [];
    // Exclude food categories from the count — the generator never schedules
    // them as activities, so they inflate the "remaining" count artificially.
    const unusedInBaseCity = baseCityLocations.filter(
      (loc) => !usedLocations.has(loc.id) && !isFoodCategory(loc.category),
    );

    // Suggest day trips for small city selections (1-2 cities) when running low on locations.
    // Capped at MAX_DAY_TRIPS to keep them supplementary — no spacing constraint since
    // the exhaustion trigger already gates when trips fire.
    const isSmallCitySelection = data.cities && data.cities.length <= 2;
    const canScheduleDayTrip = dayTripCount < MAX_DAY_TRIPS;

    if (isSmallCitySelection && canScheduleDayTrip) {
      activeDayTrip = shouldSuggestDayTrip(
        cityInfo.key,
        daysInCurrentCity,
        unusedInBaseCity.length,
        3, // Target activities per day
      );

      // If day trip suggested and the target city has locations, switch to day trip city
      if (activeDayTrip) {
        const dayTripLocations = locationsByCityKey.get(activeDayTrip.cityId) ?? [];
        const unusedInDayTripCity = dayTripLocations.filter((loc) => !usedLocations.has(loc.id));

        if (unusedInDayTripCity.length >= 3) {
          // Switch to day trip city for this day
          const dayTripCityInfo = CITY_INFO_BY_KEY.get(activeDayTrip.cityId);
          if (dayTripCityInfo) {
            cityInfo = dayTripCityInfo;
            dayTripCount++;
            logger.info(`Day ${dayIndex + 1}: Scheduling day trip from ${lastCityKey} to ${activeDayTrip.cityId}`, {
              daysInBaseCity: daysInCurrentCity,
              unusedInBaseCity: unusedInBaseCity.length,
              unusedInDayTripCity: unusedInDayTripCity.length,
              dayTripCount,
            });
          }
        } else {
          // Not enough locations in day trip city, skip
          activeDayTrip = undefined;
        }
      }
    }



    // Get available locations for this city
    const cityLocations = locationsByCityKey.get(cityInfo.key) ?? [];
    const regionLocations = cityInfo.regionId
      ? locationsByRegionId.get(cityInfo.regionId) ?? []
      : [];
    // Use city locations if available, otherwise fall back to region locations
    // Apply comprehensive geographic validation to prevent cross-region recommendations
    const rawAvailableLocations = cityLocations.length > 0 ? cityLocations : regionLocations;

    // Track names seen in this day's available locations to deduplicate database entries
    // (e.g., "Tottori Sand Dunes" may have 7 entries with different IDs but same name)
    const seenNamesInDay = new Set<string>();

    const availableLocations = rawAvailableLocations.filter((loc) => {
      // 0. Hierarchy filter: exclude children of schedulable parents (parent is the itinerary unit)
      //    and exclude container parents (not schedulable, children are the units)
      if (loc.parentId && loc.parentMode !== "container") {
        // This is a child location -- check if its parent is schedulable
        const parent = rawAvailableLocations.find((p) => p.id === loc.parentId);
        if (parent?.parentMode === "schedulable") return false;
      }
      if (loc.parentMode === "container") return false;

      // 1. Pre-filter by usedLocations (ID) to prevent duplicates across days
      if (usedLocations.has(loc.id)) return false;

      // 2. Pre-filter by usedLocationNames (name) to prevent same-name duplicates across days
      const normalizedName = loc.name.toLowerCase().trim();
      if (usedLocationNames.has(normalizedName)) return false;

      // 3. Deduplicate within this day's available locations (handles DB duplicates)
      // This ensures only ONE "Tottori Sand Dunes" entry makes it into availableLocations
      if (seenNamesInDay.has(normalizedName)) return false;
      seenNamesInDay.add(normalizedName);

      // 4. Basic city name matching (use planning_city when available)
      const locationCityKey = loc.planningCity ?? normalizeKey(loc.city);
      if (locationCityKey !== cityInfo.key) {
        return false;
      }
      // 5. Geographic validation: ensure location is actually in the correct region
      // This catches data corruption where city="Osaka" but coordinates are in Okinawa
      if (!isLocationValidForCity(loc, cityInfo.key, cityInfo.regionId)) return false;

      // 6. Exclude food categories - meals are optional and added via smart prompts
      // This allows users to opt into meal recommendations rather than auto-filling them
      if (isFoodCategory(loc.category)) return false;

      // 7. Exclude categories from LLM intent extraction (e.g., "bar" for family trips)
      if (excludedCategories?.has(loc.category?.toLowerCase())) return false;

      // 8. Hard-filter non-accessible locations when mobility assistance is required.
      //    Only excludes on *explicit* negative signal (entrance === false). Unknown
      //    accessibility (null/undefined) stays in — scoring handles those softly.
      if (data.accessibility?.mobility && loc.accessibilityOptions?.wheelchairAccessibleEntrance === false) {
        return false;
      }

      return true;
    });

    // Zone clustering: select a walkable zone for this day and filter candidates
    const cityZoneMap = cityZoneMaps.get(cityInfo.key);
    let zoneFilteredLocations: Location[] | null = null;
    let selectedZoneId: string | null = null;
    let isZoneClustered = false;

    if (cityZoneMap) {
      if (!usedZonesByCity.has(cityInfo.key)) {
        usedZonesByCity.set(cityInfo.key, new Set());
      }
      const usedZones = usedZonesByCity.get(cityInfo.key)!;

      selectedZoneId = selectZoneForDay(
        cityZoneMap,
        daysInCurrentCity - 1,
        totalDaysPerCity.get(cityInfo.key) ?? 1,
        usedZones,
        interestSequence,
        savedIdSet.size > 0 ? savedIdSet : undefined,
      );

      if (selectedZoneId) {
        usedZones.add(selectedZoneId);
        const zoneLocIds = cityZoneMap.zones.get(selectedZoneId)?.locationIds;
        if (zoneLocIds && zoneLocIds.size >= 3) {
          zoneFilteredLocations = availableLocations.filter((loc) => zoneLocIds.has(loc.id));
          // Only apply zone filter if it yields enough candidates
          if (zoneFilteredLocations.length >= 3) {
            isZoneClustered = true;
            logger.info(`Day ${dayIndex + 1} (${cityInfo.key}): Zone ${selectedZoneId} selected — ${zoneFilteredLocations.length} candidates`);
          } else {
            zoneFilteredLocations = null;
          }
        }
      }
    }

    // Fetch cluster + transit-line relationships for this city's locations
    const relationshipLookup = await fetchRelationshipLookup(
      availableLocations.map((loc) => loc.id),
    );

    const dayActivities: Itinerary["days"][number]["activities"] = [];
    const dayCityUsage = new Map<string, number>();

    // Track time used in each slot
    const timeSlotUsage = new Map<typeof TIME_OF_DAY_SEQUENCE[number], number>();
    TIME_OF_DAY_SEQUENCE.forEach((slot) => timeSlotUsage.set(slot, 0));

    // Track interest cycling across the entire day (not per time slot)
    let interestIndex = 0;

    // Track categories and neighborhoods for diversity, and last location for distance
    const dayCategories: string[] = [];
    const dayNeighborhoods: string[] = [];
    let lastLocation: Location | undefined;

    // Add saved locations for this city first (user explicitly saved these)
    const savedForCity = savedByCity.get(cityInfo.key) ?? [];
    for (const favLoc of savedForCity) {
      // Skip if already used
      if (usedLocations.has(favLoc.id)) continue;
      const normalizedName = favLoc.name.toLowerCase().trim();
      if (usedLocationNames.has(normalizedName)) continue;

      const locationDuration = getLocationDurationMinutes(favLoc);
      const isFood = isFoodCategory(favLoc.category);

      // Assign time slot based on category instead of hardcoding morning
      const timeSlot = pickTimeSlotForSaved(favLoc.category, timeSlotUsage);

      // Build activity for saved location
      const activity: Extract<ItineraryActivity, { kind: "place" }> = {
        kind: "place",
        id: `${favLoc.id}-${dayIndex + 1}-fav`,
        title: favLoc.name,
        timeOfDay: timeSlot,
        durationMin: locationDuration,
        locationId: favLoc.id,
        coordinates: favLoc.coordinates,
        neighborhood: favLoc.neighborhood,
        tags: favLoc.category ? [favLoc.category, "saved"] : ["saved"],
        notes: "From your saved places",
        recommendationReason: { primaryReason: "From your saved places" },
        ...(favLoc.description && { description: favLoc.description }),
        ...(isFood && { mealType: inferMealTypeFromTimeSlot(timeSlot) }),
      };

      dayActivities.push(activity);
      usedLocations.add(favLoc.id);
      usedLocationNames.add(normalizedName);

      // Track for diversity
      if (favLoc.category) {
        dayCategories.push(favLoc.category);
      }
      const locNeighborhood = favLoc.neighborhood ?? favLoc.city;
      if (locNeighborhood) {
        dayNeighborhoods.push(locNeighborhood);
      }
      lastLocation = favLoc;

      // Update time slot usage
      timeSlotUsage.set(timeSlot, (timeSlotUsage.get(timeSlot) ?? 0) + locationDuration);

      logger.info(`Day ${dayIndex + 1}: Added saved location "${favLoc.name}"`);
    }

    // Add pinned locations from LLM intent extraction (must-visit places from notes)
    for (const [pinnedId, pinned] of pinnedLocationMap) {
      // Skip if already used or not for this day
      if (usedLocations.has(pinnedId)) continue;
      const normalizedName = pinned.location.name.toLowerCase().trim();
      if (usedLocationNames.has(normalizedName)) continue;

      // If pinned has a preferred day, only add on that day
      if (pinned.preferredDay !== undefined && pinned.preferredDay !== dayIndex) continue;

      // If no preferred day, add on the first day in the pinned location's city
      if (pinned.preferredDay === undefined) {
        const pinnedCityKey = pinned.location.planningCity ?? normalizeKey(pinned.location.city);
        if (pinnedCityKey !== cityInfo.key) continue;
      }

      const locationDuration = getLocationDurationMinutes(pinned.location);
      const timeSlot = pinned.preferredTimeSlot ?? pickTimeSlotForSaved(pinned.location.category, timeSlotUsage);

      const activity: Extract<ItineraryActivity, { kind: "place" }> = {
        kind: "place",
        id: `${pinnedId}-${dayIndex + 1}-pinned`,
        title: pinned.location.name,
        timeOfDay: timeSlot,
        durationMin: locationDuration,
        locationId: pinnedId,
        coordinates: pinned.location.coordinates,
        neighborhood: pinned.location.neighborhood,
        tags: pinned.location.category ? [pinned.location.category, "pinned"] : ["pinned"],
        notes: "From your trip notes",
        recommendationReason: { primaryReason: "Mentioned in your trip notes" },
        ...(pinned.location.description && { description: pinned.location.description }),
      };

      dayActivities.push(activity);
      usedLocations.add(pinnedId);
      usedLocationNames.add(normalizedName);

      if (pinned.location.category) {
        dayCategories.push(pinned.location.category);
      }
      const locNeighborhood = pinned.location.neighborhood ?? pinned.location.city;
      if (locNeighborhood) {
        dayNeighborhoods.push(locNeighborhood);
      }
      lastLocation = pinned.location;
      timeSlotUsage.set(timeSlot, (timeSlotUsage.get(timeSlot) ?? 0) + locationDuration);

      logger.info(`Day ${dayIndex + 1}: Added pinned location "${pinned.location.name}"`);
    }

    // Inject festival fallback notes (KOK-32). When the festival's
    // suggestedActivity didn't resolve to a real Location, drop a dated
    // note-activity on the festival day so the trip still reflects the
    // user's opt-in. Title stays "Note" (literal type constraint); festival
    // name + description + suggestedActivity prose live in the notes body.
    const festivalNotesForDay = festivalNotesByDay.get(dayIndex) ?? [];
    for (const fn of festivalNotesForDay) {
      const noteActivity: Extract<ItineraryActivity, { kind: "note" }> = {
        kind: "note",
        id: `festival-${fn.festivalId}-${dayIndex + 1}`,
        title: "Note",
        timeOfDay: "afternoon",
        notes: `${fn.festivalName}. ${fn.notes}`,
      };
      dayActivities.push(noteActivity);
      logger.info(`Day ${dayIndex + 1}: Added festival note "${fn.festivalName}"`);
    }

    // Track assigned meal types to prevent multiple lunches/dinners per day
    // Only one "full meal" per slot (breakfast, lunch, dinner). Additional food places become "snacks"
    const usedMealTypesForDay = new Set<"breakfast" | "lunch" | "dinner">();

    // Track if we've exhausted all available locations for this day
    let locationsExhausted = false;
    let exhaustionAttempts = 0;
    const maxExhaustionAttempts = 3; // Try 3 different interests before giving up

    // Compute day-level date and weekend flag (constant across all time slots)
    const dayDate = data.dates.start
      ? (() => {
          const d = parseLocalDateWithOffset(data.dates.start, dayIndex);
          return d ? formatLocalDateISO(d) : undefined;
        })()
      : undefined;
    const isWeekend = dayDate
      ? (() => {
          const [yw, mw, dw] = dayDate.split("-").map(Number);
          const dow = (yw && mw && dw) ? new Date(yw, mw - 1, dw).getDay() : undefined;
          return dow === 0 || dow === 6;
        })()
      : undefined;

    // Fill each time slot intelligently
    for (const timeSlot of TIME_OF_DAY_SEQUENCE) {
      let availableMinutes = Math.round(getAvailableTimeForSlot(timeSlot, pace) * pacingModifier);

      // Deduct transition buffer on city-change days (check-out, luggage, settling in)
      // Applied to morning slot only. Skip Day 1 (arrival already has its own adjustments).
      if (
        timeSlot === "morning" &&
        dayIndex > 0 &&
        expandedCitySequence[dayIndex - 1]?.key !== cityInfo.key
      ) {
        availableMinutes = Math.max(60, availableMinutes - CITY_TRANSITION_MINUTES);
      }

      // Adjust for day trip travel time
      if (activeDayTrip) {
        if (timeSlot === "morning") {
          // Deduct outbound travel from morning
          availableMinutes = Math.max(60, availableMinutes - activeDayTrip.travelMinutes);
        } else if (timeSlot === "evening") {
          // Deduct return travel from evening
          availableMinutes = Math.max(60, availableMinutes - activeDayTrip.travelMinutes);
        }
      }

      let remainingTime = availableMinutes;
      let activityIndex = 0;

      // Check for day-specific constraints from LLM intent
      const dayConstraint = intent?.dayConstraints?.find(
        c => c.dayIndex === dayIndex && (!c.timeSlot || c.timeSlot === timeSlot),
      );

      // Ensure at least one activity per time slot
      while (remainingTime > 0 && activityIndex < 10) {
        // Cycle through interests, with day constraint override
        let interest = interestSequence[interestIndex % interestSequence.length];
        if (!interest) {
          break;
        }
        // Day constraint mealType overrides to food interest for the first activity
        if (dayConstraint?.mealType && activityIndex === 0) {
          const mealTimeSlots: Record<string, string> = {
            breakfast: "morning", lunch: "afternoon", dinner: "evening",
          };
          if (!dayConstraint.timeSlot || mealTimeSlots[dayConstraint.mealType] === timeSlot) {
            interest = "food" as InterestId;
          }
        }
        // Day constraint category emphasis overrides the rotation interest
        if (dayConstraint?.categoryEmphasis && activityIndex === 0) {
          // Map category emphasis to an interest (e.g., "restaurant" → "food")
          const emphasisToInterest: Record<string, InterestId> = {
            restaurant: "food", cafe: "food", market: "food",
            shrine: "culture", temple: "culture", museum: "culture", castle: "culture", craft: "craft",
            park: "nature", garden: "nature", nature: "nature",
            bar: "nightlife", entertainment: "nightlife",
            shopping: "shopping",
            onsen: "wellness", wellness: "wellness",
            viewpoint: "photography",
          };
          const mapped = emphasisToInterest[dayConstraint.categoryEmphasis];
          if (mapped) {
            interest = mapped;
          }
        }

        // Get weather forecast for this day and city
        const dayCityId = cityInfo.key as CityId | undefined;
        const dayWeatherForecast: WeatherForecast | undefined = dayDate && dayCityId
          ? weatherContext.cityForecasts.get(dayCityId)?.get(dayDate ?? "")
          : undefined;

        // Pick a location — try zone-filtered first, then expand, then full city
        const pickArgs = [
          interest,
          usedLocations,
          remainingTime,
          activityIndex === 0 ? 0 : travelTime,
          lastLocation?.coordinates,
          dayCategories,
          pace,
          interestSequence,
          data.budget,
          data.accessibility?.mobility ? {
            wheelchairAccessible: true,
            elevatorRequired: false,
          } : undefined,
          dayWeatherForecast,
          data.weatherPreferences,
          timeSlot,
          dayDate,
          data.group,
          dayNeighborhoods,
          usedLocationNames,
          contentLocationIds,
        ] as const;
        const communityRatings = options?.communityRatings;
        const dietaryRestrictions = data.accessibility?.dietary;
        const clusterCtx = relationshipLookup.clusterPairs.size > 0
          ? { clusterPairs: relationshipLookup.clusterPairs, scheduledIds: dayActivities.filter((a) => a.kind === "place" && a.locationId).map((a) => (a as { locationId: string }).locationId) }
          : undefined;

        let locationResult = isZoneClustered && zoneFilteredLocations
          ? pickLocationForTimeSlot(zoneFilteredLocations, ...pickArgs, true, communityRatings, categoryWeights, dietaryRestrictions, hasPhotographyVibe, isWeekend, accommodationStyle, preferredTags, hasLocalSecretsVibe, hasNatureAdventureVibe, hasHeritageVibe, clusterCtx)
          : null;

        // Tier 2: Expand to neighboring zones
        if (!locationResult && isZoneClustered && selectedZoneId && cityZoneMap) {
          const expandedIds = getExpandedZoneLocationIds(cityZoneMap, selectedZoneId);
          const expandedLocs = availableLocations.filter((loc) => expandedIds.has(loc.id));
          if (expandedLocs.length >= 3) {
            locationResult = pickLocationForTimeSlot(expandedLocs, ...pickArgs, true, communityRatings, categoryWeights, dietaryRestrictions, hasPhotographyVibe, isWeekend, accommodationStyle, preferredTags, hasLocalSecretsVibe, hasNatureAdventureVibe, hasHeritageVibe, clusterCtx);
          }
        }

        // Tier 3: Fall back to full city pool (original behavior)
        if (!locationResult) {
          locationResult = pickLocationForTimeSlot(availableLocations, ...pickArgs, false, communityRatings, categoryWeights, dietaryRestrictions, hasPhotographyVibe, isWeekend, accommodationStyle, preferredTags, hasLocalSecretsVibe, hasNatureAdventureVibe, hasHeritageVibe, clusterCtx);
        }

        const location = locationResult && "_scoringReasoning" in locationResult
          ? (locationResult as Location & { _scoringReasoning?: string[]; _scoreBreakdown?: import("./scoring/locationScoring").ScoreBreakdown; _runnerUps?: { name: string; id: string }[] })
          : locationResult;
        const scoringData = location && "_scoringReasoning" in location ? {
          reasoning: location._scoringReasoning,
          breakdown: location._scoreBreakdown,
          runnerUps: (location as { _runnerUps?: { name: string; id: string }[] })._runnerUps,
        } : null;

        if (!location) {
          // If no location fits, check if we've exhausted available locations
          exhaustionAttempts++;
          interestIndex++;

          if (exhaustionAttempts >= maxExhaustionAttempts) {
            // All available locations exhausted - stop adding activities to this slot
            locationsExhausted = true;
            logger.warn(`Day ${dayIndex + 1}: Locations exhausted for ${cityInfo.key}`, {
              timeSlot,
              usedLocationsCount: usedLocations.size,
              availableLocationsCount: availableLocations.length,
              activityIndex,
            });
            break;
          }

          if (interestIndex >= interestSequence.length * 2) {
            // Prevent infinite loop
            break;
          }
          continue;
        }

        // SAFEGUARD: Double-check location isn't already used (should never happen,
        // but prevents duplicates if there's a bug in pickLocationForTimeSlot)
        if (usedLocations.has(location.id)) {
          logger.warn(`Duplicate location ID detected: "${location.name}" (${location.id}) - skipping`);
          interestIndex++;
          continue;
        }

        // Also check for same-name duplicates (different IDs but same restaurant/place name)
        // This prevents recommending multiple branches of the same establishment
        const normalizedName = location.name.toLowerCase().trim();
        if (usedLocationNames.has(normalizedName)) {
          logger.warn(`Duplicate location name detected: "${location.name}" - skipping (different ID but same name)`);
          interestIndex++;
          continue;
        }

        // Reset exhaustion counter on successful selection
        exhaustionAttempts = 0;

        const locationDuration = getLocationDurationMinutes(location);
        const timeNeeded = locationDuration + (activityIndex === 0 ? 0 : travelTime);

        // Check if location fits (with some flexibility)
        if (timeNeeded <= remainingTime * 1.1 || activityIndex === 0) {
          // First activity in slot must fit, others can be slightly over
          if (timeNeeded <= remainingTime * 1.1) {
            const locationKey = location.planningCity ?? normalizeKey(location.city);
            dayCityUsage.set(locationKey, (dayCityUsage.get(locationKey) ?? 0) + 1);
            // Build recommendation reason from scoring data
            const recommendationReason = scoringData?.breakdown
              ? formatRecommendationReason(scoringData.breakdown, location, {
                  timeSlot,
                  alternativesConsidered: scoringData.runnerUps?.map((r) => r.name),
                })
              : undefined;

            // Build activity object with optional meal info for food locations
            // Only assign one full meal per slot (breakfast/lunch/dinner). Additional food places become "snacks"
            const isFood = isFoodCategory(location.category);
            const inferredMealType = isFood ? inferMealTypeFromTimeSlot(timeSlot) : undefined;

            // Check if this meal slot is already taken for this day
            let mealType: "breakfast" | "lunch" | "dinner" | "snack" | undefined;
            let mealNote: string | undefined;

            if (inferredMealType) {
              if (usedMealTypesForDay.has(inferredMealType)) {
                // Meal slot already filled - this becomes a snack/cafe visit
                mealType = "snack";
                mealNote = "Cafe / Snack stop";
              } else {
                // First meal of this type for the day
                mealType = inferredMealType;
                mealNote = `${mealType.charAt(0).toUpperCase() + mealType.slice(1)} spot`;
                usedMealTypesForDay.add(inferredMealType);
              }
            }

            const activity: Extract<ItineraryActivity, { kind: "place" }> = {
              kind: "place",
              id: `${location.id}-${dayIndex + 1}-${timeSlot}-${activityIndex + 1}`,
              title: location.name,
              timeOfDay: timeSlot,
              durationMin: locationDuration,
              locationId: location.id,
              coordinates: location.coordinates,
              neighborhood: location.neighborhood,
              tags: buildTags(interest, location.category),
              recommendationReason,
              ...(location.description && { description: location.description }),
              ...(mealType && { mealType }),
              ...(mealNote && { notes: mealNote }),
            };

            // Tag activities from editorial content
            if (contentLocationIds?.has(location.id)) {
              activity.tags = [...(activity.tags ?? []), "content-pick"];
              if (activity.recommendationReason) {
                activity.recommendationReason.primaryReason = `Featured in "${data.contentContext?.title}"`;
              }
            }

            dayActivities.push(activity);
            usedLocations.add(location.id);
            usedLocationNames.add(normalizedName);
            remainingTime -= timeNeeded;
            timeSlotUsage.set(timeSlot, (timeSlotUsage.get(timeSlot) ?? 0) + timeNeeded);

            // Track category, neighborhood, and location for diversity and distance
            if (location.category) {
              dayCategories.push(location.category);
            }
            // Track neighborhood for geographic diversity (fall back to city if no neighborhood)
            const locationNeighborhood = location.neighborhood ?? location.city;
            if (locationNeighborhood) {
              dayNeighborhoods.push(locationNeighborhood);
            }
            lastLocation = location;
            
            activityIndex++;
            interestIndex++;
          } else {
            // Location doesn't fit, try next interest
            interestIndex++;
            if (interestIndex >= interestSequence.length * 2) {
              break;
            }
          }
        } else {
          // Location doesn't fit, try next interest
          interestIndex++;
          if (interestIndex >= interestSequence.length * 2) {
            break;
          }
        }

        // Stop if we've used most of the available time
        if (remainingTime < availableMinutes * 0.2 && activityIndex > 0) {
          break;
        }
      }

      // If locations exhausted, don't continue to more time slots
      if (locationsExhausted) {
        break;
      }
    }

    // Determine city ID for this day
    const dayCityId = cityInfo.key as CityId | undefined;

    // Generate a stable ID for this day
    // Use a combination of day index and random string for uniqueness
    const randomSuffix = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
    const dayId = `day-${dayIndex + 1}-${randomSuffix}`;
    
    // Build day label - include day trip indicator if applicable
    let dateLabel = buildDayTitle(dayIndex, cityInfo.key);
    if (activeDayTrip) {
      const baseCityLabel = CITY_INFO_BY_KEY.get(lastCityKey)?.label ?? capitalize(lastCityKey);
      dateLabel = `Day ${dayIndex + 1} (Day Trip: ${baseCityLabel} → ${cityInfo.label})`;
    }

    // Compute weekday from trip start date + day index
    const WEEKDAY_NAMES: import("@/types/location").Weekday[] = [
      "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
    ];
    let weekday: import("@/types/location").Weekday | undefined;
    if (data.dates.start) {
      const parts = data.dates.start.split("-");
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      d.setDate(d.getDate() + dayIndex);
      weekday = WEEKDAY_NAMES[d.getDay()];
    } else {
      weekday = "wednesday"; // Mid-week default, most venues open
    }

    // Reorder activities within the day to group transit-line neighbors
    const reorderedActivities = reorderByTransitLine(dayActivities, relationshipLookup.transitLineMap);

    days.push({
      id: dayId,
      dateLabel,
      weekday,
      cityId: dayCityId,
      activities: reorderedActivities,
      // Add metadata about day trip if applicable
      ...(activeDayTrip && {
        isDayTrip: true,
        baseCityId: lastCityKey as CityId,
        dayTripTravelMinutes: activeDayTrip.travelMinutes,
      }),
    });
  }

  // Compute planning warnings at generation time so the itinerary view can
  // re-surface seasonal/holiday/festival context that the user saw in the
  // builder. Persisted on the Itinerary rather than re-derived later to
  // keep the view layer decoupled from TripBuilderData.
  const planningWarnings = detectPlanningWarnings(data);

  // Direction 4: post-scoring canonical coverage. No-op when personaId is
  // undefined (production runtime), the cap is 0 (repeat-traveler default),
  // or no canonical_for_personas matches exist for the trip's cities.
  let finalDays = days;
  if (options?.personaId) {
    const cap = options.canonicalCoverageCap
      ?? DEFAULT_PER_CITY_CAP_BY_PERSONA[options.personaId]
      ?? 0;

    // Step 0 diagnostic for the canonical-coverage transit-awkwardness bug
    // (smoke-test 2026-05-09). Logs per-day pre-swap geographic spread so we
    // can decide whether the symptom is the swap layer (clean pre-swap, split
    // post-swap) or the picker / zone expansion (already-split pre-swap).
    // Same one-line passive-telemetry pattern as PR #201's persona log.
    // No-op when cap is 0 (no swap will fire anyway).
    if (cap > 0) {
      for (let i = 0; i < days.length; i += 1) {
        const day = days[i]!;
        const placeCoords: { lat: number; lng: number }[] = [];
        for (const activity of day.activities) {
          if (activity.kind === "place" && activity.coordinates) {
            placeCoords.push(activity.coordinates);
          }
        }
        let maxPairwiseKm = 0;
        for (let a = 0; a < placeCoords.length; a += 1) {
          for (let b = a + 1; b < placeCoords.length; b += 1) {
            const d = calculateDistance(placeCoords[a]!, placeCoords[b]!);
            if (d > maxPairwiseKm) maxPairwiseKm = d;
          }
        }
        logger.info("[canonical:preswap-spread]", {
          dayIndex: i,
          cityId: day.cityId ?? null,
          activityCount: day.activities.length,
          placeCount: placeCoords.length,
          maxPairwiseKm: Math.round(maxPairwiseKm * 10) / 10,
          personaId: options.personaId,
        });
      }
    }

    const covered = applyCanonicalCoverage({
      itinerary: { days, planningWarnings },
      personaId: options.personaId,
      allLocations,
      perCityCap: cap,
    });
    finalDays = covered.days;
  }

  return { days: finalDays, planningWarnings };
}

