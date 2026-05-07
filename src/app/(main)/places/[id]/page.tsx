import { notFound } from "next/navigation";
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
  params: Promise<{ id: string }>;
};

async function fetchLocation(id: string): Promise<Location | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("locations")
    .select(LOCATION_DETAIL_COLUMNS)
    .eq("id", id)
    .single();

  if (error || !data) return null;

  return transformDbRowToLocation(data as unknown as LocationDbRow);
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { id } = await params;
  const location = await fetchLocation(id);

  // Call notFound() here so Next.js commits to a 404 during the metadata phase.
  // Returning fallback metadata + relying on notFound() in the page render
  // produces a soft-404 (HTTP 200 with not-found UI) on Next 16 + ISR routes.
  if (!location) {
    notFound();
  }

  const description =
    location.shortDescription ??
    location.description?.slice(0, 160) ??
    `Discover ${location.name} in ${location.city}, Japan`;

  return {
    title: `${location.name} | ${location.city} | Yuku Japan`,
    description,
    alternates: {
      canonical: `/places/${id}`,
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
  const { id } = await params;
  const [location, editorNote, featuredGuides] = await Promise.all([
    fetchLocation(id),
    fetchEditorNoteByLocationSlug(id),
    getGuidesByLocationId(id, 3),
  ]);

  if (!location) notFound();

  const placeSchema = buildPlaceJsonLd(location);
  const breadcrumbs = buildBreadcrumbList([
    { name: "Home", path: "/" },
    { name: "Places", path: "/places" },
    { name: location.name, path: `/places/${id}` },
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
