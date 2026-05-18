"use client";

import Image from "next/image";
import Link from "next/link";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { resizePhotoUrl } from "@/lib/google/transformations";
import { LOCATION_EDITORIAL_SUMMARIES } from "@/data/locationEditorialSummaries";
import { typography } from "@/lib/typography-system";
import { cn } from "@/lib/utils";

import type { Location } from "@/types/location";
import type { LandingPageContent } from "@/types/sanitySiteContent";

function getSummary(location: Location): string {
  const editorial = LOCATION_EDITORIAL_SUMMARIES[location.id]?.trim();
  if (editorial) return editorial;
  if (location.shortDescription?.trim()) return location.shortDescription.trim();
  if (location.description?.trim()) return location.description.trim();
  const city = location.city ? ` in ${location.city}` : "";
  return `Notable ${location.category}${city}.`;
}

type FeaturedLocationsProps = {
  locations: Location[];
  content?: LandingPageContent;
};

export function FeaturedLocations({ locations, content }: FeaturedLocationsProps) {
  if (locations.length === 0) return null;

  return (
    <section aria-label="Featured locations" className="bg-canvas py-12 sm:py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-6">
        {/* Header */}
        <ScrollReveal direction="left">
          <div>
            <p className="eyebrow-editorial text-brand-primary">
              {content?.featuredLocationsEyebrow ?? "Editor\u2019s Picks"}
            </p>
            <h2 className={cn(typography({ intent: "editorial-h2" }), "mt-4")}>
              {content?.featuredLocationsHeading ?? "Places that stay with you"}
            </h2>
            <p className={cn(typography({ intent: "utility-body-muted" }), "mt-3 max-w-md")}>
              {content?.featuredLocationsDescription ?? "Backstreet temples. Neighborhood staples. Places worth the detour."}
            </p>
          </div>
        </ScrollReveal>

        {/* Cards grid — hero card for first item */}
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {locations.slice(0, 5).map((location, i) => {
            const isHero = i === 0;
            return (
              <ScrollReveal
                key={location.id}
                delay={0.1 + i * 0.08}
                className={cn(
                  "h-full rounded-lg bg-surface shadow-[var(--shadow-card)] transition-[box-shadow] duration-300 hover:shadow-[var(--shadow-elevated)]",
                  isHero && "sm:col-span-2 lg:col-span-2 lg:row-span-2"
                )}
              >
                <Link
                  href={`/places/${location.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30"
                >
                  <div className={cn(
                    "relative overflow-hidden",
                    isHero ? "aspect-[4/3] sm:aspect-[16/10] lg:aspect-auto lg:flex-1" : "aspect-[4/3]"
                  )}>
                    <Image
                      src={resizePhotoUrl(location.primaryPhotoUrl ?? location.image, isHero ? 900 : 600) || "/placeholder.jpg"}
                      alt={location.name}
                      fill
                      className="object-cover transition-transform duration-500 ease-cinematic group-hover:scale-[1.04]"
                      sizes={isHero
                        ? "(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 50vw"
                        : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      }
                    />
                    <div className="absolute inset-0 scrim-40 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                  </div>
                  <div className="p-4 space-y-1">
                    <h3 className={cn(
                      "font-serif font-medium text-foreground line-clamp-2 group-hover:text-brand-primary transition-colors",
                      isHero ? "text-lg" : "text-base"
                    )}>
                      {location.name}
                    </h3>
                    <p className={cn(typography({ intent: "utility-meta" }), "text-stone")}>
                      {location.city}, {location.region}
                    </p>
                    {isHero && (
                      <p className={cn(typography({ intent: "utility-meta" }), "mt-1 line-clamp-2 leading-relaxed")}>
                        {getSummary(location)}
                      </p>
                    )}
                  </div>
                </Link>
              </ScrollReveal>
            );
          })}
        </div>

        {/* Section CTA */}
        <div className="mt-10 text-center">
          <Link
            href="/places"
            className="link-reveal group inline-flex min-h-11 items-center gap-2 py-2 text-sm font-medium text-foreground transition-colors hover:text-brand-primary"
          >
            {content?.featuredLocationsCtaText ?? "View all places"}
            <svg
              className="h-4 w-4 transition-transform group-hover:translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
              />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
