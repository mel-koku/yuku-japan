export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

/**
 * Type of availability rule for seasonal locations.
 * - 'fixed_annual': Specific date each year (e.g., Oct 22 for Jidai Matsuri)
 * - 'floating_annual': Relative date (e.g., 3rd Saturday of March)
 * - 'date_range': Range of dates (with optional year for temporary events)
 */
export type AvailabilityType = "fixed_annual" | "floating_annual" | "date_range";

/**
 * Type of seasonal location. Mirrors the distinct values present in
 * `locations.seasonal_type` in prod (DB column is plain text, no CHECK constraint).
 *
 * This union documents what's actually stored. It is intentionally broader than
 * `GATING_SEASONAL_TYPES`, which is the narrower set used for planner gating —
 * gate-vs-marker, not "valid value".
 */
export type SeasonalType =
  | "festival"
  | "seasonal_attraction"
  | "winter_closure"
  | "cherry_blossom"
  | "summer_festival"
  | "plum_blossom"
  | "autumn_foliage"
  | "winter_illumination"
  | "lotus"
  | "snow_winter"
  | "summer_flowers"
  | "wisteria"
  | "winter_festival"
  | "hydrangea"
  | "iris"
  | "sunflower"
  | "lavender"
  | "seasonal_food"
  | "cosmos";

/**
 * Availability rule for a seasonal location.
 * Defines when a location is available or unavailable.
 */
export type LocationAvailability = {
  id: string;
  locationId: string;
  availabilityType: AvailabilityType;
  /** Month when availability period starts (1-12) */
  monthStart?: number;
  /** Day when availability period starts (1-31) */
  dayStart?: number;
  /** Month when availability period ends (1-12) */
  monthEnd?: number;
  /** Day when availability period ends (1-31) */
  dayEnd?: number;
  /** Week ordinal for floating dates (1-5, where 5 means "last") */
  weekOrdinal?: number;
  /** Day of week for floating dates (0=Sunday, 6=Saturday) */
  dayOfWeek?: number;
  /** Start year for temporary events/closures */
  yearStart?: number;
  /** End year for temporary events/closures */
  yearEnd?: number;
  /** True if location IS available during this period, false if closed */
  isAvailable: boolean;
  /** Human-readable description of the availability rule */
  description?: string;
};

export type LocationOperatingPeriod = {
  day: Weekday;
  /**
   * 24-hour formatted opening time (HH:MM). Use "00:00" for always-open.
   */
  open: string;
  /**
   * 24-hour formatted closing time (HH:MM). When the location remains open
   * past midnight, set `isOvernight` to true to indicate the close occurs on
   * the following day.
   */
  close: string;
  /**
   * Marks whether the closing time spills into the next calendar day.
   */
  isOvernight?: boolean;
};

export type LocationOperatingHours = {
  /**
   * IANA timezone identifier used to interpret operating window times.
   */
  timezone: string;
  periods: LocationOperatingPeriod[];
  /**
   * Optional free-form annotation for seasonal hours or exceptions.
   */
  notes?: string;
};

export type LocationVisitRecommendation = {
  /**
   * Typical amount of time (in minutes) a traveler should allocate.
   */
  typicalMinutes: number;
  /**
   * Optional minimum time (in minutes) to experience the essentials.
   */
  minMinutes?: number;
  /**
   * Optional maximum time (in minutes) before the visit starts to feel long.
   */
  maxMinutes?: number;
  /**
   * Optional contextual description surfaced in UI.
   */
  summary?: string;
};

export type LocationTransitMode =
  | "walk"
  | "train"
  | "subway"
  | "bus"
  | "car"
  | "bicycle"
  | "tram"
  | "ferry"
  | "taxi";

/**
 * Initial vocabulary of known payment methods surfaced by Yuku's payment-type badge.
 * Derivation helpers treat unknown string values in `paymentTypes` as inert (no pill),
 * so future additions (apple_pay, paypay, etc.) do not require a code change to render safely.
 */
export const PAYMENT_TYPE_VALUES = [
  "cash",
  "ic_card",
  "visa",
  "mastercard",
  "jcb",
  "amex",
] as const;

export type PaymentType = (typeof PAYMENT_TYPE_VALUES)[number];

/**
 * Initial vocabulary of known dietary accommodations surfaced by Yuku's dietary-flags badge.
 * Derivation helpers treat unknown string values in `dietaryFlags` as inert (no pill),
 * so future additions (kosher, etc.) do not require a code change to render safely.
 * Adding a new value still requires updates to the priority order, label map, and UI tests
 * — forward-compat is about safe data round-tripping, not single-line vocabulary expansion.
 */
