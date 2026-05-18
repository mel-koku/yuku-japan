"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import { PlaneLanding, PlaneTakeoff } from "lucide-react";

import { useTripBuilder } from "@/context/TripBuilderContext";
import { cn } from "@/lib/cn";
import { typography } from "@/lib/typography-system";
import { easeReveal } from "@/lib/motion";
import type { EntryPoint, KnownRegionId } from "@/types/trip";
import type { Airport } from "@/app/api/airports/route";
import { logger } from "@/lib/logger";
import { JAPAN_MAP_VIEWBOX, ALL_PREFECTURE_PATHS } from "@/data/japanMapPaths";
import type { TripBuilderConfig } from "@/types/sanitySiteContent";
import { computeEffectiveArrivalStart, computeEffectiveDepartureEnd } from "@/lib/utils/airportBuffer";
import { formatTime12h } from "@/lib/utils/timeUtils";
import { parseFlightDetails, formatParsedFlight } from "@/lib/utils/flightParser";
import { AirportSearch } from "./AirportSearch";
import { FlightPasteSection } from "./FlightPasteSection";
import { TimePickerSection } from "./TimePickerSection";

const TOP_AIRPORT_CODES = ["HND", "NRT", "KIX", "CTS", "FUK", "NGO"];

/** Fallback lookup for manual IATA entry when the airport API is unavailable. */
const FALLBACK_AIRPORTS: Record<string, { name: string; city: string; region: KnownRegionId; lat: number; lng: number }> = {
  HND: { name: "Tokyo Haneda Airport", city: "tokyo", region: "kanto", lat: 35.5494, lng: 139.7798 },
  NRT: { name: "Narita International Airport", city: "tokyo", region: "kanto", lat: 35.7647, lng: 140.3864 },
  KIX: { name: "Kansai International Airport", city: "osaka", region: "kansai", lat: 34.4347, lng: 135.2441 },
  ITM: { name: "Osaka Itami Airport", city: "osaka", region: "kansai", lat: 34.7854, lng: 135.4383 },
  CTS: { name: "New Chitose Airport", city: "sapporo", region: "hokkaido", lat: 42.7752, lng: 141.6925 },
  FUK: { name: "Fukuoka Airport", city: "fukuoka", region: "kyushu", lat: 33.5859, lng: 130.4511 },
  NGO: { name: "Chubu Centrair Airport", city: "nagoya", region: "chubu", lat: 34.8584, lng: 136.8124 },
  OKA: { name: "Naha Airport", city: "naha", region: "okinawa", lat: 26.1958, lng: 127.6459 },
  HIJ: { name: "Hiroshima Airport", city: "hiroshima", region: "chugoku", lat: 34.4361, lng: 132.9194 },
  SDJ: { name: "Sendai Airport", city: "sendai", region: "tohoku", lat: 38.1397, lng: 140.9170 },
  KMJ: { name: "Kumamoto Airport", city: "kumamoto", region: "kyushu", lat: 32.8373, lng: 130.8551 },
  KOJ: { name: "Kagoshima Airport", city: "kagoshima", region: "kyushu", lat: 31.8034, lng: 130.7194 },
  TAK: { name: "Takamatsu Airport", city: "takamatsu", region: "shikoku", lat: 34.2142, lng: 134.0156 },
  MYJ: { name: "Matsuyama Airport", city: "matsuyama", region: "shikoku", lat: 33.8272, lng: 132.6997 },
  KMQ: { name: "Komatsu Airport", city: "kanazawa", region: "chubu", lat: 36.3946, lng: 136.4069 },
};

export type EntryPointStepProps = {
  sanityConfig?: TripBuilderConfig;
};

