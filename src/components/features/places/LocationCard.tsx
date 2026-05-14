"use client";

import Image from "next/image";
import { memo, useRef, useState, useEffect } from "react";
import { m, useReducedMotion } from "framer-motion";

import { useSaved } from "@/context/SavedContext";
import { LOCATION_EDITORIAL_SUMMARIES } from "@/data/locationEditorialSummaries";
import { useFirstSaveToast } from "@/hooks/useFirstSaveToast";
import { resizePhotoUrl } from "@/lib/google/transformations";
import { resolveTimeEstimate } from "@/lib/locations/timeEstimates";
import { easeReveal, durationBase } from "@/lib/motion";
import type { Location } from "@/types/location";
import { PhotoAttribution } from "./PhotoAttribution";

type LocationCardProps = {
  location: Location;
  onSelect?: (location: Location) => void;
  variant?: "default" | "tall" | "compact";
  /** Optional meta text shown below the name (e.g., "5 min walk") */
  meta?: string;
};

export const LocationCard = memo(function LocationCard({ location, onSelect, variant = "default", meta }: LocationCardProps) {
  const { isInSaved, toggleSave } = useSaved();
  const active = isInSaved(location.id);
  const prefersReducedMotion = useReducedMotion();
  const displayName = location.name;
  const summary = getShortOverview(location, null);
  const estimatedDuration = resolveTimeEstimate(location.estimatedDuration, location.category);
  const rating = getLocationRating(location);
  const reviewCount = getLocationReviewCount(location);
  const showFirstSaveToast = useFirstSaveToast();
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const imageSrc = resizePhotoUrl(location.primaryPhotoUrl ?? location.image, 800);

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

  if (variant === "compact") {
    return (
      <m.article
        className="group relative text-foreground"
        initial={prefersReducedMotion ? {} : { y: 12, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true, margin: "-5%" }}
        transition={{ duration: durationBase, ease: easeReveal }}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelect?.(location)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect?.(location); }}
          className="flex w-full cursor-pointer items-center gap-3 rounded-lg bg-surface p-3 text-left shadow-[var(--shadow-sm)] transition-all duration-300 hover:shadow-[var(--shadow-card)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-canvas">
            <Image
              src={imageSrc || FALLBACK_IMAGE_SRC}
              alt={displayName}
              fill
              className="object-cover"
              sizes="64px"
              priority={false}
            />
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <h3 className="text-sm font-medium text-foreground line-clamp-1 transition-colors duration-200 group-hover:text-brand-primary">
              {displayName}
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-stone">
              <span className="capitalize">{location.category}</span>
              {rating ? (
                <>
                  <span aria-hidden="true">&middot;</span>
                  <StarIcon />
                  <span>{rating.toFixed(1)}</span>
                </>
              ) : null}
              {meta && (
                <>
                  <span aria-hidden="true">&middot;</span>
                  <span>{meta}</span>
                </>
              )}
            </div>
          </div>
          {location.parentMode !== "container" && (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                if (!active) showFirstSaveToast();
                toggleSave(location.id);
              }}
              aria-label={active ? "Remove from saved" : "Save for trip"}
              className="shrink-0 p-1"
            >
              <HeartIcon active={active} animating={heartAnimating} className="h-4 w-4" />
            </button>
          )}
        </div>
      </m.article>
    );
  }

  return (
    <m.article
      className="group relative text-foreground"
      initial={prefersReducedMotion ? {} : { y: 24, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true, margin: "-5%" }}
      transition={{ duration: durationBase, ease: easeReveal }}
    >
      <div className={`overflow-hidden rounded-lg bg-surface shadow-[var(--shadow-card)] transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-[var(--shadow-elevated)] ${variant === "tall" ? "h-full" : ""}`}>
        <div className="relative">
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelect?.(location)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect?.(location); }}
            ref={buttonRef}
            className="relative block w-full text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-inset"
          >
            <div className={`relative w-full overflow-hidden bg-surface ${variant === "tall" ? "aspect-[3/4]" : "aspect-[4/3]"}`}>
              <Image
                src={imageSrc || FALLBACK_IMAGE_SRC}
                alt={displayName}
                fill
                className="object-cover transition-transform duration-500 ease-cinematic group-hover:scale-[1.04]"
                sizes="(min-width:1280px) 25vw, (min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
                priority={false}
              />
              <div className="absolute inset-0 scrim-50 opacity-0 group-hover:opacity-100 sm:transition-opacity sm:duration-500" />
            </div>
          </div>
          {location.heroAttribution ? (
            <div className="pointer-events-auto absolute top-3 right-3 z-10">
              <PhotoAttribution
                attribution={location.heroAttribution}
                variant="tooltip"
                className="h-7 w-7"
              />
            </div>
          ) : null}
          <div className="absolute bottom-3 right-3 flex items-center gap-2 sm:opacity-0 sm:translate-y-2 sm:group-hover:opacity-100 sm:group-hover:translate-y-0 sm:transition-all sm:duration-300 pointer-events-none touch-visible">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (!active) showFirstSaveToast();
                toggleSave(location.id);
              }}
              aria-label={active ? "Remove from saved" : "Save for trip"}
              className="pointer-events-auto flex min-h-11 items-center gap-1.5 rounded-full bg-surface/90 px-3 backdrop-blur-md shadow-[var(--shadow-elevated)] transition-all hover:bg-surface hover:scale-105 active:scale-[0.98]"
            >
              <HeartIcon active={active} animating={heartAnimating} variant="overlay" />
              <span className="text-xs font-medium text-foreground">
                {active ? "Saved" : "Save"}
              </span>
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSelect?.(location)}
          className="block w-full text-left cursor-pointer focus-visible:outline-none p-4"
        >
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium text-foreground line-clamp-1 transition-colors duration-200 group-hover:text-brand-primary">
                {displayName}
              </h3>
              {rating ? (
                <div className="flex shrink-0 items-center gap-1 text-sm">
                  <StarIcon />
                  <span className="text-foreground">{rating.toFixed(1)}</span>
                  {reviewCount ? (
                    <span className="text-stone">({formatReviewCount(reviewCount)})</span>
                  ) : null}
                </div>
              ) : !hasRealRating(location) ? (
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-sage">
                  Curated
                </span>
              ) : null}
            </div>
            <p className="text-sm text-stone">
              {location.parentName
                ? `${location.city} \u00b7 in ${location.parentName}`
                : `${location.city}, ${location.region}`}
            </p>
            <p className="text-sm text-stone line-clamp-2">{summary}</p>
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <span className="text-xs font-medium capitalize bg-sand/50 text-foreground-secondary px-2.5 py-1 rounded-md">
                {location.category}
              </span>
              {location.jtaApproved && (
                <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-brand-secondary border border-brand-secondary/40 px-2 py-0.5 rounded-md">
                  JTA Approved
                </span>
              )}
              {location.isUnescoSite && (
                <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-accent border border-accent/40 px-2 py-0.5 rounded-md">
                  UNESCO
                </span>
              )}
              {estimatedDuration ? (
                <>
                  <span className="text-border">&middot;</span>
                  <span className="flex items-center gap-1 text-sm text-stone">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" />
                      <path strokeLinecap="round" d="M12 6v6l4 2" />
                    </svg>
                    Est. {estimatedDuration}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </button>
      </div>
    </m.article>
  );
});

