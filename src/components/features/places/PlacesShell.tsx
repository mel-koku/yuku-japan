"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Location } from "@/types/location";
import { featureFlags } from "@/lib/env/featureFlags";
import { CategoryBar } from "./CategoryBar";
import { useAllLocationsSingle, useFilterMetadataQuery } from "@/hooks/useLocationsQuery";
import { usePlacesFilters, SORT_OPTIONS, DURATION_FILTERS } from "@/hooks/usePlacesFilters";
import { useSavedPlaces } from "@/hooks/useSavedQuery";
import { useAppState } from "@/state/AppState";
import { PlacesPagination } from "./PlacesPagination";
import { PLACES_PAGE_SIZE } from "@/lib/filters/filterUtils";
import type { PagesContent } from "@/types/sanitySiteContent";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import { calculateDistance } from "@/lib/utils/geoUtils";

import { SeasonalBanner } from "./SeasonalBanner";
import { PlacesSavedTripBar } from "./PlacesSavedTripBar";
import { PlacesLanes } from "./PlacesLanes";
import { PlacesSearchModal } from "./PlacesSearchModal";
import { getActiveSeasonalHighlight } from "@/lib/utils/seasonUtils";

/* ── Dynamic imports ─────────────────────────────────────────────────
 * Heavy components are code-split so Turbopack compiles them in
 * separate chunks. This keeps the initial PlacesShell bundle small
 * and removes framer-motion from the critical compilation path.
 * ----------------------------------------------------------------- */

const PlacesIntro = dynamic(
  () => import("./PlacesIntro").then((m) => ({ default: m.PlacesIntro })),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col items-center justify-center py-24 px-6">
        <p className="font-serif text-2xl sm:text-3xl text-foreground text-center">
          Places in Japan
        </p>
      </div>
    ),
  }
);

const FilterPanel = dynamic(
  () => import("./FilterPanel").then((m) => ({ default: m.FilterPanel })),
  { ssr: false, loading: () => <div className="h-12 animate-pulse rounded-lg bg-surface" /> }
);

const PlacesMapLayout = dynamic(
  () => import("./PlacesMapLayout").then((m) => ({ default: m.PlacesMapLayout })),
  { ssr: false, loading: () => <div className="h-[50vh] animate-pulse rounded-lg bg-surface" /> }
);

const LocationExpanded = dynamic(
  () => import("./LocationExpanded").then((m) => ({ default: m.LocationExpanded })),
  { ssr: false, loading: () => <div className="h-96 animate-pulse rounded-lg bg-surface" /> }
);

const LocationEditorialGrid = dynamic(
  () => import("./LocationEditorialGrid").then((m) => ({ default: m.LocationEditorialGrid })),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg bg-surface animate-pulse">
            <div className="aspect-[4/3]" />
            <div className="p-3.5 space-y-2">
              <div className="h-4 w-3/4 rounded bg-border" />
              <div className="h-3 w-1/2 rounded bg-border" />
            </div>
          </div>
        ))}
      </div>
    ),
  }
);

type PlacesShellProps = {
  content?: PagesContent;
  cityHeroes?: Record<string, string>;
};

