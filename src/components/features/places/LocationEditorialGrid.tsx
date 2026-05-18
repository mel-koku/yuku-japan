"use client";

import Image from "next/image";
import Link from "next/link";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { m } from "framer-motion";
import { useSaved } from "@/context/SavedContext";
import { useFirstSaveToast } from "@/hooks/useFirstSaveToast";
import { resizePhotoUrl } from "@/lib/google/transformations";
import { LOCATION_EDITORIAL_SUMMARIES } from "@/data/locationEditorialSummaries";
import { formatMinutesToFitLabel, resolveTimeEstimate } from "@/lib/locations/timeEstimates";
import { useLocationPairs } from "@/hooks/useLocationPairs";
import { useLocationDurations } from "@/hooks/useLocationDurations";
import type { LocationPair } from "@/app/api/locations/pairs/route";
import type { Location } from "@/types/location";

const FALLBACK_IMAGE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

type LocationEditorialGridProps = {
  locations: Location[];
  onSelect?: (location: Location) => void;
  totalCount?: number;
  activeCategory?: string | null;
  onClearFilters?: () => void;
};

function formatDuration(raw?: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Already human-readable (contains "hour", "min", "day", or a dash like "2-3 hours")
  if (/[a-zA-Z-]/.test(trimmed)) return trimmed;
  // Plain number = minutes
  const mins = parseInt(trimmed, 10);
  if (isNaN(mins)) return trimmed;
  if (mins < 60) return `${mins} mins`;
  const hours = mins / 60;
  if (hours === Math.floor(hours)) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `${hours.toFixed(1)} hours`;
}

function getSummary(location: Location): string {
  const editorial = LOCATION_EDITORIAL_SUMMARIES[location.id]?.trim();
  if (editorial) return editorial;
  if (location.shortDescription?.trim()) return location.shortDescription.trim();
  if (location.description?.trim()) return location.description.trim();

  const city = location.city ? ` in ${location.city}` : "";
  return `Notable ${location.category}${city}.`;
}