export const DIETARY_FLAG_VALUES = [
  "vegetarian",
  "vegan",
  "halal",
  "gluten_free",
] as const;

export type DietaryFlag = (typeof DIETARY_FLAG_VALUES)[number];

export type Location = {
  id: string;
  name: string;
  region: string;
  city: string;
  /** KnownCityId assigned by coordinate snap — used by the itinerary planner. */
  planningCity?: string;
  /**
   * Neighborhood or district within the city (e.g., "Gion", "Arashiyama", "Higashiyama").
   * Used for geographic diversity scoring in itinerary generation.
   */
  neighborhood?: string;
  /**
   * Prefecture (administrative division) where the location is situated.
   * Used for geographic filtering in the explore page.
   */
  prefecture?: string;

  // ============================================
  // Hierarchy Fields
  // ============================================

  /**
   * Parent location ID for child locations (e.g., Bamboo Grove -> Arashiyama).
   * NULL for top-level locations (the default for all existing rows).
   */
  parentId?: string;

  /**
   * Only set on locations that ARE parents (have children pointing to them).
   * - 'schedulable': Itinerary schedules the parent; children are guide content (Miyajima, Nikko Toshogu)
   * - 'container': Never scheduled; children are the itinerary items (Dotonbori, Harajuku)
   * - 'flexible': Can be scheduled as a block OR children individually (Arashiyama, Naramachi)
   */
  parentMode?: 'schedulable' | 'container' | 'flexible';

  /** Ordering within a parent (lower = first). */
  sortOrder?: number;

  /** Resolved parent location name for display (set on search results for child locations). */
  parentName?: string;

  category: string;
  image: string;
  /**
   * AI-generated editorial description of the location.
   * Used as fallback when Google Places editorialSummary is not available.
   */
  description?: string;
  minBudget?: string;
  estimatedDuration?: string;
  /**
   * Optional structured representation of when the location is open.
   */
  operatingHours?: LocationOperatingHours;
  /**
   * Structured guidance for how long to stay at this location.
   */
  recommendedVisit?: LocationVisitRecommendation;
  /**
   * Hints for the most convenient ways to travel to this location.
   */
  preferredTransitModes?: LocationTransitMode[];
  /**
   * Optional precise coordinates used for routing calculations.
   */
  coordinates?: {
    lat: number;
    lng: number;
  };
  /**
   * IANA timezone identifier for the location if different from operatingHours.
   */
  timezone?: string;
  /**
   * Optional short description that can be displayed on summary cards.
   * When absent the UI will generate a sensible fallback string.
   */
  shortDescription?: string;
  /**
   * Optional average visitor rating (0–5). Missing values will be replaced
   * with a deterministic fallback so the UI can still surface a rating.
   */
  rating?: number;
  /**
   * Optional number of reviews supporting the rating. Like ratings, a
   * fallback value will be generated when this field is undefined.
   */
  reviewCount?: number;
  /**
   * Optional pre-defined Google Place ID.
   * If not provided the application will resolve it dynamically.
   */
  placeId?: string;
  /**
   * Optional primary photo URL from Google Places API.
   * Stored in database to eliminate N+1 query problem.
   */
  primaryPhotoUrl?: string;
  /**
   * Structured attribution for the wikimedia-source hero photo, denormalized
   * from `location_photos`. Null for google heroes (their attribution flows
   * through Google's htmlAttributions in /api/places/photo).
   */
  heroAttribution?: LocationHeroAttribution;
  /**
   * Accessibility information for the location (legacy structure)
   * @deprecated Use accessibilityOptions from Google Places enrichment instead
   */
  accessibility?: {
    /**
     * Whether the location is wheelchair accessible
     */
    wheelchairAccessible?: boolean;
    /**
     * Whether an elevator is required or available
     */
    elevatorRequired?: boolean;
    /**
     * Whether step-free access is available
     */
    stepFreeAccess?: boolean;
    /**
     * Additional accessibility notes
     */
    notes?: string;
  };

  // ============================================
  // Google Places Enrichment Fields
  // ============================================

  /**
   * Primary type from Google Places API (e.g., "buddhist_temple", "castle", "restaurant")
   * More specific than our generic category field
   */
  googlePrimaryType?: string;

  /**
   * Array of all types from Google Places API
   * A location can have multiple types (e.g., ["tourist_attraction", "museum", "point_of_interest"])
   */
  googleTypes?: string[];

  /**
   * Business status from Google Places API
   * Used to filter out closed locations from itinerary planning
   */
  businessStatus?: 'OPERATIONAL' | 'TEMPORARILY_CLOSED' | 'PERMANENTLY_CLOSED';

  /**
   * Price level from Google Places API (0-4)
   * 0 = Free, 1 = Inexpensive ($), 2 = Moderate ($$), 3 = Expensive ($$$), 4 = Very Expensive ($$$$)
   */
  priceLevel?: 0 | 1 | 2 | 3 | 4;

  /**
   * Accessibility options from Google Places API
   */
  accessibilityOptions?: {
    wheelchairAccessibleEntrance?: boolean;
    wheelchairAccessibleParking?: boolean;
    wheelchairAccessibleRestroom?: boolean;
    wheelchairAccessibleSeating?: boolean;
  };

  /**
   * Dietary options from Google Places API (for restaurants)
   */
  dietaryOptions?: {
    servesVegetarianFood?: boolean;
  };

  /**
   * Service options from Google Places API (for restaurants)
   */
  serviceOptions?: {
    dineIn?: boolean;
    takeout?: boolean;
    delivery?: boolean;
  };

  /**
   * Meal options from Google Places API (for restaurants)
   */
  mealOptions?: {
    servesBreakfast?: boolean;
    servesBrunch?: boolean;
    servesLunch?: boolean;
    servesDinner?: boolean;
  };

  /**
   * Whether the location is suitable for children/families
   */
  goodForChildren?: boolean;

  /**
   * Whether the location is suitable for groups
   */
  goodForGroups?: boolean;

  /**
   * Whether outdoor seating is available
   */
  outdoorSeating?: boolean;

  /**
   * Whether the location accepts reservations
   */
  reservable?: boolean;

  /**
   * Google's editorial summary of the location
   */
  editorialSummary?: string;

  // ============================================
  // Contact Info (from Google Places, stored in DB)
  // ============================================

  /**
   * Location website URL, sourced from Google Places
   */
  websiteUri?: string;

  /**
   * International phone number, sourced from Google Places
   */
  phoneNumber?: string;

  /**
   * Google Maps URL for this location
   */
  googleMapsUri?: string;

  // ============================================
  // Practical Travel Info (Gemini-enriched)
  // ============================================

  /**
   * Japanese name (日本語名) — useful for taxi drivers, signs, Japanese map searches
   */
  nameJapanese?: string;

  /**
   * Nearest train/subway station and walking time, e.g. "Kiyomizu-Gojo Station (5 min walk)"
   */
  nearestStation?: string;

  /**
   * True if the location only accepts cash (no credit cards)
   */
  cashOnly?: boolean;

  /**
   * Accepted payment methods. Absent means unknown (pill not rendered).
   * Empty arrays rejected at the DB layer; a DB mishap that slips an empty
   * array through is treated as unknown by the derivation helper.
   */
  paymentTypes?: PaymentType[];

  /**
   * Dietary accommodations offered. Absent means unknown (no pills rendered).
   * Empty arrays rejected at the DB layer; a DB mishap that slips an empty
   * array through is treated as unknown by the derivation helper.
   * Only rendered on restaurant/cafe/bar categories.
   */
  dietaryFlags?: DietaryFlag[];

  /**
   * Reservation status: "required", "recommended", or undefined if not needed/unknown
   */
  reservationInfo?: 'required' | 'recommended';

  /**
   * Curated insider tip for this location — local knowledge, hidden features, or best practices.
   */
  insiderTip?: string;

  /**
   * Manually curated flag to mark locations for featured carousel display
   * Used for editor-selected featured destinations
   */
  isFeatured?: boolean;

  /**
   * Whether this location is certified by the Japan Tourism Agency (JTA).
   * Used as social proof on cards and detail views.
   */
  jtaApproved?: boolean;

  /**
   * Whether this location is a curated hidden gem.
   * Used for the "Hidden Gems" vibe filter on the explore page.
   */
  isHiddenGem?: boolean;

  /**
   * Whether this location is a UNESCO World Heritage Site.
   * Used for badge display and itinerary scoring.
   */
  isUnescoSite?: boolean;

  /**
   * Multi-dimensional tags: environment (indoor/outdoor/mixed), pace (quick-stop/half-day/full-day),
   * seasonal (cherry-blossom/autumn-foliage/year-round), atmosphere (quiet/lively/contemplative).
   */
  tags?: string[];

  /**
   * Editor-curated personas this location is "must-include" for. Read by the
   * post-scoring force-include layer in src/lib/selection/canonicalCoverage.ts.
   * Empty/null = no force-include (backwards-compat by construction).
   */
  canonicalForPersonas?: string[];

  /**
   * Cuisine type for restaurant/bar/cafe/market locations (e.g., ramen, sushi, izakaya, kaiseki).
   */
  cuisineType?: string;

  /**
   * Craft technique type for craft workshop locations (e.g., pottery, textile, lacquerware).
   * Only set when category is "craft".
   */
  craftType?: string;

  /**
   * Tattoo policy for onsen/wellness locations.
   * - 'prohibited': Tattoos not allowed (most traditional onsen in Japan)
   * - 'cover_required': Must cover tattoos with stickers or bandages
   * - 'accepted': Tattoo-friendly facility
   */
  tattooPolicy?: "prohibited" | "cover_required" | "accepted";

  // ============================================
  // Source Tracking
  // ============================================

  /**
   * How this location was added to the database.
   * - 'community': Discovered via user video import
   * - null/undefined: Curated by the Yuku team
   */
  source?: 'community' | null;

  /**
   * Original video URL that led to this location being added.
   * Only set when source is 'community'.
   */
  sourceUrl?: string;

  // ============================================
  // Seasonal Availability Fields
  // ============================================

  /**
   * Whether this location has seasonal or date-dependent availability.
   * When true, the location should be filtered based on trip dates.
   */
  isSeasonal?: boolean;

  /**
   * Type of seasonal location (festival, seasonal_attraction, winter_closure).
   * Only set when isSeasonal is true.
   */
  seasonalType?: SeasonalType;

  /**
   * Availability rules for this location.
   * Loaded from location_availability table when needed.
   */
  availability?: LocationAvailability[];

  /**
   * Months (1-12) when this location is operational.
   * NULL/undefined = year-round. Complements the date-precise
   * availability rules with a simpler month-level guard for
   * businesses that operate seasonally (whale watching, ski resorts, etc.).
   */
  validMonths?: number[];

  // ============================================
  // Experience-specific fields (from experiences table)
  // ============================================

  /** Sanity CMS slug for editorial content link */
  sanitySlug?: string;

  /** Whether this experience has rich editorial content in Sanity */
  hasEditorial?: boolean;

  /** External booking URL */
  bookingUrl?: string;

  /** Difficulty level for experiences */
  difficulty?: string;
};

