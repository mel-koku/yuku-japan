"use client";

import { useEffect, useRef, useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";
import { typography } from "@/lib/typography-system";
import { Button } from "@/components/ui/Button";
import { easeReveal, durationFast } from "@/lib/motion";
import { VIBES, type VibeId } from "@/data/vibes";
import { REGION_ORDER, getRegionForPrefecture } from "@/data/prefectures";

type SortOptionId = "recommended" | "highest_rated" | "most_reviews" | "price_low" | "duration_short";

type SortOption = {
  id: SortOptionId;
  label: string;
};

type FilterPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  // Search
  query: string;
  onQueryChange: (value: string) => void;
  // Prefecture filter (multi-select)
  prefectureOptions: readonly { value: string; label: string }[];
  selectedPrefectures: string[];
  onPrefecturesChange: (prefectures: string[]) => void;
  // Vibe filter
  selectedVibes: VibeId[];
  onVibesChange: (vibes: VibeId[]) => void;
  // Price filter
  selectedPriceLevel: number | null;
  onPriceLevelChange: (priceLevel: number | null) => void;
  // Duration filter
  durationOptions: readonly { value: string; label: string }[];
  selectedDuration: string | null;
  onDurationChange: (duration: string | null) => void;
  // Accessibility filter
  wheelchairAccessible: boolean;
  onWheelchairAccessibleChange: (value: boolean) => void;
  // Dietary filter
  vegetarianFriendly: boolean;
  onVegetarianFriendlyChange: (value: boolean) => void;
  // Featured filter
  featuredOnly: boolean;
  onFeaturedToggle: (value: boolean) => void;
  // UNESCO filter
  unescoOnly: boolean;
  onUnescoToggle: (value: boolean) => void;
  // Saved-only filter
  savedOnly: boolean;
  onSavedOnlyChange: (value: boolean) => void;
  // Results count
  resultsCount: number;
  // Clear all
  onClearAll: () => void;
  // Sort options
  sortOptions: readonly SortOption[];
  selectedSort: SortOptionId;
  onSortChange: (sort: SortOptionId) => void;
  // Seasonal filter
  selectedCategory?: string | null;
  onCategoryChange?: (category: string | null) => void;
  seasonalHighlight?: { label: string } | null;
};

const PRICE_OPTIONS = [
  { value: 0, label: "Free" },
  { value: 1, label: "$" },
  { value: 2, label: "$$" },
  { value: 3, label: "$$$" },
  { value: 4, label: "$$$$" },
] as const;

