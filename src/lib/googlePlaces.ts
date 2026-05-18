import { Location, LocationDetails } from "@/types/location";
import { fetchWithTimeout } from "@/lib/api/fetchWithTimeout";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { TIMEOUT_10_SECONDS } from "@/lib/constants";

// Import from extracted modules
import {
  type PlaceIdCacheEntry,
  type PlaceDetailsRow,
  getPlaceIdCache,
  getPlaceDetailsCache,
  getSupabaseClientSafe,
  normalizeDetailsRow,
  PLACE_ID_CACHE_TTL,
  PLACE_DETAILS_CACHE_TTL,
  PLACE_DETAILS_TABLE,
  SUPABASE_DETAILS_COLUMN_SET,
} from "@/lib/google/cache";
import {
  type PlaceDetailsPayload,
  transformPlaceDetails,
} from "@/lib/google/transformations";
import { mapGoogleTypeToCategory } from "@/lib/google/typeMapping";
import {
  searchPlaceId,
  type AutocompletePlace,
  type PlaceWithCoordinates,
  type AutocompleteOptions,
  autocompletePlaces as autocompletePlacesFromSearch,
  fetchPlaceCoordinates as fetchPlaceCoordinatesFromSearch,
} from "@/lib/google/search";

const PLACES_API_BASE_URL = "https://places.googleapis.com/v1";

/**
 * Slim runtime mask kept inside Google's Advanced billing tier.
 * Excludes Preferred-tier fields (editorialSummary, internationalPhoneNumber,
 * regularOpeningHours) — those are already populated in DB columns
 * (editorial_summary, phone_number, operating_hours) from prior enrichment,
 * and runtime UI serves them via /api/locations/[id]. Trade-off: opening hours
 * can go stale between enrichment refreshes.
 */
const RUNTIME_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "shortFormattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "websiteUri",
  "googleMapsUri",
  "photos.name",
].join(",");

/**
 * Full field mask for enrichment scripts that need all data.
 * ~35 fields — includes reviews, photo metadata, categorization, service options.
 */
export const FULL_FIELD_MASK = [
  // Basic info
  "id",
  "displayName",
  "formattedAddress",
  "shortFormattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "editorialSummary",
  "websiteUri",
  "internationalPhoneNumber",
  "googleMapsUri",
  // Opening hours
  "regularOpeningHours.weekdayDescriptions",
  "currentOpeningHours.weekdayDescriptions",
  // Reviews
  "reviews.authorAttribution",
  "reviews.rating",
  "reviews.relativePublishTimeDescription",
  "reviews.publishTime",
  "reviews.text",
  // Photos
  "photos.name",
  "photos.widthPx",
  "photos.heightPx",
  "photos.authorAttributions",
  // Categorization (for enrichment)
  "primaryType",
  "types",
  // Status & Price
  "businessStatus",
  "priceLevel",
  // Accessibility options
  "accessibilityOptions",
  // Restaurant/food service options
  "servesVegetarianFood",
  "servesBeer",
  "servesWine",
  "dineIn",
  "takeout",
  "delivery",
  "servesBreakfast",
  "servesBrunch",
  "servesLunch",
  "servesDinner",
].join(",");


function getApiKey(): string {
  const key = env.googlePlacesApiKey;
  if (!key) {
    throw new Error(
      "Missing Google Places API key. Set GOOGLE_PLACES_API_KEY in your environment.",
    );
  }
  return key;
}

/**
 * Safely checks if a location can resolve its Google Place ID without throwing an error.
 * Returns true if the location has a placeId or can successfully resolve one.
 */
export async function canResolvePlaceId(location: Location): Promise<boolean> {
  try {
    // If location already has a place_id, consider it valid
    if (location.placeId) {
      return true;
    }

    const cache = getPlaceIdCache();
    const cached = cache.get(location.id);
    if (cached && cached.expiresAt > Date.now()) {
      return true;
    }

    // Try to resolve Place ID
    const query = [location.name, location.city, location.region, "Japan"]
      .filter(Boolean)
      .join(", ");

    const found = await searchPlaceId({ query });
    if (found) {
      cache.set(location.id, found);
      return true;
    }

    return false;
  } catch (_error) {
    return false;
  }
}

