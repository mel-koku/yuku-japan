import { NextRequest, NextResponse } from "next/server";

import type { Location, LocationDetails } from "@/types/location";
import { isValidLocationId } from "@/lib/api/validation";
import { locationIdSchema } from "@/lib/api/schemas";
import { badRequest, notFound } from "@/lib/api/errors";
import { withApiHandler } from "@/lib/api/withApiHandler";
import { RATE_LIMITS } from "@/lib/api/rateLimits";
import { createClient } from "@/lib/supabase/server";
import { getBestSummary } from "@/lib/utils/editorialSummary";
import { transformDbRowToLocation } from "@/lib/locations/locationService";

import { LOCATION_DETAIL_COLUMNS, type LocationDbRow } from "@/lib/supabase/projections";

/**
 * GET /api/locations/[id]
 * Fetches location details including Google Places data for a given location ID.
 *
 * @param request - Next.js request object
 * @param props - Route props containing the location ID parameter
 * @param props.params.id - Location ID (must be a valid identifier)
 * @returns Location object with enriched details from Google Places API, or error response
 * @throws Returns 400 if location ID format is invalid
 * @throws Returns 404 if location is not found
 * @throws Returns 429 if rate limit exceeded (100 requests/minute)
 * @throws Returns 503 if Google Places API is not configured
 * @throws Returns 500 for other errors
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  return withApiHandler(
    async (_req) => {
      // Validate using both existing function and Zod schema for defense in depth
      const idValidation = locationIdSchema.safeParse(id);
      if (!idValidation.success || !isValidLocationId(id)) {
        return badRequest("Invalid location ID format", {
          errors: idValidation.success ? undefined : idValidation.error.issues,
        });
      }

      const validatedId = idValidation.data;

      // Fetch location + harvested photos in parallel.
      // `location_photos` holds up to 5 photo refs per location:
      //   - source='google': photo_name is a Google opaque ref, served via the
      //     /api/places/photo proxy which carries Google's htmlAttributions.
      //   - source='wikimedia': photo_name is a storage path
      //     ({location_id}/{width}.{ext}) under the editorial-photos bucket,
      //     served direct from Supabase Storage. Carries structured license
      //     metadata for the PhotoAttribution UI (Phase 3).
      const supabase = await createClient();
      const [{ data: locationData, error: dbError }, { data: photoRows }] = await Promise.all([
        supabase
          .from("locations")
          .select(LOCATION_DETAIL_COLUMNS)
          .eq("id", validatedId)
          .single(),
        supabase
          .from("location_photos")
          .select(
            "photo_name, source, width_px, height_px, attribution, attribution_uri, license_short, license_uri, license_notice, source_uri",
          )
          .eq("location_id", validatedId)
          .in("source", ["google", "wikimedia"])
          .eq("moderation", "approved")
          .order("sort_order", { ascending: true })
          .limit(5),
      ]);

      if (dbError || !locationData) {
        return notFound("Location not found");
      }

      // Transform database row to Location type via canonical mapper.
      // PlaceDetail hydrates the server-rendered location with this response,
      // so every enrichment field the UI reads must flow through. Canonical
      // covers the LOCATION_DETAIL_COLUMNS projection via "key in r" guards.
      const location: Location = transformDbRowToLocation(
        locationData as unknown as LocationDbRow,
      );

      // Gallery photos — prefer harvested location_photos rows (with
      // attribution), fall back to the primary hero when the table is empty.
      type PhotoRow = {
        photo_name: string;
        source: string;
        width_px: number | null;
        height_px: number | null;
        attribution: string | null;
        attribution_uri: string | null;
        license_short: string | null;
        license_uri: string | null;
        license_notice: string | null;
        source_uri: string | null;
      };
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
      const harvestedPhotos = ((photoRows ?? []) as PhotoRow[]).map((p) => ({
        name: p.photo_name,
        widthPx: p.width_px ?? undefined,
        heightPx: p.height_px ?? undefined,
        proxyUrl: p.source === "wikimedia"
          ? `${supabaseUrl}/storage/v1/object/public/editorial-photos/${p.photo_name}`
          : `/api/places/photo?photoName=${encodeURIComponent(p.photo_name)}&maxWidthPx=1600`,
        attributions: p.attribution
          ? [{
              displayName: p.attribution,
              uri: p.attribution_uri ?? undefined,
              licenseShort: p.license_short ?? undefined,
              licenseUri: p.license_uri ?? undefined,
              licenseNotice: p.license_notice ?? undefined,
              sourceUri: p.source_uri ?? undefined,
            }]
          : [],
      }));

      const galleryPhotos = harvestedPhotos.length > 0
        ? harvestedPhotos
        : location.primaryPhotoUrl
          ? [{ name: "primary", proxyUrl: location.primaryPhotoUrl, attributions: [] }]
          : [];

      // Build LocationDetails from database data (no Google API call)
      // All data was pre-enriched during location ingestion
      const details: LocationDetails = {
        placeId: (location.placeId ?? location.id) as string,
        displayName: location.name,
        formattedAddress: `${location.city}, ${location.region}`,
        rating: location.rating,
        userRatingCount: location.reviewCount,
        editorialSummary: getBestSummary(location, location.editorialSummary),
        websiteUri: location.websiteUri,
        internationalPhoneNumber: location.phoneNumber,
        googleMapsUri: location.googleMapsUri,
        regularOpeningHours: formatOperatingHoursForDisplay(location.operatingHours ?? null),
        reviews: [],
        photos: galleryPhotos,
        fetchedAt: new Date().toISOString(),
      };

      return NextResponse.json(
        {
          location,
          details,
        },
        {
          status: 200,
          headers: {
            // Longer cache since data is from DB, not real-time API
            "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
          },
        },
      );
    },
    { rateLimit: RATE_LIMITS.LOCATIONS },
  )(request);
}

/**
 * Converts LocationOperatingHours to display-friendly string array
 */
function formatOperatingHoursForDisplay(
  hours: Location["operatingHours"] | null,
): string[] | undefined {
  if (!hours || !hours.periods || hours.periods.length === 0) {
    return undefined;
  }

  const dayOrder = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const dayLabels: Record<string, string> = {
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
  };

  return dayOrder
    .map((day) => {
      const period = hours.periods.find((p) => p.day === day);
      if (!period) return null;
      const label = dayLabels[day] ?? day;
      return `${label}: ${period.open} – ${period.close}${period.isOvernight ? " (next day)" : ""}`;
    })
    .filter((entry): entry is string => entry !== null);
}

