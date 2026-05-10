/**
 * Call-site contract test for `fetchAllLocations` strict OR-fallback (Option D
 * from `docs/superpowers/handoffs/2026-05-10-locationservice-or-fallback-scope.md`).
 *
 * The contract this test asserts:
 *   When `cities` is non-empty, `fetchAllLocations` calls `.or(...)` with the
 *   STRICT shape — `planning_city` authoritative when set, `city.ilike` only
 *   inside an `and(planning_city.is.null, …)` clause.
 *
 *   STRICT:  or(planning_city.eq.kyoto,and(planning_city.is.null,city.ilike.kyoto))
 *   LOOSE:   or(planning_city.eq.kyoto,city.ilike.kyoto)             ← regressed
 *
 * Why a call-site spy and not an output-shape test:
 *   Per `feedback_test_must_fail_when_code_under_test_is_bypassed.md` (PR #198
 *   burn). An output-shape test on the picker can be satisfied by fallback
 *   paths — exactly the regression we'd be guarding against (a loose OR will
 *   *also* return rows). Asserting the SQL contract directly is what fails
 *   when the code is bypassed.
 *
 * Bypass-test verification (per same memory): if you replace the strict shape
 * with the loose `${planningFilters},${cityFilters}` form in
 * `locationService.ts:600-606`, the "strict" tests below MUST fail. Confirmed
 * during PR development.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

type FilterCall = [string, ...unknown[]];

let lastCall: { filters: FilterCall[] } | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    from: () => {
      const filters: FilterCall[] = [];
      const chain: Record<string, unknown> = {
        select: (cols: string) => {
          filters.push(["select", cols]);
          return chain;
        },
        eq: (col: string, val: unknown) => {
          filters.push(["eq", col, val]);
          return chain;
        },
        order: (col: string, opts: unknown) => {
          filters.push(["order", col, opts]);
          return chain;
        },
        or: (clause: string) => {
          filters.push(["or", clause]);
          return chain;
        },
        range: (from: number, to: number) => {
          filters.push(["range", from, to]);
          lastCall = { filters };
          // Return one row so fetchAllLocations doesn't throw on the
          // "no locations found" check, but stop pagination short.
          return Promise.resolve({
            data: [
              {
                id: "test-row-1",
                name: "Test",
                region: "Kanto",
                city: "Tokyo",
                planning_city: "tokyo",
                category: "temple",
                image: "/test.jpg",
                latitude: 35.7,
                longitude: 139.8,
                place_id: "p1",
                rating: 4.5,
                review_count: 100,
                is_active: true,
                is_accommodation: false,
              },
            ],
            error: null,
          });
        },
      };
      return chain;
    },
  })),
}));

import { fetchAllLocations } from "../locationService";

describe("fetchAllLocations strict OR-fallback", () => {
  beforeEach(() => {
    lastCall = null;
  });

  it("does not call .or() when no cities filter is provided", async () => {
    await fetchAllLocations({});
    const orCall = lastCall?.filters.find(([op]) => op === "or");
    expect(orCall).toBeUndefined();
  });

  it("calls .or() with strict shape for a single city", async () => {
    await fetchAllLocations({ cities: ["kyoto"] });
    const orCall = lastCall?.filters.find(([op]) => op === "or");
    expect(orCall).toBeDefined();
    const clause = orCall?.[1] as string;

    // Strict shape — planning_city authoritative, city.ilike INSIDE and(...)
    expect(clause).toBe(
      "planning_city.eq.kyoto,and(planning_city.is.null,city.ilike.kyoto)",
    );
  });

  it("calls .or() with strict shape for multiple cities", async () => {
    await fetchAllLocations({ cities: ["kyoto", "Osaka"] });
    const orCall = lastCall?.filters.find(([op]) => op === "or");
    const clause = orCall?.[1] as string;

    expect(clause).toBe(
      "planning_city.eq.kyoto,planning_city.eq.osaka,and(planning_city.is.null,city.ilike.kyoto),and(planning_city.is.null,city.ilike.Osaka)",
    );
  });

  it("regression: loose OR shape (no nested and) must NOT appear in clause", async () => {
    // Direct guard against the pre-Option-D shape. If someone reverts to
    // `${planningFilters},${cityFilters}` (loose), this assertion catches it.
    await fetchAllLocations({ cities: ["kyoto"] });
    const orCall = lastCall?.filters.find(([op]) => op === "or");
    const clause = orCall?.[1] as string;

    expect(clause).not.toBe("planning_city.eq.kyoto,city.ilike.kyoto");
    expect(clause).toContain("and(planning_city.is.null,city.ilike.kyoto)");
  });

  it("lowercases planning_city slug while preserving city literal casing", async () => {
    await fetchAllLocations({ cities: ["Kyoto"] });
    const orCall = lastCall?.filters.find(([op]) => op === "or");
    const clause = orCall?.[1] as string;

    // planning_city.eq is lowercased (slug semantics)
    expect(clause).toContain("planning_city.eq.kyoto");
    // city.ilike preserves call-site casing (postgres ilike is case-insensitive
    // anyway; we only assert we don't accidentally lowercase the literal)
    expect(clause).toContain("city.ilike.Kyoto");
  });
});