export function LocationEditorialGrid({
  locations,
  onSelect,
  activeCategory,
  onClearFilters,
}: LocationEditorialGridProps) {
  const visibleIds = useMemo(() => locations.map((l) => l.id), [locations]);
  const pairs = useLocationPairs(visibleIds);
  const durations = useLocationDurations(visibleIds);

  if (locations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface">
          <svg className="h-8 w-8 text-stone" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <p className="text-base font-medium text-foreground mb-1">Nothing matched those filters</p>
        <p className="text-sm text-stone text-center max-w-sm">
          Try removing a filter or searching for something else.
        </p>
        {onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="mt-4 text-sm font-medium text-brand-primary hover:underline underline-offset-2 transition-colors"
          >
            Clear all filters
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      {/*
       * Visually-hidden h2 establishes a heading level between the page h1
       * and the card h3s. Without it, screen readers see a heading-jump from
       * h1 directly to h3 across the long card grid.
       */}
      <h2 className="sr-only">
        {activeCategory && activeCategory !== "all"
          ? `${activeCategory} places`
          : "All places"}
      </h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
      {locations.map((location, i) => (
        <m.div
          key={location.id}
          className="h-full"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: (i % 4) * 0.04, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <PlacesCard
            location={location}
            onSelect={onSelect}
            eager={i < 8}
            pair={pairs[location.id] ?? null}
            durationMinutes={durations[location.id]}
          />
        </m.div>
      ))}
    </div>
    </>
  );
}

const PlacesCard = memo(function PlacesCard({
  location,
  onSelect,
  eager = false,
  pair,
  durationMinutes,
}: {
  location: Location;
  onSelect?: (location: Location) => void;
  eager?: boolean;
  pair?: LocationPair | null;
  /** Summed sub-experience minutes for this location, when available. */
  durationMinutes?: number;
}) {
  const { isInSaved, toggleSave } = useSaved();
  const active = isInSaved(location.id);
  const showFirstSaveToast = useFirstSaveToast();
  const imageSrc = resizePhotoUrl(location.primaryPhotoUrl ?? location.image, 600);
  const summary = getSummary(location);

  const [heartAnimating, setHeartAnimating] = useState(false);
  const wasSaved = useRef(active);

  useEffect(() => {
    if (active && !wasSaved.current) {
      setHeartAnimating(true);
      const timer = setTimeout(() => setHeartAnimating(false), 500);
      return () => clearTimeout(timer);
    }
    wasSaved.current = active;
  }, [active]);

  return (
    <article
      className="group relative h-full"
      data-location-id={location.id}
    >
      <Link
        href={`/places/${location.slug}`}
        prefetch={false}
        onClick={onSelect ? (e) => { e.preventDefault(); onSelect(location); } : undefined}
        className="flex h-full w-full flex-col overflow-hidden rounded-lg bg-surface transition-all duration-300 shadow-[var(--shadow-card)] hover:-translate-y-1 hover:shadow-[var(--shadow-elevated)]"
      >
        {/* Image */}
        <div className="relative w-full overflow-hidden aspect-[4/3]">
          <Image
            src={imageSrc || FALLBACK_IMAGE}
            alt={location.name}
            fill
            priority={eager}
            className="object-cover transition-transform duration-500 ease-cinematic group-hover:scale-[1.04]"
            sizes="(min-width:1280px) 25vw, (min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
          />

          {/* Save button */}
          <div className={`touch-visible absolute top-3 right-3 z-10 sm:transition-opacity sm:duration-300 ${
            active ? "sm:opacity-100" : "sm:opacity-0 sm:group-hover:opacity-100"
          }`}>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!active) showFirstSaveToast();
                toggleSave(location.id);
              }}
              aria-label={active ? "Unsave" : "Save for trip"}
              className={`flex items-center gap-1.5 rounded-full px-3 py-2 min-h-[44px] text-xs font-medium shadow-[var(--shadow-sm)] transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30 ${
                active
                  ? "bg-brand-primary text-white"
                  : "bg-white/80 text-foreground"
              }`}
            >
              <HeartIcon active={active} animating={heartAnimating} />
              {active ? "Saved" : "Save for trip"}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col p-3.5 space-y-1.5">
          {/* Name + rating */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground line-clamp-2 group-hover:text-brand-primary transition-colors">
              {location.name}
            </h3>
            {location.rating ? (
              <span className="flex shrink-0 items-center gap-0.5 text-xs text-foreground">
                <svg className="h-3 w-3 text-warning" viewBox="0 0 24 24" fill="currentColor">
                  <path d="m12 17.27 5.18 3.11-1.64-5.81L20.9 9.9l-6-0.52L12 4 9.1 9.38l-6 .52 5.36 4.67L6.82 20.38 12 17.27z" />
                </svg>
                {location.rating.toFixed(1)}
                {location.reviewCount ? (
                  <span className="text-stone">
                    ({location.reviewCount >= 1000
                      ? `${(location.reviewCount / 1000).toFixed(1)}k`
                      : location.reviewCount})
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-sage">
                Curated
              </span>
            )}
          </div>

          {/* City + duration. Cascade: aggregated sub-experience minutes win
              when present (concierge data — "this temple has 3 highlights
              totalling 1.5 hrs"), then the curated estimatedDuration, then
              the category-based static fallback. */}
          <p className="text-xs text-stone">
            {location.city}, {location.region}
            {(() => {
              const dur = (durationMinutes ? formatMinutesToFitLabel(durationMinutes) : null)
                ?? formatDuration(location.estimatedDuration)
                ?? resolveTimeEstimate(location.estimatedDuration, location.category);
              return dur ? (
                <>
                  <span className="text-border"> &middot; </span>
                  <span>{dur}</span>
                </>
              ) : null;
            })()}
          </p>

          {/* Summary */}
          <p className="text-xs text-foreground-secondary line-clamp-2 leading-relaxed">
            {summary}
          </p>

          {/* Pair line — curated cluster wins, then ≤1km spatial fallback,
              then pgvector cosine similarity ("in the same spirit").
              Suppressed when the card already carries a JTA or UNESCO badge to avoid
              meta-line crowding. */}
          {pair && !location.jtaApproved && !location.isUnescoSite && (
            <p className="text-xs text-foreground-secondary">
              {pair.kind === "cluster" && (
                <>
                  <span className="text-stone">Pairs with </span>
                  <span className="font-medium text-foreground">{pair.parentName ?? pair.name}</span>
                </>
              )}
              {pair.kind === "nearby" && (
                <>
                  <span className="text-stone">{pair.walkMinutes} min walk to </span>
                  <span className="font-medium text-foreground">{pair.parentName ?? pair.name}</span>
                </>
              )}
              {pair.kind === "similar" && (
                <>
                  <span className="text-stone">In the same spirit: </span>
                  <span className="font-medium text-foreground">{pair.parentName ?? pair.name}</span>
                </>
              )}
            </p>
          )}

          {/* Category + badges + duration */}
          <div className="flex items-center gap-2 pt-0.5 mt-auto flex-wrap">
            <span className="text-[11px] font-medium capitalize bg-surface text-stone px-2 py-0.5 rounded-md">
              {location.category}
            </span>
            {location.jtaApproved && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-brand-secondary border border-brand-secondary/40 px-1.5 py-0.5 rounded-md">
                JTA
              </span>
            )}
            {location.isUnescoSite && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-accent border border-accent/40 px-1.5 py-0.5 rounded-md">
                UNESCO
              </span>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
});

function HeartIcon({ active, animating }: { active: boolean; animating: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-3.5 w-3.5 transition-colors ${
        active ? "fill-white stroke-white" : "fill-none stroke-current"
      } ${animating ? "animate-heart-pulse" : ""}`}
      viewBox="0 0 24 24"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19.5 13.572a24.064 24.064 0 0 1-7.5 7.178 24.064 24.064 0 0 1-7.5-7.178C3.862 12.334 3 10.478 3 8.52 3 5.989 5.014 4 7.5 4c1.54 0 2.994.757 4 1.955C12.506 4.757 13.96 4 15.5 4 17.986 4 20 5.989 20 8.52c0 1.958-.862 3.813-2.5 5.052Z" />
    </svg>
  );
}
