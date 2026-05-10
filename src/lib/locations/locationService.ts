/**
 * Server-side location service for fetching locations from the database
 *
 * This service replaces the need for MOCK_LOCATIONS by providing async functions
 * to query the real 2,586 locations stored in Supabase.
 */

import { createClient } from "@/lib/supabase/server";
import type { Location } from "@/types/location";
import { normalizeOperatingHours } from "./normalizeHours";
import {
  LOCATION_ITINERARY_COLUMNS,
  LOCATION_LISTING_COLUMNS,
  type LocationDbRow,
  type LocationListingDbRow,
} from "@/lib/supabase/projections";
import { assertLocationDbRow, assertLocationDbRows } from "@/lib/supabase/assertDbRow";
import { logger } from "@/lib/logger";
import { readFileCache, readFileCacheStale, writeFileCache } from "@/lib/api/fileCache";

const LANDING_CACHE_TTL = 30 * 60 * 1000; // 30 min (shorter than ISR revalidate = 3600s so revalidation sees fresh data)
const isDev = process.env.NODE_ENV === "development";

/**
 * Fetches the total count of browseable locations in the database.
 *
 * Mirrors the filters used by the Places browse experience
 * (`/api/locations/all` → `PlacesShell`) so the landing page hero
 * advertises a number users can actually reach in the grid:
 *   - is_active = true
 *   - business_status not PERMANENTLY_CLOSED (null permitted)
 *   - is_accommodation = false (stays are not browseable here)
 *   - parent_id IS NULL (only top-level rows; sub-experiences hidden)
 *
 * Cache key is versioned (`-v2`) so deploys invalidate the prior count
 * (which included accommodations + child rows) without manual cleanup.
 *
 * @returns The total number of browseable locations
 */
const LOCATION_COUNT_CACHE_KEY = "landing-location-count-v2";

export async function getLocationCount(): Promise<number> {
  if (!isDev) {
    const cached = readFileCache<number>(LOCATION_COUNT_CACHE_KEY, LANDING_CACHE_TTL);
    if (cached !== null) return cached;
  }

  const supabase = await createClient();

  const { count, error } = await supabase
    .from("locations")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true)
    .or("business_status.is.null,business_status.neq.PERMANENTLY_CLOSED")
    .eq("is_accommodation", false)
    .is("parent_id", null);

  if (error || count === null) {
    return readFileCacheStale<number>(LOCATION_COUNT_CACHE_KEY) ?? 0;
  }

  writeFileCache(LOCATION_COUNT_CACHE_KEY, count);
  return count;
}

/**
 * Returns the number of distinct prefectures with active locations.
 */
