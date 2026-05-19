"use client";

import Image from "next/image";
import { memo, useEffect, useRef, useState } from "react";
import { useSaved } from "@/context/SavedContext";
import { useFirstSaveToast } from "@/hooks/useFirstSaveToast";
import { resizePhotoUrl } from "@/lib/google/transformations";
import { formatCityRegion } from "@/lib/locationNameUtils";
import type { Location } from "@/types/location";
import { HeartIcon } from "./LocationCard";
import { PracticalBadges } from "@/components/ui/PracticalBadges";
import { SeasonalBadge } from "./SeasonalBadge";

const FALLBACK_IMAGE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

type PlacesCompactCardProps = {
  location: Location;
  onSelect?: (location: Location) => void;
  isHighlighted?: boolean;
  onHover?: (locationId: string | null) => void;
  eager?: boolean;
};

export const PlacesCompactCard = memo(function PlacesCompactCard({
  location,
  onSelect,
  isHighlighted,
  onHover,
  eager = false,
}: PlacesCompactCardProps) {
  const { isInSaved, toggleSave } = useSaved();
  const active = isInSaved(location.id);
  const showFirstSaveToast = useFirstSaveToast();

  const imageSrc = resizePhotoUrl(location.primaryPhotoUrl ?? location.image, 400);

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
      className={`group relative text-foreground animate-card-in ${
        isHighlighted ? "ring-2 ring-brand-primary/60 rounded-lg" : ""
      }`}
      data-location-id={location.id}
      onMouseEnter={() => onHover?.(location.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div
        onClick={() => onSelect?.(location)}
        className="relative block w-full text-left cursor-pointer rounded-lg"
        role="link"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect?.(location);
          }
        }}
      >
        {/* Image container */}
        <div className="relative w-full overflow-hidden rounded-lg border border-border shadow-[var(--shadow-card)] aspect-[4/3]">
          <Image
            src={imageSrc || FALLBACK_IMAGE}
            alt={location.name}
            fill
            priority={eager}
            className="object-cover transition-transform duration-500 ease-cinematic group-hover:scale-[1.04]"
            sizes="(min-width:1024px) 25vw, (min-width:640px) 50vw, 100vw"
          />

          {/* Seasonal badge (top-left) */}
          <div className="absolute top-2.5 left-2.5 z-10">
            <SeasonalBadge tags={location.tags} />
          </div>

          {/* Gradient overlay */}
          <div className="absolute inset-0 scrim-70" />

          {/* Bottom accent line on hover */}
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-primary origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500" />

          {/* Overlay Actions */}
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 sm:opacity-0 sm:translate-y-2 sm:group-hover:opacity-100 sm:group-hover:translate-y-0 sm:transition-all sm:duration-300 pointer-events-none z-10 touch-visible">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (!active) showFirstSaveToast();
                toggleSave(location.id);
              }}
              aria-label={active ? "Unsave" : "Save for trip"}
              className="pointer-events-auto flex h-10 min-h-[44px] items-center gap-1 rounded-full bg-surface/90 px-2.5 backdrop-blur-md shadow-[var(--shadow-elevated)] transition-all hover:bg-surface hover:scale-105 active:scale-[0.98]"
            >
              <HeartIcon active={active} animating={heartAnimating} variant="overlay" />
              <span className="text-[11px] font-medium text-foreground">
                {active ? "Saved" : "Save"}
              </span>
            </button>
          </div>

          {/* Text overlay */}
          <div className="absolute inset-x-0 bottom-0 p-3">
            <p className="text-[10px] uppercase tracking-[0.25em] text-white/60 mb-0.5 font-mono">
              {formatCityRegion(location.city, location.region)}
            </p>
            <p className="font-serif text-white text-base line-clamp-1">
              {location.name}
            </p>
            <div className="mt-1">
              <PracticalBadges location={location} variant="overlay" max={2} />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
});
