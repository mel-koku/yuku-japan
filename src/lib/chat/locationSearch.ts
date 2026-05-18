import { createClient } from "@/lib/supabase/server";
import { LOCATION_CHAT_COLUMNS } from "@/lib/supabase/projections";
import type { LocationChatDbRow } from "@/lib/supabase/projections";
import { getOpenStatus } from "@/lib/availability/isOpenNow";
import { logger } from "@/lib/logger";
import { calculateDistance } from "@/lib/utils/geoUtils";
import { normalizeOperatingHours } from "@/lib/locations/normalizeHours";

export type ChatLocationResult = {
  id: string;
  /** URL slug for the `/places/[slug]` route — see LocationDbRow.slug. */
  slug: string;
  name: string;
  city: string;
  region: string;
  prefecture: string | null;
  category: string;
  image: string;
  shortDescription: string | null;
  editorialSummary: string | null;
  description: string | null;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: number | null;
  estimatedDuration: string | null;
  operatingHours: LocationChatDbRow["operating_hours"];
  coordinates: { lat: number; lng: number } | null;
  primaryPhotoUrl: string | null;
  jtaApproved: boolean | null;
};

function transformChatRow(row: LocationChatDbRow): ChatLocationResult {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    region: row.region,
    prefecture: row.prefecture,
    category: row.category,
    image: row.image,
    shortDescription: row.short_description,
    editorialSummary: row.editorial_summary,
    description: row.description,
    rating: row.rating,
    reviewCount: row.review_count,
    priceLevel: row.price_level,
    estimatedDuration: row.estimated_duration,
    operatingHours: normalizeOperatingHours(row.operating_hours) ?? null,
    coordinates: row.coordinates,
    primaryPhotoUrl: row.primary_photo_url,
    jtaApproved: row.jta_approved,
  };
}

export type LocationSearchFilters = {
  query?: string;
  city?: string;
  region?: string;
  category?: string;
  priceLevel?: number;
  jtaApproved?: boolean;
  limit?: number;
};

/**
 * Search locations for chat responses.
 * Text search via ilike on name/description + structured filters.
 */
export async function searchLocationsForChat(
  filters: LocationSearchFilters,
): Promise<ChatLocationResult[]> {
  try {
    const supabase = await createClient();
    const limit = filters.limit ?? 8;

    let query = supabase
      .from("locations")
      .select(LOCATION_CHAT_COLUMNS)
      .eq("is_active", true)
      .neq("business_status", "PERMANENTLY_CLOSED")
      .limit(limit);

    if (filters.city) {
      query = query.ilike("city", `%${filters.city}%`);
    }
    if (filters.region) {
      query = query.ilike("region", `%${filters.region}%`);
    }
    if (filters.category) {
      query = query.ilike("category", filters.category);
    }
    if (filters.priceLevel !== undefined) {
      query = query.lte("price_level", filters.priceLevel);
    }
    if (filters.jtaApproved) {
      query = query.eq("jta_approved", true);
    }
    if (filters.query) {
      query = query.or(
        `name.ilike.%${filters.query}%,short_description.ilike.%${filters.query}%,description.ilike.%${filters.query}%`,
      );
    }

    query = query.order("rating", { ascending: false, nullsFirst: false });

    const { data, error } = await query;

    if (error) {
      logger.error("Chat location search failed", error);
      return [];
    }

    return (data as unknown as LocationChatDbRow[]).map(transformChatRow);
  } catch (error) {
    logger.error(
      "Chat location search error",
      error instanceof Error ? error : new Error(String(error)),
    );
    return [];
  }
}

export type NearbySearchParams = {
  lat: number;
  lng: number;
  radiusKm?: number;
  category?: string;
  openNow?: boolean;
  limit?: number;
};

/**
 * Find locations near a lat/lng point using bounding-box query + Haversine sort.
 */
export async function searchNearbyLocations(
  params: NearbySearchParams,
): Promise<ChatLocationResult[]> {
  try {
    const supabase = await createClient();
    const radiusKm = params.radiusKm ?? 2;
    const limit = params.limit ?? 8;

    // Approximate bounding box (1 degree ≈ 111km)
    const latDelta = radiusKm / 111;
    const lngDelta = radiusKm / (111 * Math.cos((params.lat * Math.PI) / 180));

    let query = supabase
      .from("locations")
      .select(LOCATION_CHAT_COLUMNS)
      .eq("is_active", true)
      .neq("business_status", "PERMANENTLY_CLOSED")
      .not("coordinates", "is", null)
      .gte("coordinates->lat", params.lat - latDelta)
      .lte("coordinates->lat", params.lat + latDelta)
      .gte("coordinates->lng", params.lng - lngDelta)
      .lte("coordinates->lng", params.lng + lngDelta)
      .limit(50); // fetch more, sort in JS

    if (params.category) {
      query = query.ilike("category", params.category);
    }

    const { data, error } = await query;

    if (error) {
      logger.error("Chat nearby search failed", error);
      return [];
    }

    // Sort by distance using shared Haversine
    let rows = (data as unknown as LocationChatDbRow[])
      .map((row) => {
        const coords = row.coordinates;
        if (!coords) return { row, distance: Infinity };
        const distance = calculateDistance(
          { lat: params.lat, lng: params.lng },
          coords,
        );
        return { row, distance };
      })
      .filter(({ distance }) => distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);

    // Filter by open now if requested
    if (params.openNow) {
      rows = rows.filter(({ row }) =>
        getOpenStatus(normalizeOperatingHours(row.operating_hours)).state === "open",
      );
    }

    return rows.slice(0, limit).map(({ row }) => transformChatRow(row));
  } catch (error) {
    logger.error(
      "Chat nearby search error",
      error instanceof Error ? error : new Error(String(error)),
    );
    return [];
  }
}

/**
 * Get full location detail by ID for chat.
 */
export async function getLocationDetailForChat(
  id: string,
): Promise<ChatLocationResult | null> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("locations")
      .select(LOCATION_CHAT_COLUMNS)
      .eq("id", id)
      .single();

    if (error || !data) {
      logger.warn("Chat location detail not found", { id });
      return null;
    }

    return transformChatRow(data as unknown as LocationChatDbRow);
  } catch (error) {
    logger.error(
      "Chat location detail error",
      error instanceof Error ? error : new Error(String(error)),
    );
    return null;
  }
}