export async function getPrefectureCount(): Promise<number> {
  if (!isDev) {
    const cached = readFileCache<number>("landing-prefecture-count", LANDING_CACHE_TTL);
    if (cached !== null) return cached;
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("locations")
    .select("prefecture")
    .eq("is_active", true)
    .not("prefecture", "is", null);

  if (error || !data) {
    return readFileCacheStale<number>("landing-prefecture-count") ?? 0;
  }

  const count = new Set(data.map((r) => r.prefecture)).size;
  writeFileCache("landing-prefecture-count", count);
  return count;
}

/**
 * Returns the total number of published travel tips.
 */
export async function getTipCount(): Promise<number> {
  if (!isDev) {
    const cached = readFileCache<number>("landing-tip-count", LANDING_CACHE_TTL);
    if (cached !== null) return cached;
  }

  const supabase = await createClient();

  const { count, error } = await supabase
    .from("travel_guidance")
    .select("*", { count: "exact", head: true })
    .eq("status", "published");

  if (error || count === null) {
    return readFileCacheStale<number>("landing-tip-count") ?? 0;
  }

  writeFileCache("landing-tip-count", count);
  return count;
}

/**
 * Transforms a database row to a Location type
 * Works with both full LocationDbRow and LocationListingDbRow
 */
export function transformDbRowToLocation(row: LocationDbRow | LocationListingDbRow): Location {
  // Every column is mapped via the `"key" in row` guard pattern so that
  // adding a column to a projection automatically surfaces it here.
  // Previously serviceOptions/isFeatured were in LOCATION_LISTING_COLUMNS
  // but never mapped, and nameJapanese/nearestStation/cashOnly/coordinates
  // were only mapped in the full-row branch — so listing-projection
  // callers (places map, batch, saved) silently dropped those fields.
  const r = row as Record<string, unknown>;
  const base: Location = {
    id: row.id,
    name: row.name,
    region: row.region,
    city: row.city,
    category: row.category,
    image: row.image,
    planningCity: "planning_city" in r ? (r.planning_city as string | null) ?? undefined : undefined,
    prefecture: row.prefecture ?? undefined,
    parentId: "parent_id" in r ? (r.parent_id as string | null) ?? undefined : undefined,
    parentMode: "parent_mode" in r ? (r.parent_mode as Location["parentMode"]) ?? undefined : undefined,
    sortOrder: "sort_order" in r ? (r.sort_order as number | null) ?? undefined : undefined,
    minBudget: row.min_budget ?? undefined,
    estimatedDuration: row.estimated_duration ?? undefined,
    shortDescription: "short_description" in r ? (r.short_description as string | null) ?? undefined : undefined,
    rating: "rating" in r ? (r.rating as number | null) ?? undefined : undefined,
    reviewCount: "review_count" in r ? (r.review_count as number | null) ?? undefined : undefined,
    placeId: row.place_id ?? undefined,
    primaryPhotoUrl: "primary_photo_url" in r ? (r.primary_photo_url as string | null) ?? undefined : undefined,
    coordinates: "coordinates" in r ? (r.coordinates as Location["coordinates"]) ?? undefined : undefined,
    // Google Places enrichment fields
    googlePrimaryType: "google_primary_type" in r ? (r.google_primary_type as string | null) ?? undefined : undefined,
    googleTypes: "google_types" in r ? (r.google_types as string[] | null) ?? undefined : undefined,
    businessStatus: "business_status" in r ? (r.business_status as Location["businessStatus"]) ?? undefined : undefined,
    priceLevel: "price_level" in r ? (r.price_level as Location["priceLevel"]) ?? undefined : undefined,
    accessibilityOptions: "accessibility_options" in r ? (r.accessibility_options as Location["accessibilityOptions"]) ?? undefined : undefined,
    dietaryOptions: "dietary_options" in r ? (r.dietary_options as Location["dietaryOptions"]) ?? undefined : undefined,
    serviceOptions: "service_options" in r ? (r.service_options as Location["serviceOptions"]) ?? undefined : undefined,
    tags: "tags" in r ? (r.tags as string[] | null) ?? undefined : undefined,
    canonicalForPersonas: "canonical_for_personas" in r
      ? ((r.canonical_for_personas as string[] | null) ?? undefined)
      : undefined,
    insiderTip: "insider_tip" in r ? (r.insider_tip as string | null) ?? undefined : undefined,
    nameJapanese: "name_japanese" in r ? (r.name_japanese as string | null) ?? undefined : undefined,
    nearestStation: "nearest_station" in r ? (r.nearest_station as string | null) ?? undefined : undefined,
    cashOnly: "cash_only" in r ? (r.cash_only as boolean | null) ?? undefined : undefined,
    paymentTypes: "payment_types" in r
      ? ((r.payment_types as Location["paymentTypes"] | null) ?? undefined)
      : undefined,
    dietaryFlags: "dietary_flags" in r
      ? ((r.dietary_flags as Location["dietaryFlags"] | null) ?? undefined)
      : undefined,
    reservationInfo: "reservation_info" in r ? (r.reservation_info as Location["reservationInfo"]) ?? undefined : undefined,
    isFeatured: "is_featured" in r ? (r.is_featured as boolean | null) ?? undefined : undefined,
    isHiddenGem: "is_hidden_gem" in r ? (r.is_hidden_gem as boolean | null) ?? undefined : undefined,
    jtaApproved: "jta_approved" in r ? (r.jta_approved as boolean | null) ?? undefined : undefined,
    isUnescoSite: "is_unesco_site" in r ? (r.is_unesco_site as boolean | null) ?? undefined : undefined,
    websiteUri: "website_uri" in r ? (r.website_uri as string | null) ?? undefined : undefined,
    phoneNumber: "phone_number" in r ? (r.phone_number as string | null) ?? undefined : undefined,
    googleMapsUri: "google_maps_uri" in r ? (r.google_maps_uri as string | null) ?? undefined : undefined,
    craftType: "craft_type" in r ? (r.craft_type as string | null) ?? undefined : undefined,
    cuisineType: "cuisine_type" in r ? (r.cuisine_type as string | null) ?? undefined : undefined,
  };

  // Fields that only exist on the full LocationDbRow projection.
  if ("operating_hours" in r) {
    return {
      ...base,
      neighborhood: (r.neighborhood as string | null) ?? undefined,
      description: (r.description as string | null) ?? undefined,
      operatingHours: normalizeOperatingHours(r.operating_hours),
      recommendedVisit: (r.recommended_visit as Location["recommendedVisit"]) ?? undefined,
      preferredTransitModes: (r.preferred_transit_modes as Location["preferredTransitModes"]) ?? undefined,
      timezone: (r.timezone as string | null) ?? undefined,
      mealOptions: (r.meal_options as Location["mealOptions"]) ?? undefined,
      goodForChildren: (r.good_for_children as boolean | null) ?? undefined,
      goodForGroups: (r.good_for_groups as boolean | null) ?? undefined,
      outdoorSeating: (r.outdoor_seating as boolean | null) ?? undefined,
      reservable: (r.reservable as boolean | null) ?? undefined,
      editorialSummary: (r.editorial_summary as string | null) ?? undefined,
      isSeasonal: (r.is_seasonal as boolean | null) ?? undefined,
      seasonalType: (r.seasonal_type as Location["seasonalType"]) ?? undefined,
      validMonths: (r.valid_months as number[] | null) ?? undefined,
      cuisineType: (r.cuisine_type as string | null) ?? undefined,
      source: (r.source as 'community' | null) ?? undefined,
      sourceUrl: (r.source_url as string | null) ?? undefined,
      tattooPolicy: (r.tattoo_policy as Location["tattooPolicy"]) ?? undefined,
    };
  }

  return base;
}

/**
 * Fetches a single location by ID
 *
 * @param id - The location ID
 * @returns The location or null if not found
 */
export async function fetchLocationById(id: string): Promise<Location | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("locations")
    .select(LOCATION_ITINERARY_COLUMNS)
    .eq("id", id)
    .single();

  if (error || !data) {
    if (error) logger.error("[fetchLocationById] Supabase query failed", error, { code: error.code, id });
    return null;
  }

  assertLocationDbRow(data, "fetchLocationById");
  return transformDbRowToLocation(data as unknown as LocationDbRow);
}