async function resolvePlaceId(location: Location): Promise<PlaceIdCacheEntry> {
  const cache = getPlaceIdCache();
  const cached = cache.get(location.id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  if (location.placeId) {
    const entry: PlaceIdCacheEntry = {
      placeId: location.placeId,
      expiresAt: Date.now() + PLACE_ID_CACHE_TTL,
    };
    cache.set(location.id, entry);
    return entry;
  }

  const query = [location.name, location.city, location.region, "Japan"]
    .filter(Boolean)
    .join(", ");

  const found = await searchPlaceId({ query });
  if (!found) {
    throw new Error(`Could not resolve Google Place ID for location "${location.name}".`);
  }

  cache.set(location.id, found);
  return found;
}

export async function fetchLocationDetails(location: Location): Promise<LocationDetails> {
  const detailsCache = getPlaceDetailsCache();

  const cached = detailsCache.get(location.id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.details;
  }

  const { client: supabase, canPersist } = await getSupabaseClientSafe();
  let supabaseRow: PlaceDetailsRow | null = null;

  if (supabase) {
    const { data, error } = await supabase
      .from(PLACE_DETAILS_TABLE)
      .select(SUPABASE_DETAILS_COLUMN_SET)
      .eq("location_id", location.id)
      .maybeSingle<PlaceDetailsRow>();

    if (error && process.env.NODE_ENV !== "production") {
      logger.warn("Failed to read cached Google Place details", {
        locationId: location.id,
        error,
      });
    }

    if (data) {
      supabaseRow = data;
    }
  }

  if (supabaseRow) {
    const fetchedAt = Date.parse(supabaseRow.fetched_at);
    if (!Number.isNaN(fetchedAt) && fetchedAt + PLACE_DETAILS_CACHE_TTL > Date.now()) {
      const normalized = normalizeDetailsRow(supabaseRow);
      detailsCache.set(location.id, {
        details: normalized,
        expiresAt: Date.now() + PLACE_DETAILS_CACHE_TTL,
      });
      const placeIdCache = getPlaceIdCache();
      placeIdCache.set(location.id, {
        placeId: normalized.placeId,
        expiresAt: Date.now() + PLACE_ID_CACHE_TTL,
        matchedName: undefined,
        formattedAddress: undefined,
      });
      return normalized;
    }
  }

  let resolvedPlaceId = supabaseRow?.place_id;
  if (!resolvedPlaceId) {
    const { placeId } = await resolvePlaceId(location);
    resolvedPlaceId = placeId;
  } else {
    const placeIdCache = getPlaceIdCache();
    placeIdCache.set(location.id, {
      placeId: resolvedPlaceId,
      expiresAt: Date.now() + PLACE_ID_CACHE_TTL,
      matchedName: undefined,
      formattedAddress: undefined,
    });
  }

  const apiKey = getApiKey();

  const response = await fetchWithTimeout(
    `${PLACES_API_BASE_URL}/places/${resolvedPlaceId}?languageCode=en`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": RUNTIME_FIELD_MASK,
      },
      cache: "no-store",
    },
    TIMEOUT_10_SECONDS,
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to fetch details for "${location.name}". Status ${response.status}. Body: ${errorBody}`,
    );
  }

  const payload = (await response.json()) as PlaceDetailsPayload;
  const details = transformPlaceDetails(payload, resolvedPlaceId);
  detailsCache.set(location.id, {
    details,
    expiresAt: Date.now() + PLACE_DETAILS_CACHE_TTL,
  });

  if (supabase && canPersist) {
    const { error } = await supabase.from(PLACE_DETAILS_TABLE).upsert({
      location_id: location.id,
      place_id: details.placeId,
      payload: details as unknown as Record<string, unknown>,
      fetched_at: details.fetchedAt,
    } as never);

    if (error && process.env.NODE_ENV !== "production") {
      logger.warn("Failed to persist Google Place details", {
        locationId: location.id,
        error,
      });
    }
  }

  return details;
}

export async function fetchPhotoStream(
  photoName: string,
  options?: { maxWidthPx?: number; maxHeightPx?: number },
): Promise<Response> {
  const apiKey = getApiKey();
  const params = new URLSearchParams();
  if (options?.maxWidthPx) {
    params.set("maxWidthPx", options.maxWidthPx.toString());
  }
  if (options?.maxHeightPx) {
    params.set("maxHeightPx", options.maxHeightPx.toString());
  }

  const query = params.toString();
  const url = query
    ? `${PLACES_API_BASE_URL}/${photoName}/media?${query}`
    : `${PLACES_API_BASE_URL}/${photoName}/media`;

  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        "X-Goog-Api-Key": apiKey,
      },
    },
    TIMEOUT_10_SECONDS,
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to fetch photo "${photoName}". Status ${response.status}. Body: ${errorBody}`,
    );
  }

  return response;
}

// Re-export types and functions from search module for backward compatibility
export type { AutocompletePlace, PlaceWithCoordinates, AutocompleteOptions };
export const autocompletePlaces = autocompletePlacesFromSearch;
export const fetchPlaceCoordinates = fetchPlaceCoordinatesFromSearch;

/**
 * Extended payload type that includes all fields from FULL_FIELD_MASK
 */
type FullPlaceDetailsPayload = PlaceDetailsPayload & {
  location?: {
    latitude?: number;
    longitude?: number;
  };
  primaryType?: string;
  types?: string[];
  businessStatus?: string;
  priceLevel?: string;
  accessibilityOptions?: {
    wheelchairAccessibleEntrance?: boolean;
    wheelchairAccessibleParking?: boolean;
    wheelchairAccessibleRestroom?: boolean;
    wheelchairAccessibleSeating?: boolean;
  };
  servesVegetarianFood?: boolean;
  dineIn?: boolean;
  takeout?: boolean;
  delivery?: boolean;
  servesBreakfast?: boolean;
  servesBrunch?: boolean;
  servesLunch?: boolean;
  servesDinner?: boolean;
};

