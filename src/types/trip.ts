/**
 * Defines the start and end ISO date strings used throughout the trip builder.
 */
import { VIBES, type VibeId as VibeIdFromData } from "@/data/vibes";
import type { InterestId as InterestIdFromData } from "@/data/interests";
import type { TravelerProfile } from "./traveler";

/**
 * Re-export VibeId from vibes.ts for convenience.
 */
export type VibeId = VibeIdFromData;

/**
 * Re-export InterestId from interests.ts for convenience.
 * InterestId is an internal scoring concept derived from vibes via vibesToInterests().
 * It is NOT stored on TripBuilderData -- use vibes for user-facing selections.
 */
export type InterestId = InterestIdFromData;

/**
 * Valid vibe IDs set for validation.
 */
export const VALID_VIBE_IDS = new Set<VibeId>(VIBES.map((v) => v.id));

export type TravelDates = {
  start?: string;
  end?: string;
};

/**
 * Enumerates the pacing options for a trip. Additional options can be added in later phases.
 * 
 * Note: This type is semantically equivalent to TravelPace in traveler.ts but kept separate
 * as they may diverge in the future (e.g., trip-level vs traveler-level pacing).
 */
export type TripStyle = "relaxed" | "balanced" | "fast";

/**
 * Known city IDs for static references. Dynamic cities from database
 * may have additional IDs not in this union.
 */
export type KnownCityId =
  | "kyoto" | "osaka" | "nara" | "kobe" | "otsu" | "himeji" | "wakayama"  // Kansai
  | "tokyo" | "yokohama" | "kamakura" | "nikko" | "nasushiobara" | "hakone" | "kawaguchiko" | "kawagoe" | "narita" | "chichibu"  // Kanto
  | "nagoya" | "kanazawa" | "hakusan" | "takayama" | "nagano" | "niigata" | "nagaoka" | "ise" | "toyama"  // Chubu
  | "fukuoka" | "dazaifu" | "asakura" | "nagasaki" | "omura" | "kumamoto" | "kagoshima" | "oita" | "yakushima" | "miyazaki" | "kitakyushu"
  | "arita" | "imari" | "kurokawa" | "takachiho"  // Kyushu
  | "sapporo" | "hakodate" | "asahikawa" | "kushiro" | "abashiri" | "wakkanai"
  | "toyako" | "noboribetsu" | "furano" | "shiretoko" | "niseko"  // Hokkaido
  | "sendai" | "morioka" | "aomori" | "akita" | "yamagata" | "aizuwakamatsu"
  | "ginzan" | "zao" | "tazawako" | "hiraizumi" | "hachimantai"  // Tohoku
  | "hiroshima" | "okayama" | "maniwa" | "matsue" | "tottori" | "shimonoseki"  // Chugoku
  | "matsuyama" | "takamatsu" | "tokushima" | "kochi" | "iyavalley"  // Shikoku
  | "naha" | "ishigaki" | "miyako" | "amami";  // Okinawa

/**
 * City ID type that accepts both known static cities and dynamic database cities.
 * Use KnownCityId when you need strict typing for static cities.
 */
export type CityId = string;

/**
 * Known region IDs for static references.
 * Japan is divided into 9 main regions.
 */
export type KnownRegionId =
  | "kansai"    // Osaka, Kyoto, Nara, Kobe, etc.
  | "kanto"     // Tokyo, Yokohama, etc.
  | "chubu"     // Nagoya, Kanazawa, etc.
  | "kyushu"    // Fukuoka, Nagasaki, etc.
  | "hokkaido"  // Sapporo, Hakodate, etc.
  | "tohoku"    // Sendai, Aomori, etc.
  | "chugoku"   // Hiroshima, Okayama, etc.
  | "shikoku"   // Matsuyama, Takamatsu, etc.
  | "okinawa";  // Naha, Miyakojima, etc.

/**
 * Region ID type that accepts both known static regions and dynamic database regions.
 * Use KnownRegionId when you need strict typing for static regions.
 */
export type RegionId = string;

/**
 * City option returned from the /api/cities endpoint.
 * Includes location count and preview images for UI display.
 */
export type CityOption = {
  id: string;
  name: string;
  region: string;
  locationCount: number;
  previewImages: string[];
};

export type EntryPointType = "airport" | "accommodation" | "custom";

export type EntryPoint = {
  type: EntryPointType;
  id: string;
  name: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  cityId?: CityId;
  iataCode?: string; // 3-letter IATA airport code
  region?: KnownRegionId; // Region the entry point belongs to
};

/**
 * Per-day entry point configuration for start/end locations.
 *
 * `clearedStart` / `clearedEnd` flags mark an explicit user clear on this day,
 * overriding the city-level accommodation fallback during resolution. Without
 * these, a clear at the day level would silently fall through to the city
 * accommodation and re-render the same value, making the X button look dead.
 */
export type DayEntryPoint = {
  startPoint?: EntryPoint;
  endPoint?: EntryPoint;
  clearedStart?: boolean;
  clearedEnd?: boolean;
};

/**
 * City-level accommodation setting. When set, all days in this city
 * use this accommodation as start/end point (unless overridden per-day).
 */
export type CityAccommodation = {
  cityId: string;
  entryPoint: EntryPoint;
};

