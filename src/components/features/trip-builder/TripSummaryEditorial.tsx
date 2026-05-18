"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, Plane, Palette, MapPin, Search, X, Check } from "lucide-react";
import { formatTime12h } from "@/lib/utils/timeUtils";
import { parseLocalDate } from "@/lib/utils/dateUtils";

import { useTripBuilder } from "@/context/TripBuilderContext";
import { getVibeById } from "@/data/vibes";
import { deriveRegionsFromCities, REGIONS } from "@/data/regions";
import { computeDefaultCityDays, redistributeOnRemove } from "@/lib/tripBuilder/cityDayAllocation";
import { getDepartureDistanceWarning, optimizeCitySequence } from "@/lib/routing/citySequence";
import { travelTimeFromEntryPoint } from "@/lib/travelTime";
import { getCityMetadata } from "@/lib/tripBuilder/cityRelevance";
import { useMapboxSearch, type MapboxSuggestion } from "@/hooks/useMapboxSearch";
import { SortableCityList } from "./SortableCityList";
import type { CityId, TripBuilderData } from "@/types/trip";
import type { TripBuilderConfig } from "@/types/sanitySiteContent";

type AccommodationValue = NonNullable<TripBuilderData["accommodations"]>[string];

type TripSummaryEditorialProps = {
  onEditDates?: () => void;
  onEditEntryPoint?: () => void;
  onEditVibes?: () => void;
  onEditRegions?: () => void;
  sanityConfig?: TripBuilderConfig;
  accommodations?: TripBuilderData["accommodations"];
  onAccommodationChange?: (cityId: string, accom: AccommodationValue | undefined) => void;
};

