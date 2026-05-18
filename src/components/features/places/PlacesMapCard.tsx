"use client";

import Image from "next/image";
import Link from "next/link";
import { memo, forwardRef } from "react";
import { resizePhotoUrl } from "@/lib/google/transformations";
import type { Location } from "@/types/location";

type PlacesMapCardProps = {
  location: Location;
  isHighlighted?: boolean;
  onHover?: (locationId: string | null) => void;
  onSelect?: (location: Location) => void;
  /** Distance in km from the user's current location, when Near Me is active. */
  distanceKm?: number;
};

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export const PlacesMapCard = memo(
  forwardRef<HTMLDivElement, PlacesMapCardProps>(function PlacesMapCard(
    { location, isHighlighted, onHover, onSelect, distanceKm },
    ref,
  ) {
    const thumb = resizePhotoUrl(location.primaryPhotoUrl ?? location.image, 96);

    return (
      <div
        ref={ref}
        data-location-id={location.id}
        onMouseEnter={() => onHover?.(location.id)}
        onMouseLeave={() => onHover?.(null)}
      >
        <Link
          href={`/places/${location.slug}`}
          onClick={onSelect ? (e) => { e.preventDefault(); onSelect(location); } : undefined}
          className={`flex items-center gap-2 rounded-lg bg-background pl-2 pr-3 py-2.5 min-h-[44px] shadow-[var(--shadow-sm)] transition ${
            isHighlighted
              ? "ring-1 ring-brand-primary/40 bg-background"
              : "hover:bg-surface hover:shadow-[var(--shadow-card)]"
          }`}
        >
          {thumb && (
            <div className="relative h-8 w-8 shrink-0 rounded-lg overflow-hidden">
              <Image
                src={thumb}
                alt={location.name}
                fill
                className="object-cover"
                sizes="32px"
              />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-foreground leading-tight">
              {location.name}
            </p>
            <div className="flex items-center gap-1">
              <p className="text-[11px] text-foreground-secondary truncate leading-tight">
                {location.city}
              </p>
              {location.rating ? (
                <>
                  <span className="text-border">&middot;</span>
                  <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-foreground-secondary">
                    <svg className="h-2.5 w-2.5 text-warning" viewBox="0 0 24 24" fill="currentColor">
                      <path d="m12 17.27 5.18 3.11-1.64-5.81L20.9 9.9l-6-0.52L12 4 9.1 9.38l-6 .52 5.36 4.67L6.82 20.38 12 17.27z" />
                    </svg>
                    {location.rating.toFixed(1)}
                  </span>
                </>
              ) : null}
              {distanceKm != null ? (
                <>
                  <span className="text-border">&middot;</span>
                  <span className="shrink-0 font-mono text-[11px] text-foreground-secondary">
                    {formatDistance(distanceKm)}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </Link>
      </div>
    );
  }),
);
