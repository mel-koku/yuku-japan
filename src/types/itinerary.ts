import type { LocationTransitMode } from "./location";
import type { PlanningWarning } from "@/lib/planning/tripWarnings";

export type ActivityKind = "place" | "note";

/**
 * Recommendation reason explaining why a location was selected.
 * 
 * Note: A similar RecommendationReason exists in tripDomain.ts with structured scoring factors.
 * This version is more flexible and used in itinerary editing contexts.
 */
export type RecommendationReason = {
  /**
   * Primary reason for the recommendation
   */
  primaryReason: string;
  /**
   * Breakdown of scoring factors
   */
  factors?: Array<{
    factor: string;
    score: number;
    reasoning: string;
  }>;
  /**
   * Alternative locations that were considered
   */
  alternativesConsidered?: string[];
};

export type ItineraryTime = {
  startTime?: string;
  endTime?: string;
  timezone?: string;
};

export type ItineraryOperatingWindow = {
  opensAt: string;
  closesAt: string;
  note?: string;
  status?: "within" | "outside" | "unknown";
};

export type ItineraryScheduledVisit = {
  /**
   * Planned arrival time in local day timezone (HH:MM).
   */
  arrivalTime: string;
  /**
   * Planned departure time in local day timezone (HH:MM).
   */
  departureTime: string;
  /**
   * Optional buffer (minutes) added before opening or after closing.
   */
  arrivalBufferMinutes?: number;
  departureBufferMinutes?: number;
  /**
   * Operating window this visit was aligned against.
   */
  operatingWindow?: ItineraryOperatingWindow;
  /**
   * Execution confidence for the scheduled time.
   */
  status?: "scheduled" | "tentative" | "out-of-hours" | "closed";
};

export type ItineraryTravelMode = LocationTransitMode | "transit" | "rideshare";

export type TransitStep = {
  type: "walk" | "transit";
  /** Walk duration in minutes */
  walkMinutes?: number;
  /** Walk instruction, e.g. "Walk to Shibuya Station" */
  walkInstruction?: string;
  /** Transit line name, e.g. "JR Yamanote Line" */
  lineName?: string;
  /** Romaji reading of line name, e.g. "Yamanote sen" */
  lineNameRomaji?: string;
  /** Short line name, e.g. "Yamanote" */
  lineShortName?: string;
  /** Vehicle type from Google, e.g. "HEAVY_RAIL", "SUBWAY" */
  vehicleType?: string;
  /** Departure stop name, e.g. "Shibuya" */
  departureStop?: string;
  /** Arrival stop name, e.g. "Harajuku" */
  arrivalStop?: string;
  /** Headsign, e.g. "toward Shinjuku" */
  headsign?: string;
  /** Number of stops */
  numStops?: number;
  /** Duration in minutes for this step */
  durationMinutes?: number;
  /** Line color hex from NAVITIME, e.g. "#FF9500" */
  lineColor?: string;
  /** Train type, e.g. "Rapid", "Local", "Express" */
  trainType?: string;
  /** Which car to board for easy exit, e.g. "Middle/Rear" */
  carPosition?: string;
  /** Station exit/entrance name, e.g. "South Exit", "Exit 6" */
  departureGateway?: string;
  /** Station exit at arrival, e.g. "Exit 6" */
  arrivalGateway?: string;
  /** Fare in yen for this leg */
  fareYen?: number;
};

export type ItineraryTravelSegment = {
  mode: ItineraryTravelMode;
  durationMinutes: number;
  distanceMeters?: number;
  departureTime?: string;
  arrivalTime?: string;
  instructions?: string[];
  notes?: string;
  path?: Array<{ lat: number; lng: number }>;
  /** True if this is a heuristic estimate (not from real routing API) */
  isEstimated?: boolean;
  /** Structured transit steps (walk + transit legs) from Google Directions */
  transitSteps?: TransitStep[];
  /** True if departure time is after the last train for the city */
  lastTrainWarning?: boolean;
  /** True if departure falls within morning (7:30–9:30) or evening (17:30–19:00) rush hour */
  rushHourWarning?: boolean;
  /** True when this segment's origin is a "last known location" because intermediate stops had no address. */
  skippedOverCustom?: boolean;
};

export type ItineraryCityTransition = {
  fromCityId: string;
  toCityId: string;
  mode: ItineraryTravelMode;
  durationMinutes: number;
  distanceMeters?: number;
  departureTime?: string;
  arrivalTime?: string;
  notes?: string;
};

/**
 * A single activity in an itinerary day.
 *
 * This is the **canonical activity type** used throughout the itinerary system —
 * rendering, editing, undo/redo, smart prompts, and persistence.
 *
 * Contrast with `TripActivity` in tripDomain.ts, which is the planning-phase
 * representation used during initial generation (has `location?: Location` and
 * structured scoring factors). Once a trip is generated, activities are stored
 * as `ItineraryActivity`.
 */
