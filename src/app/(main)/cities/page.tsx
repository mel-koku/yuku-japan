import type { Metadata } from "next";
import { REGIONS } from "@/data/regions";
import { REGION_DESCRIPTIONS } from "@/data/regionDescriptions";
import { CITY_PAGE_DATA, getAllCitySlugs } from "@/lib/cities/cityData";
import { getCityMetadata } from "@/lib/tripBuilder/cityRelevance";
import { fetchCityHeroPhotoUrl } from "@/lib/locations/locationService";
import { CityIndex } from "@/components/features/cities/CityIndex";
import { DEFAULT_OG_IMAGES, DEFAULT_TWITTER_IMAGES } from "@/lib/seo/defaults";

const CITIES_DESCRIPTION =
  "Thirty-five cities across nine regions, with editorial picks for each. Tokyo neon, Kyoto gardens, Kanazawa craft, Sapporo snow.";

export const metadata: Metadata = {
  title: "Cities of Japan | Yuku Japan",
  description: CITIES_DESCRIPTION,
  alternates: { canonical: "/cities" },
  openGraph: {
    images: DEFAULT_OG_IMAGES,
    title: "Cities of Japan | Yuku Japan",
    description: CITIES_DESCRIPTION,
    url: "/cities",
    siteName: "Yuku Japan",
    type: "website",
  },
  twitter: {
    images: DEFAULT_TWITTER_IMAGES,
    card: "summary_large_image",
    title: "Cities of Japan | Yuku Japan",
    description: CITIES_DESCRIPTION,
  },
};

export const revalidate = 3600;

export default async function CitiesIndexPage() {
  const allSlugs = getAllCitySlugs();

  const allCityEntries = REGIONS.flatMap((region) =>
    region.cities
      .map((c) => ({ id: c.id, data: CITY_PAGE_DATA[c.id] }))
      .filter((e): e is { id: typeof e.id; data: NonNullable<typeof e.data> } => Boolean(e.data)),
  );

  const heroEntries = await Promise.all(
    allCityEntries.map(async (e) => [e.id, await fetchCityHeroPhotoUrl(e.data.name)] as const),
  );
  const heroById = new Map(heroEntries);

  const regions = REGIONS.map((region) => {
    const regionDesc = REGION_DESCRIPTIONS.find((r) => r.id === region.id);

    const cities = region.cities.map((c) => {
      const pageData = CITY_PAGE_DATA[c.id];
      const meta = getCityMetadata(c.id);

      return {
        data: pageData,
        stats: {
          totalLocations: meta?.locationCount ?? 0,
          hiddenGemsCount: 0,
          topCategories: [] as { category: string; count: number }[],
          averageRating: 0,
        },
        heroImage: heroById.get(c.id),
      };
    });

    return {
      regionId: region.id,
      regionName: region.name,
      tagline: regionDesc?.tagline ?? "",
      cities,
    };
  });

  return (
    <CityIndex regions={regions} totalCities={allSlugs.length} />
  );
}