// ============================================
// Sub-experiences (editorial content within a location)
// ============================================

export type SubExperienceType = 'highlight' | 'route_stop' | 'time_variant';

export type SubExperience = {
  id: string;
  locationId: string;
  name: string;
  description: string;
  timeEstimate?: number;
  tip?: string;
  image?: string;
  sortOrder: number;
  subType: SubExperienceType;
  timeContext?: string;
};

// ============================================
// Location relationships
// ============================================

export type LocationRelationshipType = 'cluster' | 'gateway' | 'alternative' | 'transit_line';

export type LocationRelationship = {
  id: string;
  locationId: string;
  relatedId: string;
  relationshipType: LocationRelationshipType;
  source: 'algorithmic' | 'curated';
  editorialNote?: string;
  transitLine?: string;
  walkMinutes?: number;
  sortOrder: number;
};

export type LocationReview = {
  authorName: string;
  rating?: number;
  text?: string;
  relativePublishTimeDescription?: string;
  profilePhotoUri?: string;
  authorUri?: string;
  publishTime?: string;
};

export type LocationPhotoAttribution = {
  displayName?: string;
  uri?: string;
  photoUri?: string;
  licenseShort?: string;
  licenseUri?: string;
  licenseNotice?: string;
  sourceUri?: string;
};