/**
 * Fetches multiple locations by their IDs
 *
 * @param ids - Array of location IDs
 * @returns Array of locations (may be fewer than requested if some IDs not found)
 */
export async function fetchLocationsByIds(ids: string[]): Promise<Location[]> {
  if (ids.length === 0) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("locations")
    .select(LOCATION_ITINERARY_COLUMNS)
    .in("id", ids);

  if (error || !data) {
    if (error) logger.error("[fetchLocationsByIds] Supabase query failed", error, { code: error.code });
    return [];
  }

  assertLocationDbRows(data, "fetchLocationsByIds");
  return (data as unknown as LocationDbRow[]).map(transformDbRowToLocation);
}

/**
 * Fetches a single location by name (case-insensitive)
 *
 * @param name - The location name to search for
 * @returns The location or null if not found
 */
export async function fetchLocationByName(name: string): Promise<Location | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("locations")
    .select(LOCATION_ITINERARY_COLUMNS)
    .eq("is_active", true)
    .ilike("name", name)
    .limit(1)
    .single();

  if (error || !data) {
    if (error) logger.error("[fetchLocationByName] Supabase query failed", error, { code: error.code, name });
    return null;
  }

  assertLocationDbRow(data, "fetchLocationByName");
  return transformDbRowToLocation(data as unknown as LocationDbRow);
}

