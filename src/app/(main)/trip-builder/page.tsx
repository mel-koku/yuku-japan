import type { Metadata } from "next";

import { getTripBuilderConfig } from "@/lib/sanity/contentService";
import TripBuilderClient from "./TripBuilderClient";
import { DEFAULT_OG_IMAGES, DEFAULT_TWITTER_IMAGES } from "@/lib/seo/defaults";

const TRIP_BUILDER_DESCRIPTION =
  "Build a routed Japan itinerary in five minutes. Pick your dates, entry airport, vibes, and regions. We handle the day-to-day.";

export const metadata: Metadata = {
  title: "Trip Builder | Yuku Japan",
  description: TRIP_BUILDER_DESCRIPTION,
  alternates: { canonical: "/trip-builder" },
  // Wizard is a converting surface, not a ranking surface — content is
  // thin client-side state, and the home page is the SEO target for
  // trip-planning queries. robots.ts also disallows crawl; this closes
  // the side door where Google lists a URL it found backlinked.
  robots: { index: false, follow: true },
  openGraph: {
    images: DEFAULT_OG_IMAGES,
    title: "Trip Builder | Yuku Japan",
    description: TRIP_BUILDER_DESCRIPTION,
    url: "/trip-builder",
    siteName: "Yuku Japan",
    type: "website",
  },
  twitter: {
    images: DEFAULT_TWITTER_IMAGES,
    card: "summary_large_image",
    title: "Trip Builder | Yuku Japan",
    description: TRIP_BUILDER_DESCRIPTION,
  },
};

export const revalidate = 3600;

export default async function TripBuilderPage() {
  const sanityConfig = await getTripBuilderConfig();

  return <TripBuilderClient sanityConfig={sanityConfig ?? undefined} />;
}
