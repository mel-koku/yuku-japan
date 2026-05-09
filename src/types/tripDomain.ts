import type { CityId, EntryPoint, RegionId } from "./trip";
import type { TravelerProfile } from "./traveler";
import type { Location } from "./location";

/**
 * Trip status
 */
export type TripStatus = "draft" | "planning" | "planned" | "active" | "completed";

/**
 * Time slot for activities
 */
export type TimeSlot = "morning" | "afternoon" | "evening";

/**
 * Legacy structured form of a TripActivity recommendation reason.
 *
 * No current producer — the itinerary engine writes the canonical array form
 * (`RecommendationReason` from `@/types/itinerary`). This shape is kept for
 * backwards-compatibility with Trip JSON persisted by earlier engine versions.
 * Read defensively via `convertTripReasonToItineraryReason()`; new code should
 * use the canonical form directly.
 */
export type RecommendationReason = {
  /**
   * Primary reason for this recommendation
   */
  primaryReason: string;
  /**
   * Breakdown of scoring factors
   */
  factors: {
    interest?: number;
    proximity?: number;
    budget?: number;
    accessibility?: number;
    time?: number;
    weather?: number;
    groupFit?: number;
  };
  /**
   * Alternative locations that were considered
   */
  alternativesConsidered?: string[];
};

/**
 * A pre-scored alternative to a planned activity, surfaced during replacement.
 *
 * Used by the replacement picker and refinement engine to present options
 * when a user wants to swap an activity. Not persisted — generated on demand.
 */
export type ActivityAlternative = {
  /**
   * Location ID for the alternative
   */
  locationId: string;
  /**
   * Location name
   */
  name: string;
  /**
   * Reason why this alternative was suggested
   */
  reason: string;
  /**
   * Score for this alternative
   */
  score: number;
};

/**
 * Constraints for a trip day
 */
export type DayConstraints = {
  /**
   * Nap windows for children (time ranges in HH:MM format)
   */
  napWindows?: Array<{ start: string; end: string }>;
  /**
   * Mobility limits (e.g., max walking distance)
   */
  mobilityLimits?: {
    maxWalkingDistance?: number; // in meters
    requiresElevator?: boolean;
    stepFreeAccess?: boolean;
  };
  /**
   * Rest gaps required between activities (in minutes)
   */
  restGaps?: number;
};

/**
 * Tips for an activity
 */
export type ActivityTip = {
  /**
   * Tip text
   */
  text: string;
  /**
   * Priority level
   */
  priority: "high" | "medium" | "low";
  /**
   * Category of tip (crowd avoidance, photo times, local secrets, weather backups)
   */
  category: "crowd" | "photo" | "local" | "weather" | "general";
};

/**
 * Planning-phase activity representation used during trip generation.
 *
 * Contains the full `Location` object and structured scoring factors.
 * After generation, activities are converted to `ItineraryActivity` (itinerary.ts)
 * which is the canonical type used for rendering, editing, and persistence.
 */
export type TripActivity = {
  /**
   * Unique identifier for this activity
   */
  id: string;
  /**
   * Reference to the location
   */
  locationId: string;
  /**
   * Location details (can be populated from cache or API)
   */
  location?: Location;
  /**
   * Time slot for this activity
   */
  timeSlot: TimeSlot;
  /**
   * Duration in minutes
   */
  duration: number;
  /**
   * Start time (HH:MM format)
   */
  startTime?: string;
  /**
   * End time (HH:MM format)
   */
  endTime?: string;
  /**
   * Alternative activities if this one is unavailable
   */
  alternatives?: ActivityAlternative[];
  /**
   * Reasoning for this recommendation
   */
  reasoning?: RecommendationReason;
  /**
   * Tips for this activity
   */
  tips?: ActivityTip[];
  /**
   * Meal type if this is a meal activity
   */
  mealType?: "breakfast" | "lunch" | "dinner" | "snack";
  /**
   * Fixed activity (airport arrival/departure). Cannot be deleted, replaced, or reordered.
   */
  isAnchor?: boolean;
  /**
   * True when this activity was force-included by `applyCanonicalCoverage`
   * (editor-curated brand-promise icon). Propagated from ItineraryActivity
   * via `convertItineraryToTrip` and read by `refineTooBusy` to protect the
   * activity from removal.
   */
  isCanonical?: boolean;
  /**
   * Embedded coordinates for activities without a database location (e.g., airports).
   */
  coordinates?: { lat: number; lng: number };
};

/**
 * A single day in a trip
 *
 * `isLocked` is set when the API caller doesn't have access to the day's
 * detailed content (e.g., unauthenticated guest viewing Day 2-N). When true,
 * `activities` is empty and any per-day prose/briefings are stripped.
 */
export type TripDay = {
  /**
   * Unique identifier for this day
   */
  id: string;
  /**
   * Date in ISO format (YYYY-MM-DD)
   */
  date: string;
  /**
   * Primary city for this day
   */
  cityId: CityId;
  /**
   * Activities scheduled for this day
   */
  activities: TripActivity[];
  /**
   * Constraints for this day
   */
  constraints?: DayConstraints;
  /**
   * Explanation text for the day's plan
   */
  explanation?: string;
  /**
   * Message when refinement made no changes (e.g., no candidates available, day fully scheduled)
   */
  message?: string;
  /** Mirrors `ItineraryDay.isLocked` — see Itinerary docs. */
  isLocked?: boolean;
};

/**
 * Normalized Trip domain model
 */
export type Trip = {
  /**
   * Unique identifier for this trip
   */
  id: string;
  /**
   * Traveler profile for this trip
   */
  travelerProfile: TravelerProfile;
  /**
   * Trip dates
   */
  dates: {
    start: string; // ISO date string
    end: string; // ISO date string
  };
  /**
   * Selected regions
   */
  regions: RegionId[];
  /**
   * Selected cities
   */
  cities: CityId[];
  /**
   * Entry point for the trip
   */
  entryPoint?: EntryPoint;
  /**
   * Trip status
   */
  status: TripStatus;
  /**
   * Days of the trip
   */
  days: TripDay[];
  /**
   * Created timestamp
   */
  createdAt?: string;
  /**
   * Updated timestamp
   */
  updatedAt?: string;
};

