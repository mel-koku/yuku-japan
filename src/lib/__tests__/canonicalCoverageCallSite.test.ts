/**
 * Call-site contract test for the canonical_for_personas force-include
 * layer (Direction 4, PR #197). Spies on `applyCanonicalCoverage` and
 * asserts that `generateItinerary` invokes it with the expected arguments
 * exactly when `personaId` is supplied.
 *
 * Pre-existing coverage:
 *   - `src/lib/selection/__tests__/canonicalCoverage.test.ts` — unit-tests
 *     `applyCanonicalCoverage` itself (13 cases).
 *   - `scripts/simulate-planner.test.ts` (gitignored) — 400-trip Supabase
 *     sim with `SIM_ASSERT=1` regression check, manual-only.
 *
 * Gap this file closes: the *call site* between `generateItinerary` and
 * `applyCanonicalCoverage`. Catches:
 *   - the `if (options?.personaId)` guard being removed or inverted
 *   - the call site being deleted or moved before the place loop
 *   - `DEFAULT_PER_CITY_CAP_BY_PERSONA["first-timer"]` losing its entry
 *   - `canonicalCoverageCap` override stopping being honored
 *
 * Why a spy and not an output assertion:
 *   An earlier draft of this file asserted that hand-picked canonicals
 *   landed in the produced itinerary. That test passed even when the layer
 *   was bypassed (`if (false && options?.personaId)`) — the picker's many
 *   fallback paths surfaced canonicals organically. A behavioral test of
 *   the layer's *effect* is what `scripts/simulate-planner.test.ts` runs
 *   against live data; that's the right tool for the empirical question.
 *   This file's job is the call-site contract, which a spy proves cleanly.
 *
 * Gap this file does NOT close (called out so future-you knows):
 *   - DB projection drop in `LOCATION_ITINERARY_COLUMNS`. We don't go
 *     through `fetchAllLocations`. If someone drops `canonical_for_personas`
 *     from the SELECT, this test still passes. The simulation harness in
 *     `scripts/` is the only thing that catches that.
 *   - Behavioral correctness of the swap layer itself — that's the unit
 *     test in `src/lib/selection/__tests__/canonicalCoverage.test.ts`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TripBuilderData } from "@/types/trip";
import type { Location } from "@/types/location";
import { generateItinerary } from "@/lib/itineraryGenerator";
import { applyCanonicalCoverage } from "@/lib/selection/canonicalCoverage";

vi.mock("@/lib/weather/weatherService", () => ({
  fetchWeatherForecast: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/selection/canonicalCoverage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/selection/canonicalCoverage")>();
  // Wrap the real implementation in a spy so the integration still runs
  // end-to-end while we observe call-site arguments.
  return {
    ...actual,
    applyCanonicalCoverage: vi.fn(actual.applyCanonicalCoverage),
  };
});

const mockedApply = vi.mocked(applyCanonicalCoverage);

// Minimal Tokyo-only fixture — just enough for `generateItinerary` to run
// without throwing. The picker's exact output doesn't matter here; we only
// observe whether `applyCanonicalCoverage` was called.
const TOKYO_FIXTURE: Location[] = [
  {
    id: "tokyo-temple-1", name: "Senso-ji",
    city: "Tokyo", region: "Kanto", category: "temple",
    image: "/test.jpg",
    coordinates: { lat: 35.7148, lng: 139.7967 },
    rating: 4.5, reviewCount: 25000,
    recommendedVisit: { typicalMinutes: 90, minMinutes: 45 },
    preferredTransitModes: ["subway"], timezone: "Asia/Tokyo",
    planningCity: "tokyo",
  },
  {
    id: "tokyo-shrine-1", name: "Meiji Jingu",
    city: "Tokyo", region: "Kanto", category: "shrine",
    image: "/test.jpg",
    coordinates: { lat: 35.6764, lng: 139.6993 },
    rating: 4.6, reviewCount: 20000,
    recommendedVisit: { typicalMinutes: 60, minMinutes: 30 },
    preferredTransitModes: ["train"], timezone: "Asia/Tokyo",
    planningCity: "tokyo",
  },
  {
    id: "tokyo-park-1", name: "Ueno Park",
    city: "Tokyo", region: "Kanto", category: "park",
    image: "/test.jpg",
    coordinates: { lat: 35.7141, lng: 139.7744 },
    rating: 4.4, reviewCount: 12000,
    recommendedVisit: { typicalMinutes: 90, minMinutes: 45 },
    preferredTransitModes: ["subway"], timezone: "Asia/Tokyo",
    planningCity: "tokyo",
  },
];

const TRIP: TripBuilderData = {
  duration: 3,
  dates: { start: "2026-09-14", end: "2026-09-16" },
  regions: ["kanto"],
  cities: ["tokyo"],
  vibes: ["temples_tradition"],
  style: "balanced",
};

describe("canonical_for_personas — generateItinerary call-site contract", () => {
  beforeEach(() => {
    mockedApply.mockClear();
  });

  it("invokes applyCanonicalCoverage with the persona's default cap when personaId is set", async () => {
    await generateItinerary(TRIP, {
      locations: TOKYO_FIXTURE,
      personaId: "first-timer",
    });

    expect(mockedApply).toHaveBeenCalledTimes(1);
    expect(mockedApply).toHaveBeenCalledWith(
      expect.objectContaining({
        personaId: "first-timer",
        // DEFAULT_PER_CITY_CAP_BY_PERSONA["first-timer"] is the load-bearing
        // editorial decision — 5 first-timer canonicals per major city.
        // If a future PR drops the cap to 0 (which would silently disable
        // force-include for all first-timer trips), this assertion fails.
        perCityCap: 5,
      }),
    );
  });

  it("does not invoke applyCanonicalCoverage when personaId is omitted (production runtime)", async () => {
    await generateItinerary(TRIP, {
      locations: TOKYO_FIXTURE,
      // personaId intentionally omitted — current production callers
    });

    expect(mockedApply).not.toHaveBeenCalled();
  });

  it("honors an explicit canonicalCoverageCap override over the persona default", async () => {
    await generateItinerary(TRIP, {
      locations: TOKYO_FIXTURE,
      personaId: "first-timer",
      canonicalCoverageCap: 2,
    });

    expect(mockedApply).toHaveBeenCalledTimes(1);
    expect(mockedApply).toHaveBeenCalledWith(
      expect.objectContaining({
        personaId: "first-timer",
        perCityCap: 2,
      }),
    );
  });
});