/**
 * Fetches multiple locations by names in a single batch query (case-insensitive)
 *
 * @param names - Array of location names to search for
 * @returns Array of matching locations
 */
export async function fetchLocationsByNames(names: string[]): Promise<Location[]> {
  if (names.length === 0) {
    return [];
  }

  const supabase = await createClient();

  // Build case-insensitive OR filter for all names
  const nameFilters = names.map((n) => `name.ilike.${n}`).join(",");

  const { data, error } = await supabase
    .from("locations")
    .select(LOCATION_ITINERARY_COLUMNS)
    .eq("is_active", true)
    .or(nameFilters);

  if (error || !data) {
    if (error) logger.error("[fetchLocationsByNames] Supabase query failed", error, { code: error.code });
    return [];
  }

  assertLocationDbRows(data, "fetchLocationsByNames");
  return (data as unknown as LocationDbRow[]).map(transformDbRowToLocation);
}

/**
 * Options for filtering locations by city
 */
export interface FetchByCityOptions {
  /** Limit the number of results */
  limit?: number;
  /** Exclude specific location IDs */
  excludeIds?: string[];
  /** Only include locations with valid place_id */
  requirePlaceId?: boolean;
  /**
   * KnownCityId slug (lowercase ASCII) used as a fallback match against
   * `planning_city`. Required for cities whose display name contains diacritics
   * (Nikkō, Ōita, Kitakyūshū) — the DB stores ASCII in `city` and slugs in
   * `planning_city`, so an exact `.ilike("city", "Nikkō")` returns 0 rows.
   */
  slug?: string;
}

/**
 * Fetches locations by city
 *
 * @param city - The city name to filter by
 * @param options - Additional filtering options
 * @returns Array of matching locations
 */
export async function fetchLocationsByCity(
  city: string,
  options: FetchByCityOptions = {},
): Promise<Location[]> {
  const { limit = 100, excludeIds = [], requirePlaceId = true, slug } = options;

  const supabase = await createClient();

  let query = supabase
    .from("locations")
    .select(LOCATION_ITINERARY_COLUMNS)
    .eq("is_active", true);

  if (slug) {
    query = query.or(`planning_city.eq.${slug},city.ilike.${city}`);
  } else {
    query = query.ilike("city", city);
  }

  if (requirePlaceId) {
    query = query.not("place_id", "is", null).neq("place_id", "");
  }

  // Exclude permanently closed locations but include null business_status
  query = query.or("business_status.is.null,business_status.neq.PERMANENTLY_CLOSED");

  if (excludeIds.length > 0) {
    query = query.not("id", "in", `(${excludeIds.join(",")})`);
  }

  const { data, error } = await query.limit(limit);

  if (error || !data) {
    if (error) logger.error("[fetchLocationsByCity] Supabase query failed", error, { code: error.code, city });
    return [];
  }

  assertLocationDbRows(data, "fetchLocationsByCity");
  return (data as unknown as LocationDbRow[]).map(transformDbRowToLocation);
}

/**
 * Options for filtering locations by categories
 */
export interface FetchByCategoriesOptions {
  /** Limit the number of results */
  limit?: number;
  /** Filter by city (optional) */
  city?: string;
  /** Exclude specific location IDs */
  excludeIds?: string[];
  /** Only include locations with valid place_id */
  requirePlaceId?: boolean;
}

/**
 * Fetches locations by categories
 *
 * @param categories - Array of category names to filter by
 * @param options - Additional filtering options
 * @returns Array of matching locations
 */