export function FilterPanel({
  isOpen,
  onClose,
  query,
  onQueryChange,
  prefectureOptions,
  selectedPrefectures,
  onPrefecturesChange,
  selectedVibes,
  onVibesChange,
  selectedPriceLevel,
  onPriceLevelChange,
  durationOptions,
  selectedDuration,
  onDurationChange,
  wheelchairAccessible,
  onWheelchairAccessibleChange,
  vegetarianFriendly,
  onVegetarianFriendlyChange,
  featuredOnly,
  onFeaturedToggle,
  unescoOnly,
  onUnescoToggle,
  savedOnly,
  onSavedOnlyChange,
  resultsCount,
  onClearAll,
  sortOptions,
  selectedSort,
  onSortChange,
  selectedCategory,
  onCategoryChange,
  seasonalHighlight,
}: FilterPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Section expand/collapse state
  const [expandedSections, setExpandedSections] = useState({
    sort: true,
    where: false,
    what: true,
    highlights: true,
    duration: false,
    price: false,
    dietary: false,
  });

  const toggleSection = (key: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Active filter counts for badges
  const sortActiveCount = selectedSort !== "recommended" ? 1 : 0;
  const whereActiveCount = selectedPrefectures.length;
  const whatActiveCount = selectedVibes.length + (selectedCategory === "in_season" ? 1 : 0);
  const durationActiveCount = selectedDuration ? 1 : 0;
  const priceActiveCount = selectedPriceLevel !== null ? 1 : 0;
  const highlightsActiveCount = (unescoOnly ? 1 : 0) + (featuredOnly ? 1 : 0) + (savedOnly ? 1 : 0);
  const dietaryActiveCount = (wheelchairAccessible ? 1 : 0) + (vegetarianFriendly ? 1 : 0);

  // Close on escape key + focus management
  useEffect(() => {
    if (!isOpen) return;

    triggerRef.current = document.activeElement;
    document.body.style.overflow = "hidden";

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    };
  }, [isOpen]);

  const toggleVibe = (vibeId: VibeId) => {
    if (selectedVibes.includes(vibeId)) {
      onVibesChange(selectedVibes.filter((v) => v !== vibeId));
      if (vibeId === "foodie_paradise") {
        onVegetarianFriendlyChange(false);
      }
    } else {
      onVibesChange([...selectedVibes, vibeId]);
    }
  };

  const togglePrefecture = (prefectureValue: string) => {
    if (selectedPrefectures.includes(prefectureValue)) {
      onPrefecturesChange(selectedPrefectures.filter((p) => p !== prefectureValue));
    } else {
      onPrefecturesChange([...selectedPrefectures, prefectureValue]);
    }
  };

  const hasActiveFilters =
    query ||
    selectedPrefectures.length > 0 ||
    selectedVibes.length > 0 ||
    selectedPriceLevel !== null ||
    selectedDuration ||
    wheelchairAccessible ||
    vegetarianFriendly ||
    featuredOnly ||
    unescoOnly ||
    savedOnly ||
    selectedSort !== "recommended";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <m.div
            className="fixed inset-0 z-50 bg-charcoal/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: durationFast, ease: easeReveal }}
            onClick={onClose}
          />

          {/* Panel */}
          <m.div
            ref={panelRef}
            data-lenis-prevent
            className="fixed right-0 top-0 z-50 h-full w-[420px] max-w-[90vw] bg-background border-l border-border flex flex-col shadow-[var(--shadow-elevated)]"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: durationFast, ease: easeReveal }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="filter-panel-title"
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-border px-6 py-4 shrink-0">
              <div>
                <h2 id="filter-panel-title" className={typography({ intent: "editorial-h3" })}>
                  Refine
                </h2>
                <p className="mt-0.5 text-xs text-foreground-secondary">
                  Sort, filter by location, vibe, price, and more.
                </p>
              </div>
              <button
                onClick={onClose}
                className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface transition duration-300"
                aria-label="Close filters"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content — sections stagger in after panel settles */}
            <m.div
              className="flex-1 overflow-y-auto px-6 py-6 pb-[env(safe-area-inset-bottom)] space-y-1"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.05, delayChildren: 0.2 } },
              }}
            >
              {/* Search — always visible */}
              <m.div className="relative pb-4" variants={sectionVariants}>
                <svg
                  className="absolute left-3 top-1/2 -translate-y-[calc(50%+8px)] h-4 w-4 text-stone"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  placeholder="Search by name, city, or region..."
                  className="w-full h-12 rounded-lg border border-border bg-background pl-10 pr-4 text-base placeholder:text-stone shadow-[var(--shadow-sm)] focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
                {query && (
                  <button
                    onClick={() => onQueryChange("")}
                    className="absolute right-3 top-1/2 -translate-y-[calc(50%+8px)] p-1 rounded-full hover:bg-surface"
                    aria-label="Clear search"
                  >
                    <svg className="h-3.5 w-3.5 text-stone" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </m.div>

              {/* Sort by */}
              <FilterSection
                label="Sort by"
                activeCount={sortActiveCount}
                isExpanded={expandedSections.sort}
                onToggle={() => toggleSection("sort")}
                onClear={sortActiveCount > 0 ? () => onSortChange("recommended") : undefined}
              >
                <div className="flex flex-wrap gap-2">
                  {sortOptions.map((option) => (
                    <PanelChip
                      key={option.id}
                      label={option.label}
                      isSelected={selectedSort === option.id}
                      onClick={() => onSortChange(option.id)}
                    />
                  ))}
                </div>
              </FilterSection>

              {/* Where */}
              <FilterSection
                label="Where"
                activeCount={whereActiveCount}
                isExpanded={expandedSections.where}
                onToggle={() => toggleSection("where")}
                onClear={whereActiveCount > 0 ? () => onPrefecturesChange([]) : undefined}
              >
                <PrefectureGroupedChips
                  prefectureOptions={prefectureOptions}
                  selectedPrefectures={selectedPrefectures}
                  onToggle={togglePrefecture}
                />
              </FilterSection>

              {/* Highlights */}
              <FilterSection
                label="Highlights"
                activeCount={highlightsActiveCount}
                isExpanded={expandedSections.highlights}
                onToggle={() => toggleSection("highlights")}
                onClear={highlightsActiveCount > 0 ? () => { onUnescoToggle(false); onFeaturedToggle(false); onSavedOnlyChange(false); } : undefined}
              >
                <div className="space-y-4">
                  <ToggleOption
                    label="UNESCO World Heritage"
                    description="Sites inscribed on the UNESCO World Heritage List"
                    checked={unescoOnly}
                    onChange={onUnescoToggle}
                  />

                  <ToggleOption
                    label="Featured"
                    description="Handpicked places worth the trip"
                    checked={featuredOnly}
                    onChange={onFeaturedToggle}
                  />

                  <ToggleOption
                    label="Saved only"
                    description="Show only places you've saved"
                    checked={savedOnly}
                    onChange={onSavedOnlyChange}
                  />
                </div>
              </FilterSection>

              {/* Vibe */}
              <FilterSection
                label="Vibe"
                activeCount={whatActiveCount}
                isExpanded={expandedSections.what}
                onToggle={() => toggleSection("what")}
                onClear={whatActiveCount > 0 ? () => { onVibesChange([]); if (onCategoryChange) onCategoryChange(null); } : undefined}
              >
                <div className="flex flex-wrap gap-2">
                  {VIBES.filter((v) => v.id !== "in_season").map((vibe) => (
                    <PanelChip
                      key={vibe.id}
                      label={vibe.name}
                      isSelected={selectedVibes.includes(vibe.id)}
                      onClick={() => toggleVibe(vibe.id)}
                    />
                  ))}
                </div>
                {seasonalHighlight && onCategoryChange && (
                  <div className="mt-3 pt-3 border-t border-border/30">
                    <PanelChip
                      label={`In Season: ${seasonalHighlight.label}`}
                      isSelected={selectedCategory === "in_season"}
                      onClick={() => onCategoryChange(selectedCategory === "in_season" ? null : "in_season")}
                    />
                  </div>
                )}
              </FilterSection>

              {/* Duration */}
              <FilterSection
                label="Duration"
                activeCount={durationActiveCount}
                isExpanded={expandedSections.duration}
                onToggle={() => toggleSection("duration")}
                onClear={durationActiveCount > 0 ? () => onDurationChange(null) : undefined}
              >
                <div className="flex flex-wrap gap-2">
                  <PanelChip
                    label="Any"
                    isSelected={!selectedDuration}
                    onClick={() => onDurationChange(null)}
                    size="small"
                  />
                  {durationOptions.map((option) => (
                    <PanelChip
                      key={option.value}
                      label={option.label}
                      isSelected={selectedDuration === option.value}
                      onClick={() => onDurationChange(selectedDuration === option.value ? null : option.value)}
                      size="small"
                    />
                  ))}
                </div>
              </FilterSection>

              {/* Price */}
              <FilterSection
                label="Price"
                activeCount={priceActiveCount}
                isExpanded={expandedSections.price}
                onToggle={() => toggleSection("price")}
                onClear={priceActiveCount > 0 ? () => onPriceLevelChange(null) : undefined}
              >
                <div className="flex flex-wrap gap-2">
                  <PanelChip
                    label="Any"
                    isSelected={selectedPriceLevel === null}
                    onClick={() => onPriceLevelChange(null)}
                    size="small"
                  />
                  {PRICE_OPTIONS.map((option) => (
                    <PanelChip
                      key={option.value}
                      label={option.label}
                      isSelected={selectedPriceLevel === option.value}
                      onClick={() => onPriceLevelChange(selectedPriceLevel === option.value ? null : option.value)}
                      size="small"
                    />
                  ))}
                </div>
              </FilterSection>

              {/* Accessibility & Dietary */}
              <FilterSection
                label="Accessibility & Dietary"
                activeCount={dietaryActiveCount}
                isExpanded={expandedSections.dietary}
                onToggle={() => toggleSection("dietary")}
                onClear={dietaryActiveCount > 0 ? () => { onWheelchairAccessibleChange(false); onVegetarianFriendlyChange(false); } : undefined}
              >
                <div className="space-y-4">
                  <ToggleOption
                    label="Wheelchair accessible"
                    description="Places with a wheelchair-accessible entrance"
                    checked={wheelchairAccessible}
                    onChange={onWheelchairAccessibleChange}
                  />

                  <ToggleOption
                    label="Vegetarian friendly"
                    description="Restaurants with vegetarian options"
                    checked={vegetarianFriendly}
                    onChange={onVegetarianFriendlyChange}
                  />
                </div>
              </FilterSection>
            </m.div>

            {/* Footer */}
            <div className="border-t border-border px-6 py-4 flex items-center justify-between shrink-0">
              <button
                onClick={onClearAll}
                className={cn(
                  "text-sm font-medium underline underline-offset-2 transition",
                  hasActiveFilters
                    ? "text-foreground hover:text-foreground-secondary"
                    : "text-stone cursor-not-allowed"
                )}
                disabled={!hasActiveFilters}
              >
                Clear all
              </button>
              <Button
                variant="primary"
                size="lg"
                onClick={onClose}
              >
                Show {resultsCount.toLocaleString()} places
              </Button>
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}

type FilterSectionProps = {
  label: string;
  activeCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  onClear?: () => void;
  children: React.ReactNode;
};

const sectionVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: easeReveal } },
};

