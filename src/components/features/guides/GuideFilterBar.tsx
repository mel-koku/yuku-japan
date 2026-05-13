"use client";

import { useRef } from "react";
import { cn } from "@/lib/cn";
import type { GuideType } from "@/types/guide";

type FilterOption = {
  value: GuideType;
  label: string;
  count: number;
};

type SeasonOption = {
  value: string;
  label: string;
  count: number;
};

type GuideFilterBarProps = {
  types: FilterOption[];
  selectedType: GuideType | null;
  onTypeChange: (type: GuideType | null) => void;
  totalCount: number;
  seasons?: SeasonOption[];
  selectedSeason?: string | null;
  onSeasonChange?: (season: string | null) => void;
  currentSeason?: string | null;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
};

export function GuideFilterBar({
  types,
  selectedType,
  onTypeChange,
  totalCount,
  seasons,
  selectedSeason,
  onSeasonChange,
  currentSeason,
  searchQuery = "",
  onSearchChange,
}: GuideFilterBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasSeasons = seasons && seasons.length > 0;

  return (
    <div className="sticky top-20 z-40 bg-background/100 border-b border-border/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 py-2">
          {/* Type chips — horizontally scrollable on mobile */}
          <div
            className="overflow-x-auto scrollbar-hide overscroll-contain snap-x snap-mandatory flex-1 min-w-0"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            <div className="flex gap-1 sm:gap-2 min-w-max items-center">
              <button
                onClick={() => onTypeChange(null)}
                aria-pressed={selectedType === null}
                className={cn(
                  "snap-start px-4 py-2.5 min-h-[44px] text-sm font-medium tracking-wide whitespace-nowrap border-b-2 transition-all",
                  selectedType === null
                    ? "border-brand-primary text-foreground"
                    : "border-transparent text-stone hover:text-foreground"
                )}
              >
                All
                <span className="ml-1.5 text-xs text-stone">{totalCount}</span>
              </button>

              {types.map((type) => (
                <button
                  key={type.value}
                  onClick={() =>
                    onTypeChange(selectedType === type.value ? null : type.value)
                  }
                  aria-pressed={selectedType === type.value}
                  className={cn(
                    "snap-start px-4 py-2.5 min-h-[44px] text-sm font-medium tracking-wide whitespace-nowrap border-b-2 transition-all",
                    selectedType === type.value
                      ? "border-brand-primary text-foreground"
                      : "border-transparent text-stone hover:text-foreground"
                  )}
                >
                  {type.label}
                  <span className="ml-1.5 text-xs text-stone">{type.count}</span>
                </button>
              ))}

              {/* Season dropdown */}
              {hasSeasons && (
                <>
                  <div className="mx-1 h-6 w-px bg-border/50 self-center shrink-0" />
                  <select
                    value={selectedSeason ?? ""}
                    onChange={(e) => onSeasonChange?.(e.target.value || null)}
                    aria-label="Filter by season"
                    className={cn(
                      "snap-start h-[44px] px-3 py-2 text-sm font-medium tracking-wide whitespace-nowrap bg-transparent border-b-2 transition-all cursor-pointer appearance-none pr-6",
                      selectedSeason
                        ? "border-brand-secondary text-foreground"
                        : currentSeason
                          ? "border-transparent text-brand-secondary hover:text-foreground"
                          : "border-transparent text-stone hover:text-foreground"
                    )}
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "right 4px center",
                    }}
                  >
                    <option value="">Season</option>
                    {seasons.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label} ({s.count})
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>

          {/* Search input — fixed width, right side */}
          <div className="relative shrink-0 w-40 sm:w-52">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              type="search"
              placeholder="Search guides…"
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              aria-label="Search guides by keyword"
              className="h-[38px] w-full rounded-lg border border-border/60 bg-transparent pl-8 pr-3 text-sm text-foreground placeholder:text-stone/60 focus:outline-none focus:ring-1 focus:ring-brand-primary/40 transition"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  onSearchChange?.("");
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-stone hover:text-foreground transition"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
