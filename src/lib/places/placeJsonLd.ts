import type { Location } from "@/types/location";

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://yukujapan.com").replace(/\/+$/, "");

/**
 * Resolve a possibly-relative photo URL to an absolute one. Schema.org's
 * ImageObject and Google's structured-data validator both require the
 * `image` field to be a fully-qualified URL — relative paths produce
 * "Invalid URL" warnings in Search Console.
 */
function absoluteImageUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * Build JSON-LD structured data for a place detail page.
 *
 * Food categories map to specific LocalBusiness subtypes (Restaurant,
 * CafeOrCoffeeShop, BarOrPub, GroceryStore) and emit aggregateRating —
 * Google supports review snippets on LocalBusiness subtypes. Everything
 * else maps to TouristAttraction without aggregateRating; Google's
 * review-snippet eligibility list excludes TouristAttraction, so a rating
 * there triggers an "Invalid object type for parent_node" error in Search
 * Console without ever earning stars in SERPs.
 */
const FOOD_TYPE_BY_CATEGORY: Record<string, string> = {
  restaurant: "Restaurant",
  cafe: "CafeOrCoffeeShop",
  bar: "BarOrPub",
  market: "GroceryStore",
};

export function buildPlaceJsonLd(location: Location) {
  const foodType = FOOD_TYPE_BY_CATEGORY[location.category];
  const schemaType = foodType ?? "TouristAttraction";

  return {
    "@context": "https://schema.org",
    "@type": schemaType,
    name: location.name,
    ...(location.nameJapanese && { alternateName: location.nameJapanese }),
    ...(location.shortDescription && { description: location.shortDescription }),
    ...(location.description &&
      !location.shortDescription && {
        description: location.description.slice(0, 300),
      }),
    url: `${BASE_URL}/places/${location.slug}`,
    ...(location.primaryPhotoUrl && { image: absoluteImageUrl(location.primaryPhotoUrl) }),
    ...(location.coordinates && {
      geo: {
        "@type": "GeoCoordinates",
        latitude: location.coordinates.lat,
        longitude: location.coordinates.lng,
      },
    }),
    ...(location.coordinates && {
      address: {
        "@type": "PostalAddress",
        addressLocality: location.city,
        addressCountry: "JP",
      },
    }),
    ...(foodType && location.rating && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: location.rating,
        bestRating: 5,
        ...(location.reviewCount && { reviewCount: location.reviewCount }),
      },
    }),
    ...(location.websiteUri && { sameAs: location.websiteUri }),
    ...(location.phoneNumber && { telephone: location.phoneNumber }),
    isPartOf: {
      "@type": "TouristDestination",
      name: `${location.city}, Japan`,
    },
  };
}