/**
 * Structured hero-photo attribution for wikimedia-source heroes, denormalized
 * onto `locations.hero_attribution` so listing queries don't need to JOIN
 * `location_photos`. Null for google heroes — their attribution is satisfied
 * by Google's htmlAttributions returned through /api/places/photo.
 *
 * Backfill: scripts/_phase3-backfill-hero-attribution-2026-05-14.mjs.
 * Sync contract documented in 20260515130000_add_locations_hero_attribution.sql.
 */
export type LocationHeroAttribution = {
  author: string;
  authorUri: string | null;
  licenseShort: string;
  licenseUri: string;
  licenseNotice: string | null;
  sourceUri: string;
};

export type LocationPhoto = {
  name: string;
  widthPx?: number;
  heightPx?: number;
  proxyUrl: string;
  attributions: LocationPhotoAttribution[];
};

export type LocationDetails = {
  placeId: string;
  displayName?: string;
  formattedAddress?: string;
  shortAddress?: string;
  rating?: number;
  userRatingCount?: number;
  editorialSummary?: string;
  websiteUri?: string;
  internationalPhoneNumber?: string;
  googleMapsUri?: string;
  regularOpeningHours?: string[];
  currentOpeningHours?: string[];
  reviews: LocationReview[];
  photos: LocationPhoto[];
  fetchedAt: string;
};

export type LocationDetailsResponse = {
  location: Location;
  details: LocationDetails;
};