export async function fetchLocationsByCategories(
  categories: string[],
  options: FetchByCategoriesOptions = {},
): Promise<Location[]> {
  if (categories.length === 0) {
    return [];
  }

  const { limit = 100, city, excludeIds = [], requirePlaceId = true } = options;

  const supabase = await createClient();

  let query = supabase
    .from("locations")
    .select(LOCATION_ITINERARY_COLUMNS)
    .eq("is_active", true)
    .in("category", categories);

  if (city) {
    query = query.ilike("city", city);
  }

  if (requirePlaceId) {
    query = query.not("place_id", "is", null).neq("place_id", "");
  }

  // Exclude permanently closed locations but include null business_status
  query = query.or("business_status.is.null,business_status.neq.PERMANENTLY_CLOSED");

  if (excludeIds.length > 0) {
    query = query.not("id", "in", `(${excludeIds.join(",")})`);
  }

  const { data, error } = await query.limit(limit);

  if (error || !data) {
    if (error) logger.error("[fetchLocationsByCategories] Supabase query failed", error, { code: error.code, categories });
    return [];
  }

  assertLocationDbRows(data, "fetchLocationsByCategories");
  return (data as unknown as LocationDbRow[]).map(transformDbRowToLocation);
}

/**
 * Fetches locations for batch API endpoint (listing columns only)
 *
 * @param ids - Array of location IDs
 * @returns Array of locations with listing columns
 */
export async function fetchLocationsByIdsForListing(ids: string[]): Promise<Location[]> {
  if (ids.length === 0) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("locations")
    .select(LOCATION_LISTING_COLUMNS)
    .in("id", ids);

  if (error || !data) {
    if (error) logger.error("[fetchLocationsByIdsForListing] Supabase query failed", error, { code: error.code });
    return [];
  }

  assertLocationDbRows(data, "fetchLocationsByIdsForListing");
  return (data as unknown as LocationListingDbRow[]).map(transformDbRowToLocation);
}

/**
 * Options for fetching top-rated locations
 */
export interface FetchTopRatedOptions {
  /** Maximum number of locations to return (default: 8) */
  limit?: number;
  /** Minimum rating threshold (default: 4.0) */
  minRating?: number;
  /** Minimum number of reviews required (default: 10) */
  minReviewCount?: number;
}

/**
 * Fetches top-rated locations for featured display
 *
 * @param options - Filtering options
 * @returns Array of top-rated locations sorted by rating descending
 */