export function PlacesShell({ content, cityHeroes }: PlacesShellProps) {
  const router = useRouter();
  const {
    locations,
    total,
    isLoading,
    error,
  } = useAllLocationsSingle();
  const { data: filterMetadata } = useFilterMetadataQuery();
  const { user, saved: savedIds } = useAppState();
  const { saved } = useSavedPlaces(user?.email ? user.id : undefined);
  const savedLocationIdSet = useMemo(
    () =>
      new Set(
        saved
          .map((s) => s.locationId)
          .filter((id): id is string => Boolean(id)),
      ),
    [saved],
  );

  const {
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
    selectedSort, setSelectedSort,
    page, setPage, totalPages, filterVersion,
    filteredLocations,
    sortedLocations,
    visibleLocations,
    prefectureOptions,
    activeFilters,
    activeFilterCount,
    removeFilter,
    clearAllFilters,
  } = usePlacesFilters(locations, filterMetadata, savedLocationIdSet);

  const handleFilterSeasonal = useCallback(() => {
    setSelectedCategory("in_season");
  }, [setSelectedCategory]);

  const seasonalHighlight = useMemo(() => getActiveSeasonalHighlight(), []);

  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [expandedLocation, setExpandedLocation] = useState<Location | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  // Search modal: bare /places renders lanes only; modal opens on hero
  // search click, Browse-all CTA, city tile click, or any filter URL param.
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // ── Search input state ──
  const [inputValue, setInputValue] = useState("");

  // Unified clear that resets both hook state and local shell state
  const handleClearAll = useCallback(() => {
    clearAllFilters();
    setInputValue("");
  }, [clearAllFilters]);

  // Sync input → search query
  useEffect(() => {
    setQuery(inputValue);
  }, [inputValue, setQuery]);

  const handleInputChange = (value: string) => {
    setInputValue(value);
  };

  const handleInputSubmit = () => {
    // Search is live via useEffect — no-op on submit
  };

  // Auto-open location from ?location= URL param
  const searchParams = useSearchParams();
  const locationParam = searchParams.get("location");
  const didAutoExpandRef = useRef(false);

  // Apply URL → state. Used both at mount and on browser back/forward
  // (via the popstate listener below). Always overwrites — going from
  // /places?city=tokyo back to /places must CLEAR the city filter, not
  // just leave the prior value in place.
  const applyParamsToState = useCallback((params: URLSearchParams) => {
    const yukuParam = params.get("yuku");
    setYukuIds(yukuParam ? yukuParam.split(",").map((s) => s.trim()).filter(Boolean) : []);

    setSelectedCity(params.get("city"));
    setSelectedCategory(params.get("category"));
    setInputValue(params.get("q") ?? "");
    setJtaApprovedOnly(params.get("jta") === "true");

    const sortParam = params.get("sort");
    if (sortParam && ["recommended", "highest_rated", "most_reviews", "price_low", "duration_short"].includes(sortParam)) {
      setSelectedSort(sortParam as typeof selectedSort);
    } else {
      setSelectedSort("recommended");
    }

    const prefParam = params.get("prefectures");
    setSelectedPrefectures(prefParam ? prefParam.split(",").filter(Boolean) : []);

    const vibesParam = params.get("vibes");
    setSelectedVibes(vibesParam ? (vibesParam.split(",").filter(Boolean) as typeof selectedVibes) : []);

    const priceParam = params.get("price");
    setSelectedPriceLevel(priceParam !== null && priceParam !== "" ? Number(priceParam) : null);

    setSelectedDuration(params.get("duration"));
    setWheelchairAccessible(params.get("wheelchair") === "true");
    setVegetarianFriendly(params.get("vegetarian") === "true");
    setFeaturedOnly(params.get("featured") === "true");
    setUnescoOnly(params.get("unesco") === "true");
    setSavedOnly(params.get("saved") === "1");

    const pageParam = params.get("page");
    if (pageParam) {
      const parsed = Number.parseInt(pageParam, 10);
      setPage(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
    } else {
      setPage(1);
    }

    // Decide modal state from URL — open whenever any filter intent is present.
    const FILTER_KEYS = [
      "q", "city", "category", "jta", "sort", "prefectures", "vibes",
      "price", "duration", "wheelchair", "vegetarian",
      "featured", "unesco", "saved", "yuku", "view",
    ];
    const hasFilter = FILTER_KEYS.some((k) => {
      const v = params.get(k);
      return v !== null && v !== "" && v !== "false";
    });
    setIsSearchOpen(hasFilter);
  }, [
    setYukuIds, setSelectedCity, setSelectedCategory, setJtaApprovedOnly,
    setSelectedSort, setSelectedPrefectures, setSelectedVibes,
    setSelectedPriceLevel, setSelectedDuration,
    setWheelchairAccessible, setVegetarianFriendly, setFeaturedOnly,
    setUnescoOnly, setSavedOnly, setPage,
  ]);

  // Mount-only: apply URL params on first render.
  const didApplyParamsRef = useRef(false);
  useEffect(() => {
    if (didApplyParamsRef.current) return;
    didApplyParamsRef.current = true;
    const params = new URLSearchParams(searchParams.toString());
    applyParamsToState(params);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser back/forward: re-apply URL → state. popstate fires only on user
  // navigation, not on history.pushState/replaceState — so our own URL syncs
  // (router.replace) don't trigger feedback loops.
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      applyParamsToState(params);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [applyParamsToState]);
  const [flyToLocation, setFlyToLocation] = useState<Location | null>(null);

  useEffect(() => {
    if (!locationParam || didAutoExpandRef.current || !locations || locations.length === 0) return;

    const match = locations.find((loc) => loc.id === locationParam);
    if (match) {
      setExpandedLocation(match);
      setFlyToLocation(match);
      didAutoExpandRef.current = true;
    }
  }, [locationParam, locations]);

  const gridSectionRef = useRef<HTMLDivElement>(null);

  const handlePageChange = useCallback(
    (newPage: number) => {
      setPage(newPage);
      requestAnimationFrame(() => {
        gridSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [setPage],
  );

  const handleSelectLocation = useCallback((location: Location) => {
    setExpandedLocation(location);
  }, []);

  const handleCloseExpanded = useCallback(() => {
    setExpandedLocation(null);
  }, []);

  const handleOpenSearch = useCallback(() => {
    setIsSearchOpen(true);
  }, []);

  const handleCloseSearch = useCallback(() => {
    setIsSearchOpen(false);
    handleClearAll();
  }, [handleClearAll]);

  const handleCitySelect = useCallback(
    (citySlug: string) => {
      setSelectedCity(citySlug);
      setIsSearchOpen(true);
    },
    [setSelectedCity],
  );

  // Desktop: `/` opens the search modal (skips when typing in an input).
  // Cmd/Ctrl+K is intentionally not wired — reserved for a future global
  // command palette to avoid muscle-memory collision.
  useEffect(() => {
    const handleSlash = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      if (isSearchOpen) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      setIsSearchOpen(true);
    };
    window.addEventListener("keydown", handleSlash);
    return () => window.removeEventListener("keydown", handleSlash);
  }, [isSearchOpen]);

  const activeCategory = useMemo(() => {
    // Map selected vibes to the closest editorial category for interstitial messages
    const vibeToCategory: Record<string, string> = {
      temples_tradition: "culture",
      foodie_paradise: "food",
      nature_adventure: "nature",
      modern_japan: "shopping",
      art_architecture: "culture",
      zen_wellness: "nature",
    };
    if (selectedVibes.length === 1) {
      return vibeToCategory[selectedVibes[0]!] ?? null;
    }
    return null;
  }, [selectedVibes]);

  const mapAvailable = useMemo(
    () => featureFlags.enableMapbox && !featureFlags.cheapMode,
    [],
  );

  // Grid/Map toggle synced to URL param
  const viewParam = searchParams.get("view");
  const [viewMode, setViewModeState] = useState<"grid" | "map">(
    viewParam === "map" && mapAvailable ? "map" : "grid",
  );

  // Near-me state — owned alongside viewMode. Active only in map view.
  const {
    position: userPosition,
    error: geoError,
    isLoading: geoLoading,
    request: requestGeolocation,
  } = useCurrentLocation();
  const [nearMeActive, setNearMeActive] = useState(false);
  const [nearMeErrorVisible, setNearMeErrorVisible] = useState(false);

  const handleNearMeClick = useCallback(() => {
    if (nearMeActive) {
      // Toggle off — keep cached coords for the next click within 5 min.
      setNearMeActive(false);
      setNearMeErrorVisible(false);
      return;
    }
    setNearMeErrorVisible(false);
    requestGeolocation();
    setNearMeActive(true);
  }, [nearMeActive, requestGeolocation]);

  // Surface geolocation errors when active
  useEffect(() => {
    if (nearMeActive && geoError) {
      setNearMeErrorVisible(true);
      setNearMeActive(false);
    }
  }, [nearMeActive, geoError]);

  const dismissNearMeError = useCallback(() => {
    setNearMeErrorVisible(false);
  }, []);

  // Distance-sorted view of sortedLocations when near-me is active and we have coords
  const userCoords = useMemo(
    () => (userPosition ? { lat: userPosition.lat, lng: userPosition.lng } : null),
    [userPosition],
  );

  const nearMeApplied = nearMeActive && userCoords !== null && viewMode === "map";

  // Spatial anchor: drives the map's fitBounds re-fit so changing the city
  // filter zooms the user to that city instead of leaving them at country zoom.
  const anchorKey = useMemo(() => {
    if (nearMeApplied) return "near-me";
    if (selectedCity) return `city:${selectedCity}`;
    if (savedOnly) return "saved";
    if (selectedPrefectures.length > 0) return `pref:${selectedPrefectures.join("+")}`;
    if (selectedCategory) return `category:${selectedCategory}`;
    return "all";
  }, [nearMeApplied, selectedCity, savedOnly, selectedPrefectures, selectedCategory]);

  const distanceById = useMemo(() => {
    if (!nearMeApplied || !userCoords) return null;
    const map = new Map<string, number>();
    for (const loc of sortedLocations) {
      if (loc.coordinates?.lat != null && loc.coordinates?.lng != null) {
        map.set(
          loc.id,
          calculateDistance(userCoords, {
            lat: loc.coordinates.lat,
            lng: loc.coordinates.lng,
          }),
        );
      }
    }
    return map;
  }, [nearMeApplied, userCoords, sortedLocations]);

  const distanceSortedLocations = useMemo(() => {
    if (!distanceById) return sortedLocations;
    // Locations with coords sorted by distance ascending; coordless tail at end
    const withCoords: Location[] = [];
    const withoutCoords: Location[] = [];
    for (const loc of sortedLocations) {
      if (distanceById.has(loc.id)) withCoords.push(loc);
      else withoutCoords.push(loc);
    }
    withCoords.sort((a, b) => {
      const da = distanceById.get(a.id) ?? Infinity;
      const db = distanceById.get(b.id) ?? Infinity;
      return da - db;
    });
    return [...withCoords, ...withoutCoords];
  }, [distanceById, sortedLocations]);

  // Scroll to top when filters change (skip initial mount)
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (viewMode === "grid") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [filterVersion, viewMode]);

  const setViewMode = useCallback(
    (mode: "grid" | "map") => {
      setViewModeState(mode);
    },
    [],
  );

  // Sync all filter state to URL params (debounced)
  const isUrlInitializedRef = useRef(false);
  useEffect(() => {
    if (!isUrlInitializedRef.current) {
      isUrlInitializedRef.current = true;
      return;
    }
    const timeout = setTimeout(() => {
      const params = new URLSearchParams();
      if (viewMode === "map") params.set("view", "map");
      if (query) params.set("q", query);
      if (selectedCity) params.set("city", selectedCity);
      if (selectedCategory) params.set("category", selectedCategory);
      if (jtaApprovedOnly) params.set("jta", "true");
      if (selectedSort !== "recommended") params.set("sort", selectedSort);
      if (selectedPrefectures.length > 0) params.set("prefectures", selectedPrefectures.join(","));
      if (selectedVibes.length > 0) params.set("vibes", selectedVibes.join(","));
      if (selectedPriceLevel !== null) params.set("price", String(selectedPriceLevel));
      if (selectedDuration) params.set("duration", selectedDuration);
      if (wheelchairAccessible) params.set("wheelchair", "true");
      if (vegetarianFriendly) params.set("vegetarian", "true");
      if (featuredOnly) params.set("featured", "true");
      if (unescoOnly) params.set("unesco", "true");
      if (savedOnly) params.set("saved", "1");
      if (viewMode === "grid" && page > 1) params.set("page", String(page));
      if (yukuIds.length > 0) params.set("yuku", yukuIds.join(","));
      if (locationParam) params.set("location", locationParam);
      const qs = params.toString();
      router.replace(`/places${qs ? `?${qs}` : ""}`, { scroll: false });
    }, 300);
    return () => clearTimeout(timeout);
  }, [
    viewMode, query, selectedCity, selectedCategory, jtaApprovedOnly,
    selectedSort, selectedPrefectures, selectedVibes, selectedPriceLevel,
    selectedDuration, wheelchairAccessible, vegetarianFriendly,
    featuredOnly, unescoOnly, savedOnly, yukuIds, locationParam, router, page,
  ]);

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Lanes view — the bare /places experience. Always rendered; the
          search modal sits on top when active. */}
      <PlacesIntro onSearchClick={handleOpenSearch}>
        <SeasonalBanner
          locations={locations}
          onFilterSeasonal={handleFilterSeasonal}
        />
      </PlacesIntro>
      <PlacesLanes
        locations={locations}
        cityHeroes={cityHeroes}
        onSelect={handleSelectLocation}
        onCitySelect={handleCitySelect}
        onOpenSearch={handleOpenSearch}
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 text-center">
        <button
          type="button"
          onClick={handleOpenSearch}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-6 py-3 text-sm font-medium text-foreground transition hover:bg-canvas hover:shadow-[var(--shadow-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          Browse all {total ? total.toLocaleString() : ""} places
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Search modal — wraps the existing CategoryBar + grid/map + FilterPanel. */}
      <PlacesSearchModal isOpen={isSearchOpen} onClose={handleCloseSearch}>
      {/* Error state */}
      {error ? (
        <div className="flex-1 flex items-center justify-center py-20">
          <div className="mx-auto max-w-md px-4 text-center">
            <div className="rounded-lg border border-error/30 bg-error/10 p-4 sm:p-8">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error/20">
                <svg className="h-6 w-6 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-base font-semibold text-error mb-2">{content?.placesErrorMessage ?? "Something went wrong loading places"}</p>
              <p className="text-sm text-error mb-6">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg bg-error px-5 py-2.5 text-sm font-semibold text-white hover:bg-error/90 transition focus:outline-none focus:ring-2 focus:ring-error focus:ring-offset-2"
              >
                {content?.placesRetryText ?? "Try again"}
              </button>
            </div>
          </div>
        </div>
      ) : (
      <>
      <CategoryBar
        onFiltersClick={() => setIsFilterPanelOpen(true)}
        activeFilterCount={activeFilterCount}
        activeFilters={activeFilters}
        onRemoveFilter={removeFilter}
        onClearAllFilters={handleClearAll}
        inputValue={inputValue}
        onInputChange={handleInputChange}
        onInputSubmit={handleInputSubmit}
        totalCount={activeFilterCount > 0 || yukuIds.length > 0 ? filteredLocations.length : total}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        mapAvailable={mapAvailable}
        onNearMeClick={handleNearMeClick}
        nearMeActive={nearMeApplied}
        nearMeLoading={nearMeActive && geoLoading}
      />

      {/* Near Me geolocation error */}
      {nearMeErrorVisible && geoError && (
        <div className="mx-auto mt-3 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-start justify-between gap-3 rounded-md bg-yuzu-tint px-4 py-3 text-sm">
            <p className="text-foreground-body">
              {geoError === "Location permission denied."
                ? "Location access denied. Enable it in your browser to find places near you."
                : geoError}
            </p>
            <button
              type="button"
              onClick={dismissNearMeError}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-foreground-secondary hover:text-foreground transition"
              aria-label="Dismiss location error"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Yuku filter banner */}
      {yukuIds.length > 0 && (
        <div className="mx-auto mt-3 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-start justify-between gap-3 rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-4 py-3 text-sm">
            <div className="flex items-start gap-2.5">
              <svg className="h-5 w-5 shrink-0 text-brand-primary mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path strokeLinecap="round" d="M12 16v-4m0-4h.01" />
              </svg>
              <div>
                <span className="font-medium text-brand-primary">
                  Yuku suggested {yukuIds.length} place{yukuIds.length !== 1 ? "s" : ""} for you
                </span>
                <p className="text-xs text-foreground-secondary mt-0.5">
                  Other filters are paused while viewing suggestions.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={clearYukuFilter}
              className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-brand-primary hover:bg-brand-primary/10 transition"
            >
              Show all places
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      {viewMode === "map" && mapAvailable ? (
        <PlacesMapLayout
          filteredLocations={filteredLocations}
          sortedLocations={distanceSortedLocations}
          totalCount={total}
          onSelectLocation={handleSelectLocation}
          isLoading={isLoading}
          isChatOpen={isChatOpen}
          onChatClose={() => setIsChatOpen(false)}
          hasActiveChips={activeFilters.filter((f) => f.type !== "search").length > 0}
          flyToLocation={flyToLocation}
          userLocation={nearMeApplied ? userCoords : null}
          locationDistanceKm={distanceById}
          anchorKey={anchorKey}
        />
      ) : isLoading ? (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-12 sm:pb-16">
          {/*
           * Match PLACES_PAGE_SIZE (36) AND the real card's rendered height so the
           * grid doesn't change size when cards swap in. Measured real cards
           * at ~413px vs a previous 353px skeleton → everything below the
           * grid shifted when cards landed, producing ~0.15 CLS on /places.
           *
           * Content block mirrors the real card: name, city/duration, 2-line
           * summary, category+badge row.
           */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
            {Array.from({ length: PLACES_PAGE_SIZE }).map((_, index) => (
              <div key={index} className="rounded-lg bg-surface animate-pulse">
                <div className="aspect-[4/3]" />
                <div className="p-3.5 space-y-2">
                  <div className="h-4 w-3/4 rounded bg-border" />
                  <div className="h-3 w-1/2 rounded bg-border" />
                  <div className="h-3 w-full rounded bg-border" />
                  <div className="h-3 w-5/6 rounded bg-border" />
                  <div className="flex gap-2 pt-1">
                    <div className="h-5 w-16 rounded-md bg-border" />
                    <div className="h-5 w-12 rounded-md bg-border" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <main
          ref={gridSectionRef}
          className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-12 sm:pb-16"
        >
          <LocationEditorialGrid
            locations={visibleLocations}
            onSelect={handleSelectLocation}
            totalCount={total}
            activeCategory={activeCategory}
            onClearFilters={activeFilterCount > 0 ? handleClearAll : undefined}
          />

          {totalPages > 1 && (
            <div className="mt-12 flex flex-col items-center gap-4">
              <p className="font-mono text-xs uppercase tracking-wide text-foreground-secondary">
                {`Showing ${(page - 1) * PLACES_PAGE_SIZE + 1}–${
                  (page - 1) * PLACES_PAGE_SIZE + visibleLocations.length
                } of ${sortedLocations.length.toLocaleString()} places`}
              </p>
              <PlacesPagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            </div>
          )}
        </main>
      )}

      {/* Filter Panel */}
      <FilterPanel
        isOpen={isFilterPanelOpen}
        onClose={() => setIsFilterPanelOpen(false)}
        query={query}
        onQueryChange={setQuery}
        prefectureOptions={prefectureOptions}
        selectedPrefectures={selectedPrefectures}
        onPrefecturesChange={setSelectedPrefectures}
        selectedVibes={selectedVibes}
        onVibesChange={setSelectedVibes}
        selectedPriceLevel={selectedPriceLevel}
        onPriceLevelChange={setSelectedPriceLevel}
        durationOptions={DURATION_FILTERS.map(({ id, label }) => ({
          value: id,
          label,
        }))}
        selectedDuration={selectedDuration}
        onDurationChange={setSelectedDuration}
        wheelchairAccessible={wheelchairAccessible}
        onWheelchairAccessibleChange={setWheelchairAccessible}
        vegetarianFriendly={vegetarianFriendly}
        onVegetarianFriendlyChange={setVegetarianFriendly}
        featuredOnly={featuredOnly}
        onFeaturedToggle={setFeaturedOnly}
        unescoOnly={unescoOnly}
        onUnescoToggle={setUnescoOnly}
        savedOnly={savedOnly}
        onSavedOnlyChange={setSavedOnly}
        resultsCount={activeFilters.length === 0 ? total : filteredLocations.length}
        onClearAll={handleClearAll}
        sortOptions={SORT_OPTIONS}
        selectedSort={selectedSort}
        onSortChange={setSelectedSort}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        seasonalHighlight={seasonalHighlight}
      />

      </>
      )}
      </PlacesSearchModal>

      {/* Location detail — mounts above both lanes and modal. */}
      {expandedLocation && (
        <LocationExpanded
          location={expandedLocation}
          onClose={handleCloseExpanded}
        />
      )}

      <PlacesSavedTripBar savedCount={savedIds.length} />
    </div>
  );
}