export function EntryPointStep({ sanityConfig }: EntryPointStepProps) {
  const { data, setData } = useTripBuilder();
  const [airports, setAirports] = useState<Airport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [exitSearchQuery, setExitSearchQuery] = useState("");
  const [showFlightPaste, setShowFlightPaste] = useState(false);
  const [flightPasteText, setFlightPasteText] = useState("");
  const [flightParseMessage, setFlightParseMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [manualCodeError, setManualCodeError] = useState<string | null>(null);

  const fetchAirports = useCallback(async () => {
    try {
      setIsLoading(true);
      setFetchError(false);
      const response = await fetch("/api/airports");
      if (!response.ok) throw new Error("Failed to fetch airports");
      const result = await response.json();
      setAirports(result.data || []);
    } catch (error) {
      logger.error("Error fetching airports", error instanceof Error ? error : new Error(String(error)));
      setFetchError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAirports();
  }, [fetchAirports]);

  const handleSelectAirport = useCallback(
    (airport: Airport) => {
      const entryPoint: EntryPoint = {
        type: "airport",
        id: airport.id,
        name: airport.name,
        coordinates: airport.coordinates,
        iataCode: airport.iataCode,
        cityId: airport.city.toLowerCase(),
        region: airport.region.toLowerCase() as KnownRegionId,
      };
      setData((prev) => ({ ...prev, entryPoint }));
      setSearchQuery("");
    },
    [setData]
  );

  const handleClear = useCallback(() => {
    setData((prev) => ({ ...prev, entryPoint: undefined, exitPoint: undefined, sameAsEntry: undefined, arrivalTime: undefined, departureTime: undefined }));
  }, [setData]);

  const handleManualCodeChange = useCallback((value: string) => {
    const upper = value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
    setManualCode(upper);
    setManualCodeError(null);
  }, []);

  const handleManualCodeSubmit = useCallback(() => {
    if (manualCode.length !== 3) {
      setManualCodeError("Enter a 3-letter IATA code.");
      return;
    }
    const fallback = FALLBACK_AIRPORTS[manualCode];
    if (!fallback) {
      setManualCodeError(`${manualCode} is not a recognized Japanese airport code.`);
      return;
    }
    const entryPoint: EntryPoint = {
      type: "airport",
      id: `fallback-${manualCode.toLowerCase()}`,
      name: fallback.name,
      coordinates: { lat: fallback.lat, lng: fallback.lng },
      iataCode: manualCode,
      cityId: fallback.city,
      region: fallback.region,
    };
    setData((prev) => ({ ...prev, entryPoint }));
    setManualCode("");
    setManualCodeError(null);
  }, [manualCode, setData]);

  const handleSelectExitAirport = useCallback(
    (airport: Airport) => {
      const exitPoint: EntryPoint = {
        type: "airport",
        id: airport.id,
        name: airport.name,
        coordinates: airport.coordinates,
        iataCode: airport.iataCode,
        cityId: airport.city.toLowerCase(),
        region: airport.region.toLowerCase() as KnownRegionId,
      };
      setData((prev) => ({ ...prev, exitPoint, sameAsEntry: false }));
      setExitSearchQuery("");
    },
    [setData],
  );

  const handleToggleSameAsEntry = useCallback(
    (same: boolean) => {
      setData((prev) => ({
        ...prev,
        sameAsEntry: same,
        exitPoint: same ? undefined : prev.exitPoint,
      }));
      setExitSearchQuery("");
    },
    [setData],
  );

  const handleClearExit = useCallback(() => {
    setData((prev) => ({ ...prev, exitPoint: undefined, sameAsEntry: false }));
  }, [setData]);

  const handleArrivalTimeChange = useCallback(
    (time: string | undefined) => {
      setData((prev) => ({ ...prev, arrivalTime: time }));
    },
    [setData],
  );

  const handleDepartureTimeChange = useCallback(
    (time: string | undefined) => {
      setData((prev) => ({ ...prev, departureTime: time }));
    },
    [setData],
  );

  const handleFlightParse = useCallback(() => {
    if (!flightPasteText.trim()) return;
    const result = parseFlightDetails(flightPasteText, airports);
    const parts: string[] = [];

    if (result.arrival) {
      // Auto-select airport if matched
      if (result.arrival.iataCode) {
        const matchedAirport = airports.find((a) => a.iataCode === result.arrival!.iataCode);
        if (matchedAirport) {
          handleSelectAirport(matchedAirport);
        }
      }
      // Set arrival time
      if (result.arrival.time) {
        setData((prev) => ({ ...prev, arrivalTime: result.arrival!.time }));
      }
      // Store flight details
      if (result.arrival.airline || result.arrival.flightNumber) {
        setData((prev) => ({
          ...prev,
          flightDetails: {
            ...prev.flightDetails,
            arrival: {
              airline: result.arrival!.airline,
              flightNumber: result.arrival!.flightNumber,
            },
          },
        }));
      }
      parts.push(formatParsedFlight(result.arrival, "arrival"));
    }

    if (result.departure) {
      // Set departure time
      if (result.departure.time) {
        setData((prev) => ({ ...prev, departureTime: result.departure!.time }));
      }
      // Set exit airport if different from arrival
      if (result.departure.iataCode && result.departure.iataCode !== result.arrival?.iataCode) {
        const exitAirport = airports.find((a) => a.iataCode === result.departure!.iataCode);
        if (exitAirport) {
          handleSelectExitAirport(exitAirport);
        }
      }
      // Store flight details
      if (result.departure.airline || result.departure.flightNumber) {
        setData((prev) => ({
          ...prev,
          flightDetails: {
            ...prev.flightDetails,
            departure: {
              airline: result.departure!.airline,
              flightNumber: result.departure!.flightNumber,
            },
          },
        }));
      }
      parts.push(formatParsedFlight(result.departure, "departure"));
    }

    if (parts.length > 0) {
      setFlightParseMessage({ type: "success", text: `Found: ${parts.join(" | ")}` });
      setShowFlightPaste(false);
      setFlightPasteText("");
    } else {
      setFlightParseMessage({ type: "error", text: "Couldn\u2019t detect flight info. Try entering manually." });
    }
  }, [flightPasteText, airports, handleSelectAirport, handleSelectExitAirport, setData]);

  const arrivalHint = useMemo(() => {
    const effective = computeEffectiveArrivalStart(data.arrivalTime, data.entryPoint?.iataCode);
    if (!effective) return null;
    const hh = Number(effective.split(":")[0]);
    if (hh >= 20) return "Day 1 is arrival day. Grab dinner and settle in";
    if (hh >= 18) return "Just enough time for dinner near your hotel";
    return `First activity starts around ${formatTime12h(effective)}`;
  }, [data.arrivalTime, data.entryPoint?.iataCode]);

  const departureHint = useMemo(() => {
    const exitIata = data.sameAsEntry !== false
      ? data.entryPoint?.iataCode
      : (data.exitPoint?.iataCode ?? data.entryPoint?.iataCode);
    const effective = computeEffectiveDepartureEnd(data.departureTime, exitIata);
    if (!effective) return null;
    return formatTime12h(effective);
  }, [data.departureTime, data.entryPoint?.iataCode, data.exitPoint?.iataCode, data.sameAsEntry]);

  const topAirports = useMemo(() => {
    return TOP_AIRPORT_CODES
      .map((code) => airports.find((a) => a.iataCode === code))
      .filter((a): a is Airport => a !== undefined);
  }, [airports]);

  const filteredAirports = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return airports
      .filter(
        (airport) =>
          airport.name.toLowerCase().includes(query) ||
          airport.city.toLowerCase().includes(query) ||
          airport.iataCode.toLowerCase().includes(query) ||
          airport.shortName.toLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [airports, searchQuery]);

  const filteredExitAirports = useMemo(() => {
    if (!exitSearchQuery.trim()) return [];
    const query = exitSearchQuery.toLowerCase();
    return airports
      .filter(
        (airport) =>
          airport.name.toLowerCase().includes(query) ||
          airport.city.toLowerCase().includes(query) ||
          airport.iataCode.toLowerCase().includes(query) ||
          airport.shortName.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [airports, exitSearchQuery]);

  const sameAsEntry = data.sameAsEntry !== false;

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      {/* Left (60%) — Japan map area with selected airport display */}
      <div className="relative flex items-center justify-center overflow-hidden bg-surface/30 px-8 py-4 lg:w-[60%] lg:py-0">
        <div className="relative w-full max-w-lg">
          {/* SVG Japan Map with airport markers */}
          <JapanSilhouette
            airports={airports}
            topAirportCodes={TOP_AIRPORT_CODES}
            selectedAirport={data.entryPoint}
            selectedExitAirport={!sameAsEntry ? data.exitPoint : undefined}
            onSelectAirport={handleSelectAirport}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Right (40%) — Airport selection */}
      <div className="flex flex-1 flex-col px-6 py-8 lg:w-[40%] lg:justify-center lg:pl-6 lg:pr-12">
        <div className="w-full max-w-md">
          <p className="eyebrow-editorial text-brand-primary">
            STEP 02
          </p>

          <m.h2
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: easeReveal, delay: 0.15 }}
            className={cn(typography({ intent: "editorial-h2" }), "tracking-tight")}
          >
            {sanityConfig?.entryPointHeading ?? "Where will you land?"}
          </m.h2>

          <p className="mt-2 text-sm text-stone">
            {sanityConfig?.entryPointDescription ?? "Optional. We\u2019ll route from there."}
          </p>

          {/* Selected airport display */}
          <AnimatePresence mode="wait">
            {data.entryPoint && (
              <m.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-6 rounded-lg border border-accent/30 bg-accent/5 p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/20 text-accent">
                      <PlaneLanding className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{data.entryPoint.name}</p>
                      <p className="font-mono text-xs text-accent">{data.entryPoint.iataCode}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="rounded-md px-4 py-2 text-xs text-stone hover:bg-surface hover:text-foreground-secondary"
                  >
                    {sanityConfig?.entryPointChangeText ?? "Change"}
                  </button>
                </div>

                {/* Arrival time */}
                <div className="mt-3 border-t border-accent/10 pt-3">
                  <TimePickerSection
                    label="Landing at"
                    value={data.arrivalTime}
                    onChange={handleArrivalTimeChange}
                    onClear={() => setData((prev) => ({ ...prev, arrivalTime: undefined }))}
                    hint={arrivalHint}
                  />
                </div>
              </m.div>
            )}
          </AnimatePresence>

          {/* Departure airport section — shown after entry point is selected */}
          <AnimatePresence>
            {data.entryPoint && (
              <m.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: easeReveal }}
                className="overflow-hidden"
              >
                <div className="mt-6">
                  <p className="text-xs font-medium uppercase tracking-wide text-stone">
                    Departure
                  </p>

                  {/* Toggle buttons */}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleSameAsEntry(true)}
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all",
                        sameAsEntry
                          ? "border-accent/30 bg-accent/5 text-accent"
                          : "border-border bg-background text-stone hover:border-accent/20 hover:text-foreground-secondary",
                      )}
                    >
                      Same airport
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleSameAsEntry(false)}
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all",
                        !sameAsEntry
                          ? "border-accent/30 bg-accent/5 text-accent"
                          : "border-border bg-background text-stone hover:border-accent/20 hover:text-foreground-secondary",
                      )}
                    >
                      Different airport
                    </button>
                  </div>

                  {/* Exit airport selection — only when "Different" is chosen */}
                  <AnimatePresence>
                    {!sameAsEntry && (
                      <m.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: easeReveal }}
                        className="overflow-hidden"
                      >
                        {data.exitPoint ? (
                          <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/20 text-accent">
                                  <PlaneTakeoff className="h-5 w-5" />
                                </div>
                                <div>
                                  <p className="font-medium text-foreground">{data.exitPoint.name}</p>
                                  <p className="font-mono text-xs text-accent">{data.exitPoint.iataCode}</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={handleClearExit}
                                className="rounded-md px-4 py-2 text-xs text-stone hover:bg-surface hover:text-foreground-secondary"
                              >
                                Change
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3">
                            <AirportSearch
                              searchQuery={exitSearchQuery}
                              onSearchQueryChange={setExitSearchQuery}
                              filteredAirports={filteredExitAirports}
                              topAirports={topAirports}
                              onSelectAirport={handleSelectExitAirport}
                              placeholder="Search departure airport..."
                            />
                          </div>
                        )}
                      </m.div>
                    )}
                  </AnimatePresence>

                  {/* Departure time */}
                  <div className="mt-4">
                    <TimePickerSection
                      label="Departing at"
                      value={data.departureTime}
                      onChange={handleDepartureTimeChange}
                      onClear={() => setData((prev) => ({ ...prev, departureTime: undefined }))}
                      hint={departureHint}
                      hintPrefix="Last activity wraps up around "
                    />
                  </div>
                </div>
              </m.div>
            )}
          </AnimatePresence>

          {/* Flight paste + Airport search + cards grid */}
          {!data.entryPoint && !isLoading && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-5"
            >
              <FlightPasteSection
                showFlightPaste={showFlightPaste}
                onToggleFlightPaste={() => {
                  setShowFlightPaste((v) => !v);
                  setFlightParseMessage(null);
                }}
                flightPasteText={flightPasteText}
                onFlightPasteTextChange={setFlightPasteText}
                flightParseMessage={flightParseMessage}
                onClearParseMessage={() => setFlightParseMessage(null)}
                onFlightParse={handleFlightParse}
              />

              <AirportSearch
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                filteredAirports={filteredAirports}
                topAirports={topAirports}
                onSelectAirport={handleSelectAirport}
                placeholder={sanityConfig?.entryPointSearchPlaceholder ?? "Search by name, city, or code..."}
                popularLabel={sanityConfig?.entryPointPopularLabel ?? "Popular airports"}
                noResultsText={sanityConfig?.entryPointNoResults ?? "No airports found"}
                popularLabelClassName="mb-2 mt-4"
              />
            </m.div>
          )}

          {isLoading && (
            <div className="mt-8 flex items-center gap-2 text-stone">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
              <span className="text-sm">Loading airports...</span>
            </div>
          )}

          {fetchError && !isLoading && airports.length === 0 && (
            <div className="mt-8 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-error">Couldn&apos;t load airports.</span>
                <button
                  type="button"
                  onClick={fetchAirports}
                  className="text-sm font-medium text-brand-primary hover:underline"
                >
                  Retry
                </button>
              </div>

              <div className="rounded-lg bg-surface p-4 shadow-[var(--shadow-card)]">
                <label htmlFor="manual-iata" className="mb-2 block text-sm font-medium text-foreground">
                  Or enter your airport code
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="manual-iata"
                    type="text"
                    inputMode="text"
                    autoCapitalize="characters"
                    maxLength={3}
                    value={manualCode}
                    onChange={(e) => handleManualCodeChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleManualCodeSubmit(); }}
                    placeholder="NRT"
                    aria-describedby={manualCodeError ? "manual-iata-error" : undefined}
                    aria-invalid={!!manualCodeError}
                    className={cn(
                      "h-12 w-24 rounded-md border bg-background px-3 text-center font-mono text-lg uppercase tracking-widest text-foreground placeholder:text-foreground-secondary/40",
                      "text-base focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1",
                      manualCodeError ? "border-error" : "border-border"
                    )}
                  />
                  <button
                    type="button"
                    onClick={handleManualCodeSubmit}
                    disabled={manualCode.length !== 3}
                    className={cn(
                      "h-12 rounded-md px-4 text-sm font-medium transition-colors",
                      manualCode.length === 3
                        ? "bg-brand-primary text-white hover:bg-brand-secondary active:scale-[0.98]"
                        : "bg-border text-foreground-secondary cursor-not-allowed"
                    )}
                  >
                    Set airport
                  </button>
                </div>
                {manualCodeError && (
                  <p id="manual-iata-error" className="mt-2 text-sm text-error" role="alert">
                    {manualCodeError}
                  </p>
                )}
                <p className="mt-2 text-xs text-stone">
                  Common codes: HND (Haneda), NRT (Narita), KIX (Kansai), CTS (Chitose), FUK (Fukuoka), NGO (Centrair)
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Convert lat/lng to SVG viewBox coordinates (0 0 438 516).
 * Approximate linear transform calibrated against known airport positions.
 */
function coordsToSvg(lat: number, lng: number): { x: number; y: number } {
  return {
    x: 18.65 * lng - 2297.7,
    y: -23.49 * lat + 1087.4,
  };
}

/**
 * Japan silhouette SVG with ALL airport markers.
 */
type JapanSilhouetteProps = {
  airports: Airport[];
  topAirportCodes: string[];
  selectedAirport?: EntryPoint;
  selectedExitAirport?: EntryPoint;
  onSelectAirport: (airport: Airport) => void;
  isLoading: boolean;
};

const BASE_VB = { x: 0, y: 0, w: 438, h: 516 };
const MAX_ZOOM = 3;
const ZOOM_LABEL_THRESHOLD = 1.4; // Show all IATA codes at 1.4x+ zoom

function JapanSilhouette({
  airports,
  topAirportCodes,
  selectedAirport,
  selectedExitAirport,
  onSelectAirport,
  isLoading,
}: JapanSilhouetteProps) {
  const topSet = useMemo(() => new Set(topAirportCodes), [topAirportCodes]);
  const [hoveredAirport, setHoveredAirport] = useState<{ iataCode: string; name: string; x: number; y: number } | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const isZoomedRef = useRef(false);

  // ── Zoom / pan (ref-based — no re-renders during interaction) ──
  const svgRef = useRef<SVGSVGElement>(null);
  const vb = useRef({ ...BASE_VB });
  const isPanning = useRef(false);
  const panOrigin = useRef({ x: 0, y: 0 });
  const didDrag = useRef(false);

  const clampVB = useCallback(
    (x: number, y: number, w: number, h: number) => ({
      x: Math.max(0, Math.min(x, BASE_VB.w - w)),
      y: Math.max(0, Math.min(y, BASE_VB.h - h)),
      w,
      h,
    }),
    []
  );

  const applyVB = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const v = vb.current;
    svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
    const zoomed = v.w < BASE_VB.w - 1;
    svg.style.cursor = zoomed
      ? isPanning.current
        ? "grabbing"
        : "grab"
      : "";
    // Reveal all IATA labels when zoomed past threshold
    const nowZoomed = v.w < BASE_VB.w / ZOOM_LABEL_THRESHOLD;
    if (nowZoomed !== isZoomedRef.current) {
      isZoomedRef.current = nowZoomed;
      setIsZoomed(nowZoomed);
    }
  }, []);

  // Wheel zoom — { passive: false } to allow preventDefault
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = svg.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top) / rect.height;
      const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
      let nw = vb.current.w * factor;
      let nh = vb.current.h * factor;
      if (nw >= BASE_VB.w) {
        nw = BASE_VB.w;
        nh = BASE_VB.h;
      }
      if (nw < BASE_VB.w / MAX_ZOOM) {
        nw = BASE_VB.w / MAX_ZOOM;
        nh = BASE_VB.h / MAX_ZOOM;
      }
      vb.current = clampVB(
        vb.current.x + (vb.current.w - nw) * mx,
        vb.current.y + (vb.current.h - nh) * my,
        nw,
        nh
      );
      applyVB();
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [clampVB, applyVB]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      isPanning.current = true;
      didDrag.current = false;
      panOrigin.current = { x: e.clientX, y: e.clientY };
    },
    []
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isPanning.current) return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx =
        ((e.clientX - panOrigin.current.x) / rect.width) * vb.current.w;
      const dy =
        ((e.clientY - panOrigin.current.y) / rect.height) * vb.current.h;
      panOrigin.current = { x: e.clientX, y: e.clientY };
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag.current = true;
      vb.current = clampVB(
        vb.current.x - dx,
        vb.current.y - dy,
        vb.current.w,
        vb.current.h
      );
      applyVB();
    },
    [clampVB, applyVB]
  );

  const onPointerUp = useCallback(() => {
    isPanning.current = false;
    applyVB();
  }, [applyVB]);

  const onDblClick = useCallback(() => {
    vb.current = { ...BASE_VB };
    applyVB();
  }, [applyVB]);

  return (
    <div className="relative h-full w-full" style={{ maxHeight: "calc(100dvh - 14rem)" }}>
      <svg
        ref={svgRef}
        viewBox={JAPAN_MAP_VIEWBOX}
        className="h-full w-full"
        aria-hidden
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onDoubleClick={onDblClick}
      >
        {/* Proper Japan map — all prefecture outlines */}
        {ALL_PREFECTURE_PATHS.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.8"
            className="text-foreground"
            opacity="0.15"
          />
        ))}
        {!isLoading &&
          airports.map((airport) => {
            if (!airport.coordinates?.lat || !airport.coordinates?.lng) return null;
            const pos = coordsToSvg(airport.coordinates.lat, airport.coordinates.lng);
            // Skip if outside viewBox bounds
            if (pos.x < 0 || pos.x > 438 || pos.y < 0 || pos.y > 516) return null;

            const isSelected = selectedAirport?.iataCode === airport.iataCode;
            const isExitSelected = selectedExitAirport?.iataCode === airport.iataCode;
            const isTop = topSet.has(airport.iataCode);
            const showLabel = isSelected || isExitSelected || isTop || isZoomed;

            return (
              <g key={airport.iataCode} className="cursor-pointer">
                {/* Pulse ring for selected entry */}
                {isSelected && (
                  <m.circle
                    cx={pos.x}
                    cy={pos.y}
                    r={12}
                    fill="none"
                    className="stroke-sage"
                    strokeWidth="1.5"
                    initial={{ r: 6, opacity: 0.6 }}
                    animate={{ r: 14, opacity: 0 }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}

                {/* Pulse ring for selected exit */}
                {isExitSelected && !isSelected && (
                  <m.circle
                    cx={pos.x}
                    cy={pos.y}
                    r={12}
                    fill="none"
                    className="stroke-brand-primary"
                    strokeWidth="1.5"
                    initial={{ r: 6, opacity: 0.6 }}
                    animate={{ r: 14, opacity: 0 }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}

                {/* Click target (larger invisible circle). The map is a
                    pointer-only visual aid — its parent <svg> is aria-hidden,
                    and the AirportSearch input is the keyboard/screen-reader
                    path to the same airports. So this target carries no
                    role/tabIndex/aria-label: a focusable element inside an
                    aria-hidden subtree would trap keyboard users on an
                    element their screen reader cannot announce. */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={10}
                  fill="transparent"
                  className="cursor-pointer"
                  onClick={() => { if (!didDrag.current) onSelectAirport(airport); }}
                  onMouseEnter={() => setHoveredAirport({ iataCode: airport.iataCode, name: airport.shortName, x: pos.x, y: pos.y })}
                  onMouseLeave={() => setHoveredAirport(null)}
                />

                {/* Marker dot */}
                <m.circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isSelected || isExitSelected ? 5 : isTop ? 3.5 : 2}
                  className={cn(
                    "cursor-pointer transition-colors",
                    isSelected
                      ? "fill-sage"
                      : isExitSelected
                        ? "fill-brand-primary"
                        : isTop
                          ? "fill-brand-primary"
                          : "fill-brand-primary/50"
                  )}
                  whileHover={{ scale: 1.5 }}
                  style={{ pointerEvents: "none" }}
                />

                {/* IATA label — shown for top airports and selected */}
                {showLabel && (
                  <text
                    x={pos.x + (pos.x > 320 ? -5 : 7)}
                    y={pos.y + 3}
                    className={cn(
                      "cursor-pointer font-mono text-[8px]",
                      isSelected
                        ? "fill-sage font-bold"
                        : isExitSelected
                          ? "fill-brand-primary font-bold"
                          : "fill-foreground-secondary"
                    )}
                    textAnchor={pos.x > 320 ? "end" : "start"}
                    onClick={() => { if (!didDrag.current) onSelectAirport(airport); }}
                  >
                    {airport.iataCode}
                  </text>
                )}
              </g>
            );
          })}
        {hoveredAirport && selectedAirport?.iataCode !== hoveredAirport.iataCode && (
          <text
            x={hoveredAirport.x + (hoveredAirport.x > 320 ? -5 : 7)}
            y={hoveredAirport.y + (topSet.has(hoveredAirport.iataCode) ? 13 : 3)}
            className="pointer-events-none font-mono text-[8px] fill-foreground-secondary"
            textAnchor={hoveredAirport.x > 320 ? "end" : "start"}
          >
            {hoveredAirport.name}
          </text>
        )}
      </svg>
    </div>
  );
}
