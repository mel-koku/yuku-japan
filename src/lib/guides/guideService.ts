/**
 * Server-side guide service for fetching guides from the database
 *
 * Provides functions to query AI-generated travel guides stored in Supabase.
 */

import { createClient } from "@/lib/supabase/server";
import type { Guide, GuideRow, GuideSummary } from "@/types/guide";
import { rowToGuide } from "@/types/guide";
import { fetchLocationsByIds } from "@/lib/locations/locationService";
import {
  attachGuideFallbackImage,
  attachLocationFallbackImages,
  patchLocationHeroPhotos,
} from "@/services/guides/fallbackImages";
import type { Location } from "@/types/location";
import { sanityClient } from "@/sanity/client";
import { guideBySlugQuery, authorBySlugQuery, allAuthorsQuery } from "@/sanity/queries";
import type { SanityGuide, SanityAuthorFull, SanityAuthorSummary } from "@/types/sanityGuide";
import { logger } from "@/lib/logger";

/**
 * Columns for full guide fetch
 */
const GUIDE_FULL_COLUMNS = `
  id,
  title,
  subtitle,
  summary,
  body,
  featured_image,
  thumbnail_image,
  guide_type,
  seasons,
  tags,
  city,
  region,
  location_ids,
  reading_time_minutes,
  author,
  status,
  featured,
  sort_order,
  created_at,
  updated_at,
  published_at
`;

/**
 * Columns for guide list/summary fetch (lighter payload)
 */
const GUIDE_SUMMARY_COLUMNS = `
  id,
  title,
  subtitle,
  summary,
  featured_image,
  thumbnail_image,
  guide_type,
  seasons,
  city,
  region,
  reading_time_minutes,
  tags,
  location_ids
`;

type GuideSummaryRow = {
  id: string;
  title: string;
  subtitle: string | null;
  summary: string;
  featured_image: string;
  thumbnail_image: string | null;
  guide_type: GuideSummary["guideType"];
  seasons: string[] | null;
  city: string | null;
  region: string | null;
  reading_time_minutes: number | null;
  tags: string[];
  location_ids: string[] | null;
};

function rowToSummary(row: GuideSummaryRow): GuideSummary {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle ?? undefined,
    summary: row.summary,
    featuredImage: row.featured_image,
    thumbnailImage: row.thumbnail_image ?? undefined,
    guideType: row.guide_type,
    seasons: row.seasons ?? undefined,
    city: row.city ?? undefined,
    region: row.region ?? undefined,
    readingTimeMinutes: row.reading_time_minutes ?? undefined,
    tags: row.tags,
  };
}

async function summariesWithFallbacks(
  rows: GuideSummaryRow[]
): Promise<GuideSummary[]> {
  const summaries = rows.map(rowToSummary);
  const locationIdsByGuide = new Map<string, string[]>();
  for (const row of rows) {
    locationIdsByGuide.set(row.id, row.location_ids ?? []);
  }
  return attachLocationFallbackImages(summaries, locationIdsByGuide);
}

/**
 * Returns the total number of published guides.
 */
export async function getGuideCount(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("guides")
    .select("*", { count: "exact", head: true })
    .eq("status", "published");

  if (error || count === null) {
    return 0;
  }

  return count;
}

export type SitemapGuideEntry = {
  /** The guide slug — Supabase guides use the slug as their `id` column. */
  id: string;
  /** ISO timestamp from `updated_at`, or `null` if missing. */
  updatedAt: string | null;
};

/**
 * Lean projection for sitemap generation — id + updated_at only.
 *
 * Avoids dragging the full summary projection (and its image fallback
 * pipeline) through the sitemap route just to read a timestamp.
 */
export async function getSitemapGuideEntries(): Promise<SitemapGuideEntry[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("guides")
    .select("id, updated_at")
    .eq("status", "published");

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: typeof row.id === "string" ? row.id : "",
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  })).filter((entry) => entry.id);
}

/**
 * Fetches all published guides for the list page.
 *
 * @returns Array of guide summaries sorted by sort_order and published_at
 */
export async function getPublishedGuides(): Promise<GuideSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("guides")
    .select(GUIDE_SUMMARY_COLUMNS)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("published_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return summariesWithFallbacks(data as unknown as GuideSummaryRow[]);
}

/**
 * Fetches a single guide by its slug ID.
 *
 * @param slug - The guide's slug-based ID
 * @returns The full guide or null if not found/not published
 */
export async function getGuideBySlug(slug: string): Promise<Guide | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("guides")
    .select(GUIDE_FULL_COLUMNS)
    .eq("id", slug)
    .eq("status", "published")
    .single();

  if (error || !data) {
    return null;
  }

  return attachGuideFallbackImage(rowToGuide(data as GuideRow));
}

/**
 * Fetches featured guides for homepage display.
 *
 * @param limit - Maximum number of guides to return (default: 3)
 * @returns Array of featured guide summaries
 */
export async function getFeaturedGuides(limit: number = 3): Promise<GuideSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("guides")
    .select(GUIDE_SUMMARY_COLUMNS)
    .eq("status", "published")
    .eq("featured", true)
    .order("sort_order", { ascending: true })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return summariesWithFallbacks(data as unknown as GuideSummaryRow[]);
}

/**
 * Fetches a guide with its linked locations for the detail page.
 *
 * @param slug - The guide's slug-based ID
 * @returns Object with guide and linked locations, or null if not found
 */
