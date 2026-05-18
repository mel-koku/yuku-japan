"use client";

import Image from "next/image";
import Link from "next/link";
import { Star, MapPin } from "lucide-react";
import { resizePhotoUrl } from "@/lib/google/transformations";

const FALLBACK_IMAGE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

type AskYukuLocationCardProps = {
  /** URL slug for the `/places/[slug]` route. */
  slug: string;
  name: string;
  category: string;
  city: string;
  rating: number | null;
  image: string;
  primaryPhotoUrl: string | null;
};

export function AskYukuLocationCard({
  slug,
  name,
  category,
  city,
  rating,
  image,
  primaryPhotoUrl,
}: AskYukuLocationCardProps) {
  const imageSrc = resizePhotoUrl(primaryPhotoUrl ?? image, 200) || FALLBACK_IMAGE;

  return (
    <Link
      href={`/places/${slug}`}
      className="group flex items-center gap-3 rounded-lg bg-surface p-2 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-card)]"
    >
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
        <Image
          src={imageSrc}
          alt={name}
          fill
          className="object-cover"
          sizes="48px"
          unoptimized
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground group-hover:text-brand-primary">
          {name}
        </p>
        <div className="flex items-center gap-2 text-xs text-foreground-secondary">
          <span className="capitalize">{category}</span>
          <span className="flex items-center gap-0.5">
            <MapPin className="h-3 w-3" />
            {city}
          </span>
          {rating && (
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-brand-secondary text-brand-secondary" />
              {rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
