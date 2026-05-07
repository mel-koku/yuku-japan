import type { MetadataRoute } from "next";

// Strip any trailing slash so the sitemap URL doesn't end up `//sitemap.xml`.
const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://yukujapan.com").replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // Photo proxy must remain crawlable so Google Images can index
        // location hero photos. The proxy is CDN-cached at the edge so the
        // extra bot traffic doesn't translate to origin / Google API spend.
        allow: ["/", "/api/places/photo"],
        disallow: ["/api/", "/studio/", "/dashboard/", "/account/", "/saved/", "/itinerary/", "/trip-builder/", "/signin/", "/auth/"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
