"use client";

import Image from "next/image";
import Link from "next/link";
import { m } from "framer-motion";
import type { CityPageData } from "@/lib/cities/cityData";
import type { CityStats, CategoryBreakdown } from "@/lib/cities/cityHelpers";
import type { Location } from "@/types/location";
import type { GuideSummary } from "@/types/guide";
import { GuideCard } from "@/components/features/guides/GuideCard";
import { resizePhotoUrl } from "@/lib/google/transformations";
import { getCategoryHexColor } from "@/lib/itinerary/activityColors";
import { typography } from "@/lib/typography-system";
import { cn } from "@/lib/cn";

type NearbyCity = {
  id: string;
  name: string;
  locationCount: number;
};

type Props = {
  city: CityPageData;
  stats: CityStats;
  categories: CategoryBreakdown[];
  topLocations: Location[];
  hiddenGems: Location[];
  heroImage?: string;
  regionName: string;
  nearbyCities: NearbyCity[];
  cityGuides?: GuideSummary[];
};

const FALLBACK_HERO =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

// Inline location card for A variant (avoids importing PlacesCardB pattern)
function LocationCard({ location, eager }: { location: Location; eager?: boolean }) {
  const imageSrc = resizePhotoUrl(location.primaryPhotoUrl ?? location.image, 600);
  return (
    <Link
      href={`/places/${location.id}`}
      className="group block overflow-hidden rounded-lg bg-surface border border-border transition-all hover:-translate-y-1"
    >
      <div className="relative w-full overflow-hidden aspect-[4/3]">
        <Image
          src={imageSrc || FALLBACK_HERO}
          alt={location.name}
          fill
          priority={eager}
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          sizes="(min-width:1024px) 25vw, (min-width:640px) 50vw, 100vw"
        />
      </div>
      <div className="p-3.5 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-serif text-foreground line-clamp-1 group-hover:text-brand-primary transition-colors">
            {location.name}
          </h3>
          {location.rating ? (
            <span className="flex shrink-0 items-center gap-0.5 text-xs text-foreground">
              <svg className="h-3 w-3 text-warning" viewBox="0 0 24 24" fill="currentColor">
                <path d="m12 17.27 5.18 3.11-1.64-5.81L20.9 9.9l-6-0.52L12 4 9.1 9.38l-6 .52 5.36 4.67L6.82 20.38 12 17.27z" />
              </svg>
              {location.rating.toFixed(1)}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-stone capitalize">{location.category}</p>
        {location.shortDescription && (
          <p className="text-xs text-foreground-secondary line-clamp-2 leading-relaxed">
            {location.shortDescription}
          </p>
        )}
      </div>
    </Link>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  restaurant: "Restaurants", nature: "Nature", landmark: "Landmarks",
  culture: "Culture", shrine: "Shrines", museum: "Museums", park: "Parks",
  temple: "Temples", shopping: "Shopping", garden: "Gardens", onsen: "Onsen",
  entertainment: "Entertainment", market: "Markets", wellness: "Wellness",
  viewpoint: "Viewpoints", bar: "Bars", cafe: "Cafes", castle: "Castles",
  historic_site: "Historic Sites", craft: "Craft", beach: "Beaches",
  aquarium: "Aquariums", theater: "Theaters", zoo: "Zoos",
};

export function CityDetail({
  city,
  stats,
  categories,
  topLocations,
  hiddenGems,
  heroImage,
  regionName,
  nearbyCities,
  cityGuides,
}: Props) {
  const heroSrc = resizePhotoUrl(heroImage, 1600) ?? FALLBACK_HERO;
  const maxCount = categories[0]?.count ?? 1;

  return (
    <div className="min-h-[100dvh]">
      {/* Hero */}
      <section className="relative h-[50vh] min-h-[360px] sm:h-[60vh] overflow-hidden">
        <Image src={heroSrc} alt={city.name} fill priority className="object-cover" sizes="100vw" />
        <div className="absolute inset-0 scrim-80" />
        <div className="absolute inset-0 flex items-end">
          <div className="w-full px-6 sm:px-8 lg:px-12 pb-10 sm:pb-14">
            <div className="mx-auto max-w-7xl">
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="flex items-center gap-2 mb-3"
              >
                <Link href="/cities" className="eyebrow-editorial text-white/70 hover:text-white transition-colors">
                  Cities
                </Link>
                <span className="text-white/40">/</span>
                <span className="eyebrow-editorial text-white/70">{regionName}</span>
              </m.div>
              <m.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className={cn(typography({ intent: "editorial-hero" }), "text-4xl sm:text-5xl lg:text-6xl text-white")}
              >
                {city.name}
              </m.h1>
              <m.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="mt-2 text-lg text-white/80"
              >
                {city.nameJapanese} · {city.tagline}
              </m.p>
            </div>
          </div>
        </div>
      </section>

      {/* Description + Stats */}
      <section className="py-12 sm:py-16 px-6">
        <div className="mx-auto max-w-7xl">
          <m.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="max-w-2xl text-base sm:text-lg text-foreground-body leading-relaxed"
          >
            {city.description}
          </m.p>
          <m.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-8 flex flex-wrap gap-3"
          >
            {[
              { label: "Places", value: stats.totalLocations.toString() },
              { label: "Local picks", value: stats.hiddenGemsCount.toString() },
              ...(stats.averageRating > 0
                ? [{ label: "Avg rating", value: stats.averageRating.toFixed(1) }]
                : []),
              { label: "Known for", value: stats.topCategories[0]?.category ?? "-" },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-2 rounded-lg bg-surface border border-border px-4 py-2.5"
              >
                <span className="text-xs text-stone">{item.label}</span>
                <span className="text-sm font-medium capitalize text-foreground">{item.value}</span>
              </div>
            ))}
          </m.div>
        </div>
      </section>

      {/* Category Breakdown */}
      {categories.length > 0 && (
        <section className="py-12 sm:py-16 bg-canvas px-6">
          <div className="mx-auto max-w-7xl">
            <h2 className={typography({ intent: "editorial-h3" })}>
              What {city.name} is known for
            </h2>
            <div className="mt-8 space-y-3 max-w-2xl">
              {categories.slice(0, 10).map((cat, i) => {
                const color = getCategoryHexColor(cat.category);
                const widthPct = Math.max((cat.count / maxCount) * 100, 4);
                return (
                  <m.div
                    key={cat.category}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.04 }}
                    className="flex items-center gap-3"
                  >
                    <span className="w-28 shrink-0 text-sm capitalize text-foreground-secondary">
                      {CATEGORY_LABELS[cat.category] ?? cat.category}
                    </span>
                    <div className="flex-1 h-7 rounded-lg bg-surface overflow-hidden">
                      <m.div
                        className="h-full rounded-lg flex items-center justify-end pr-2"
                        style={{ backgroundColor: color }}
                        initial={{ width: 0 }}
                        whileInView={{ width: `${widthPct}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.1 + i * 0.04, ease: [0.25, 0.1, 0.25, 1] }}
                      >
                        <span className="text-[11px] font-semibold text-white">{cat.count}</span>
                      </m.div>
                    </div>
                  </m.div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Top-Rated Locations */}
      {topLocations.length > 0 && (
        <section className="py-12 sm:py-16 px-6">
          <div className="mx-auto max-w-7xl">
            <h2 className={typography({ intent: "editorial-h3" })}>
              Top-rated in {city.name}
            </h2>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {topLocations.map((loc, i) => (
                <LocationCard key={loc.id} location={loc} eager={i < 4} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Hidden Gems */}
      {hiddenGems.length > 0 && (
        <section className="py-12 sm:py-16 bg-canvas px-6">
          <div className="mx-auto max-w-7xl">
            <p className="eyebrow-editorial text-brand-primary">Off the usual route</p>
            <h2 className={`mt-2 ${typography({ intent: "editorial-h3" })}`}>
              Local picks in {city.name}
            </h2>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {hiddenGems.map((loc) => (
                <LocationCard key={loc.id} location={loc} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Guides for this city — internal-linking cluster
          (city → guide → place) and editorial entry points. */}
      {cityGuides && cityGuides.length > 0 && (
        <section className="py-12 sm:py-16 bg-canvas px-6">
          <div className="mx-auto max-w-7xl">
            <h2 className={typography({ intent: "editorial-h3" })}>
              Guides for {city.name}
            </h2>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {cityGuides.map((guide, i) => (
                <GuideCard key={guide.id} guide={guide} index={i} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Nearby Cities */}
      {nearbyCities.length > 0 && (
        <section className="py-12 sm:py-16 px-6">
          <div className="mx-auto max-w-7xl">
            <h2 className={typography({ intent: "editorial-h3" })}>
              Nearby in {regionName}
            </h2>
            <div className="mt-6 flex flex-wrap gap-3">
              {nearbyCities.map((nc) => (
                <Link
                  key={nc.id}
                  href={`/cities/${nc.id}`}
                  className="flex items-center gap-2 rounded-lg bg-surface border border-border px-4 py-3 transition-all hover:-translate-y-1 active:scale-[0.98]"
                >
                  <span className="text-sm font-medium text-foreground">{nc.name}</span>
                  <span className="text-xs text-stone">{nc.locationCount} places</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-20 sm:py-28 px-6">
        <div className="mx-auto max-w-7xl text-center">
          <h2 className={typography({ intent: "editorial-h2" })}>
            Plan a trip to {city.name}
          </h2>
          <p className="mt-3 text-foreground-secondary">
            Build a personalized itinerary with the best of {city.name}.
          </p>
          <div className="mt-8">
            <Link
              href="/trip-builder"
              className="inline-flex h-12 items-center rounded-lg bg-brand-primary px-8 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98]"
            >
              Start planning
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
