/**
 * Column projections for Supabase queries
 *
 * Instead of using .select("*") which fetches all 25+ columns,
 * use these targeted projections to fetch only what's needed.
 * This reduces network payload and improves query performance.
 */

import type {
  LocationOperatingHours,
  LocationVisitRecommendation,
  LocationTransitMode,
  LocationRelationshipType,
  SeasonalType,
  SubExperienceType,
} from "@/types/location";

/**
 * Database row type for locations table
 * Used for type-safe transformation from Supabase to Location type
 */
export type LocationDbRow = {
  id: string;
  name: string;
  region: string;
  city: string;
  planning_city: string | null;
  city_original: string | null;
  neighborhood: string | null;
  prefecture: string | null;
  category: string;
  image: string;
  description: string | null;
  min_budget: string | null;
  estimated_duration: string | null;
  operating_hours: LocationOperatingHours | null;
  recommended_visit: LocationVisitRecommendation | null;
  preferred_transit_modes: LocationTransitMode[] | null;
  coordinates: { lat: number; lng: number } | null;
  timezone: string | null;
  short_description: string | null;
  rating: number | null;
  review_count: number | null;
  place_id: string | null;
  primary_photo_url: string | null;
  // Google Places enrichment fields
  google_primary_type: string | null;
  google_types: string[] | null;
  business_status: string | null;
  price_level: number | null;
  accessibility_options: {
    wheelchairAccessibleEntrance?: boolean;
    wheelchairAccessibleParking?: boolean;
    wheelchairAccessibleRestroom?: boolean;
    wheelchairAccessibleSeating?: boolean;
  } | null;
  dietary_options: {
    servesVegetarianFood?: boolean;
  } | null;
  service_options: {
    dineIn?: boolean;
    takeout?: boolean;
    delivery?: boolean;
  } | null;
  meal_options: {
    servesBreakfast?: boolean;
    servesBrunch?: boolean;
    servesLunch?: boolean;
    servesDinner?: boolean;
  } | null;
  is_featured: boolean | null;
  is_hidden_gem: boolean | null;
  jta_approved: boolean | null;
  is_unesco_site: boolean | null;
  // Enhanced enrichment fields
  good_for_children: boolean | null;
  good_for_groups: boolean | null;
  outdoor_seating: boolean | null;
  reservable: boolean | null;
  editorial_summary: string | null;
  // Seasonal availability fields
  is_seasonal: boolean | null;
  seasonal_type: SeasonalType | null;
  valid_months: number[] | null;
  // Practical travel info (Gemini-enriched)
  name_japanese: string | null;
  nearest_station: string | null;
  cash_only: boolean | null;
  payment_types: string[] | null;
  dietary_flags: string[] | null;
  reservation_info: "required" | "recommended" | null;
  insider_tip: string | null;
  tags: string[] | null;
  canonical_for_personas: string[] | null;
  cuisine_type: string | null;
  craft_type: string | null;
  // Source tracking
  source: string | null;
  source_url: string | null;
  // Tattoo policy for onsen/wellness
  tattoo_policy: "prohibited" | "cover_required" | "accepted" | null;
  // Hierarchy fields
  parent_id: string | null;
  parent_mode: "schedulable" | "container" | "flexible" | null;
  sort_order: number | null;
};

/**
 * Columns needed for location listings/grids (21 columns)
 * Used by: PlacesShell, search results
 * Includes Google Places enrichment fields for filtering
 */
export const LOCATION_LISTING_COLUMNS = `
  id,
  name,
  region,
  city,
  prefecture,
  category,
  image,
  short_description,
  rating,
  review_count,
  estimated_duration,
  min_budget,
  place_id,
  primary_photo_url,
  coordinates,
  google_primary_type,
  google_types,
  business_status,
  price_level,
  accessibility_options,
  dietary_options,
  service_options,
  tags,
  canonical_for_personas,
  name_japanese,
  nearest_station,
  payment_types,
  dietary_flags,
  insider_tip,
  is_featured,
  jta_approved,
  is_unesco_site,
  parent_id,
  parent_mode
`.replace(/\s+/g, "");