export async function fetchTopRatedLocations(
  options: FetchTopRatedOptions = {},
): Promise<Location[]> {
  const { limit = 8, minRating = 4.0, minReviewCount = 10 } = options;
  const cacheKey = `landing-top-rated-${limit}-${minRating.toFixed(1)}-${minReviewCount}`;

  if (!isDev) {
    const cached = readFileCache<Location[]>(cacheKey, LANDING_CACHE_TTL);
    if (cached !== null) return cached;
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("locations")
    .select(LOCATION_LISTING_COLUMNS)
    .eq("is_active", true)
    .is("parent_id", null)
    .not("place_id", "is", null)
    .neq("place_id", "")
    .or("business_status.is.null,business_status.neq.PERMANENTLY_CLOSED")
    .not("rating", "is", null)
    .gte("rating", minRating)
    .not("review_count", "is", null)
    .gte("review_count", minReviewCount)
    .not("primary_photo_url", "is", null)
    .order("rating", { ascending: false })
    .order("review_count", { ascending: false })
    .limit(limit);

  if (error || !data) {
    if (error) logger.error("[fetchTopRatedLocations] Supabase query failed", error, { code: error.code });
    return readFileCacheStale<Location[]>(cacheKey) ?? [];
  }

  assertLocationDbRows(data, "fetchTopRatedLocations");
  const locations = (data as unknown as LocationListingDbRow[]).map(transformDbRowToLocation);
  writeFileCache(cacheKey, locations);
  return locations;
}

/**
 * Valid pattern for city names - letters, spaces, and hyphens only
 * Used to prevent SQL injection in city filter queries
 */
const VALID_CITY_PATTERN = /^[A-Za-z\s-]+$/;

/**
 * Validates city names before building filter strings
 * @throws Error if any city name contains invalid characters
 */
function validateCityNames(cities: string[]): void {
  for (const city of cities) {
    if (!VALID_CITY_PATTERN.test(city)) {
      throw new Error(`Invalid city name: "${city}". City names must contain only letters, spaces, and hyphens.`);
    }
  }
}

/**
 * Options for fetching all locations
 */
export interface FetchAllLocationsOptions {
  /** Filter by specific cities (case-insensitive) */
  cities?: string[];
  /** Maximum number of pages to fetch (default: 100) */
  maxPages?: number;
  /** Items per page (default: 100) */
  pageSize?: number;
}

/**
 * Fetches all locations from the database with pagination
 *
 * This function handles large datasets by paginating through results.
 * It validates city names to prevent injection attacks.
 *
 * @param options - Filtering and pagination options
 * @returns Array of all matching locations
 * @throws Error if database query fails or no locations found
 */
export async function fetchAllLocations(
  options: FetchAllLocationsOptions = {},
): Promise<Location[]> {
  const { cities, maxPages = 100, pageSize = 100 } = options;

  // Validate city names if provided
  if (cities && cities.length > 0) {
    validateCityNames(cities);
  }

  const supabase = await createClient();

  // Use larger page size (1000) to reduce round trips — was 100, causing 40+ sequential fetches
  const effectivePageSize = Math.max(pageSize, 1000);

  // First, fetch page 0 to determine if we need more
  let baseQuery = supabase
    .from("locations")
    .select(LOCATION_ITINERARY_COLUMNS)
    .eq("is_active", true)
    .eq("is_accommodation", false)
    .order("name", { ascending: true });

  if (cities && cities.length > 0) {
    // Strict planner picker: planning_city is authoritative when set;
    // city.ilike only fires for rows where planning_city IS NULL (legacy bridge,
    // ~35 rows corpus-wide as of 2026-05-10). Surface divergence: city pages
    // (fetchLocationsByCity / fetchCityHeroPhotoUrl) intentionally keep the
    // wider OR-fallback for browse breadth + PR #195 diacritic resolution.
    const planningFilters = cities.map((c) => `planning_city.eq.${c.toLowerCase()}`).join(",");
    const cityFilters = cities.map((c) => `and(planning_city.is.null,city.ilike.${c})`).join(",");
    baseQuery = baseQuery.or(`${planningFilters},${cityFilters}`);
  }

  const { data: firstPage, error: firstError } = await baseQuery.range(0, effectivePageSize - 1);

  if (firstError) {
    throw new Error(`Failed to fetch locations from database: ${firstError.message}`);
  }

  if (!firstPage || firstPage.length === 0) {
    throw new Error("No locations found in database. Please ensure locations are seeded.");
  }

  assertLocationDbRows(firstPage, "fetchAllLocations");
  const allLocations: Location[] = (firstPage as unknown as LocationDbRow[]).map(transformDbRowToLocation);

  // If first page was full, fetch remaining pages in parallel
  if (firstPage.length === effectivePageSize) {
    // Estimate total pages needed and fire requests in parallel
    const pagePromises: Promise<Location[]>[] = [];
    for (let page = 1; page < maxPages; page++) {
      pagePromises.push(
        (async () => {
          let query = supabase
            .from("locations")
            .select(LOCATION_ITINERARY_COLUMNS)
            .eq("is_active", true)
            .eq("is_accommodation", false)
            .order("name", { ascending: true });

          if (cities && cities.length > 0) {
            // Strict planner picker; matches the rule applied above on the first page.
            const planningFilters = cities.map((c) => `planning_city.eq.${c.toLowerCase()}`).join(",");
            const cityFilters = cities.map((c) => `and(planning_city.is.null,city.ilike.${c})`).join(",");
            query = query.or(`${planningFilters},${cityFilters}`);
          }

          const { data, error } = await query.range(
            page * effectivePageSize,
            (page + 1) * effectivePageSize - 1,
          );

          if (error || !data || data.length === 0) {
            return [];
          }
          assertLocationDbRows(data, "fetchAllLocations.page");
          return (data as unknown as LocationDbRow[]).map(transformDbRowToLocation);
        })(),
      );
    }

    // Resolve all in parallel — empty arrays indicate we've passed the last page
    const results = await Promise.all(pagePromises);
    for (const locations of results) {
      if (locations.length === 0) break;
      allLocations.push(...locations);
    }
  }

  return allLocations;
}

/**
 * Fetches locations that have seasonal tags matching the given month.
 * Used for the Seasonal Spotlight section on the landing page.
 */
export async function fetchSeasonalLocations(
  month: number,
  limit: number = 12,
  options?: { regions?: string[] }
): Promise<Location[]> {
  const { getSeasonalTags } = await import("@/lib/utils/seasonUtils");
  const tags = getSeasonalTags(month);
  if (tags.length === 0) return [];

  const supabase = await createClient();

  let query = supabase
    .from("locations")
    .select(LOCATION_LISTING_COLUMNS)
    .eq("is_active", true)
    .overlaps("tags", tags)
    .gte("rating", 4.0);

  // Region narrowing must run as a SQL filter (not post-fetch) so the
  // limited card pool isn't starved when most matches are out-of-region —
  // e.g. the late-bloom window narrows to Tohoku/Hokkaido while most
  // cherry-blossom rows are in Kansai/Kanto.
  if (options?.regions && options.regions.length > 0) {
    query = query.in("region", options.regions);
  }

  const { data, error } = await query
    .order("rating", { ascending: false })
    .limit(limit);

  if (error || !data) {
    logger.warn("Failed to fetch seasonal locations", { error });
    return [];
  }

  return (data as unknown as LocationListingDbRow[]).map(transformDbRowToLocation);
}

/**
 * Returns the highest-rated photo URL for a city — for OG metadata only.
 * Single-row fetch, no payload duplication with the full city page query.
 * Returns `undefined` if the city has no rated, photographed locations.
 */
export async function fetchCityHeroPhotoUrl(
  cityName: string,
  slug?: string,
): Promise<string | undefined> {
  const supabase = await createClient();
  let query = supabase
    .from("locations")
    .select("primary_photo_url")
    .eq("is_active", true)
    .not("primary_photo_url", "is", null);

  // Match on planning_city (KnownCityId slug) when provided so cities with
  // diacritic display names (Nikkō → city='Nikko' in DB) still resolve.
  if (slug) {
    query = query.or(`planning_city.eq.${slug},city.ilike.${cityName}`);
  } else {
    query = query.eq("city", cityName);
  }

  const { data, error } = await query
    .order("rating", { ascending: false, nullsFirst: false })
    .order("review_count", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return undefined;
  const url = data.primary_photo_url;
  return typeof url === "string" && url.length > 0 ? url : undefined;
}

export type SitemapLocationEntry = {
  id: string;
  /** ISO timestamp; `null` if the row never had `updated_at` populated. */
  updatedAt: string | null;
  /** Absolute URL of the primary photo, if present. Used for Image sitemap extension. */
  photoUrl: string | null;
};

/**
 * Returns id + updated_at + photo for every active location, paginated in
 * 1000-row chunks to bypass Supabase's default row limit.
 *
 * Used by the sitemap route so each entry can carry a real `lastmod` (vs.
 * build-time `new Date()`) — without a credible lastmod Google ignores the
 * field, losing per-page recrawl prioritization. Photo URL feeds the Image
 * sitemap extension.
 */
export async function getSitemapLocationEntries(): Promise<SitemapLocationEntry[]> {
  const supabase = await createClient();
  const pageSize = 1000;
  const entries: SitemapLocationEntry[] = [];

  for (let page = 0; ; page += 1) {
    const { data, error } = await supabase
      .from("locations")
      .select("id, updated_at, primary_photo_url")
      .eq("is_active", true)
      .or("business_status.is.null,business_status.neq.PERMANENTLY_CLOSED")
      .order("id", { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      logger.warn("Failed to fetch locations for sitemap entries", { error: error.message, page });
      break;
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row && typeof row.id === "string") {
        entries.push({
          id: row.id,
          updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
          photoUrl: typeof row.primary_photo_url === "string" ? row.primary_photo_url : null,
        });
      }
    }
    if (data.length < pageSize) break;
  }

  return entries;
}