function FilterSection({ label, activeCount, isExpanded, onToggle, onClear, children }: FilterSectionProps) {
  return (
    <m.div className="border-b border-border/50 last:border-b-0" variants={sectionVariants}>
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full py-3.5 group"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <h3 className={cn(typography({ intent: "utility-label" }), "text-xs font-semibold tracking-wider text-stone group-hover:text-foreground-secondary transition")}>
            {label}
          </h3>
          {activeCount > 0 && !isExpanded && (
            <span className="flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-brand-primary text-white text-[10px] font-bold">
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onClear && isExpanded && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onClear();
                }
              }}
              className="text-xs text-stone hover:text-foreground underline underline-offset-2"
            >
              Clear
            </span>
          )}
          <svg
            className={cn(
              "h-4 w-4 text-stone transition-transform duration-200",
              isExpanded && "rotate-180"
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: durationFast, ease: easeReveal }}
            className="overflow-hidden"
          >
            <div className="pb-4">
              {children}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  );
}

function PrefectureGroupedChips({
  prefectureOptions,
  selectedPrefectures,
  onToggle,
}: {
  prefectureOptions: readonly { value: string; label: string }[];
  selectedPrefectures: string[];
  onToggle: (value: string) => void;
}) {
  const grouped = new Map<string, { value: string; label: string }[]>();
  const ungrouped: { value: string; label: string }[] = [];

  for (const option of prefectureOptions) {
    const region = getRegionForPrefecture(option.label);
    if (region) {
      if (!grouped.has(region)) grouped.set(region, []);
      grouped.get(region)!.push(option);
    } else {
      ungrouped.push(option);
    }
  }

  const orderedRegions = REGION_ORDER.filter((r) => grouped.has(r));

  return (
    <div className="space-y-3">
      {orderedRegions.map((region) => (
        <div key={region}>
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-stone mb-1.5">{region}</p>
          <div className="flex flex-wrap gap-2">
            {grouped.get(region)!.map((option) => (
              <PanelChip
                key={option.value}
                label={option.label}
                isSelected={selectedPrefectures.includes(option.value)}
                onClick={() => onToggle(option.value)}
              />
            ))}
          </div>
        </div>
      ))}
      {ungrouped.length > 0 && (
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-stone mb-1.5">Other</p>
          <div className="flex flex-wrap gap-2">
            {ungrouped.map((option) => (
              <PanelChip
                key={option.value}
                label={option.label}
                isSelected={selectedPrefectures.includes(option.value)}
                onClick={() => onToggle(option.value)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type PanelChipProps = {
  label: string;
  isSelected: boolean;
  onClick: () => void;
  size?: "default" | "small";
};

function PanelChip({ label, isSelected, onClick, size = "default" }: PanelChipProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border font-medium transition",
        size === "small" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        isSelected
          ? "border-brand-primary bg-brand-primary text-white"
          : "border-border bg-background text-foreground-secondary hover:border-brand-primary"
      )}
    >
      {label}
    </button>
  );
}

type ToggleOptionProps = {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

function ToggleOption({ label, description, checked, onChange }: ToggleOptionProps) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className={cn(
          "w-10 h-6 rounded-full transition-colors",
          checked ? "bg-brand-primary" : "bg-surface group-hover:bg-border"
        )}>
          <div className={cn(
            "absolute top-1 w-4 h-4 bg-background rounded-full transition-transform shadow-[var(--shadow-sm)]",
            checked ? "translate-x-5" : "translate-x-1"
          )} />
        </div>
      </div>
      <div className="flex-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <p className="text-xs text-stone mt-0.5">{description}</p>
      </div>
    </label>
  );
}