/**
 * Slimmed projection for the places /api/locations/all endpoint.
 * Drops fields unused by PlacesCompactCard / map: place_id, min_budget,
 * google_types, business_status.
 */
export const LOCATION_EXPLORE_COLUMNS = `
  id,
  name,
  region,
  city,
  prefecture,
  category,
  image,
  short_description,
  rating,
  review_count,
  estimated_duration,
  primary_photo_url,
  coordinates,
  google_primary_type,
  price_level,
  accessibility_options,
  dietary_options,
  is_hidden_gem,
  is_featured,
  name_japanese,
  nearest_station,
  cash_only,
  payment_types,
  dietary_flags,
  reservation_info,
  operating_hours,
  good_for_children,
  good_for_groups,
  meal_options,
  service_options,
  tags,
  cuisine_type,
  craft_type,
  insider_tip,
  jta_approved,
  is_unesco_site,
  parent_id,
  parent_mode
`.replace(/\s+/g, "");

/**
 * Columns needed for location detail views (18 columns)
 * Used by: LocationExpanded, /api/locations/[id]
 */
export const LOCATION_DETAIL_COLUMNS = `
  id,
  name,
  name_japanese,
  region,
  city,
  prefecture,
  planning_city,
  neighborhood,
  category,
  image,
  description,
  short_description,
  editorial_summary,
  insider_tip,
  rating,
  review_count,
  estimated_duration,
  min_budget,
  operating_hours,
  recommended_visit,
  coordinates,
  timezone,
  place_id,
  primary_photo_url,
  website_uri,
  phone_number,
  google_maps_uri,
  google_primary_type,
  google_types,
  business_status,
  preferred_transit_modes,
  nearest_station,
  cash_only,
  payment_types,
  dietary_flags,
  reservation_info,
  tags,
  accessibility_options,
  meal_options,
  service_options,
  dietary_options,
  cuisine_type,
  price_level,
  good_for_children,
  good_for_groups,
  outdoor_seating,
  reservable,
  is_hidden_gem,
  is_seasonal,
  seasonal_type,
  valid_months,
  is_accommodation,
  tattoo_policy,
  jta_approved,
  is_unesco_site,
  parent_id,
  parent_mode
`.replace(/\s+/g, "");

/**
 * Columns needed for itinerary generation (24 columns)
 * Used by: itineraryGenerator, itineraryEngine, /api/itinerary/refine
 * Includes Google Places enrichment fields for meal planning and filtering
 */
export const LOCATION_ITINERARY_COLUMNS = `
  id,
  name,
  region,
  city,
  planning_city,
  neighborhood,
  category,
  image,
  primary_photo_url,
  coordinates,
  operating_hours,
  recommended_visit,
  estimated_duration,
  preferred_transit_modes,
  place_id,
  timezone,
  short_description,
  rating,
  review_count,
  min_budget,
  google_primary_type,
  google_types,
  business_status,
  meal_options,
  good_for_children,
  good_for_groups,
  outdoor_seating,
  reservable,
  editorial_summary,
  is_seasonal,
  seasonal_type,
  valid_months,
  price_level,
  accessibility_options,
  dietary_options,
  tags,
  canonical_for_personas,
  cuisine_type,
  payment_types,
  dietary_flags,
  insider_tip,
  tattoo_policy,
  is_unesco_site,
  parent_id,
  parent_mode
`.replace(/\s+/g, "");

/**
 * Columns needed for day trip suggestion cards (16 columns)
 * Used by: /api/day-trips/suggest
 * Slim projection with coordinates for distance filtering + card display fields
 */
export const LOCATION_DAY_TRIP_COLUMNS = `
  id,
  name,
  region,
  city,
  planning_city,
  category,
  image,
  primary_photo_url,
  short_description,
  rating,
  review_count,
  coordinates,
  is_hidden_gem,
  is_unesco_site,
  tags,
  estimated_duration
`.replace(/\s+/g, "");

/**
 * Columns needed for primary photo endpoint (5 columns)
 * Used by: /api/locations/[id]/primary-photo
 */
export const LOCATION_PHOTO_COLUMNS = `
  id,
  name,
  place_id,
  image,
  city,
  region,
  category,
  coordinates
`.replace(/\s+/g, "");

