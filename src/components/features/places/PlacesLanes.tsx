"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { m, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { resizePhotoUrl } from "@/lib/google/transformations";
import { typography } from "@/lib/typography-system";
import { easeReveal, durationBase } from "@/lib/motion";
import { cn } from "@/lib/cn";
import type { Location } from "@/types/location";
import { FEATURED_CITIES } from "@/data/featuredCities";

const ICONIC_CATEGORIES = new Set([
  "shrine",
  "temple",
  "castle",
  "landmark",
  "historic_site",
  "viewpoint",
  "tower",
]);

type PlacesLanesProps = {
  locations: Location[];
  cityHeroes?: Record<string, string>;
  onSelect: (location: Location) => void;
  onCitySelect: (citySlug: string) => void;
  onOpenSearch: () => void;
  lanesData?: { iconic: Location[]; containers: Location[] };
};

export function PlacesLanes({ locations, cityHeroes, onSelect, onCitySelect, onOpenSearch, lanesData }: PlacesLanesProps) {
  const prefersReducedMotion = useReducedMotion();

  // resizePhotoUrl strips legacy location-photos bucket URLs to undefined,
  // so a location can have l.image set but produce no usable image. Only
  // include locations whose photo actually resolves — otherwise the lane
  // fills with gradient placeholders for famous places.
  const hasResolvablePhoto = (l: Location) =>
    Boolean(resizePhotoUrl(l.primaryPhotoUrl ?? l.image, 600));

  const iconicFromLocations = useMemo(() => {
    return locations
      .filter((l) => ICONIC_CATEGORIES.has(l.category) || l.isUnescoSite || l.isFeatured)
      .filter(hasResolvablePhoto)
      .sort((a, b) => {
        const scoreA = (a.rating ?? 0) * Math.log10((a.reviewCount ?? 0) + 10);
        const scoreB = (b.rating ?? 0) * Math.log10((b.reviewCount ?? 0) + 10);
        return scoreB - scoreA;
      })
      .slice(0, 8);
  }, [locations]);

  const containersFromLocations = useMemo(() => {
    return locations
      .filter((l) => l.parentMode === "container")
      .filter(hasResolvablePhoto)
      .slice(0, 12);
  }, [locations]);

  // Use SSR-provided lanesData when available; fall back to deriving from the
  // full client-side locations once it loads. This keeps the lanes visible
  // immediately on first paint without waiting for the ~400-600 KB fetch.
  const iconic = lanesData
    ? lanesData.iconic.filter(hasResolvablePhoto).slice(0, 8)
    : iconicFromLocations;
  const containers = lanesData
    ? lanesData.containers.filter(hasResolvablePhoto).slice(0, 12)
    : containersFromLocations;

  if (!lanesData && locations.length === 0) return null;

  const fadeIn = prefersReducedMotion
    ? undefined
    : { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-10%" } };

  return (
    <section
      aria-label="Editorial entry points"
      className="mx-auto max-w-7xl space-y-12 px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12"
    >
      {iconic.length > 0 && (
        <RailLane
          eyebrow="The greats"
          intro="The five or six places that justify the flight."
          motionProps={fadeIn}
          prefersReducedMotion={prefersReducedMotion ?? false}
        >
          {iconic.map((loc) => (
            <PlaceTile key={loc.id} location={loc} onSelect={onSelect} />
          ))}
        </RailLane>
      )}

      <Lane
        eyebrow="Where to base yourself"
        intro="Choose where to begin. We'll shape the rest around it."
        motionProps={fadeIn}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
          {FEATURED_CITIES.map((city) => {
            const heroImage = cityHeroes?.[city.slug];
            return (
              <CityTile
                key={city.slug}
                city={heroImage ? { ...city, image: heroImage } : city}
                onSelect={onCitySelect}
              />
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onOpenSearch}
            className="link-reveal text-sm font-medium text-foreground-secondary transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded-sm"
          >
            More cities →
          </button>
        </div>
      </Lane>

      {containers.length > 0 && (
        <RailLane
          eyebrow="Districts and clusters"
          intro="Walking neighborhoods, hot-spring towns, lantern-lit lanes."
          motionProps={fadeIn}
          prefersReducedMotion={prefersReducedMotion ?? false}
        >
          {containers.map((loc) => (
            <PlaceTile key={loc.id} location={loc} onSelect={onSelect} variant="container" />
          ))}
        </RailLane>
      )}
    </section>
  );
}

function Lane({
  eyebrow,
  intro,
  children,
  motionProps,
}: {
  eyebrow: string;
  intro: string;
  children: React.ReactNode;
  motionProps?: Parameters<typeof m.div>[0];
}) {
  return (
    <m.div
      {...motionProps}
      transition={{ duration: durationBase, ease: easeReveal }}
      className="space-y-4"
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow-editorial">{eyebrow}</p>
          <p className={cn(typography({ intent: "editorial-h3" }), "mt-1 text-foreground-body")}>
            {intro}
          </p>
        </div>
      </div>
      {children}
    </m.div>
  );
}

function RailLane({
  eyebrow,
  intro,
  children,
  motionProps,
  prefersReducedMotion,
}: {
  eyebrow: string;
  intro: string;
  children: React.ReactNode;
  motionProps?: Parameters<typeof m.div>[0];
  prefersReducedMotion: boolean;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateBoundaries = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // 2px epsilon — sub-pixel scrollLeft on retina/zoom can leave a fraction.
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < max - 2);
  }, []);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    updateBoundaries();
    el.addEventListener("scroll", updateBoundaries, { passive: true });
    const ro = new ResizeObserver(updateBoundaries);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateBoundaries);
      ro.disconnect();
    };
  }, [updateBoundaries]);

  const scrollByDirection = (direction: -1 | 1) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * Math.round(el.clientWidth * 0.8),
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  };

  return (
    <m.div
      {...motionProps}
      transition={{ duration: durationBase, ease: easeReveal }}
      className="space-y-4"
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow-editorial">{eyebrow}</p>
          <p className={cn(typography({ intent: "editorial-h3" }), "mt-1 text-foreground-body")}>
            {intro}
          </p>
        </div>
        <div className="hidden shrink-0 gap-2 sm:flex">
          <RailArrowButton
            direction="left"
            disabled={!canScrollLeft}
            onClick={() => scrollByDirection(-1)}
          />
          <RailArrowButton
            direction="right"
            disabled={!canScrollRight}
            onClick={() => scrollByDirection(1)}
          />
        </div>
      </div>
      {/* overscroll-x-contain (not the shorthand): horizontal wheel stays in
          the rail, vertical wheel chains up so the page can scroll while the
          cursor is over a tile. */}
      <div
        ref={railRef}
        className="-mx-4 overflow-x-auto overscroll-x-contain px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      >
        <div className="flex snap-x snap-mandatory gap-3 sm:gap-4">{children}</div>
      </div>
    </m.div>
  );
}

function RailArrowButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "left" ? "Scroll left" : "Scroll right"}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-divider bg-surface text-foreground-secondary shadow-[var(--shadow-card)] transition hover:text-foreground hover:shadow-[var(--shadow-elevated)] disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

function PlaceTile({
  location,
  onSelect,
  variant = "place",
}: {
  location: Location;
  onSelect: (location: Location) => void;
  variant?: "place" | "container";
}) {
  const imageSrc = resizePhotoUrl(location.primaryPhotoUrl ?? location.image, 600);
  const [imageFailed, setImageFailed] = useState(false);
  const subtitle = variant === "container"
    ? location.region
    : `${location.city}, ${location.region}`;
  const showImage = Boolean(imageSrc) && !imageFailed;

  return (
    <button
      type="button"
      onClick={() => onSelect(location)}
      className="group relative w-44 shrink-0 snap-start overflow-hidden rounded-lg bg-canvas text-left shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary sm:w-56"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-canvas">
        {showImage ? (
          <Image
            src={imageSrc!}
            alt=""
            fill
            sizes="(min-width:1024px) 224px, 176px"
            className="object-cover transition-transform duration-500 ease-cinematic group-hover:scale-[1.04]"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-canvas via-sand to-canvas" aria-hidden="true" />
        )}
        <div className={cn("absolute inset-0", showImage ? "scrim-50" : "scrim-20")} />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <p
            className={cn(
              "line-clamp-2 font-serif text-base font-medium leading-tight",
              showImage ? "text-white" : "text-foreground",
            )}
          >
            {location.name}
          </p>
          <p
            className={cn(
              "mt-0.5 text-[11px] uppercase tracking-wide",
              showImage ? "text-white/80" : "text-foreground-secondary",
            )}
          >
            {subtitle}
          </p>
        </div>
      </div>
    </button>
  );
}

function CityTile({
  city,
  onSelect,
}: {
  city: { slug: string; label: string; region: string; image: string };
  onSelect: (citySlug: string) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(city.image) && !imageFailed;

  return (
    <button
      type="button"
      onClick={() => onSelect(city.slug)}
      className="group relative block aspect-[4/5] w-full overflow-hidden rounded-lg bg-surface text-left shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
    >
      {showImage ? (
        <Image
          src={city.image}
          alt={city.label}
          fill
          sizes="(min-width:1024px) 200px, 50vw"
          className="object-cover transition-transform duration-500 ease-cinematic group-hover:scale-[1.04]"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-canvas via-sand to-canvas" aria-hidden="true" />
      )}
      <div className={cn("absolute inset-0", showImage ? "scrim-60" : "scrim-20")} />
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className={cn("line-clamp-2 font-serif text-base font-medium leading-tight", showImage ? "text-white" : "text-foreground")}>{city.label}</p>
        <p className={cn("mt-0.5 text-[11px] uppercase tracking-wide", showImage ? "text-white/80" : "text-foreground-secondary")}>{city.region}</p>
      </div>
    </button>
  );
}
