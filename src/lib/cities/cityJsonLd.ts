import type { CityPageData } from "./cityData";
import type { CityStats } from "./cityHelpers";
import type { Location } from "@/types/location";

type CityCoordinates = { lat: number; lng: number };

export function buildCityJsonLd(
  city: CityPageData,
  stats: CityStats,
  topLocations: Location[],
  coordinates?: CityCoordinates
) {
  const topItems = topLocations.slice(0, 10).map((loc, i) => ({
    "@type": "ListItem" as const,
    position: i + 1,
    item: {
      "@type": "TouristAttraction" as const,
      name: loc.name,
      ...(loc.shortDescription && { description: loc.shortDescription }),
      ...(loc.coordinates && {
        geo: {
          "@type": "GeoCoordinates" as const,
          latitude: loc.coordinates.lat,
          longitude: loc.coordinates.lng,
        },
      }),
      ...(loc.primaryPhotoUrl && { image: loc.primaryPhotoUrl }),
    },
  }));

  return {
    "@context": "https://schema.org",
    "@type": "TouristDestination",
    name: `${city.name}, Japan`,
    alternateName: city.nameJapanese,
    description: city.description,
    ...(coordinates && {
      geo: {
        "@type": "GeoCoordinates",
        latitude: coordinates.lat,
        longitude: coordinates.lng,
      },
    }),
    touristType: stats.topCategories.slice(0, 3).map((c) => c.category),
    isPartOf: {
      "@type": "Country",
      name: "Japan",
    },
    ...(topItems.length > 0 && {
      containsPlace: {
        "@type": "ItemList",
        name: `Top places in ${city.name}`,
        numberOfItems: topItems.length,
        itemListElement: topItems,
      },
    }),
  };
}