type HeartIconProps = {
  active: boolean;
  animating?: boolean;
  className?: string;
  variant?: "overlay" | "inline";
};

export function HeartIcon({ active, animating, className, variant = "inline" }: HeartIconProps) {
  const baseClass = className ?? "h-5 w-5";
  const colorClass = variant === "overlay"
    ? active ? "fill-error stroke-error" : "fill-foreground/20 stroke-foreground/70"
    : active ? "fill-error stroke-error" : "fill-none stroke-current";

  return (
    <svg
      aria-hidden="true"
      className={`${baseClass} transition-colors ${colorClass} ${animating ? "animate-heart-pulse" : ""}`}
      viewBox="0 0 24 24"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19.5 13.572a24.064 24.064 0 0 1-7.5 7.178 24.064 24.064 0 0 1-7.5-7.178C3.862 12.334 3 10.478 3 8.52 3 5.989 5.014 4 7.5 4c1.54 0 2.994.757 4 1.955C12.506 4.757 13.96 4 15.5 4 17.986 4 20 5.989 20 8.52c0 1.958-.862 3.813-2.5 5.052Z" />
    </svg>
  );
}

const CATEGORY_DESCRIPTORS: Record<string, string> = {
  culture: "Historic cultural landmark",
  food: "Favorite spot for local flavors",
  nature: "Outdoor escape with scenic views",
  shopping: "Bustling shopping stop",
  view: "Panoramic viewpoint worth the stop",
  entertainment: "Fun activities and family outings",
};

const FALLBACK_IMAGE_SRC =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

function getShortOverview(location: Location, cachedSummary: string | null): string {
  const trimmedCachedSummary = cachedSummary?.trim();
  if (trimmedCachedSummary) return trimmedCachedSummary;
  const editorialSummary = LOCATION_EDITORIAL_SUMMARIES[location.id]?.trim();
  if (editorialSummary) return editorialSummary;
  if (location.shortDescription && location.shortDescription.trim().length > 0) {
    return location.shortDescription.trim();
  }
  const descriptor = CATEGORY_DESCRIPTORS[location.category.toLowerCase()] ?? "Notable experience";
  const cityPiece = location.city ? ` in ${location.city}` : "";
  const details: string[] = [];
  if (location.minBudget) details.push(`Budget ${location.minBudget}`);
  if (location.estimatedDuration) details.push(`Plan for ${location.estimatedDuration}`);
  const detailsSentence = details.length > 0 ? ` ${details.join(" \u2022 ")}` : "";
  return `${descriptor}${cityPiece}.${detailsSentence || " Fits into most itineraries."}`;
}

function getLocationRating(location: Location): number | null {
  if (!Number.isFinite(location.rating)) return null;
  const clamped = clamp(location.rating as number, 0, 5);
  return clamped ? Math.round(clamped * 10) / 10 : null;
}

function getLocationReviewCount(location: Location): number | null {
  if (Number.isFinite(location.reviewCount) && (location.reviewCount as number) > 0) {
    return location.reviewCount as number;
  }
  return null;
}

function hasRealRating(location: Location): boolean {
  return Number.isFinite(location.rating) && (location.rating as number) > 0;
}

function formatReviewCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return count.toString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function StarIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 text-warning"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="m12 17.27 5.18 3.11-1.64-5.81L20.9 9.9l-6-0.52L12 4 9.1 9.38l-6 .52 5.36 4.67L6.82 20.38 12 17.27z" />
    </svg>
  );
}
