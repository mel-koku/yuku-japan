import type { Metadata } from "next";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PlacesShellLazy } from "@/components/features/places/PlacesShellLazy";
import { getPagesContent } from "@/lib/sanity/contentService";
import { getLocationCount } from "@/lib/locations/locationService";
import { DEFAULT_OG_IMAGES, DEFAULT_TWITTER_IMAGES } from "@/lib/seo/defaults";
import { typography } from "@/lib/typography-system";
import { cn } from "@/lib/cn";

const PLACES_DESCRIPTION =
  "Over 6,000 locations across Japan. Cultural landmarks, neighborhood favorites, and an interactive map.";

const PLACES_H1_DEFAULT = "Every place worth knowing about, in one collection.";

export const metadata: Metadata = {
  title: "Places in Japan | Yuku Japan",
  description: PLACES_DESCRIPTION,
  alternates: {
    canonical: "/places",
  },
  openGraph: {
    images: DEFAULT_OG_IMAGES,
    title: "Places in Japan | Yuku Japan",
    description: PLACES_DESCRIPTION,
    url: "/places",
    siteName: "Yuku Japan",
    type: "website",
  },
  twitter: {
    images: DEFAULT_TWITTER_IMAGES,
    card: "summary_large_image",
    title: "Places in Japan | Yuku Japan",
    description: PLACES_DESCRIPTION,
  },
};

export const revalidate = 3600;

export default async function PlacesPage() {
  const [content, totalCount] = await Promise.all([
    getPagesContent(),
    getLocationCount(),
  ]);

  // The h1 lives here in SSR — PlacesShell mounts its UI behind a
  // `dynamic({ ssr: false })` boundary, so any heading rendered downstream
  // is invisible to Googlebot's primary indexing pass. Rendering the
  // headline server-side gives the page a real topical anchor.
  const heading = content?.placesHeading ?? PLACES_H1_DEFAULT;

  return (
    <ErrorBoundary>
      <header className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 pb-2 sm:pt-12 sm:pb-4 lg:pt-16 text-center">
        <h1 className={cn(typography({ intent: "editorial-h1" }), "text-[clamp(2rem,4vw,3rem)] max-w-3xl mx-auto")}>
          {heading}
        </h1>
        {totalCount > 0 && (
          <p className="mt-3 font-mono text-xs uppercase tracking-wide text-foreground-secondary">
            {totalCount.toLocaleString()}+ places · 47 prefectures
          </p>
        )}
      </header>
      <PlacesShellLazy content={content ?? undefined} />
    </ErrorBoundary>
  );
}
