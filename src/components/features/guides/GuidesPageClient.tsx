"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { cn } from "@/lib/cn";
import { typography } from "@/lib/typography-system";
import type { GuideSummary, GuideType } from "@/types/guide";
import { GuideFilterBar } from "./GuideFilterBar";
import { GuideCard } from "./GuideCard";
import type { PagesContent } from "@/types/sanitySiteContent";
import { getCurrentSeason, type Season } from "@/lib/utils/seasonUtils";

type GuidesPageClientProps = {
  guides: GuideSummary[];
  content?: PagesContent;
};

const GUIDE_TYPE_OPTIONS: { value: GuideType; label: string }[] = [
  { value: "itinerary", label: "Itinerary" },
  { value: "listicle", label: "Top Picks" },
  { value: "deep_dive", label: "Deep Dive" },
  { value: "activity", label: "Activities" },
  { value: "blog", label: "Blog" },
];

const SEASON_OPTIONS: { value: string; label: string }[] = [
  { value: "spring", label: "Spring" },
  { value: "summer", label: "Summer" },
  { value: "autumn", label: "Autumn" },
  { value: "winter", label: "Winter" },
];

/** Map our internal "fall" to Sanity/DB "autumn" */
function seasonToDbSeason(season: Season): string {
  return season === "fall" ? "autumn" : season;
}

function matchesSearch(guide: GuideSummary, query: string): boolean {
  const q = query.toLowerCase();
  return (
    guide.title.toLowerCase().includes(q) ||
    (guide.subtitle?.toLowerCase().includes(q) ?? false) ||
    (guide.summary?.toLowerCase().includes(q) ?? false) ||
    (guide.city?.toLowerCase().includes(q) ?? false) ||
    (guide.region?.toLowerCase().includes(q) ?? false) ||
    (guide.tags?.some((t) => t.toLowerCase().includes(q)) ?? false)
  );
}

export function GuidesPageClient({ guides, content }: GuidesPageClientProps) {
  const searchParams = useSearchParams();
  const initialType = searchParams.get("type") as GuideType | null;
  const [selectedType, setSelectedType] = useState<GuideType | null>(
    initialType && GUIDE_TYPE_OPTIONS.some((o) => o.value === initialType) ? initialType : null
  );
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Search-filtered base — all count computations cascade from this
  const searchFiltered = useMemo(() => {
    if (!searchQuery.trim()) return guides;
    return guides.filter((g) => matchesSearch(g, searchQuery.trim()));
  }, [guides, searchQuery]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    searchFiltered.forEach((g) => {
      counts[g.guideType] = (counts[g.guideType] || 0) + 1;
    });
    return counts;
  }, [searchFiltered]);

  const seasonCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const base = selectedType ? searchFiltered.filter((g) => g.guideType === selectedType) : searchFiltered;
    base.forEach((g) => {
      if (g.seasons) {
        for (const s of g.seasons) {
          if (s !== "year-round") {
            counts[s] = (counts[s] || 0) + 1;
          }
        }
      }
    });
    return counts;
  }, [searchFiltered, selectedType]);

  const filterTypes = useMemo(
    () =>
      GUIDE_TYPE_OPTIONS.filter((o) => (typeCounts[o.value] || 0) > 0).map(
        (o) => ({
          value: o.value,
          label: o.label,
          count: typeCounts[o.value] || 0,
        })
      ),
    [typeCounts]
  );

  const filterSeasons = useMemo(
    () =>
      SEASON_OPTIONS.filter((o) => (seasonCounts[o.value] || 0) > 0).map(
        (o) => ({
          value: o.value,
          label: o.label,
          count: seasonCounts[o.value] || 0,
        })
      ),
    [seasonCounts]
  );

  // Auto-highlight current season if it has guides
  const currentDbSeason = seasonToDbSeason(getCurrentSeason());
  const hasCurrentSeasonGuides = (seasonCounts[currentDbSeason] || 0) > 0;

  const filteredGuides = useMemo(() => {
    let result = searchFiltered;
    if (selectedType) {
      result = result.filter((g) => g.guideType === selectedType);
    }
    if (selectedSeason) {
      result = result.filter((g) => g.seasons?.includes(selectedSeason));
    }
    return result;
  }, [searchFiltered, selectedType, selectedSeason]);

  if (guides.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-4">
        <p className="font-serif text-lg text-foreground">
          {content?.guidesEmptyHeading ?? "Guides are in the works"}
        </p>
        <p className="mt-2 text-sm text-stone text-center max-w-sm">
          {content?.guidesEmptyDescription ?? "Still writing these. Browse places while we finish."}
        </p>
        <a
          href="/places"
          className="mt-6 inline-flex h-12 items-center justify-center rounded-lg bg-brand-primary px-6 text-sm font-semibold text-white transition hover:bg-brand-primary/90"
        >
          Browse places
        </a>
      </div>
    );
  }

  return (
    <div>
      {/* Editorial Hero */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-12 pb-4 sm:pt-16 sm:pb-6 lg:pt-20 text-center">
        <ScrollReveal delay={0.1} distance={20} duration={0.5}>
          <h1 className={cn(typography({ intent: "editorial-h1" }), "text-[clamp(2rem,4vw,3rem)] max-w-3xl mx-auto")}>
            {content?.guidesHeading ?? "Japan, explored in depth."}
          </h1>
        </ScrollReveal>
      </section>

      {/* Filter Bar */}
      <GuideFilterBar
        types={filterTypes}
        selectedType={selectedType}
        onTypeChange={setSelectedType}
        totalCount={searchFiltered.length}
        seasons={filterSeasons}
        selectedSeason={selectedSeason}
        onSeasonChange={setSelectedSeason}
        currentSeason={hasCurrentSeasonGuides ? currentDbSeason : null}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Breathing room between filter bar and content */}
      <div className="h-4 sm:h-6" aria-hidden="true" />

      {/* Card Grid */}
      <section
        aria-label="Travel guides"
        className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-12 sm:pb-16 lg:pb-20"
      >
        {filteredGuides.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 sm:gap-8">
            {filteredGuides.map((guide, i) => (
              <GuideCard key={guide.id} guide={guide} index={i} eager={i < 3} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="font-serif text-lg text-foreground">
              {searchQuery
                ? `No guides match "${searchQuery}"`
                : (content?.guidesFilteredEmptyHeading ?? "No guides in this category")}
            </p>
            <p className="mt-2 text-sm text-stone">
              {searchQuery
                ? "Try a different keyword, or clear the search."
                : (content?.guidesFilteredEmptyDescription ?? "Try another filter, or browse them all.")}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