export type PlaceDetailsWithLocation = {
  location: Location;
  details: LocationDetails;
};

/**
 * Fetch place details by Google Place ID using the slim RUNTIME_FIELD_MASK.
 * Returns both a Location object (for display) and LocationDetails (for additional info).
 * This is used for entry points and custom locations not in the database.
 * Note: Enrichment fields (primaryType, types, businessStatus, meal/service options)
 * are not requested — the Location object will have those fields as undefined.
 */
export async function fetchPlaceDetailsByPlaceId(
  placeId: string,
  fallbackName?: string,
): Promise<PlaceDetailsWithLocation | null> {
  const apiKey = getApiKey();

  const response = await fetchWithTimeout(
    `${PLACES_API_BASE_URL}/places/${placeId}?languageCode=en`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": RUNTIME_FIELD_MASK,
      },
      cache: "no-store",
    },
    TIMEOUT_10_SECONDS,
  );

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error("Failed to fetch place details by placeId", new Error(errorBody), {
      placeId,
      status: response.status,
    });
    return null;
  }

  const payload = (await response.json()) as FullPlaceDetailsPayload;

  if (!payload.id) {
    return null;
  }

  // Transform to LocationDetails
  const details = transformPlaceDetails(payload, placeId);

  // Map Google type to our category
  const { category } = mapGoogleTypeToCategory(payload.primaryType, payload.types);

  // Extract city from formatted address (typically first part before comma)
  const addressParts = payload.formattedAddress?.split(",") ?? [];
  const city = addressParts.length > 1 ? addressParts[addressParts.length - 2]?.trim() : addressParts[0]?.trim() ?? "";
  const region = addressParts.length > 0 ? addressParts[addressParts.length - 1]?.trim() : "";

  // Get first photo URL if available
  let primaryPhotoUrl: string | undefined;
  if (details.photos.length > 0 && details.photos[0]) {
    primaryPhotoUrl = details.photos[0].proxyUrl;
  }

  // Build Location object
  const location: Location = {
    id: placeId,
    // Synthesized from a raw Google Places response — not a `locations` row,
    // never linked via /places/. `Location.slug` is required; mirror the id.
    slug: placeId,
    name: payload.displayName?.text ?? fallbackName ?? "",
    region: region || "Japan",
    city: city || "Japan",
    category,
    image: primaryPhotoUrl ?? "",
    coordinates: payload.location ? {
      lat: payload.location.latitude ?? 0,
      lng: payload.location.longitude ?? 0,
    } : undefined,
    placeId,
    rating: payload.rating,
    reviewCount: payload.userRatingCount,
    shortDescription: payload.editorialSummary?.text,
    googlePrimaryType: payload.primaryType,
    googleTypes: payload.types,
    businessStatus: payload.businessStatus as Location["businessStatus"],
    primaryPhotoUrl,
    accessibilityOptions: payload.accessibilityOptions,
    dietaryOptions: payload.servesVegetarianFood !== undefined ? {
      servesVegetarianFood: payload.servesVegetarianFood,
    } : undefined,
    serviceOptions: (payload.dineIn !== undefined || payload.takeout !== undefined || payload.delivery !== undefined) ? {
      dineIn: payload.dineIn,
      takeout: payload.takeout,
      delivery: payload.delivery,
    } : undefined,
    mealOptions: (payload.servesBreakfast !== undefined || payload.servesBrunch !== undefined ||
                  payload.servesLunch !== undefined || payload.servesDinner !== undefined) ? {
      servesBreakfast: payload.servesBreakfast,
      servesBrunch: payload.servesBrunch,
      servesLunch: payload.servesLunch,
      servesDinner: payload.servesDinner,
    } : undefined,
  };

  // Cache in memory
  const detailsCache = getPlaceDetailsCache();
  detailsCache.set(placeId, { details, expiresAt: Date.now() + PLACE_DETAILS_CACHE_TTL });

  // Persist to Supabase so subsequent cold starts don't re-fetch from Google
  const { client: supabase, canPersist } = await getSupabaseClientSafe();
  if (supabase && canPersist) {
    const { error: persistError } = await supabase.from(PLACE_DETAILS_TABLE).upsert({
      location_id: placeId,
      place_id: details.placeId,
      payload: details as unknown as Record<string, unknown>,
      fetched_at: details.fetchedAt,
    } as never);

    if (persistError && process.env.NODE_ENV !== "production") {
      logger.warn("Failed to persist entry point place details", {
        placeId,
        error: persistError,
      });
    }
  }

  return { location, details };
}