/**
 * Subset of LocationDbRow for photo endpoint
 */
export type LocationPhotoDbRow = Pick<LocationDbRow, "id" | "name" | "place_id" | "image" | "city" | "region" | "category" | "coordinates">;

/**
 * Subset of LocationDbRow for the places /api/locations/all endpoint
 */
export type LocationExploreDbRow = Pick<LocationDbRow,
  | "id"
  | "name"
  | "region"
  | "city"
  | "prefecture"
  | "category"
  | "image"
  | "short_description"
  | "rating"
  | "review_count"
  | "estimated_duration"
  | "primary_photo_url"
  | "coordinates"
  | "google_primary_type"
  | "price_level"
  | "accessibility_options"
  | "dietary_options"
  | "is_hidden_gem"
  | "is_featured"
  | "name_japanese"
  | "nearest_station"
  | "cash_only"
  | "payment_types"
  | "dietary_flags"
  | "reservation_info"
  | "operating_hours"
  | "good_for_children"
  | "good_for_groups"
  | "meal_options"
  | "service_options"
  | "tags"
  | "cuisine_type"
  | "craft_type"
  | "insider_tip"
  | "jta_approved"
  | "is_unesco_site"
  | "parent_id"
  | "parent_mode"
>;

/**
 * Subset of LocationDbRow for listing endpoint
 * Includes Google Places enrichment fields for filtering
 */
/**
 * Columns for the experiences /api/experiences/all endpoint.
 * Slim projection for grid/map browsing of experiences.
 */
export const EXPERIENCE_EXPLORE_COLUMNS = `
  id,
  name,
  region,
  city,
  prefecture,
  experience_type,
  image,
  short_description,
  summary,
  estimated_duration,
  rating,
  review_count,
  coordinates,
  primary_photo_url,
  craft_type,
  tags,
  sanity_slug,
  has_editorial,
  difficulty,
  best_season,
  booking_url,
  meeting_point,
  is_hidden_gem,
  insider_tip,
  operating_hours,
  name_japanese,
  nearest_station,
  price_level
`.replace(/\s+/g, "");

/**
 * Columns needed for AI chat responses (18 columns)
 * Used by: Ask Yuku chat tools
 */
export const LOCATION_CHAT_COLUMNS = `
  id,
  name,
  city,
  region,
  prefecture,
  category,
  image,
  short_description,
  editorial_summary,
  description,
  rating,
  review_count,
  price_level,
  estimated_duration,
  operating_hours,
  coordinates,
  primary_photo_url,
  business_status,
  jta_approved,
  is_unesco_site
`.replace(/\s+/g, "");

/**
 * Subset of LocationDbRow for AI chat responses
 */
export type LocationChatDbRow = Pick<LocationDbRow,
  | "id"
  | "name"
  | "city"
  | "region"
  | "prefecture"
  | "category"
  | "image"
  | "short_description"
  | "editorial_summary"
  | "description"
  | "rating"
  | "review_count"
  | "price_level"
  | "estimated_duration"
  | "operating_hours"
  | "coordinates"
  | "primary_photo_url"
  | "business_status"
  | "jta_approved"
  | "is_unesco_site"
>;

export type LocationListingDbRow = Pick<LocationDbRow,
  | "id"
  | "name"
  | "region"
  | "city"
  | "prefecture"
  | "category"
  | "image"
  | "short_description"
  | "rating"
  | "review_count"
  | "estimated_duration"
  | "min_budget"
  | "place_id"
  | "primary_photo_url"
  | "coordinates"
  | "google_primary_type"
  | "google_types"
  | "business_status"
  | "price_level"
  | "accessibility_options"
  | "dietary_options"
  | "service_options"
  | "tags"
  | "canonical_for_personas"
  | "name_japanese"
  | "nearest_station"
  | "payment_types"
  | "dietary_flags"
  | "insider_tip"
  | "is_featured"
  | "jta_approved"
  | "is_unesco_site"
  | "parent_id"
  | "parent_mode"
>;