export async function getGuideWithLocations(
  slug: string
): Promise<{ guide: Guide; locations: Location[] } | null> {
  const guide = await getGuideBySlug(slug);

  if (!guide) {
    return null;
  }

  const locations = await patchLocationHeroPhotos(
    await fetchLocationsByIds(guide.locationIds)
  );

  return { guide, locations };
}

/**
 * Fetches guides by city for related content.
 *
 * @param city - City name to filter by
 * @param excludeId - Guide ID to exclude (current guide)
 * @param limit - Maximum number of guides to return
 * @returns Array of guide summaries
 */
export async function getGuidesByCity(
  city: string,
  excludeId?: string,
  limit: number = 4
): Promise<GuideSummary[]> {
  const supabase = await createClient();

  let query = supabase
    .from("guides")
    .select(GUIDE_SUMMARY_COLUMNS)
    .eq("status", "published")
    .ilike("city", city);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query
    .order("sort_order", { ascending: true })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return summariesWithFallbacks(data as unknown as GuideSummaryRow[]);
}

/**
 * Fetches published guides whose `location_ids` array contains the given
 * location id — used to surface a "Featured in guides" section on
 * /places/[id]. Internal-linking signal: guides → place → guides cluster.
 */
export async function getGuidesByLocationId(
  locationId: string,
  limit: number = 3
): Promise<GuideSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("guides")
    .select(GUIDE_SUMMARY_COLUMNS)
    .eq("status", "published")
    .contains("location_ids", [locationId])
    .order("sort_order", { ascending: true })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return summariesWithFallbacks(data as unknown as GuideSummaryRow[]);
}

/**
 * Fetches guides by type.
 *
 * @param guideType - Type of guide to filter by
 * @param excludeId - Guide ID to exclude (current guide)
 * @param limit - Maximum number of guides to return
 * @returns Array of guide summaries
 */
export async function getGuidesByType(
  guideType: Guide["guideType"],
  excludeId?: string,
  limit: number = 10
): Promise<GuideSummary[]> {
  const supabase = await createClient();

  let query = supabase
    .from("guides")
    .select(GUIDE_SUMMARY_COLUMNS)
    .eq("status", "published")
    .eq("guide_type", guideType);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query
    .order("sort_order", { ascending: true })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return summariesWithFallbacks(data as unknown as GuideSummaryRow[]);
}

/**
 * Fetches guides whose `seasons` array contains the given season.
 *
 * Previously this OR'd in any `guide_type='seasonal'` row regardless of
 * season tag, which silently leaked off-season guides into every season
 * query (e.g. "Sapporo in Winter" appeared under spring queries when the
 * season-tagged pool was thin). Removed 2026-05-04. Editorial truth-telling
 * over filling slots — if a season has fewer guides than the caller asked
 * for, the spotlight will render fewer cards rather than wrong ones.
 */
export async function getGuidesBySeason(
  season: string,
  limit: number = 6
): Promise<GuideSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("guides")
    .select(GUIDE_SUMMARY_COLUMNS)
    .eq("status", "published")
    .contains("seasons", [season])
    .order("sort_order", { ascending: true })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return summariesWithFallbacks(data as unknown as GuideSummaryRow[]);
}

// ---------------------------------------------------------------------------
// Sanity CDN fetchers
// ---------------------------------------------------------------------------

/**
 * Fetches a guide from Sanity by slug (CDN-cached).
 * Returns null if the Sanity project is unavailable.
 */
export async function getSanityGuideBySlug(
  slug: string
): Promise<SanityGuide | null> {
  try {
    const result = await sanityClient.fetch<SanityGuide | null>(
      guideBySlugQuery,
      { slug }
    );
    return result;
  } catch (error) {
    logger.warn("[guideService] Failed to fetch guide by slug", { slug, error });
    return null;
  }
}

/**
 * Fetches a Sanity guide with its linked locations from Supabase.
 */
export async function getSanityGuideWithLocations(
  slug: string
): Promise<{ guide: SanityGuide; locations: Location[] } | null> {
  const guide = await getSanityGuideBySlug(slug);
  if (!guide) return null;

  const rawLocations = guide.locationIds?.length
    ? await fetchLocationsByIds(guide.locationIds)
    : [];
  const locations = await patchLocationHeroPhotos(rawLocations);

  return { guide, locations };
}

/**
 * Fetches an author profile from Sanity with their published guides.
 * Returns null if the Sanity project is unavailable.
 */
export async function getSanityAuthorBySlug(
  slug: string
): Promise<SanityAuthorFull | null> {
  try {
    const result = await sanityClient.fetch<SanityAuthorFull | null>(
      authorBySlugQuery,
      { slug }
    );
    return result;
  } catch (error) {
    logger.warn("[guideService] Failed to fetch author by slug", { slug, error });
    return null;
  }
}

/**
 * Fetches all authors from Sanity for the directory page.
 * Returns empty array if the Sanity project is unavailable.
 */
export async function getAllSanityAuthors(): Promise<SanityAuthorSummary[]> {
  try {
    const result = await sanityClient.fetch<SanityAuthorSummary[]>(
      allAuthorsQuery
    );
    return result || [];
  } catch (error) {
    logger.warn("[guideService] Failed to fetch all authors", { error });
    return [];
  }
}
