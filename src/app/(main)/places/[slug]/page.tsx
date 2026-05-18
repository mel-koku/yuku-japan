import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PlaceDetail } from "@/components/features/places/PlaceDetail";
import { buildPlaceJsonLd } from "@/lib/places/placeJsonLd";
import { buildBreadcrumbList, buildJsonLdGraph } from "@/lib/seo/breadcrumbs";
import { serializeJsonLd } from "@/lib/seo/jsonLd";
import type { Location } from "@/types/location";
import { transformDbRowToLocation } from "@/lib/locations/locationService";
import { LOCATION_DETAIL_COLUMNS, type LocationDbRow } from "@/lib/supabase/projections";
import { fetchEditorNoteByLocationSlug } from "@/sanity/editorNote";
import { getGuidesByLocationId } from "@/lib/guides/guideService";

export const revalidate = 3600;

type RouteProps = {
  params: Promise<{ slug: string }>;
};

/**
 * Old `/places/[id]` URLs used the `locations` text PK directly. That PK has
 * the form `{normalized-name-region}-{hexhash}` — a base string plus a
 * trailing lowercase-hex collision guard. A prod audit (2026-05-18) found the
 * hash is 8, 6, OR 4 hex chars wide (never 5/7), so this matches all three.
 * It lets a slug-lookup miss spend a second query only on params that could
 * plausibly be an old id — a genuine 404 short-circuits. Backfilled slugs
 * never match it: collision-numbered slugs end in `-2`/`-3` (decimal), and a
 * base slug ending in a 4/6/8-hex run would itself have been an old id.
 */
const OLD_ID_FORMAT = /-(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4})$/;

type LocationLookup = {
  location: Location;
  /** True when the row was found by the old `id` PK, not by `slug`. The
   *  caller then permanently redirects to the canonical slug URL. */
  matchedById: boolean;
};

/**
 * Resolve a `/places/` route param to a location.
 *
 * 1. Try `slug` — the canonical lookup.
 * 2. On miss, if the param looks like an old id, try the `id` PK. A hit here
 *    means the visitor used a pre-migration URL; the caller redirects (308).
 * 3. Both miss → null (caller calls notFound()).
 */
async function fetchLocation(param: string): Promise<LocationLookup | null> {
  const supabase = await createClient();

  const bySlug = await supabase
    .from("locations")
    .select(LOCATION_DETAIL_COLUMNS)
    .eq("slug", param)
    .single();

  if (!bySlug.error && bySlug.data) {
    return {
      location: transformDbRowToLocation(bySlug.data as unknown as LocationDbRow),
      matchedById: false,
    };
  }

  // Slug miss — only worth a second query if the param could be an old id.
  if (!OLD_ID_FORMAT.test(param)) return null;

  const byId = await supabase
    .from("locations")
    .select(LOCATION_DETAIL_COLUMNS)
    .eq("id", param)
    .single();

  if (!byId.error && byId.data) {
    return {
      location: transformDbRowToLocation(byId.data as unknown as LocationDbRow),
      matchedById: true,
    };
  }

  return null;
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  // `slugParam` is the route segment — a slug, or (on a stale link) an old id.
  const { slug: slugParam } = await params;
  const result = await fetchLocation(slugParam);

  // Call notFound() here so Next.js commits to a 404 during the metadata phase.
  // Returning fallback metadata + relying on notFound() in the page render
  // produces a soft-404 (HTTP 200 with not-found UI) on Next 16 + ISR routes.
  if (!result) {
    notFound();
  }

  // Old-id URL → 308 to the canonical slug, issued during the metadata phase
  // before any rendering. permanentRedirect() throws, so nothing below runs.
  //
  // This redirect MUST emit a real HTTP 308: there is intentionally no
  // `loading.tsx` in the `places/` segment. A `loading.tsx` puts the route in
  // streaming mode, which flushes a 200 + shell before this throw runs — the
  // redirect then degrades to a client-side navigation that search-engine
  // crawlers never see. Keep the segment free of `loading.tsx`.
  //
  // The `slug !== slugParam` guard prevents a redirect loop in the pre-Phase-2
  // window: if the route deploys before the slug backfill, `slug` is NULL and
  // transformDbRowToLocation falls it back to `id` (=== slugParam here, since
  // we matched by id) — redirecting to an identical URL would loop. Once the
  // backfill has run, slug differs from id and the redirect fires normally.
  if (result.matchedById && result.location.slug !== slugParam) {
    permanentRedirect(`/places/${result.location.slug}`);
  }

  const { location } = result;
  const description =
    location.shortDescription ??
    location.description?.slice(0, 160) ??
    `Discover ${location.name} in ${location.city}, Japan`;

  return {
    title: `${location.name} | ${location.city} | Yuku Japan`,
    description,
    alternates: {
      canonical: `/places/${location.slug}`,
    },
    openGraph: {
      title: `${location.name} | ${location.city}`,
      description,
      images: location.primaryPhotoUrl
        ? [{ url: location.primaryPhotoUrl, width: 1200, height: 630 }]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${location.name} | ${location.city}`,
      description,
    },
  };
}

export default async function PlaceDetailPage({ params }: RouteProps) {
  // `slugParam` is the route segment — a slug, or (on a stale link) an old id.
  const { slug: slugParam } = await params;
  const result = await fetchLocation(slugParam);

  if (!result) notFound();

  // Old-id URL → 308 to the canonical slug. generateMetadata runs first and
  // normally emits the redirect; this is the defense-in-depth twin, covering
  // any path where the metadata redirect is skipped. Same `slug !== slugParam`
  // loop guard as generateMetadata. permanentRedirect() throws, so the
  // editor-note / guides fetches below never run on the redirect path.
  if (result.matchedById && result.location.slug !== slugParam) {
    permanentRedirect(`/places/${result.location.slug}`);
  }

  const { location } = result;

  // Editor notes and guides are keyed on `locations.id`, not the slug — the
  // Sanity `editorNote.locationSlug` field stores the id (misleading name;
  // see fetchEditorNoteByLocationSlug). Resolve the row first, then fan out
  // on `location.id`.
  const [editorNote, featuredGuides] = await Promise.all([
    fetchEditorNoteByLocationSlug(location.id),
    getGuidesByLocationId(location.id, 3),
  ]);

  const placeSchema = buildPlaceJsonLd(location);
  const breadcrumbs = buildBreadcrumbList([
    { name: "Home", path: "/" },
    { name: "Places", path: "/places" },
    { name: location.name, path: `/places/${location.slug}` },
  ]);
  const jsonLd = buildJsonLdGraph(placeSchema, breadcrumbs);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <PlaceDetail
        initialLocation={location}
        initialEditorNote={editorNote}
        featuredGuides={featuredGuides}
      />
    </>
  );
}
