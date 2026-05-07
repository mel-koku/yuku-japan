import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { REGIONS, CITY_TO_REGION } from "@/data/regions";
import { getCityPageData, getAllCitySlugs } from "@/lib/cities/cityData";
import {
  getCityStats,
  getTopRatedLocations,
  getHiddenGems,
  getCategoryBreakdown,
  getCityHeroImage,
} from "@/lib/cities/cityHelpers";
import { buildCityJsonLd } from "@/lib/cities/cityJsonLd";
import { buildBreadcrumbList, buildJsonLdGraph } from "@/lib/seo/breadcrumbs";
import { serializeJsonLd } from "@/lib/seo/jsonLd";
import { fetchLocationsByCity, fetchCityHeroPhotoUrl } from "@/lib/locations/locationService";
import { getCityMetadata } from "@/lib/tripBuilder/cityRelevance";
import { getGuidesByCity } from "@/lib/guides/guideService";
import { CityDetail } from "@/components/features/cities/CityDetail";
import type { KnownCityId } from "@/types/trip";

export const revalidate = 3600;

type RouteProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getAllCitySlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const city = getCityPageData(slug);

  if (!city) return { title: "City not found" };

  // Hero photo for OG — falls back to root metadataBase image when absent.
  // Dedicated single-row fetch, not the 200-row page query.
  const heroPhoto = await fetchCityHeroPhotoUrl(city.name);

  return {
    title: `${city.name}, Japan | Travel Guide | Yuku Japan`,
    description: city.ogDescription,
    alternates: {
      canonical: `/cities/${slug}`,
    },
    openGraph: {
      title: `${city.name}, Japan | Travel Guide`,
      description: city.ogDescription,
      siteName: "Yuku Japan",
      ...(heroPhoto && {
        images: [{ url: heroPhoto, width: 1200, height: 630, alt: `${city.name}, Japan` }],
      }),
    },
    ...(heroPhoto && {
      twitter: {
        card: "summary_large_image" as const,
        title: `${city.name}, Japan | Travel Guide`,
        description: city.ogDescription,
        images: [heroPhoto],
      },
    }),
  };
}

export default async function CityDetailPage({ params }: RouteProps) {
  const { slug } = await params;
  const city = getCityPageData(slug);

  if (!city) notFound();

  const [locations, cityGuides] = await Promise.all([
    fetchLocationsByCity(city.name, {
      limit: 200,
      requirePlaceId: false,
    }),
    getGuidesByCity(city.name, undefined, 6),
  ]);

  const stats = getCityStats(locations);
  const topLocations = getTopRatedLocations(locations);
  const hiddenGems = getHiddenGems(locations);
  const categories = getCategoryBreakdown(locations);
  const heroImage = getCityHeroImage(locations);

  // Region context
  const regionId = CITY_TO_REGION[slug as KnownCityId];
  const region = REGIONS.find((r) => r.id === regionId);
  const regionName = region?.name ?? "";

  // Nearby cities (same region, excluding current)
  const nearbyCities = (region?.cities ?? [])
    .filter((c) => c.id !== slug)
    .map((c) => {
      const meta = getCityMetadata(c.id);
      return {
        id: c.id,
        name: c.name,
        locationCount: meta?.locationCount ?? 0,
      };
    });

  // Coordinates for JSON-LD
  const meta = getCityMetadata(slug);
  const coordinates = meta?.coordinates;

  const citySchema = buildCityJsonLd(city, stats, topLocations, coordinates);
  const breadcrumbs = buildBreadcrumbList([
    { name: "Home", path: "/" },
    { name: "Cities", path: "/cities" },
    { name: `${city.name}, Japan`, path: `/cities/${slug}` },
  ]);
  const jsonLd = buildJsonLdGraph(
    citySchema as unknown as Record<string, unknown>,
    breadcrumbs,
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <CityDetail
        city={city}
        stats={stats}
        categories={categories}
        topLocations={topLocations}
        hiddenGems={hiddenGems}
        heroImage={heroImage}
        regionName={regionName}
        nearbyCities={nearbyCities}
        cityGuides={cityGuides}
      />
    </>
  );
}