/**
 * Columns needed for /api/locations/nearby (21 columns).
 * Slim projection — coordinate filtering + open-now check + card display fields.
 * Distinct from `LOCATION_LISTING_COLUMNS`: no place_id/min_budget/google_types/business_status/
 * accessibility_options/dietary_options/service_options/payment_types/dietary_flags/insider_tip/
 * is_featured/jta_approved/is_unesco_site/parent_id/parent_mode/tags. Adds is_hidden_gem +
 * operating_hours which listing doesn't carry.
 */
export const LOCATION_NEARBY_COLUMNS = `
  id,
  name,
  region,
  city,
  prefecture,
  category,
  image,
  rating,
  review_count,
  estimated_duration,
  primary_photo_url,
  coordinates,
  google_primary_type,
  price_level,
  is_hidden_gem,
  name_japanese,
  nearest_station,
  cash_only,
  reservation_info,
  operating_hours,
  short_description
`.replace(/\s+/g, "");

/**
 * Subset of LocationDbRow for /api/locations/nearby.
 */
export type LocationNearbyDbRow = Pick<LocationDbRow,
  | "id"
  | "name"
  | "region"
  | "city"
  | "prefecture"
  | "category"
  | "image"
  | "rating"
  | "review_count"
  | "estimated_duration"
  | "primary_photo_url"
  | "coordinates"
  | "google_primary_type"
  | "price_level"
  | "is_hidden_gem"
  | "name_japanese"
  | "nearest_station"
  | "cash_only"
  | "reservation_info"
  | "operating_hours"
  | "short_description"
>;

/**
 * Columns needed for /api/locations/print-enrichment (5 columns).
 * Minimal projection — print page only needs Japanese name + station + cash-only +
 * reservation flag, joined to a list of location IDs.
 */
export const LOCATION_PRINT_COLUMNS = `
  id,
  name_japanese,
  nearest_station,
  cash_only,
  reservation_info
`.replace(/\s+/g, "");

/**
 * Subset of LocationDbRow for /api/locations/print-enrichment.
 */
export type LocationPrintDbRow = Pick<LocationDbRow,
  | "id"
  | "name_japanese"
  | "nearest_station"
  | "cash_only"
  | "reservation_info"
>;

/**
 * Database row type for sub_experiences table.
 * Schema lives in supabase/migrations/20260406100000_add_location_hierarchy.sql.
 */
export type SubExperienceDbRow = {
  id: string;
  location_id: string;
  name: string;
  description: string;
  time_estimate: number | null;
  tip: string | null;
  image: string | null;
  sort_order: number;
  sub_type: SubExperienceType;
  time_context: string | null;
};

/**
 * Columns needed to render a sub-experience card on a parent location detail page.
 * Mirrors every field consumed by `transformDbRowToSubExperience`; adding a column
 * to `sub_experiences` requires updating the projection here so callsites surface
 * the new field instead of silently masking it via `select("*")`.
 */
export const SUB_EXPERIENCE_COLUMNS = `
  id,
  location_id,
  name,
  description,
  time_estimate,
  tip,
  image,
  sort_order,
  sub_type,
  time_context
`.replace(/\s+/g, "");

/**
 * Database row type for location_relationships table.
 * Schema lives in supabase/migrations/20260406100000_add_location_hierarchy.sql.
 */
export type LocationRelationshipDbRow = {
  id: string;
  location_id: string;
  related_id: string;
  relationship_type: LocationRelationshipType;
  source: "algorithmic" | "curated";
  editorial_note: string | null;
  transit_line: string | null;
  walk_minutes: number | null;
  sort_order: number;
};

/**
 * Columns needed to render bidirectional location relationships
 * (cluster, gateway, alternative, transit_line) on detail surfaces.
 * Mirrors every field consumed by the inline mapper in
 * `fetchLocationRelationships`; adding a column to `location_relationships`
 * requires updating this projection so callsites surface the new field
 * instead of silently masking it via `select("*")`.
 */
export const LOCATION_RELATIONSHIPS_COLUMNS = `
  id,
  location_id,
  related_id,
  relationship_type,
  source,
  editorial_note,
  transit_line,
  walk_minutes,
  sort_order
`.replace(/\s+/g, "");
