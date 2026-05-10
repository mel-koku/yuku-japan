"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Location } from "@/types/location";
import type { ActiveFilter, FilterMetadata } from "@/types/filters";
import { locationMatchesVibes } from "@/data/vibeFilterMapping";
import { VIBES, type VibeId } from "@/data/vibes";
import { useLocationSearchQuery } from "@/hooks/useLocationsQuery";
import { locationHasSeasonalTag, getCurrentMonth, getActiveSeasonalHighlight } from "@/lib/utils/seasonUtils";
import { parseSearchQuery } from "@/lib/search/queryParser";
import { getParentCategoryForDatabaseCategory } from "@/data/categoryHierarchy";
import {
  DURATION_FILTERS,
  calculatePopularityScore,
  parseDuration,
  normalizePrefecture,
  PLACES_PAGE_SIZE,
} from "@/lib/filters/filterUtils";

// ── Constants ──────────────────────────────────────────────

export { DURATION_FILTERS };

export type SortOptionId = "recommended" | "highest_rated" | "most_reviews" | "price_low" | "duration_short";

export const SORT_OPTIONS = [
  { id: "recommended" as const, label: "Popular" },
  { id: "highest_rated" as const, label: "Highest Rated" },
  { id: "most_reviews" as const, label: "Most Reviews" },
  { id: "price_low" as const, label: "Price (Low to High)" },
  { id: "duration_short" as const, label: "Duration (Short to Long)" },
] as const;

// ── Helpers ────────────────────────────────────────────────

type EnhancedLocation = Location & {
  durationMinutes: number | null;
  ratingValue: number;
  reviewCount: number;
};

export type { EnhancedLocation };


// ── Category diversity interleaving ───────────────────────
// Collapses the 32 DB categories into the 6 parent groups
// (culture/food/nature/shopping/view/entertainment) so the round-robin
// produces real variety — temple+shrine+museum no longer stack 6 deep.

function getDiversityGroup(category: string): string {
  return getParentCategoryForDatabaseCategory(category) ?? category;
}

function interleaveForDiversity<T extends { category: string }>(
  sorted: T[],
  maxConsecutive: number = 2
): T[] {
  if (sorted.length <= maxConsecutive) return sorted;

  // Group items by diversity group, preserving sort order within each group
  const groups = new Map<string, T[]>();
  for (const item of sorted) {
    const group = getDiversityGroup(item.category);
    const existing = groups.get(group);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(group, [item]);
    }
  }

  // Round-robin across groups, taking up to maxConsecutive from each
  const result: T[] = [];
  const groupKeys = [...groups.keys()];
  let emptyGroups = 0;

  while (emptyGroups < groupKeys.length) {
    emptyGroups = 0;
    for (const key of groupKeys) {
      const bucket = groups.get(key)!;
      if (bucket.length === 0) {
        emptyGroups++;
        continue;
      }
      const take = Math.min(maxConsecutive, bucket.length);
      for (let i = 0; i < take; i++) {
        result.push(bucket.shift()!);
      }
    }
  }

  return result;
}

// ── Hook ───────────────────────────────────────────────────

