"use client";

import dynamic from "next/dynamic";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { PagesContent } from "@/types/sanitySiteContent";

const PlacesShell = dynamic(
  () => import("./PlacesShell").then((m) => ({ default: m.PlacesShell })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[100dvh] bg-background">
        <div className="flex flex-col items-center justify-center py-24 px-6">
          <p className="font-serif text-2xl sm:text-3xl text-foreground text-center">
            Places in Japan
          </p>
          <p className="mt-3 text-sm text-stone">Finding places\u2026</p>
        </div>
        <div className="px-4">
          <div className="h-10 w-full rounded shimmer mb-4" />
          <div className="flex flex-col lg:flex-row lg:gap-4">
            <div className="lg:w-1/2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-[4/3] rounded-lg shimmer" />
              ))}
            </div>
            <div className="hidden lg:block lg:w-1/2 h-[calc(100dvh-176px)] rounded-lg shimmer" />
          </div>
        </div>
      </div>
    ),
  }
);

export function PlacesShellLazy({
  content,
  cityHeroes,
}: {
  content?: PagesContent;
  cityHeroes?: Record<string, string>;
}) {
  return (
    <ErrorBoundary>
      <PlacesShell content={content} cityHeroes={cityHeroes} />
    </ErrorBoundary>
  );
}
