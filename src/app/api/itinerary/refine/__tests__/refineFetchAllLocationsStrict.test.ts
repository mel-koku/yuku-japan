/**
 * Call-site contract test for refine route's local `fetchAllLocations` —
 * the parallel guard to `src/lib/locations/__tests__/fetchAllLocationsStrict.test.ts`.
 *
 * Why this exists: the refine route has its OWN local `fetchAllLocations`
 * (separate from `locationService.fetchAllLocations`). Pre-2026-05-10 it used
 * bare `city.ilike.X` with no `planning_city` clause at all — the most legacy
 * shape on the planner call-graph. As of the Option D bundle (this PR) it
 * mirrors the strict-with-NULL-fallback shape the central function uses.
 *
 * Without this test, refine could silently drift back to permissive
 * semantics while the central function stays strict — the exact "hidden
 * behavior split" the PR was bundled to prevent.
 *
 * Bypass verification: revert the `.or(...)` clause in
 * `src/app/api/itinerary/refine/route.ts:fetchAllLocations` to
 * `cities.map((c) => `city.ilike.${escapePostgrestValue(c)}`).join(",")`
 * and confirm this test goes red.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
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
            // Single fixture row to clear the "no locations found" guard.
            // Fields match what `transformDbRowToLocation` reads via
            // `LOCATION_ITINERARY_COLUMNS`; minimal-but-sufficient shape.
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

import { fetchAllLocations } from "@/app/api/itinerary/refine/route";

describe("refine route fetchAllLocations — strict planner picker (Option D, 2026-05-10)", () => {
  beforeEach(() => {
    lastOrArg = null;
  });

  it("emits the strict and(planning_city.is.null,city.ilike.X) clause when filtering by cities", async () => {
    await fetchAllLocations(["kyoto"]);

    expect(lastOrArg).not.toBeNull();
    expect(lastOrArg).toContain("planning_city.eq.kyoto");
    expect(lastOrArg).toContain("and(planning_city.is.null,city.ilike.kyoto)");
    // Reject regression to bare city.ilike — the pre-2026-05-10 shape.
    expect(lastOrArg).not.toMatch(/(?<!planning_city\.is\.null,)city\.ilike\.kyoto(?!\))/);
  });

  it("composes the strict shape across multiple cities", async () => {
    await fetchAllLocations(["kyoto", "osaka"]);

    expect(lastOrArg).toContain("planning_city.eq.kyoto");
    expect(lastOrArg).toContain("planning_city.eq.osaka");
    expect(lastOrArg).toContain("and(planning_city.is.null,city.ilike.kyoto)");
    expect(lastOrArg).toContain("and(planning_city.is.null,city.ilike.osaka)");
  });

  it("does not call .or(...) when no cities filter is supplied", async () => {
    await fetchAllLocations();
    expect(lastOrArg).toBeNull();
  });
});
