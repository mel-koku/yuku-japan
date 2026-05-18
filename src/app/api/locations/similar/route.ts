import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { badRequest, internalError } from "@/lib/api/errors";
import { withApiHandler } from "@/lib/api/withApiHandler";
import { RATE_LIMITS } from "@/lib/api/rateLimits";
import { LOCATION_LISTING_COLUMNS, type LocationListingDbRow } from "@/lib/supabase/projections";
import { transformDbRowToLocation } from "@/lib/locations/locationService";
import type { Location } from "@/types/location";
import {
  SIMILARITY_THRESHOLD,
  MIN_SIMILAR_RESULTS,
  SIMILAR_PLACES_LIMIT,
} from "@/lib/supabase/semanticSearch";

type SimilarLocationRpcRow = { id: string; similarity: number };

/**
 * GET /api/locations/similar?id=<locationId>
 *
 * Returns up to 6 similar locations based on embedding cosine similarity.
 * Pure DB query via RPC (zero API cost -- uses pre-computed embeddings).
 *
 * The `similar_locations` RPC ranks by embedding distance but returns a
 * snake_case row shape missing primary_photo_url/hero_attribution. We use it
 * only for the ranked ID list, then re-query LOCATION_LISTING_COLUMNS and run
 * `transformDbRowToLocation` so the response is a camelCase `Location[]` the
 * LocationCard component can render — mirroring /api/locations/all.
 */
export const GET = withApiHandler(
  async (request, { context }) => {
    const locationId = request.nextUrl.searchParams.get("id");

    if (!locationId) {
      return badRequest("Query parameter 'id' is required", {
        requestId: context.requestId,
      });
    }

    const supabase = await createClient();

    // Fetch the source location's embedding
    const { data: source, error: sourceError } = await supabase
      .from("locations")
      .select("id, embedding")
      .eq("id", locationId)
      .single();

    if (sourceError || !source) {
      return badRequest("Location not found", { requestId: context.requestId });
    }

    if (!source.embedding) {
      return NextResponse.json([], {
        headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
      });
    }

    const { data: ranked, error } = await supabase.rpc("similar_locations", {
      query_embedding: source.embedding,
      exclude_id: locationId,
      match_count: SIMILAR_PLACES_LIMIT,
      similarity_threshold: SIMILARITY_THRESHOLD,
    });

    if (error) {
      logger.error("Similar places query failed", error, {
        locationId,
        requestId: context.requestId,
      });
      return internalError("Failed to find similar places", { error: error.message }, {
        requestId: context.requestId,
      });
    }

    const rankedRows = (ranked ?? []) as SimilarLocationRpcRow[];
    if (rankedRows.length < MIN_SIMILAR_RESULTS) {
      return NextResponse.json([], {
        headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
      });
    }

    // Re-query full listing columns for the ranked IDs. The RPC's row shape is
    // raw snake_case and omits primary_photo_url/hero_attribution, so the
    // LocationCard photo (location.primaryPhotoUrl) would always be undefined.
    const rankByLocationId = new Map(rankedRows.map((r, index) => [r.id, index]));
    const { data: rows, error: rowsError } = await supabase
      .from("locations")
      .select(LOCATION_LISTING_COLUMNS)
      .in("id", [...rankByLocationId.keys()]);

    if (rowsError) {
      logger.error("Similar places hydration failed", rowsError, {
        locationId,
        requestId: context.requestId,
      });
      return internalError("Failed to find similar places", { error: rowsError.message }, {
        requestId: context.requestId,
      });
    }

    // Transform via the canonical mapper, restore embedding-similarity order
    // (Postgres `.in()` does not preserve it), and apply the same image
    // bandwidth optimization as /api/locations/all and /api/locations/nearby.
    const locations: Location[] = ((rows ?? []) as unknown as LocationListingDbRow[])
      .map((row) => ({
        ...transformDbRowToLocation(row),
        image: row.primary_photo_url ? "" : row.image,
      }))
      .sort(
        (a, b) =>
          (rankByLocationId.get(a.id) ?? Infinity) - (rankByLocationId.get(b.id) ?? Infinity),
      );

    return NextResponse.json(locations, {
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
    });
  },
  { rateLimit: RATE_LIMITS.LOCATIONS },
);
