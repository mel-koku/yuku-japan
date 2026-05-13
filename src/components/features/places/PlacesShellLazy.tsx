"use client";

import dynamic from "next/dynamic";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { PagesContent } from "@/types/sanitySiteContent";
import type { Location } from "@/types/location";

const PlacesShell = dynamic(
  () => import("./PlacesShell").then((m) => ({ default: m.PlacesShell })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[100dvh] bg-background">
        <section
          aria-busy="true"
          aria-live="polite"
          className="mx-auto max-w-7xl space-y-12 px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12"
        >
          <p className="text-center text-sm text-foreground-secondary">
            Loading places&hellip;
          </p>
          {/* City tiles skeleton — mirrors PlacesIntro grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[4/5] rounded-lg shimmer" />
            ))}
          </div>
          {/* Lane skeletons — mirrors PlacesLanes horizontal rows */}
          {Array.from({ length: 2 }).map((_, laneIdx) => (
            <div key={laneIdx} className="space-y-4">
              <div className="h-5 w-48 rounded shimmer" />
              <div className="-mx-4 overflow-hidden px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
                <div className="flex gap-3 sm:gap-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-[4/5] w-44 shrink-0 rounded-lg shimmer sm:w-56"
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </section>
      </div>
    ),
  }
);

export function PlacesShellLazy({
  content,
  cityHeroes,
  lanesData,
}: {
  content?: PagesContent;
  cityHeroes?: Record<string, string>;
  lanesData?: { iconic: Location[]; containers: Location[] };
}) {
  return (
    <ErrorBoundary>
      <PlacesShell content={content} cityHeroes={cityHeroes} lanesData={lanesData} />
    </ErrorBoundary>
  );
}
