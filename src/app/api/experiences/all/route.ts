import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Location } from "@/types/location";
import type { SupabaseExperience } from "@/types/experience";
import { logger } from "@/lib/logger";
import { internalError } from "@/lib/api/errors";
import { withApiHandler } from "@/lib/api/withApiHandler";
import { RATE_LIMITS } from "@/lib/api/rateLimits";
import { EXPERIENCE_EXPLORE_COLUMNS } from "@/lib/supabase/projections";
import { readFileCache, writeFileCache } from "@/lib/api/fileCache";
import { normalizeOperatingHours } from "@/lib/locations/normalizeHours";

/**
 * Two-tier cache: globalThis + file cache.
 * Same pattern as /api/locations/all.
 */
const CACHE_TTL = 30 * 60 * 1000; // 30 min in-memory
const FILE_CACHE_KEY = "experiences-all";
const FILE_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hour file cache

type ExperiencesPayload = { data: Location[]; total: number };
type ExperiencesCache = ExperiencesPayload & { cachedAt: number };
const _g = globalThis as typeof globalThis & { __experiencesCache?: ExperiencesCache };

function getCached(): ExperiencesPayload | null {
  const c = _g.__experiencesCache;
  if (c && Date.now() - c.cachedAt <= CACHE_TTL) {
    return { data: c.data, total: c.total };
  }
  const fileData = readFileCache<ExperiencesPayload>(FILE_CACHE_KEY, FILE_CACHE_TTL);
  if (fileData) {
    _g.__experiencesCache = { ...fileData, cachedAt: Date.now() };
    return fileData;
  }
  _g.__experiencesCache = undefined;
  return null;
}

function setCache(data: Location[], total: number) {
  const payload: ExperiencesPayload = { data, total };
  _g.__experiencesCache = { ...payload, cachedAt: Date.now() };
  writeFileCache(FILE_CACHE_KEY, payload);
}

/**
 * Map a Supabase experience row to Location-compatible shape.
 * This allows shared components (PlacesGridB, PlacesMapLayoutB, etc.)
 * to render experiences without modification.
 */
function mapToLocation(row: SupabaseExperience): Location {
  return {
    id: row.id,
    // Experiences are not `locations` rows and route via /experiences/[slug],
    // never /places/[slug]. `Location.slug` is required by the type; mirror
    // `id` so shared place components type-check.
    slug: row.id,
    name: row.name,
    region: row.region ?? "",
    city: row.city ?? "",
    prefecture: row.prefecture ?? undefined,
    // Use experience_type as category so components can distinguish
    category: row.experience_type ?? "experience",
    image: row.primary_photo_url ? "" : (row.image ?? ""),
    shortDescription: row.summary ?? row.short_description ?? undefined,
    estimatedDuration: row.estimated_duration ?? undefined,
    rating: row.rating ?? undefined,
    reviewCount: row.review_count ?? undefined,
    primaryPhotoUrl: row.primary_photo_url ?? undefined,
    coordinates: row.coordinates ?? undefined,
    craftType: row.craft_type ?? undefined,
    tags: row.tags ?? undefined,
    isHiddenGem: row.is_hidden_gem ?? undefined,
    insiderTip: row.insider_tip ?? undefined,
    operatingHours: normalizeOperatingHours(row.operating_hours),
    nameJapanese: row.name_japanese ?? undefined,
    nearestStation: row.nearest_station ?? undefined,
    priceLevel: row.price_level as Location["priceLevel"] ?? undefined,
    sanitySlug: row.sanity_slug ?? undefined,
    hasEditorial: row.has_editorial ?? undefined,
    bookingUrl: row.booking_url ?? undefined,
    difficulty: row.difficulty ?? undefined,
  };
}

/**
 * GET /api/experiences/all
 * Returns all experiences mapped to Location-compatible shape.
 *
 * Response: { data: Location[], total: number }
 */
export const GET = withApiHandler(
  async (_request, { context }) => {
    const cached = getCached();
    if (cached) {
      return NextResponse.json(cached, {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400",
          "X-Cache": "HIT",
        },
      });
    }

    const supabase = await createClient();

    const PAGE_SIZE = 1000;
    let allRows: SupabaseExperience[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: batch, error } = await supabase
        .from("experiences")
        .select(EXPERIENCE_EXPLORE_COLUMNS)
        .order("name", { ascending: true })
        .range(from, to);

      if (error) {
        logger.error("Failed to fetch experiences page", error, {
          page,
          requestId: context.requestId,
        });
        return internalError("Failed to fetch experiences from database", { error: error.message }, {
          requestId: context.requestId,
        });
      }

      const rows = (batch || []) as unknown as SupabaseExperience[];
      allRows = allRows.concat(rows);
      hasMore = rows.length === PAGE_SIZE;
      page++;
    }

    const locations: Location[] = allRows.map(mapToLocation);

    setCache(locations, locations.length);

    return NextResponse.json(
      { data: locations, total: locations.length },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400",
          "X-Cache": "MISS",
        },
      },
    );
  },
  { rateLimit: RATE_LIMITS.EXPERIENCES },
);