export type ItineraryActivity =
  | {
      kind: "place";
      id: string;
      title: string;
      timeOfDay: "morning" | "afternoon" | "evening";
      durationMin?: number;
      neighborhood?: string;
      tags?: string[];
      notes?: string;
      /**
       * Optional reference to a canonical location entry.
       */
      locationId?: string;
      /**
       * Optional embedded coordinates (for entry points or external places).
       */
      coordinates?: { lat: number; lng: number };
      /**
       * Short description of the place (from location data).
       */
      description?: string;
      /**
       * Meal type if this is a meal activity (breakfast, lunch, dinner, snack)
       */
      mealType?: "breakfast" | "lunch" | "dinner" | "snack";
      /**
       * Recommendation reason explaining why this location was selected
       */
      recommendationReason?: RecommendationReason;
      /**
       * Finalized schedule for this visit.
       */
      schedule?: ItineraryScheduledVisit;
      /**
       * Travel segment connecting from the previous activity to this one.
       */
      travelFromPrevious?: ItineraryTravelSegment;
      /**
       * Travel segment leading from this activity to the next one.
       */
      travelToNext?: ItineraryTravelSegment;
      /**
       * Annotated opening hours relevant to this visit.
       */
      operatingWindow?: ItineraryOperatingWindow;
      /**
       * Real-time availability status for this location
       */
      availabilityStatus?: import("./availability").AvailabilityStatus;
      /**
       * Availability information message
       */
      availabilityMessage?: string;
      /**
       * User-specified manual start time (HH:MM format).
       * When set, overrides auto-calculated arrival time.
       */
      manualStartTime?: string;
      /** Fixed activity (airport arrival/departure). Cannot be deleted, replaced, or reordered. */
      isAnchor?: boolean;
      /**
       * True when this activity was force-included by `applyCanonicalCoverage`
       * (editor-curated brand-promise icon for the persona+city). Source of
       * truth for downstream protection (see `refineTooBusy`); the `-canon` id
       * suffix is decorative/debug only and may be present on rows where this
       * flag is unset.
       */
      isCanonical?: boolean;
      /**
       * True when this activity was authored by the user (not from the catalog).
       * Custom activities may have no `coordinates` and no `locationId`.
       * Enrichment fields (phone, website, costEstimate, confirmationNumber)
       * are only populated on custom activities.
       */
      isCustom?: boolean;
      /** User-entered phone number for tap-to-call (custom activities only). */
      phone?: string;
      /** User-entered website or reservation URL (custom activities only). */
      website?: string;
      /** User-entered cost estimate (custom activities only). */
      costEstimate?: { amount: number; currency: string };
      /** Reserved for v2 photo upload (custom activities only). Not populated in v1. */
      photoUrl?: string;
      /** User-entered confirmation number for reservations (custom activities only). */
      confirmationNumber?: string;
      /** Opening hours captured from address resolution (custom activities with coordinates). */
      customOperatingHours?: import("./location").LocationOperatingHours;
      /** Street/formatted address for custom activities (mirrors Location.address). */
      address?: string;
    }
  | {
      kind: "note";
      id: string;
      title: "Note";
      timeOfDay: "morning" | "afternoon" | "evening";
      notes: string;
      startTime?: string;
      endTime?: string;
    };

export type ItineraryDay = {
  /**
   * Unique identifier for this day (used for editing and state management).
   */
  id: string;
  dateLabel?: string;
  /**
   * Local timezone for the day's schedule (defaults to itinerary timezone).
   */
  timezone?: string;
  /**
   * Optional day-wide timing window.
   */
  bounds?: ItineraryTime;
  /**
   * Optional weekday reference used for operating hour lookups.
   */
  weekday?: import("./location").Weekday;
  /**
   * Primary city for this day.
   */
  cityId?: import("./trip").CityId;
  /**
   * Inter-city travel segment if transitioning from previous day's city.
   */
  cityTransition?: ItineraryCityTransition;
  activities: ItineraryActivity[];
  /**
   * Whether this day is a day trip from the base city.
   */
  isDayTrip?: boolean;
  /**
   * The base city ID if this is a day trip.
   */
  baseCityId?: import("./trip").CityId;
  /**
   * One-way travel time in minutes for day trips.
   */
  dayTripTravelMinutes?: number;
  /**
   * Energy pace indicator computed from activity count and total scheduled time.
   */
  paceLabel?: "light" | "moderate" | "packed";
  /** True when the traveler arrives late (effective arrival >= 19:00) and Day 1 activities are stripped. */
  isLateArrival?: boolean;
  /** True when the traveler arrives before 08:00 effective (pre-dawn) and Day 1 activities are stripped. */
  isEarlyArrival?: boolean;
  /**
   * True when this day's full content was withheld from the API response
   * because the caller doesn't have access (e.g., unauthenticated guest).
   * Activities and per-day prose/briefings are stripped server-side; the
   * day shell (id/dateLabel/cityId) remains so the UI can render the lock.
   */
  isLocked?: boolean;
};

export type Itinerary = {
  days: ItineraryDay[];
  /**
   * Default timezone for the entire itinerary.
   */
  timezone?: string;
  /**
   * Active seasonal event during the trip dates, if any.
   */
  seasonalHighlight?: {
    id: string;
    label: string;
    description: string;
  };
  /**
   * Planning warnings detected at trip-builder time. Persisted so the
   * itinerary view can re-surface seasonal/holiday/festival context that
   * the user saw once during builder. Undefined for legacy trips generated
   * before this field existed; an empty array means "warnings were computed
   * and none applied" (distinct from "never computed").
   */
  planningWarnings?: PlanningWarning[];
};

/**
 * Represents a single edit operation on an itinerary.
 * Used for tracking edit history for undo/redo functionality.
 */
export type ItineraryEdit = {
  id: string;
  tripId: string;
  timestamp: string;
  type:
    | "setDayEntryPoint"
    | "replaceActivity"
    | "deleteActivity"
    | "reorderActivities"
    | "addActivity"
    | "swapDayTrip";
  dayId: string;
  /**
   * Snapshot of the itinerary state before this edit.
   */
  previousItinerary: Itinerary;
  /**
   * Snapshot of the itinerary state after this edit.
   */
  nextItinerary: Itinerary;
  /**
   * Additional metadata specific to the edit type.
   */
  metadata?: Record<string, unknown>;
};