export function TripSummaryEditorial({
  onEditDates,
  onEditEntryPoint,
  onEditVibes,
  onEditRegions,
  sanityConfig: _sanityConfig,
  accommodations,
  onAccommodationChange,
}: TripSummaryEditorialProps) {
  const { data, setData } = useTripBuilder();

  // Re-optimize whenever inputs change. Previously guarded by a `hasOptimized`
  // ref that latched true after the first run -- that latch meant a subsequent
  // duration bump (e.g. 10 -> 13 days) couldn't reach the auto-return-day
  // branch in `appendReturnCityIfNeeded`, so trips ended far from the exit
  // airport without a return city. The idempotent no-op guard below prevents
  // infinite loops when optimization is a fixed point for the current inputs.
  useEffect(() => {
    const cities = data.cities ?? [];
    if (data.customCityOrder || cities.length < 2 || !data.entryPoint) return;

    const effectiveExit = data.sameAsEntry !== false ? data.entryPoint : data.exitPoint;
    const optimized = optimizeCitySequence(data.entryPoint, cities, effectiveExit, data.duration);

    // Only update if the order actually changed
    if (optimized.length === cities.length && optimized.every((c, i) => c === cities[i])) return;
    setData((prev) => {
      const prevLen = prev.cities?.length ?? 0;
      return {
        ...prev,
        cities: optimized,
        regions: deriveRegionsFromCities(optimized),
        // Clear stale cityDays when the length changed (e.g. auto-return city
        // was appended). Defaults will recompute on next render.
        cityDays: optimized.length === prevLen ? prev.cityDays : undefined,
      };
    });
  }, [data.cities, data.customCityOrder, data.entryPoint, data.exitPoint, data.sameAsEntry, data.duration, setData]);

  // Format dates
  const formattedDates = useMemo(() => {
    if (!data.dates.start || !data.dates.end) return null;
    const start = parseLocalDate(data.dates.start)!;
    const end = parseLocalDate(data.dates.end)!;
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    const year = start.toLocaleDateString("en-US", { year: "numeric" });
    return `${start.toLocaleDateString("en-US", opts)} to ${end.toLocaleDateString("en-US", opts)}, ${year}`;
  }, [data.dates.start, data.dates.end]);

  const vibeNames = useMemo(
    () =>
      (data.vibes ?? [])
        .map((id) => getVibeById(id)?.name)
        .filter(Boolean) as string[],
    [data.vibes]
  );

  // Departure distance warning for the last city
  const departureWarning = useMemo(() => {
    const cities = data.cities ?? [];
    if (cities.length < 2 || !data.entryPoint) return null;
    const effectiveExit = data.sameAsEntry !== false ? data.entryPoint : data.exitPoint;
    const warning = getDepartureDistanceWarning(cities, data.entryPoint, effectiveExit);
    if (!warning) return null;

    // Resolve display names
    const cityName = (() => {
      for (const r of REGIONS) {
        const c = r.cities.find((c) => c.id === warning.lastCity);
        if (c) return c.name;
      }
      return warning.lastCity.charAt(0).toUpperCase() + warning.lastCity.slice(1);
    })();
    const airportName = (data.sameAsEntry !== false ? data.entryPoint : data.exitPoint)?.name ?? data.entryPoint.name;
    const hours = Math.floor(warning.minutes / 60);
    const mins = warning.minutes % 60;
    const timeStr = hours > 0 && mins > 0 ? `${hours}h ${mins}m` : hours > 0 ? `${hours}h` : `${mins}m`;

    return { cityName, airportName, timeStr };
  }, [data.cities, data.entryPoint, data.exitPoint, data.sameAsEntry]);

  // Auto-return-night notice. `appendReturnCityIfNeeded` quietly adds a
  // duplicate entry city at the end of the sequence when the traveler would
  // otherwise be stranded far from the departure airport. Surface it so users
  // know why the route list has an extra stop. Pattern: first city === last
  // city in non-custom-order mode (the only way this duplication occurs).
  const autoReturnNote = useMemo(() => {
    if (data.customCityOrder) return null;
    const cities = data.cities ?? [];
    if (cities.length < 3 || !data.entryPoint) return null;
    const first = cities[0];
    const last = cities[cities.length - 1];
    if (!first || !last || first !== last) return null;

    const farCityId = cities[cities.length - 2];
    if (!farCityId) return null;
    const effectiveExit = data.sameAsEntry !== false ? data.entryPoint : data.exitPoint;
    const airport = effectiveExit ?? data.entryPoint;
    const minutes = travelTimeFromEntryPoint(airport, farCityId);
    if (minutes === undefined) return null;

    const resolveName = (id: string) => {
      for (const r of REGIONS) {
        const c = r.cities.find((c) => c.id === id);
        if (c) return c.name;
      }
      return id.charAt(0).toUpperCase() + id.slice(1);
    };

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const timeStr = hours > 0 && mins > 0 ? `${hours}h ${mins}m` : hours > 0 ? `${hours}h` : `${mins}m`;

    return {
      returnCityName: resolveName(first),
      farCityName: resolveName(farCityId),
      airportName: airport.name,
      timeStr,
    };
  }, [data.cities, data.customCityOrder, data.entryPoint, data.exitPoint, data.sameAsEntry]);

  // Effective per-city day allocation (parallel array)
  const effectiveCityDays = useMemo(() => {
    const cities = data.cities ?? [];
    const duration = data.duration;
    if (cities.length < 2 || !duration || duration <= 0) return undefined;
    return data.cityDays ?? computeDefaultCityDays(cities, duration);
  }, [data.cities, data.duration, data.cityDays]);

  // Warn when a city has too few locations for its allocated days
  const thinCityWarnings = useMemo(() => {
    const cities = data.cities ?? [];
    if (!effectiveCityDays || cities.length === 0) return [];
    const LOCATIONS_PER_DAY_THRESHOLD = 5;
    const warnings: Array<{ cityName: string; days: number; locationCount: number }> = [];
    for (let i = 0; i < cities.length; i++) {
      const cityId = cities[i];
      if (!cityId) continue;
      const days = effectiveCityDays[i] ?? 1;
      if (days < 3) continue; // Only warn for 3+ day stays
      const meta = getCityMetadata(cityId);
      if (!meta) continue;
      if (meta.locationCount < days * LOCATIONS_PER_DAY_THRESHOLD) {
        const cityEntry = REGIONS.flatMap((r) => r.cities).find((c) => c.id === cityId);
        warnings.push({
          cityName: cityEntry?.name ?? cityId,
          days,
          locationCount: meta.locationCount,
        });
      }
    }
    return warnings;
  }, [data.cities, effectiveCityDays]);

  // Day change handler — adjusts target entry and adjacent entry to keep total constant
  const handleDaysChange = useCallback(
    (index: number, newDays: number) => {
      setData((prev) => {
        const cities = prev.cities ?? [];
        const duration = prev.duration;
        if (!duration || cities.length < 2) return prev;

        const current = prev.cityDays ?? computeDefaultCityDays(cities, duration);
        const oldDays = current[index] ?? 1;
        const delta = newDays - oldDays;
        if (delta === 0) return prev;

        // Find adjacent entry to absorb the delta
        const adjacentIdx = index < cities.length - 1 ? index + 1 : index - 1;
        const adjacentOld = current[adjacentIdx] ?? 1;
        const adjacentNew = adjacentOld - delta;
        if (adjacentNew < 1 || newDays < 1) return prev;

        const next = [...current];
        next[index] = newDays;
        next[adjacentIdx] = adjacentNew;
        return { ...prev, cityDays: next };
      });
    },
    [setData],
  );

  // City reorder handler (manual drag) — moves both cities and cityDays together
  const handleCityReorder = useCallback(
    (newCities: CityId[], newCityDays?: number[]) => {
      setData((prev) => ({
        ...prev,
        cities: newCities,
        cityDays: newCityDays ?? prev.cityDays,
        regions: deriveRegionsFromCities(newCities),
        customCityOrder: true,
      }));
    },
    [setData],
  );

  // City remove handler (by index, redistributes days)
  const handleCityRemove = useCallback(
    (index: number) => {
      setData((prev) => {
        const oldCities = prev.cities ?? [];
        if (index < 0 || index >= oldCities.length) return prev;

        const cities = [...oldCities];
        cities.splice(index, 1);

        // Redistribute freed days to remaining entries
        let cityDays: number[] | undefined;
        if (prev.cityDays && cities.length >= 2) {
          cityDays = redistributeOnRemove(prev.cityDays, index);
        } else {
          cityDays = undefined;
        }

        // Check if duplicates exist — if so, keep customCityOrder
        const uniqueCities = new Set(cities);
        const hasDuplicates = uniqueCities.size < cities.length;

        return {
          ...prev,
          cities,
          regions: deriveRegionsFromCities(cities),
          customCityOrder: hasDuplicates || undefined,
          cityDays,
        };
      });
    },
    [setData],
  );

  // Duplicate a city — inserts a copy at index+1, steals 1 day from source
  const handleDuplicateCity = useCallback(
    (index: number) => {
      setData((prev) => {
        const oldCities = prev.cities ?? [];
        const duration = prev.duration;
        if (index < 0 || index >= oldCities.length || !duration) return prev;

        const current = prev.cityDays ?? computeDefaultCityDays(oldCities, duration);
        const sourceDays = current[index] ?? 1;
        if (sourceDays < 2) return prev; // Can't duplicate with only 1 day

        const cities = [...oldCities];
        cities.splice(index + 1, 0, oldCities[index]!);

        const cityDays = [...current];
        cityDays[index] = sourceDays - 1;
        cityDays.splice(index + 1, 0, 1);

        return {
          ...prev,
          cities,
          cityDays,
          regions: deriveRegionsFromCities(cities),
          customCityOrder: true,
        };
      });
    },
    [setData],
  );

  return (
    <div>
      <div className="flex flex-col gap-4">
        {/* Dates + Flights — paired side-by-side on desktop, stack on mobile */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SummaryItem
            icon={<Calendar className="h-4 w-4" />}
            label="Dates"
            value={
              formattedDates ? (
                <span>
                  {formattedDates}
                  {data.duration && (
                    <span className="ml-2 text-stone">
                      ({data.duration - 1} night{data.duration - 1 !== 1 ? "s" : ""})
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-stone">Not set</span>
              )
            }
            onEdit={onEditDates}
          />

          <SummaryItem
            icon={<Plane className="h-4 w-4" />}
            label="Flights"
            value={
              data.entryPoint ? (
                <div className="flex flex-col gap-0.5">
                  <span>
                    <span className="text-stone">In:</span>{" "}
                    {data.entryPoint.name}
                    <span className="ml-2 rounded-md bg-surface px-1.5 py-0.5 font-mono text-xs text-stone">
                      {data.entryPoint.iataCode}
                    </span>
                    {data.arrivalTime && (
                      <span className="ml-2 text-xs text-stone">
                        Landing {formatTime12h(data.arrivalTime)}
                      </span>
                    )}
                  </span>
                  <span>
                    <span className="text-stone">Out:</span>{" "}
                    {data.sameAsEntry !== false ? (
                      "Same airport"
                    ) : data.exitPoint ? (
                      <>
                        {data.exitPoint.name}
                        <span className="ml-2 rounded-md bg-surface px-1.5 py-0.5 font-mono text-xs text-stone">
                          {data.exitPoint.iataCode}
                        </span>
                      </>
                    ) : (
                      "Same airport"
                    )}
                    {data.departureTime && (
                      <span className="ml-2 text-xs text-stone">
                        Departing {formatTime12h(data.departureTime)}
                      </span>
                    )}
                  </span>
                </div>
              ) : (
                <span className="text-stone">Not set</span>
              )
            }
            onEdit={onEditEntryPoint}
          />
        </div>

        {/* Vibes */}
        <SummaryItem
          icon={<Palette className="h-4 w-4" />}
          label="Travel Style"
          value={
            vibeNames.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {vibeNames.map((name) => (
                  <span
                    key={name}
                    className="rounded-full bg-brand-primary/10 px-2.5 py-0.5 text-sm font-medium text-brand-primary"
                  >
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-stone">Not set</span>
            )
          }
          onEdit={onEditVibes}
        />

        {/* Destinations — reorderable inline with accommodation */}
        <SummaryItem
          icon={<MapPin className="h-4 w-4" />}
          label="Route & Stays"
          value={
            (data.cities ?? []).length > 0 ? (
              <>
                <SortableCityList
                  cities={data.cities ?? []}
                  onReorder={handleCityReorder}
                  onRemove={handleCityRemove}
                  cityDays={effectiveCityDays}
                  onDaysChange={handleDaysChange}
                  totalDays={data.duration}
                  onDuplicate={handleDuplicateCity}
                  renderAfterCity={
                    onAccommodationChange
                      ? (cityId) => (
                          <InlineAccommodationInput
                            cityId={cityId}
                            value={accommodations?.[cityId]}
                            onChange={(accom) => onAccommodationChange(cityId, accom)}
                          />
                        )
                      : undefined
                  }
                />
                {autoReturnNote && (
                  <p role="status" className="mt-2 text-xs text-foreground-secondary">
                    We added a night in {autoReturnNote.returnCityName} before your flight — {autoReturnNote.farCityName} is about {autoReturnNote.timeStr} from {autoReturnNote.airportName}, a rushed last morning otherwise. Adjust the route below if you&apos;d rather not.
                  </p>
                )}
                {departureWarning && !autoReturnNote && (
                  <p role="status" className="mt-2 text-xs text-warning">
                    {departureWarning.cityName} is about {departureWarning.timeStr} from {departureWarning.airportName}. Consider ending your trip in a city closer to your departure airport to keep your last day relaxed.
                  </p>
                )}
                {thinCityWarnings.map((w) => {
                  const reduceTo = Math.max(1, Math.floor(w.locationCount / 5));
                  return (
                    <p role="status" key={w.cityName} className="mt-2 text-xs text-warning">
                      {w.cityName} has {w.locationCount} places for {w.days} days. Your itinerary there may feel thin. Consider reducing to {reduceTo} day{reduceTo === 1 ? "" : "s"} or adding a nearby city as a day trip.
                    </p>
                  );
                })}
              </>
            ) : (
              <span className="text-stone">Not set</span>
            )
          }
          onEdit={onEditRegions}
        />
      </div>
    </div>
  );
}

type SummaryItemProps = {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  onEdit?: () => void;
};

function SummaryItem({ icon, label, value, onEdit }: SummaryItemProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-surface text-stone">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-stone">
            {label}
          </p>
          <div className="mt-1 text-sm text-foreground">{value}</div>
        </div>
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="link-reveal shrink-0 min-h-[44px] flex items-center px-2 text-xs text-stone hover:text-foreground-secondary"
        >
          Edit
        </button>
      )}
    </div>
  );
}

// --- Inline accommodation input for each city row ---

function InlineAccommodationInput({
  cityId,
  value,
  onChange,
}: {
  cityId: string;
  value?: AccommodationValue;
  onChange: (accom: AccommodationValue | undefined) => void;
}) {
  const [searchInput, setSearchInput] = useState("");
  const { suggestions, isLoading } = useMapboxSearch(
    searchInput ? `${searchInput} ${cityId} Japan` : ""
  );

  const handleSelect = useCallback(
    (suggestion: MapboxSuggestion) => {
      if (!suggestion.coordinates) return;
      onChange({
        name: suggestion.name,
        coordinates: suggestion.coordinates,
        placeId: suggestion.mapbox_id,
      });
      setSearchInput("");
    },
    [onChange]
  );

  // Filled state: compact pill
  if (value) {
    return (
      <div className="ml-6 mt-1 flex items-center gap-1.5">
        <Check className="h-3 w-3 shrink-0 text-sage" />
        <span className="truncate text-xs text-stone">{value.name}</span>
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="shrink-0 rounded-md p-0.5 text-stone transition-colors hover:text-foreground-secondary"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  // Empty state: compact search
  return (
    <div className="ml-6 mt-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-stone" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Hotel or address"
          className="h-8 w-full rounded-lg border-0 bg-transparent pl-7 pr-3 text-xs text-foreground placeholder:text-stone/60 focus:bg-surface focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
        />
        {isLoading && searchInput.length >= 3 && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-brand-primary border-t-transparent" />
          </div>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="mt-1 max-h-32 overflow-auto rounded-lg border border-border bg-background shadow-[var(--shadow-card)]">
          {suggestions.map((s) => (
            <button
              key={s.mapbox_id}
              type="button"
              onClick={() => handleSelect(s)}
              className="flex w-full cursor-pointer flex-col px-3 py-1.5 text-left hover:bg-surface"
            >
              <p className="text-xs font-medium text-foreground">{s.name}</p>
              {s.place_formatted && (
                <p className="text-[10px] text-stone">{s.place_formatted}</p>
              )}
            </button>
          ))}
        </div>
      )}
      {/* No-results state — once the user has typed enough and the search
          settled, an empty dropdown is indistinguishable from "still loading".
          Make it explicit. */}
      {searchInput.length >= 3 && !isLoading && suggestions.length === 0 && (
        <p role="status" className="mt-1 px-3 py-1.5 text-xs text-stone">
          No matches for &ldquo;{searchInput}&rdquo;.
        </p>
      )}
    </div>
  );
}