export function usePlacesFilters(
  locations: Location[],
  filterMetadata: FilterMetadata | undefined,
  savedPlaceIds: Set<string> = new Set(),
) {
  // Filter state
  const [query, setQuery] = useState("");
  const { data: searchResultIds } = useLocationSearchQuery(query);
  const serverMatchIds = useMemo(
    () => (searchResultIds && searchResultIds.length > 0 ? new Set(searchResultIds) : null),
    [searchResultIds],
  );
  const [selectedPrefectures, setSelectedPrefectures] = useState<string[]>([]);
  const [selectedPriceLevel, setSelectedPriceLevel] = useState<number | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<string | null>(null);
  const [selectedVibes, setSelectedVibes] = useState<VibeId[]>([]);
  const [wheelchairAccessible, setWheelchairAccessible] = useState(false);
  const [vegetarianFriendly, setVegetarianFriendly] = useState(false);
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [yukuIds, setYukuIds] = useState<string[]>([]);
  // URL-driveable filters (set from ?city=, ?category=, ?jta= params)
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [jtaApprovedOnly, setJtaApprovedOnly] = useState(false);
  const [unescoOnly, setUnescoOnly] = useState(false);

  // Sort + pagination
  const [selectedSort, setSelectedSort] = useState<SortOptionId>("recommended");
  const [page, setPage] = useState(1);

  // Track filter changes for scroll-to-top and page reset.
  // Skip on first mount so URL-restored state (e.g. ?sort=x&page=3) isn't clobbered.
  const [filterVersion, setFilterVersion] = useState(0);
  const didMountFiltersRef = useRef(false);
  useEffect(() => {
    if (!didMountFiltersRef.current) {
      didMountFiltersRef.current = true;
      return;
    }
    setPage(1);
    setFilterVersion((v) => v + 1);
  }, [
    query,
    selectedPrefectures,
    selectedPriceLevel,
    selectedDuration,
    selectedVibes,
    wheelchairAccessible,
    vegetarianFriendly,
    featuredOnly,
    savedOnly,
    yukuIds,
    selectedCity,
    selectedCategory,
    jtaApprovedOnly,
    unescoOnly,
    selectedSort,
  ]);

  // Enhance with parsed duration and rating fallbacks. The server search
  // endpoint is consulted via `serverMatchIds` (used in matchesQuery below)
  // so semantic hits surface alongside local substring matches without
  // injecting partial-shape rows into the listing.
  const enhancedLocations = useMemo<EnhancedLocation[]>(() => {
    return locations.map((location) => {
      return {
        ...location,
        durationMinutes: parseDuration(location.estimatedDuration),
        ratingValue: location.rating ?? 0,
        reviewCount: location.reviewCount ?? 0,
      };
    });
  }, [locations]);

  const prefectureOptions = useMemo(() => {
    return filterMetadata?.prefectures || [];
  }, [filterMetadata]);

  // Apply all filters
  const filteredLocations = useMemo(() => {
    // Yuku filter overrides everything -- show only the exact IDs Yuku returned
    if (yukuIds.length > 0) {
      const idSet = new Set(yukuIds);
      return enhancedLocations.filter((loc) => idSet.has(loc.id));
    }

    const normalizedQuery = query.trim().toLowerCase();
    const parsed = parseSearchQuery(query);
    const durationFilter = selectedDuration
      ? DURATION_FILTERS.find((filter) => filter.id === selectedDuration) ?? null
      : null;

    const FOOD_CATEGORIES = new Set(["restaurant", "cafe", "bar", "market"]);

    // When the in-season filter is active, the active SeasonalHighlight may
    // narrow by region (e.g. cherry-blossom-late → Tohoku + Hokkaido).
    // Looked up once per filter pass so the banner CTA + the listing agree.
    const activeHighlight = selectedCategory === "in_season" ? getActiveSeasonalHighlight() : null;
    const seasonalRegionSet = activeHighlight?.regions
      ? new Set(activeHighlight.regions.map((r) => r.toLowerCase()))
      : null;

    return enhancedLocations.filter((location) => {
      let matchesQuery: boolean;
      const matchesServerSearch = serverMatchIds?.has(location.id) ?? false;

      if (parsed.hasStructuredIntent) {
        // Structured matching: geography AND category/cuisine AND free text
        const matchesGeo =
          parsed.geoTerms.length === 0 ||
          parsed.geoTerms.some((g) => {
            const normPref = normalizePrefecture(location.prefecture).toLowerCase();
            return (
              location.city.toLowerCase() === g ||
              location.region.toLowerCase() === g ||
              normPref === g
            );
          });

        const hasCategories = parsed.categories.length > 0;
        const hasCuisine = parsed.cuisineTerms.length > 0;
        const isFoodLocation = FOOD_CATEGORIES.has(location.category);

        const matchesWhat =
          !hasCategories && !hasCuisine
            ? true
            : ((!hasCategories || parsed.categories.includes(location.category)) &&
               (!hasCuisine || !isFoodLocation ||
                 parsed.cuisineTerms.some(
                   (ct) =>
                     location.cuisineType?.toLowerCase().includes(ct) ||
                     location.name.toLowerCase().includes(ct),
                 )));

        const matchesFreeText =
          !parsed.freeText ||
          location.name.toLowerCase().includes(parsed.freeText);

        matchesQuery = (matchesGeo && matchesWhat && matchesFreeText) || matchesServerSearch;
      } else if (normalizedQuery) {
        // Fallback: structured-field substring OR server-side match (FTS +
        // fuzzy + Vertex semantic via /api/locations/search). This is what
        // makes intent queries like "quiet temple morning Kyoto" surface
        // results that don't literally contain the words.
        matchesQuery =
          location.name.toLowerCase().includes(normalizedQuery) ||
          location.city.toLowerCase().includes(normalizedQuery) ||
          location.region.toLowerCase().includes(normalizedQuery) ||
          location.category.toLowerCase().includes(normalizedQuery) ||
          (location.cuisineType?.toLowerCase().includes(normalizedQuery) ?? false) ||
          matchesServerSearch;
      } else {
        matchesQuery = true;
      }

      const matchesPrefecture = selectedPrefectures.length === 0
        ? true
        : selectedPrefectures.includes(normalizePrefecture(location.prefecture));

      const matchesPriceLevel = selectedPriceLevel === null
        ? true
        : selectedPriceLevel === 0
          ? (location.priceLevel === 0 || location.priceLevel == null)
          : location.priceLevel === selectedPriceLevel;

      const matchesDuration = durationFilter
        ? durationFilter.predicate(location.durationMinutes)
        : true;

      const matchesVibe = locationMatchesVibes(location, selectedVibes);

      const matchesWheelchair = !wheelchairAccessible
        ? true
        : location.accessibilityOptions?.wheelchairAccessibleEntrance === true;

      const matchesVegetarian = !vegetarianFriendly
        ? true
        : location.dietaryOptions?.servesVegetarianFood === true;

      const matchesFeatured = !featuredOnly
        ? true
        : location.isFeatured === true;

      const matchesSaved = !savedOnly ? true : savedPlaceIds.has(location.id);

      const matchesCity = !selectedCity
        ? true
        : location.city.toLowerCase() === selectedCity.toLowerCase();

      const matchesCategory = !selectedCategory
        ? true
        : selectedCategory === "in_season"
          ? locationHasSeasonalTag(location.tags, getCurrentMonth()) &&
            (!seasonalRegionSet || seasonalRegionSet.has((location.region ?? "").toLowerCase()))
          : location.category === selectedCategory;

      const matchesJta = !jtaApprovedOnly
        ? true
        : location.jtaApproved === true;

      const matchesUnesco = !unescoOnly
        ? true
        : location.isUnescoSite === true;

      return (
        matchesQuery &&
        matchesPrefecture &&
        matchesPriceLevel &&
        matchesDuration &&
        matchesVibe &&
        matchesWheelchair &&
        matchesVegetarian &&
        matchesFeatured &&
        matchesSaved &&
        matchesCity &&
        matchesCategory &&
        matchesJta &&
        matchesUnesco
      );
    });
  }, [enhancedLocations, query, selectedPrefectures, selectedPriceLevel, selectedDuration, selectedVibes, wheelchairAccessible, vegetarianFriendly, featuredOnly, savedOnly, savedPlaceIds, yukuIds, selectedCity, selectedCategory, jtaApprovedOnly, unescoOnly, serverMatchIds]);

  // Sort
  const sortedLocations = useMemo(() => {
    const sorted = [...filteredLocations];
    switch (selectedSort) {
      case "recommended":
        sorted.sort((a, b) => {
          const scoreA = calculatePopularityScore(a.ratingValue, a.reviewCount);
          const scoreB = calculatePopularityScore(b.ratingValue, b.reviewCount);
          if (scoreA === scoreB) return a.name.localeCompare(b.name);
          return scoreB - scoreA;
        });
        return interleaveForDiversity(sorted);
      case "highest_rated":
        return sorted.sort((a, b) => {
          if (a.ratingValue === b.ratingValue) return a.name.localeCompare(b.name);
          return b.ratingValue - a.ratingValue;
        });
      case "most_reviews":
        return sorted.sort((a, b) => {
          if (a.reviewCount === b.reviewCount) return a.name.localeCompare(b.name);
          return b.reviewCount - a.reviewCount;
        });
      case "price_low":
        return sorted.sort((a, b) => {
          const priceA = a.priceLevel ?? 0;
          const priceB = b.priceLevel ?? 0;
          if (priceA === priceB) return a.name.localeCompare(b.name);
          return priceA - priceB;
        });
      case "duration_short":
        return sorted.sort((a, b) => {
          const durA = a.durationMinutes ?? Infinity;
          const durB = b.durationMinutes ?? Infinity;
          if (durA === durB) return a.name.localeCompare(b.name);
          return durA - durB;
        });
      default:
        return sorted;
    }
  }, [filteredLocations, selectedSort]);

  // Pagination (windowed — one page at a time)
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(sortedLocations.length / PLACES_PAGE_SIZE)),
    [sortedLocations.length]
  );

  // Clamp page if totalPages shrank (e.g., filter narrowed results below current page)
  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const visibleLocations = useMemo(() => {
    const start = (page - 1) * PLACES_PAGE_SIZE;
    return sortedLocations.slice(start, start + PLACES_PAGE_SIZE);
  }, [sortedLocations, page]);

  // Active filters for chips
  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const filters: ActiveFilter[] = [];

    if (query) {
      filters.push({ type: "search", value: query, label: `"${query}"` });
    }

    for (const prefectureValue of selectedPrefectures) {
      const prefOption = prefectureOptions.find((p) => p.value === prefectureValue);
      filters.push({
        type: "prefecture",
        value: prefectureValue,
        label: prefOption?.label || prefectureValue,
      });
    }

    for (const vibeId of selectedVibes) {
      const vibe = VIBES.find((v) => v.id === vibeId);
      if (vibe) {
        filters.push({
          type: "vibe",
          value: vibeId,
          label: vibe.name,
        });
      }
    }

    if (selectedDuration) {
      const durOption = DURATION_FILTERS.find((d) => d.id === selectedDuration);
      if (durOption) {
        filters.push({
          type: "duration",
          value: selectedDuration,
          label: durOption.label,
        });
      }
    }

    if (selectedPriceLevel !== null) {
      const priceLabels: Record<number, string> = { 0: "Free", 1: "$", 2: "$$", 3: "$$$", 4: "$$$$" };
      filters.push({
        type: "priceLevel",
        value: String(selectedPriceLevel),
        label: priceLabels[selectedPriceLevel] || String(selectedPriceLevel),
      });
    }

    if (wheelchairAccessible) {
      filters.push({ type: "wheelchair", value: "true", label: "Wheelchair accessible" });
    }

    if (vegetarianFriendly) {
      filters.push({ type: "vegetarian", value: "true", label: "Vegetarian friendly" });
    }

    if (featuredOnly) {
      filters.push({ type: "featured", value: "true", label: "Featured" });
    }

    if (savedOnly) {
      filters.push({ type: "saved", value: "true", label: "Saved only" });
    }

    if (selectedCity) {
      const label = selectedCity.charAt(0).toUpperCase() + selectedCity.slice(1);
      filters.push({ type: "city", value: selectedCity, label });
    }

    if (selectedCategory) {
      const label = selectedCategory === "in_season"
        ? "In Season"
        : selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1);
      filters.push({ type: "category", value: selectedCategory, label });
    }

    if (jtaApprovedOnly) {
      filters.push({ type: "jta", value: "true", label: "JTA Approved" });
    }

    if (unescoOnly) {
      filters.push({ type: "unesco", value: "true", label: "UNESCO World Heritage" });
    }

    return filters;
  }, [
    query,
    selectedPrefectures,
    prefectureOptions,
    selectedVibes,
    selectedDuration,
    selectedPriceLevel,
    wheelchairAccessible,
    vegetarianFriendly,
    featuredOnly,
    savedOnly,
    selectedCity,
    selectedCategory,
    jtaApprovedOnly,
    unescoOnly,
  ]);

  const activeFilterCount = activeFilters.filter((f) => f.type !== "search").length;

  const removeFilter = useCallback((filter: ActiveFilter) => {
    switch (filter.type) {
      case "search":
        setQuery("");
        break;
      case "prefecture":
        setSelectedPrefectures((prev) => prev.filter((p) => p !== filter.value));
        break;
      case "vibe":
        setSelectedVibes((prev) => prev.filter((v) => v !== filter.value));
        break;
      case "duration":
        setSelectedDuration(null);
        break;
      case "priceLevel":
        setSelectedPriceLevel(null);
        break;
      case "wheelchair":
        setWheelchairAccessible(false);
        break;
      case "vegetarian":
        setVegetarianFriendly(false);
        break;
      case "featured":
        setFeaturedOnly(false);
        break;
      case "saved":
        setSavedOnly(false);
        break;
      case "city":
        setSelectedCity(null);
        break;
      case "category":
        setSelectedCategory(null);
        break;
      case "jta":
        setJtaApprovedOnly(false);
        break;
      case "unesco":
        setUnescoOnly(false);
        break;
    }
  }, []);

  const clearAllFilters = useCallback(() => {
    setQuery("");
    setSelectedPrefectures([]);
    setSelectedPriceLevel(null);
    setSelectedDuration(null);
    setSelectedVibes([]);
    setWheelchairAccessible(false);
    setVegetarianFriendly(false);
    setFeaturedOnly(false);
    setSavedOnly(false);
    setYukuIds([]);
    setSelectedCity(null);
    setSelectedCategory(null);
    setJtaApprovedOnly(false);
    setUnescoOnly(false);
    setSelectedSort("recommended");
  }, []);

  const clearYukuFilter = useCallback(() => {
    setYukuIds([]);
  }, []);

  return {
    // Filter state + setters
    query, setQuery,
    selectedPrefectures, setSelectedPrefectures,
    selectedPriceLevel, setSelectedPriceLevel,
    selectedDuration, setSelectedDuration,
    selectedVibes, setSelectedVibes,
    wheelchairAccessible, setWheelchairAccessible,
    vegetarianFriendly, setVegetarianFriendly,
    featuredOnly, setFeaturedOnly,
    savedOnly, setSavedOnly,
    yukuIds, setYukuIds, clearYukuFilter,
    selectedCity, setSelectedCity,
    selectedCategory, setSelectedCategory,
    jtaApprovedOnly, setJtaApprovedOnly,
    unescoOnly, setUnescoOnly,
    // Sort
    selectedSort, setSelectedSort,
    // Pagination
    page, setPage, totalPages, filterVersion,
    // Computed
    filteredLocations,
    sortedLocations,
    visibleLocations,
    prefectureOptions,
    activeFilters,
    activeFilterCount,
    // Actions
    removeFilter,
    clearAllFilters,
  };
}