/**
 * Aggregates all mutable wizard fields. Future steps can extend this structure as needed.
 * 
 * Note: The TravelerProfile can be built from the individual fields using buildTravelerProfile().
 * The travelerProfile field is optional and will be populated automatically when needed.
 */
export type TripBuilderData = {
  duration?: number; // 1-21
  dates: TravelDates; // ISO yyyy-mm-dd
  vibes?: VibeId[]; // aspirational vibe selections
  regions?: RegionId[];
  cities?: CityId[];
  style?: TripStyle; // later steps
  entryPoint?: EntryPoint;
  exitPoint?: EntryPoint;
  sameAsEntry?: boolean; // true = round-trip (default), false = open-jaw
  accessibility?: {
    mobility?: boolean;
    dietary?: string[];
    dietaryOther?: string;
    notes?: string;
  };
  /**
   * Budget information for the trip
   */
  budget?: {
    /**
     * Total trip budget in local currency (optional)
     */
    total?: number;
    /**
     * Per-day budget in local currency (optional)
     */
    perDay?: number;
    /**
     * Budget level classification
     */
    level?: "budget" | "moderate" | "luxury";
  };
  /**
   * Group information
   */
  group?: {
    /**
     * Number of travelers
     */
    size?: number;
    /**
     * Type of group
     */
    type?: "solo" | "couple" | "family" | "friends" | "business";
    /**
     * Ages of children (if applicable)
     */
    childrenAges?: number[];
  };
  /**
   * Weather preferences for trip planning
   */
  weatherPreferences?: {
    /**
     * Prefer indoor alternatives on rainy days
     */
    preferIndoorOnRain?: boolean;
    /**
     * Minimum temperature preference (Celsius)
     */
    minTemperature?: number;
    /**
     * Maximum temperature preference (Celsius)
     */
    maxTemperature?: number;
  };
  /**
   * Optional TravelerProfile. If not provided, will be built from other fields.
   * This allows gradual migration to the new domain model.
   */
  travelerProfile?: TravelerProfile;
  /**
   * Default day start time in HH:MM format (24-hour).
   * Used as the starting point for calculating activity times.
   * Defaults to "09:00" if not specified.
   */
  dayStartTime?: string;
  /**
   * Flight landing time in HH:MM format (24-hour).
   * Used to compute a realistic Day 1 start time (arrival + customs/transit buffer).
   */
  arrivalTime?: string;
  /**
   * Flight departure time in HH:MM format (24-hour).
   * Used to compute a realistic last-day end time (departure - check-in/transit buffer).
   */
  departureTime?: string;
  /**
   * Content context from a guide or experience page CTA.
   * When present, locations from this content get a scoring boost
   * and are visually attributed in the generated itinerary.
   */
  contentContext?: {
    type: "guide" | "experience";
    slug: string;
    title: string;
    locationIds: string[];
    city?: string;
    region?: string;
  };
  /**
   * Festival IDs the user explicitly wants woven into the trip.
   * Generator pins the festival's suggested location (if resolvable) on a day
   * within the festival's date window in the festival's city, or drops a
   * dated note-activity on that day if no location maps cleanly.
   */
  mustIncludeFestivals?: string[];
  /**
   * Whether this is the traveler's first time visiting Japan.
   * Gates Day 1 orientation tips, adjusts hidden gem ratio, adds pacing warnings.
   */
  isFirstTimeVisitor?: boolean;
  /**
   * Accommodation style preference. Affects day scheduling and scoring:
   * - "hotel": Standard schedule (default behavior)
   * - "ryokan": Traditional inn — day ends at 17:00, dinner/breakfast included
   * - "hostel": Budget-friendly — standard schedule
   * - "mix": Per-city default — standard schedule
   */
  accommodationStyle?: "hotel" | "ryokan" | "hostel" | "mix";
  /**
   * When true, the generator respects data.cities array order instead of
   * auto-optimizing via nearest-neighbor routing. Set when the user manually
   * reorders cities in the trip builder.
   */
  customCityOrder?: boolean;
  /**
   * Per-city day allocation overrides as a parallel array to `cities`.
   * cityDays[i] = number of days for cities[i]. Supports duplicate cities
   * (e.g., Tokyo → Osaka → Tokyo round trips).
   * Each value min 1, total must equal trip duration.
   * Dropped if cities/duration change.
   */
  cityDays?: number[];
  /**
   * Parsed flight details (airline, flight number). Display-only — airport
   * and times auto-fill existing entryPoint/arrivalTime/departureTime fields.
   */
  flightDetails?: {
    arrival?: { airline?: string; flightNumber?: string };
    departure?: { airline?: string; flightNumber?: string };
  };
  /**
   * Pre-generation accommodation coordinates keyed by CityId.
   * Used to route days from the hotel instead of city center.
   */
  accommodations?: Record<CityId, {
    name: string;
    coordinates: { lat: number; lng: number };
    placeId?: string;
  }>;
};

/**
 * City interest data structure from pre-computed JSON.
 */
export type CityInterestCounts = {
  [interest: string]: number;
};

/**
 * Metadata for a city from the city interests data.
 */
export type CityMetadata = {
  locationCount: number;
  coordinates?: {
    lat: number;
    lng: number;
  };
  region?: string;
};

/**
 * Complete city interests data structure.
 */
export type CityInterestsData = {
  generatedAt: string;
  totalLocations: number;
  totalCities: number;
  cities: Record<string, CityInterestCounts>;
  metadata: Record<string, CityMetadata>;
};


