"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import Image from "next/image";
import { X } from "lucide-react";

import { useTripBuilder } from "@/context/TripBuilderContext";
import { useToast } from "@/context/ToastContext";
import { REGIONS, deriveRegionsFromCities, getRegionForCity } from "@/data/regions";
import {
  scoreRegionsForTrip,
  autoSelectCities,
} from "@/lib/tripBuilder/regionScoring";
import { optimizeCitySequence } from "@/lib/routing/citySequence";
import { getAllCities, getChildCityMapping } from "@/lib/tripBuilder/cityRelevance";
import { validateCityDayRatio } from "@/lib/tripBuilder/cityDayValidation";
import type { CityId, KnownRegionId } from "@/types/trip";
import type { TripBuilderConfig } from "@/types/sanitySiteContent";
import type { RegionDescription } from "@/data/regionDescriptions";
import { VIBES, type VibeId } from "@/data/vibes";
import { easeCinematicMut } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { typography } from "@/lib/typography-system";

import { RegionMapCanvas } from "./RegionMapCanvas";
import { RegionRow, type RegionSelectionState } from "./RegionRow";
import { RegionDetailPanel } from "./RegionDetailPanel";
import { RegionCitySelector } from "./RegionCitySelector";
import { CitySearchBar } from "./CitySearchBar";

export type RegionStepProps = {
  onValidityChange?: (isValid: boolean) => void;
  sanityConfig?: TripBuilderConfig;
};

/** Merge Sanity overrides into a RegionDescription, falling back to hardcoded values */
function mergeRegionOverride(
  region: RegionDescription,
  sanityRegionMap: Map<string, NonNullable<TripBuilderConfig["regions"]>[number]> | null
): RegionDescription {
  if (!sanityRegionMap) return region;
  const override = sanityRegionMap.get(region.id);
  if (!override) return region;
  const galleryUrls = override.galleryImages
    ?.map((img) => img.url)
    .filter(Boolean) as string[] | undefined;
  return {
    ...region,
    name: override.name || region.name,
    tagline: override.tagline || region.tagline,
    description: override.description || region.description,
    highlights: override.highlights?.length ? override.highlights : region.highlights,
    heroImage: override.heroImage?.url ?? region.heroImage,
    galleryImages: galleryUrls?.length ? galleryUrls : region.galleryImages,
  };
}

