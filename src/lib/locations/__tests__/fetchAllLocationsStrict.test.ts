/**
 * Call-site contract test for the planner picker's OR-fallback strictness
 * (Option D, 2026-05-10). Spies on the Supabase `.or(...)` argument and
 * asserts it carries the strict `and(planning_city.is.null,city.ilike.X)`
 * shape — i.e. that `planning_city` is authoritative when set, with
 * `city.ilike` only firing for legacy NULL_PC rows.
 *
 * Why a filter-shape spy and not an output assertion:
 *   The picker has many fallback paths; an output-shape test on returned
 *   rows can pass even when this clause is bypassed. See the same lesson
 *   in `canonicalCoverageCallSite.test.ts`. This test fails the moment a
 *   future edit reverts the `.or(...)` clause to bare `city.ilike` — which
 *   is exactly the regression we're guarding against.
 *
 * Bypass verification: comment out the `and(planning_city.is.null,...)`
 * branch in `fetchAllLocations` (revert to bare `city.ilike.${c}`) and
 * confirm this test goes red. That's the contract: the strict shape MUST
 * appear in the OR clause when cities are filtered.
 *
 * Out of scope:
 *   - Behavioral effect of strictness on the picker output. That's tested
 *     end-to-end via `scripts/simulate-planner.test.ts` (gitignored sim).
 *   - The same contract on `refine/route.ts` local `fetchAllLocations`.
 *     Guarded by a parallel test at
 *     `src/app/api/itinerary/refine/__tests__/refineFetchAllLocationsStrict.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

let lastOrArg: string | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    from: () => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        or: (arg: string) => {
          lastOrArg = arg;
          return chain;
        },
        range: () =>
          Promise.resolve({
            // Single fixture row so the fetcher's "no locations found" guard
            // doesn't throw before we get to inspect the OR clause.
            data: [
              {
                id: "fixture-1",
                name: "Fixture",
                city: "Kyoto",
                region: "Kansai",
                category: "temple",
                image: "/x.jpg",
                latitude: 35,
                longitude: 135,
                rating: 4,
                review_count: 100,
                planning_city: "kyoto",
              },
            ],
            error: null,
          }),
      };
      return chain;
    },
  })),
}));

import { fetchAllLocations } from "../locationService";

describe("fetchAllLocations — strict planner picker (Option D, 2026-05-10)", () => {
  beforeEach(() => {
    lastOrArg = null;
  });

  it("emits the strict and(planning_city.is.null,city.ilike.X) clause when filtering by cities", async () => {
    await fetchAllLocations({ cities: ["kyoto"] });

    expect(lastOrArg).not.toBeNull();
    expect(lastOrArg).toContain("planning_city.eq.kyoto");
    // The contract: city-fallback MUST be wrapped in and(planning_city.is.null,...)
    // so it only matches rows where planning_city is unset. A bare `city.ilike.kyoto`
    // (the pre-2026-05-10 shape) means a regression to permissive semantics.
    expect(lastOrArg).toContain("and(planning_city.is.null,city.ilike.kyoto)");
    expect(lastOrArg).not.toMatch(/(?<!planning_city\.is\.null,)city\.ilike\.kyoto(?!\))/);
  });

  it("composes the same strict shape across multiple cities", async () => {
    await fetchAllLocations({ cities: ["kyoto", "osaka"] });

    expect(lastOrArg).toContain("planning_city.eq.kyoto");
    expect(lastOrArg).toContain("planning_city.eq.osaka");
    expect(lastOrArg).toContain("and(planning_city.is.null,city.ilike.kyoto)");
    expect(lastOrArg).toContain("and(planning_city.is.null,city.ilike.osaka)");
  });

  it("lower-cases planning_city values but preserves city.ilike casing for diacritic-safe match", async () => {
    await fetchAllLocations({ cities: ["Kyoto"] });

    expect(lastOrArg).toContain("planning_city.eq.kyoto");
    expect(lastOrArg).toContain("and(planning_city.is.null,city.ilike.Kyoto)");
  });

  it("does not call .or(...) when no cities filter is supplied", async () => {
    await fetchAllLocations();
    expect(lastOrArg).toBeNull();
  });
});
