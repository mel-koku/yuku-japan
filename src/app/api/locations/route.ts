import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Location } from "@/types/location";
import { logger } from "@/lib/logger";
import { internalError } from "@/lib/api/errors";
import { withApiHandler } from "@/lib/api/withApiHandler";
import { RATE_LIMITS } from "@/lib/api/rateLimits";
import {
  parsePaginationParams,
  createPaginatedResponse,
} from "@/lib/api/pagination";
import { LOCATION_LISTING_COLUMNS, type LocationListingDbRow } from "@/lib/supabase/projections";
import { transformDbRowToLocation } from "@/lib/locations/locationService";
import { applySearchFilter } from "@/lib/supabase/searchFilters";
import { applyActiveLocationFilters } from "@/lib/supabase/filters";

/**
 * GET /api/locations
 * Fetches locations from Supabase with pagination and filtering support.
 *
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - region: Filter by region (e.g., "Kansai", "Tohoku", "Hokkaido")
 * - category: Filter by category (e.g., "attraction", "food", "nature")
 * - search: Search locations by name (partial match)
 *
 * @param request - Next.js request object
 * @returns Paginated array of Location objects, or error response
 * @throws Returns 429 if rate limit exceeded
 * @throws Returns 500 for database errors
 */
export const GET = withApiHandler(
  async (request, { context }) => {
    const supabase = await createClient();
    const pagination = parsePaginationParams(request);

    // Parse filter parameters
    const searchParams = request.nextUrl.searchParams;
    const region = searchParams.get("region");
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const featured = searchParams.get("featured");
    const city = searchParams.get("city");
    // /places browse: keeps the wider OR-fallback (planning_city OR city.ilike).
    // Diverges from fetchAllLocations (planner picker) which is strict on
    // planning_city — the planner's leakage was harm; browse breadth is desired UX.
    const cityFilter = city
      ? `planning_city.eq.${city.toLowerCase()},city.ilike.${city}`
      : null;

    // Get total count for pagination metadata (with filters)
    // Exclude permanently closed locations at the database level
    let countQuery = applyActiveLocationFilters(
      supabase.from("locations").select("*", { count: "exact", head: true })
    );
    if (region) countQuery = countQuery.eq("region", region);
    if (category) countQuery = countQuery.eq("category", category);
    if (featured === "true") countQuery = countQuery.eq("is_featured", true);
    if (cityFilter) countQuery = countQuery.or(cityFilter);
    if (search) {
      // Search matches ALL locations (including children, which show "in {parent}" annotation)
      countQuery = applySearchFilter(countQuery, search);
    } else {
      // Browse mode: only top-level locations
      countQuery = countQuery.is("parent_id", null);
    }
    const { count, error: countError } = await countQuery;

    if (countError) {
      logger.error("Failed to count locations", countError, { requestId: context.requestId });
      return internalError("Failed to fetch locations from database", { error: countError.message }, {
        requestId: context.requestId,
      });
    }

    const total = count || 0;

    // Fetch paginated locations (with filters)
    // Exclude permanently closed locations at the database level
    let dataQuery = applyActiveLocationFilters(
      supabase.from("locations").select(LOCATION_LISTING_COLUMNS)
    );
    if (region) dataQuery = dataQuery.eq("region", region);
    if (category) dataQuery = dataQuery.eq("category", category);
    if (featured === "true") dataQuery = dataQuery.eq("is_featured", true);
    if (cityFilter) dataQuery = dataQuery.or(cityFilter);
    if (search) {
      dataQuery = applySearchFilter(dataQuery, search);
    } else {
      dataQuery = dataQuery.is("parent_id", null);
    }
    // Search mode: don't force alphabetical — it buries real matches
    // behind irrelevant A-named rows. Without ts_rank we can't sort by
    // relevance, but unordered beats wrong order. Browse mode keeps
    // the alphabetical listing.
    const orderedQuery = search
      ? dataQuery
      : dataQuery.order("name", { ascending: true });
    const { data, error } = await orderedQuery
      .range(pagination.offset, pagination.offset + pagination.limit - 1);

    if (error) {
      logger.error("Failed to fetch locations from Supabase", error, { requestId: context.requestId });
      return internalError("Failed to fetch locations from database", { error: error.message }, {
        requestId: context.requestId,
      });
    }

    // Resolve parent names for child locations (search mode only)
    const rows = (data || []) as unknown as LocationListingDbRow[];
    const parentNameMap = new Map<string, string>();
    if (search) {
      const parentIds = [...new Set(rows.map((r) => r.parent_id).filter(Boolean))] as string[];
      if (parentIds.length > 0) {
        const { data: parents } = await supabase
          .from("locations")
          .select("id, name")
          .in("id", parentIds);
        parents?.forEach((p) => parentNameMap.set(p.id, p.name));
      }
    }

    // Transform Supabase data to Location type via canonical mapper.
    // parentName is denormalized from a separate query and overlaid here.
    const locations: Location[] = rows.map((row) => ({
      ...transformDbRowToLocation(row),
      parentName: row.parent_id ? parentNameMap.get(row.parent_id) : undefined,
    }));

    // Create paginated response
    const response = createPaginatedResponse(locations, total, pagination);

    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
      },
    });
  },
  { rateLimit: RATE_LIMITS.LOCATIONS },
);