export function RegionStep({ onValidityChange, sanityConfig }: RegionStepProps) {
  const { data, setData } = useTripBuilder();
  const { showToast } = useToast();
  const hasAutoSelected = useRef(false);
  // Tracks the exit airport we've already evaluated for open-jaw augmentation.
  // Prevents re-firing if the user removes the augmented city manually.
  const lastAugmentedExitRef = useRef<string | null>(null);
  const hoverClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPanelHovered = useRef(false);
  // Set when a region row is tapped/clicked. Keeps the detail panel open
  // against the synthesized `mouseleave` that touch devices fire after a tap,
  // so hybrid-touch users (iPad + trackpad, touchscreen laptops) — which match
  // the desktop `lg:` branch but can't sustain a hover — still see the panel.
  const pinnedByClick = useRef(false);

  const [hoveredRegion, setHoveredRegion] = useState<KnownRegionId | null>(null);
  const [expandedRegion, setExpandedRegion] = useState<KnownRegionId | null>(null);
  const [autoSelectMessage, setAutoSelectMessage] = useState<string | null>(null);
  const hasUserHovered = useRef(false);

  // Debounced hover: cancel any pending clear, set immediately.
  // A deliberate hover onto a different region wins over a click-pin.
  const handleHoverRegion = useCallback((regionId: KnownRegionId) => {
    hasUserHovered.current = true;
    setHoveredRegion((prev) => {
      if (prev !== regionId) pinnedByClick.current = false;
      return regionId;
    });
    if (hoverClearTimer.current) {
      clearTimeout(hoverClearTimer.current);
      hoverClearTimer.current = null;
    }
  }, []);

  // Debounced leave: delay clear so cursor can travel to the detail panel.
  // Skip clearing if the mouse is still over the panel, or if the panel was
  // pinned open by a tap/click (touch devices fire a synthesized mouseleave).
  const handleLeaveRegion = useCallback(() => {
    hoverClearTimer.current = setTimeout(() => {
      if (!isPanelHovered.current && !pinnedByClick.current) {
        setHoveredRegion(null);
      }
      hoverClearTimer.current = null;
    }, 1200);
  }, []);

  // Detail panel hover keeps the panel alive
  const handlePanelEnter = useCallback(() => {
    isPanelHovered.current = true;
    if (hoverClearTimer.current) {
      clearTimeout(hoverClearTimer.current);
      hoverClearTimer.current = null;
    }
  }, []);

  const handlePanelLeave = useCallback(() => {
    isPanelHovered.current = false;
    hoverClearTimer.current = setTimeout(() => {
      setHoveredRegion(null);
      hoverClearTimer.current = null;
    }, 1200);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (hoverClearTimer.current) clearTimeout(hoverClearTimer.current);
    };
  }, []);

  // Build Sanity override lookup by regionId
  const sanityRegions = sanityConfig?.regions;
  const sanityRegionMap = useMemo(() => {
    if (!sanityRegions?.length) return null;
    const map = new Map<string, NonNullable<TripBuilderConfig["regions"]>[number]>();
    for (const r of sanityRegions) {
      map.set(r.regionId, r);
    }
    return map;
  }, [sanityRegions]);

  const vibes = useMemo(() => data.vibes ?? [], [data.vibes]);

  // City-level selection (primary source of truth) — includes both known and dynamic cities
  const selectedCities = useMemo(
    () => new Set<CityId>(data.cities ?? []),
    [data.cities]
  );

  // All cities grouped by region (case-insensitive keys, title-cased)
  const allCitiesByRegion = useMemo(() => {
    const cities = getAllCities();
    const byRegion = new Map<string, number>();
    for (const c of cities) {
      if (c.region) {
        // Normalize to title case so "kanto" and "Kanto" merge
        const key = c.region.charAt(0).toUpperCase() + c.region.slice(1).toLowerCase();
        byRegion.set(key, (byRegion.get(key) ?? 0) + 1);
      }
    }
    return byRegion;
  }, []);

  // All cities data for looking up dynamic city metadata
  const allCitiesData = useMemo(() => getAllCities(), []);

  // Child-city → planning-city map (e.g. "narita" → "tokyo"). Used so a child
  // city in the search bar still flips its parent region's selection state.
  const childCityMap = useMemo(() => getChildCityMapping(), []);

  // Derive regions from selected cities (for map highlighting & summary)
  const derivedRegions = useMemo(
    () => deriveRegionsFromCities(Array.from(selectedCities)),
    [selectedCities]
  );

  // Build display names for all selected cities (known + dynamic)
  const selectedCityNames = useMemo(() => {
    const knownCityMap = new Map<string, string>();
    for (const r of REGIONS) {
      for (const c of r.cities) {
        knownCityMap.set(c.id, c.name);
      }
    }
    return Array.from(selectedCities).map((id) => {
      const known = knownCityMap.get(id);
      if (known) return known;
      const dynamic = allCitiesData.find((c) => c.city.toLowerCase() === id);
      return dynamic?.city ?? id.charAt(0).toUpperCase() + id.slice(1);
    });
  }, [selectedCities, allCitiesData]);

  // Score regions and merge Sanity overrides
  const scoredRegions = useMemo(() => {
    const effectiveExit = data.sameAsEntry !== false ? data.entryPoint : data.exitPoint;
    const scored = scoreRegionsForTrip(vibes, data.entryPoint, effectiveExit);
    if (!sanityRegionMap) return scored;
    return scored.map((s) => ({
      ...s,
      region: mergeRegionOverride(s.region, sanityRegionMap),
    }));
  }, [vibes, data.entryPoint, data.exitPoint, data.sameAsEntry, sanityRegionMap]);

  // Default-open the first region's detail panel until user hovers another
  useEffect(() => {
    if (!hasUserHovered.current && scoredRegions.length > 0 && !hoveredRegion) {
      setHoveredRegion(scoredRegions[0]!.region.id);
    }
  }, [scoredRegions, hoveredRegion]);

  // Auto-select cities on mount
  useEffect(() => {
    if (hasAutoSelected.current) return;
    if (selectedCities.size > 0) {
      hasAutoSelected.current = true;
      return;
    }

    const effectiveExit = data.sameAsEntry !== false ? data.entryPoint : data.exitPoint;
    const autoCities = autoSelectCities(
      vibes,
      data.entryPoint,
      data.duration,
      effectiveExit,
    );
    if (autoCities.length > 0) {
      const optimized = autoCities.length >= 2 && data.entryPoint
        ? optimizeCitySequence(data.entryPoint, autoCities, effectiveExit, data.duration)
        : autoCities;
      const autoRegions = deriveRegionsFromCities(optimized);
      setData((prev) => ({
        ...prev,
        cities: optimized,
        regions: autoRegions,
        // City set changed -- clear stale cityDays so defaults recompute.
        cityDays: optimized.length === (prev.cities?.length ?? 0) ? prev.cityDays : undefined,
      }));
      hasAutoSelected.current = true;
      setAutoSelectMessage("Regions suggested based on your travel style");
    }
    // exitPoint / sameAsEntry are deps so open-jaw trips re-run auto-select
    // when the exit airport arrives. Manual selections are preserved by the
    // hasAutoSelected ref + selectedCities.size > 0 early returns above.
  }, [vibes, data.entryPoint, data.exitPoint, data.sameAsEntry, data.duration, selectedCities.size, setData]);

  // Augment-on-divergence: when the user back-navigates and switches to an
  // open-jaw flight whose exit region isn't represented in their existing
  // city picks, append a single exit-region city. Each exit airport is
  // evaluated at most once (lastAugmentedExitRef) so a manual removal sticks.
  useEffect(() => {
    if (data.sameAsEntry !== false) return;
    if (!data.entryPoint?.region || !data.exitPoint?.region || !data.exitPoint.cityId) return;
    if (data.entryPoint.region === data.exitPoint.region) return;
    // First mount with no cities is handled by the initial auto-select above.
    if (selectedCities.size === 0) return;

    const exitKey = data.exitPoint.iataCode ?? data.exitPoint.id;
    if (lastAugmentedExitRef.current === exitKey) return;

    const exitRegion = data.exitPoint.region;
    const hasExitRegionCity = Array.from(selectedCities).some((cityId) => {
      const lower = cityId.toLowerCase();
      if (getRegionForCity(lower as CityId) === exitRegion) return true;
      const parent = childCityMap.get(lower)?.planningCity;
      if (!parent) return false;
      return getRegionForCity(parent.toLowerCase() as CityId) === exitRegion;
    });

    // Always claim the ref so we don't re-evaluate on subsequent renders.
    lastAugmentedExitRef.current = exitKey;

    if (hasExitRegionCity) return;

    const exitCity = data.exitPoint.cityId;
    if (selectedCities.has(exitCity)) return;

    const exitCityName =
      REGIONS.flatMap((r) => r.cities).find((c) => c.id === exitCity)?.name ?? exitCity;
    const exitRegionName =
      REGIONS.find((r) => r.id === exitRegion)?.name ?? exitRegion;

    setData((prev) => {
      const raw = [...(prev.cities ?? []), exitCity];
      const cities = optimizeCitySequence(prev.entryPoint, raw, prev.exitPoint, prev.duration);
      return {
        ...prev,
        cities,
        regions: deriveRegionsFromCities(cities),
        // City set changed — clear stale cityDays so defaults recompute.
        cityDays: undefined,
      };
    });

    showToast(`Added ${exitCityName} so you end the trip near your ${exitRegionName} departure airport`, {
      variant: "info",
      duration: 4000,
    });
  }, [data.entryPoint, data.exitPoint, data.sameAsEntry, data.duration, selectedCities, childCityMap, setData, showToast]);

  // City/day ratio validation
  const cityDayValidation = useMemo(
    () => validateCityDayRatio(selectedCities.size, data.duration ?? 0),
    [selectedCities.size, data.duration],
  );

  // Validity: must have at least 1 city AND pass city/day ratio check
  useEffect(() => {
    onValidityChange?.(selectedCities.size > 0 && cityDayValidation.isValid);
  }, [selectedCities.size, cityDayValidation.isValid, onValidityChange]);

  // Toggle a single city (known or dynamic) — auto-optimize order
  const toggleCity = useCallback(
    (cityId: CityId) => {
      setData((prev) => {
        const current = new Set<CityId>(prev.cities ?? []);
        if (current.has(cityId)) {
          current.delete(cityId);
        } else {
          current.add(cityId);
        }
        const raw = Array.from(current);
        const cities = raw.length >= 2
          ? optimizeCitySequence(prev.entryPoint, raw, prev.sameAsEntry !== false ? prev.entryPoint : prev.exitPoint, prev.duration)
          : raw;
        return {
          ...prev,
          cities,
          regions: deriveRegionsFromCities(cities),
          customCityOrder: false,
          // City set changed -- drop stale cityDays so defaults recompute.
          cityDays: cities.length === (prev.cities?.length ?? 0) ? prev.cityDays : undefined,
        };
      });
    },
    [setData]
  );

  // Toggle all known cities in a region — auto-optimize order
  const toggleRegion = useCallback(
    (regionId: KnownRegionId) => {
      const regionDef = REGIONS.find((r) => r.id === regionId);
      if (!regionDef) return;

      const knownCityIds = regionDef.cities.map((c) => c.id as CityId);
      const anySelected = knownCityIds.some((id) => selectedCities.has(id));

      setData((prev) => {
        const current = new Set<CityId>(prev.cities ?? []);
        if (anySelected) {
          for (const id of knownCityIds) current.delete(id);
        } else {
          for (const id of knownCityIds) current.add(id);
        }
        const raw = Array.from(current);
        const cities = raw.length >= 2
          ? optimizeCitySequence(prev.entryPoint, raw, prev.sameAsEntry !== false ? prev.entryPoint : prev.exitPoint, prev.duration)
          : raw;
        return {
          ...prev,
          cities,
          regions: deriveRegionsFromCities(cities),
          customCityOrder: false,
          // City set changed -- drop stale cityDays so defaults recompute.
          cityDays: cities.length === (prev.cities?.length ?? 0) ? prev.cityDays : undefined,
        };
      });

      const cityCount = knownCityIds.length;
      if (anySelected) {
        showToast(`Removed ${regionDef.name} cities`, {
          variant: "info",
          duration: 2000,
        });
      } else {
        showToast(
          `Added ${cityCount} ${cityCount === 1 ? "city" : "cities"} in ${regionDef.name}`,
          { variant: "success", duration: 2000 }
        );
      }
    },
    [selectedCities, setData, showToast]
  );

  // Desktop row click: select the region AND pin its detail panel open. Hover
  // alone is a pure preview; a click commits the selection and keeps the panel
  // visible — which is what hybrid-touch users get when a tap can't sustain a
  // hover, and a small improvement for mouse users (click now confirms in the
  // panel instead of relying on the cursor still being over the row).
  const handleClickRegion = useCallback(
    (regionId: KnownRegionId) => {
      toggleRegion(regionId);
      pinnedByClick.current = true;
      if (hoverClearTimer.current) {
        clearTimeout(hoverClearTimer.current);
        hoverClearTimer.current = null;
      }
      setHoveredRegion(regionId);
    },
    [toggleRegion]
  );

  // Compute selection state for a region (considers all cities in region, not just known)
  const getRegionSelectionState = useCallback(
    (regionId: KnownRegionId): RegionSelectionState => {
      const regionDef = REGIONS.find((r) => r.id === regionId);
      if (!regionDef) return "none";

      const knownCityIds = regionDef.cities.map((c) => c.id as CityId);
      const selectedCount = knownCityIds.filter((id) =>
        selectedCities.has(id)
      ).length;

      // Also check if any dynamic cities in this region are selected.
      // A "dynamic" city is either:
      //   1. A non-known planning city whose metadata.region matches, or
      //   2. A child city (e.g. "narita") whose planning-city parent
      //      (e.g. "tokyo") sits in this region.
      const regionName = regionDef.name.toLowerCase();
      const hasDynamicSelected = Array.from(selectedCities).some((cityId) => {
        if (knownCityIds.includes(cityId)) return false;
        const lower = cityId.toLowerCase();
        const cityData = allCitiesData.find((c) => c.city.toLowerCase() === lower);
        if (cityData?.region?.toLowerCase() === regionName) return true;
        const parent = childCityMap.get(lower)?.planningCity;
        if (!parent) return false;
        return knownCityIds.includes(parent.toLowerCase() as CityId);
      });

      const totalSelected = selectedCount + (hasDynamicSelected ? 1 : 0);
      if (totalSelected === 0) return "none";
      if (selectedCount === knownCityIds.length && !hasDynamicSelected)
        return "full";
      return "partial";
    },
    [selectedCities, allCitiesData, childCityMap]
  );

  // Detail panel region (from hover on desktop)
  const detailRegion = useMemo(() => {
    if (!hoveredRegion) return null;
    return scoredRegions.find((s) => s.region.id === hoveredRegion)?.region ?? null;
  }, [hoveredRegion, scoredRegions]);

  // Mobile expand handler — toggle region selection AND expand/collapse detail
  const handleMobileToggle = useCallback(
    (regionId: KnownRegionId) => {
      toggleRegion(regionId);
      setExpandedRegion((prev) => (prev === regionId ? null : regionId));
    },
    [toggleRegion]
  );

  // Helper: get city counts for a region (known cities only for dots)
  const getCityCounts = useCallback(
    (regionId: KnownRegionId) => {
      const regionCities = REGIONS.find((r) => r.id === regionId)?.cities ?? [];
      const total = regionCities.length;
      const selected = regionCities.filter((c) => selectedCities.has(c.id)).length;
      return { selected, total };
    },
    [selectedCities]
  );

  return (
    <div className="relative min-h-[calc(100dvh-3.5rem)] bg-background">
      <div aria-live="polite" className="sr-only">
        {autoSelectMessage}
      </div>
      {/* Layer 0: Map canvas — fixed to viewport so it never scrolls */}
      <div className="fixed inset-0 z-0">
        <RegionMapCanvas
          hoveredRegion={hoveredRegion}
          selectedRegions={derivedRegions}
        />

        {/* Grain/texture overlay */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* Layer 1: Scrollable content — flows over the fixed map */}
      <div className="relative z-10">
        {/* Heading */}
        <div className="px-6 pt-8 lg:max-w-[45%] lg:px-10 lg:pt-10">
          <p className="eyebrow-editorial text-brand-primary">
            STEP 04
          </p>

          <m.h2
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: easeCinematicMut, delay: 0.15 }}
            className={cn(typography({ intent: "editorial-h2" }), "tracking-tight")}
          >
            {sanityConfig?.regionStepHeading ?? "Where are you headed?"}
          </m.h2>

          <p className="mt-3 text-sm text-stone lg:text-base">
            {sanityConfig?.regionStepDescription ?? "Highlighted cities match your vibes."}
          </p>

          <CitySearchBar
            selectedCities={selectedCities}
            onSelectCity={toggleCity}
          />

          {/* Selected city chips */}
          {selectedCities.size > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedCityNames.map((name, i) => {
                const cityId = Array.from(selectedCities)[i];
                return (
                  <m.span
                    key={cityId}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-1.5 rounded-full bg-brand-primary px-3 py-1.5 text-sm text-white"
                  >
                    {name}
                    <button
                      type="button"
                      onClick={() => toggleCity(cityId!)}
                      className="flex items-center justify-center rounded-full p-0.5 transition-colors hover:bg-white/20"
                      aria-label={`Remove ${name}`}
                    >
                      <X className="h-3 w-3 text-white/80 hover:text-white" />
                    </button>
                  </m.span>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-sm text-warning">
              Select at least one city
            </p>
          )}

          {/* City/day ratio feedback */}
          {cityDayValidation.message && (
            <m.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`mt-2 text-sm ${
                cityDayValidation.severity === "error"
                  ? "text-error"
                  : "text-warning"
              }`}
              role="alert"
            >
              {cityDayValidation.message}
            </m.p>
          )}
        </div>

        {/* Region rows */}
        <div className="mt-8 px-4 pb-32 lg:max-w-[45%] lg:px-8">
          {scoredRegions.map((scored, i) => {
            const { selected } = getCityCounts(scored.region.id);
            const regionDef = REGIONS.find((r) => r.id === scored.region.id);
            const allCityNames = regionDef?.cities.map((c) => c.name) ?? [];
            const regionName = scored.region.name;
            const MAX_VISIBLE_CITIES = 3;
            const cityNames = allCityNames.slice(0, MAX_VISIBLE_CITIES);
            const dbTotal = allCitiesByRegion.get(regionName) ?? allCityNames.length;
            const additionalCityCount = Math.max(0, dbTotal - MAX_VISIBLE_CITIES);
            return (
              <div key={scored.region.id}>
                {/* Desktop: hover previews, click selects + pins the panel */}
                <div className="hidden lg:block">
                  <RegionRow
                    index={i}
                    region={scored.region}
                    cityNames={cityNames}
                    regionName={regionName}
                    additionalCityCount={additionalCityCount}
                    matchScore={scored.totalScore}
                    selectedCityCount={selected}

                    isHovered={hoveredRegion === scored.region.id}
                    isRecommended={scored.isRecommended}
                    isEntryPointRegion={scored.isEntryPointRegion}
                    isExitPointRegion={scored.isExitPointRegion}
                    regionSelectionState={getRegionSelectionState(scored.region.id)}
                    onClick={() => handleClickRegion(scored.region.id)}
                    onHover={() => handleHoverRegion(scored.region.id)}
                    onLeave={handleLeaveRegion}
                  />
                </div>

                {/* Mobile: tap-driven with inline expand */}
                <div className="lg:hidden">
                  <RegionRow
                    index={i}
                    region={scored.region}
                    cityNames={cityNames}
                    regionName={regionName}
                    additionalCityCount={additionalCityCount}
                    matchScore={scored.totalScore}
                    selectedCityCount={selected}

                    isHovered={expandedRegion === scored.region.id}
                    isRecommended={scored.isRecommended}
                    isEntryPointRegion={scored.isEntryPointRegion}
                    isExitPointRegion={scored.isExitPointRegion}
                    regionSelectionState={getRegionSelectionState(scored.region.id)}
                    onClick={() => handleMobileToggle(scored.region.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleMobileToggle(scored.region.id);
                      }
                    }}
                    onHover={() => {}}
                    onLeave={() => {}}
                  />

                  {/* Mobile inline detail */}
                  <AnimatePresence>
                    {expandedRegion === scored.region.id && (
                      <m.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{
                          duration: 0.4,
                          ease: easeCinematicMut,
                        }}
                        className="overflow-hidden"
                      >
                        <MobileRegionDetail
                          region={scored.region}
                          selectedCities={selectedCities}
                          onToggleCity={toggleCity}
                        />
                      </m.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Desktop detail panel — fixed to viewport, z-40 to sit above StepProgressTrack (z-30).
           pointer-events-none on wrapper so it doesn't block clicks when panel is hidden. */}
      <div className="pointer-events-none fixed inset-y-0 right-0 z-40 hidden w-[40%] lg:block">
        <RegionDetailPanel
          region={detailRegion}
          selectedCities={selectedCities}
          onToggleCity={toggleCity}
          onPanelEnter={handlePanelEnter}
          onPanelLeave={handlePanelLeave}
        />
      </div>
    </div>
  );
}

/**
 * Compact inline detail shown on mobile when a region row is expanded.
 */
function MobileRegionDetail({
  region,
  selectedCities,
  onToggleCity,
}: {
  region: RegionDescription;
  selectedCities: Set<CityId>;
  onToggleCity: (cityId: CityId) => void;
}) {
  return (
    <div className="border-b border-border/50 bg-foreground/[0.02] px-4 py-4">
      {/* Hero image */}
      <div className="relative mb-3 aspect-[16/9] overflow-hidden rounded-lg">
        <Image
          src={region.heroImage}
          alt={region.name}
          fill
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 scrim-60" />
      </div>

      {/* Description */}
      <p className="text-sm leading-relaxed text-foreground-secondary">
        {region.description}
      </p>

      {/* Best for vibes */}
      {region.bestFor.length > 0 && (
        <div className="mt-3">
          <span className="mb-2 block text-[10px] font-medium uppercase tracking-widest text-stone">
            Best for
          </span>
          <div className="flex flex-wrap gap-2">
            {region.bestFor.map((vibeId: VibeId) => {
              const vibe = VIBES.find((v) => v.id === vibeId);
              if (!vibe) return null;
              return (
                <span
                  key={vibeId}
                  className="rounded-md bg-brand-primary/10 px-2.5 py-1 text-xs font-medium text-brand-primary"
                >
                  {vibe.name}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Highlights */}
      {region.highlights.length > 0 && (
        <div className="mt-3">
          <span className="mb-2 block text-[10px] font-medium uppercase tracking-widest text-stone">
            Highlights
          </span>
          <ul className="space-y-1.5">
            {region.highlights.map((h) => (
              <li
                key={h}
                className="flex items-center gap-2 text-sm text-foreground-secondary"
              >
                <span className="h-1 w-1 shrink-0 rounded-full bg-brand-primary" />
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* City selector */}
      <div className="mt-3">
        <RegionCitySelector
          regionName={region.name}
          selectedCities={selectedCities}
          onToggleCity={onToggleCity}
          variant="mobile"
        />
      </div>
    </div>
  );
}
