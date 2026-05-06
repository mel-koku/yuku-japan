"use client";

import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { resizePhotoUrl } from "@/lib/google/transformations";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { staggerItem } from "@/lib/motion";
import { typography } from "@/lib/typography-system";
import type { Location } from "@/types/location";

type LinkedLocationsProps = {
  locations: Location[];
};

const FALLBACK_IMAGE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

export function LinkedLocations({ locations }: LinkedLocationsProps) {
  if (locations.length === 0) {
    return null;
  }

  return (
    <section className="py-12 sm:py-20 lg:py-28">
      <div className="mx-auto max-w-5xl px-6">
        {/* Header */}
        <ScrollReveal distance={20}>
          <p className="mb-2 eyebrow-editorial">
            Featured in this guide
          </p>
          <h2 className={typography({ intent: "editorial-h2" })}>
            Places to Visit
          </h2>
        </ScrollReveal>

        {/* Asymmetric grid */}
        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {locations.map((location, i) => {
            const imageSrc =
              resizePhotoUrl(
                location.primaryPhotoUrl || location.image,
                800
              ) || FALLBACK_IMAGE;
            const isFeatured = i === 0;

            return (
              <ScrollReveal
                key={location.id}
                className={
                  isFeatured
                    ? "lg:col-span-1 lg:row-span-2"
                    : ""
                }
                stagger={i * staggerItem}
                distance={30}
              >
                <Link
                  href={`/places/${location.id}`}
                  data-location-id={location.id}
                  className="group relative block h-full overflow-hidden rounded-lg"
                >
                  <div
                    className={`relative w-full ${
                      isFeatured
                        ? "aspect-[3/4] lg:aspect-auto lg:h-full"
                        : "aspect-[16/9] lg:aspect-[4/3]"
                    }`}
                  >
                    <Image
                      src={imageSrc}
                      alt={location.name}
                      fill
                      className="object-cover transition-transform duration-500 ease-cinematic group-hover:scale-[1.04]"
                      sizes={
                        isFeatured
                          ? "(min-width: 1024px) 33vw, 95vw"
                          : "(min-width: 1024px) 33vw, 95vw"
                      }
                      loading="lazy"
                    />
                    {/* Gradient overlay — recedes on hover */}
                    <div className="absolute inset-0 scrim-60 transition-opacity duration-500 group-hover:opacity-50" />
                    <div className="absolute inset-0 bg-gradient-to-t from-brand-primary/10 via-transparent to-transparent" />

                    {/* Overlay text — anchored to image bottom (over the scrim),
                       not the link bottom, so the featured card's text stays
                       over the image even when its 3:4 portrait is shorter
                       than the 2-row grid cell on desktop. */}
                    <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
                      <h3 className={cn(typography({ intent: "editorial-h3" }), "text-white transition-colors duration-500 group-hover:text-brand-primary")}>
                        {location.name}
                      </h3>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-white/70">
                        {location.city}
                        {location.region &&
                          location.city !== location.region &&
                          ` \u00b7 ${location.region}`}
                      </p>
                    </div>
                  </div>
                </Link>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
