import type { MetadataRoute } from "next";
import { getSitemapGuideEntries } from "@/lib/guides/guideService";
import { getAllCitySlugs } from "@/lib/cities/cityData";
import { getSitemapLocationEntries } from "@/lib/locations/locationService";
import { logger } from "@/lib/logger";

// Fetchers call the SSR Supabase client which reads cookies; Next 16 won't
// statically render a route that touches cookies. Mark dynamic so the build
// stops erroring. A future refactor could switch sitemap fetchers to a
// cookie-free client (e.g. anon-keyed) and re-enable ISR via `revalidate`.
export const dynamic = "force-dynamic";

// Strip any trailing slash so `${BASE_URL}/path` never produces `//path`.
// A misconfigured env var with a trailing slash (e.g. set to a Vercel preview
// URL through the dashboard) would otherwise emit malformed sitemap entries.
const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://yukujapan.com").replace(/\/+$/, "");

// Build-time fallback for routes whose source data has no `updated_at` —
// at least it's stable per deploy rather than per-request, which Google
// reads as "no real signal here, deprioritize."
const BUILD_TIME = new Date();

function parseIsoOrFallback(iso: string | null): Date {
  if (!iso) return BUILD_TIME;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? BUILD_TIME : parsed;
}

/**
 * Resolve a possibly-relative photo URL (or `/api/places/photo?...`) to an
 * absolute URL — the sitemap Image extension requires fully-qualified URLs.
 */
function absolutePhotoUrl(url: string | null): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static routes — `lastModified` defaults to build time. These pages
  // change rarely; precise lastmod isn't worth the complexity.
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: BUILD_TIME, changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE_URL}/places`, lastModified: BUILD_TIME, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE_URL}/guides`, lastModified: BUILD_TIME, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/cities`, lastModified: BUILD_TIME, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/pricing`, lastModified: BUILD_TIME, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/about`, lastModified: BUILD_TIME, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/contact`, lastModified: BUILD_TIME, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/concierge`, lastModified: BUILD_TIME, changeFrequency: "monthly", priority: 0.6 },
  ];

  // Dynamic city routes — slug-driven, content changes only when DB content
  // for the city changes (we don't track that here, so use BUILD_TIME).
  const citySlugs = getAllCitySlugs();
  const cityRoutes: MetadataRoute.Sitemap = citySlugs.map((slug) => ({
    url: `${BASE_URL}/cities/${slug}`,
    lastModified: BUILD_TIME,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  // Fetch dynamic content in parallel — sitemap generation is the slowest route,
  // and a failure in any single fetcher should not sink the whole file.
  //
  // Sanity experiences are intentionally excluded: they're authored at experience
  // slugs but the `/guides/[slug]` detail page only resolves _type=="guide", so
  // sitemapping them produces 530+ soft-404s. Add `/experiences/[slug]` here
  // once that route renders real experience content.
  const [guidesResult, locationsResult] = await Promise.allSettled([
    getSitemapGuideEntries(),
    getSitemapLocationEntries(),
  ]);

  const guideRoutes: MetadataRoute.Sitemap =
    guidesResult.status === "fulfilled"
      ? guidesResult.value.map((guide) => ({
          url: `${BASE_URL}/guides/${guide.id}`,
          lastModified: parseIsoOrFallback(guide.updatedAt),
          changeFrequency: "monthly" as const,
          priority: 0.7,
        }))
      : (logger.warn("sitemap: guides fetch failed", { error: String(guidesResult.reason) }), []);

  const placeRoutes: MetadataRoute.Sitemap =
    locationsResult.status === "fulfilled"
      ? locationsResult.value.map((entry) => {
          const photo = absolutePhotoUrl(entry.photoUrl);
          return {
            url: `${BASE_URL}/places/${entry.id}`,
            lastModified: parseIsoOrFallback(entry.updatedAt),
            changeFrequency: "monthly" as const,
            priority: 0.6,
            // Image sitemap extension — gives Google a direct pointer to the
            // photo URL even when the page hasn't been crawled yet. Pairs
            // with the `/api/places/photo` carve-out in robots.ts.
            ...(photo && { images: [photo] }),
          };
        })
      : (logger.warn("sitemap: places fetch failed", { error: String(locationsResult.reason) }), []);

  return [...staticRoutes, ...cityRoutes, ...guideRoutes, ...placeRoutes];
}
