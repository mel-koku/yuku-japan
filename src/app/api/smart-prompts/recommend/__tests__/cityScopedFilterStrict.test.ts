/**
 * Call-site contract test for the smart-prompts recommend route's city filter.
 *
 * Why this exists: the route's 5 gap-fill branches (add_meal, add_experience,
 * fill_long_gap, extend_day, diversify_categories) used to scope their
 * `locations` query with a bare `.ilike("city", cityId)`. But `cityId` is a
 * planner-hub slug (`day.cityId`, the `planning_city` namespace) — so the
 * bare filter could only ever match the subset of a hub whose admin `city`
 * column happens to equal the hub slug, dropping 47–122 rows per hub (YUK-60).
 *
 * As of the YUK-60 fix every branch routes through `cityScopedFilter`, which
 * emits the strict planner-picker `.or(...)` clause the main itinerary engine
 * (`locationService.fetchAllLocations`) and the refine route use:
 *   planning_city.eq.<slug> , and(planning_city.is.null,city.ilike.<slug>)
 *
 * Without this test a branch could silently drift back to bare `city.ilike`
 * while the others stay strict — a hidden per-branch behavior split.
 *
 * Bypass verification (must go red): in `route.ts`, revert a branch's
 * `.or(cityScopedFilter(cityId))` back to `.ilike("city", cityId)` and the
 * reverted branch emits no `.or()` arg containing `planning_city` — so its
 * `it(...)` case fails on a clean `AssertionError` (`expected [] to have a
 * length of 1`), not a thrown error. Each of the 5 branches was reverted in
 * isolation: doing so fails exactly the matching per-branch test (and, for
 * `add_meal`, the escape test, which also drives the `add_meal` branch).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/api/dailyQuota", () => ({
  checkDailyQuota: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/api/middleware", () => ({
  createRequestContext: vi.fn().mockReturnValue({
    requestId: "test-request-id",
    startTime: Date.now(),
  }),
  addRequestContextHeaders: vi.fn((response) => response),
  getOptionalAuth: vi.fn().mockResolvedValue({
    user: null,
    context: { requestId: "test-request-id" },
  }),
  requireJsonContentType: vi.fn().mockReturnValue(null),
}));

/** Every `.or()` arg seen by the locations query across one POST call. */
let orArgs: string[] = [];

/**
 * Self-returning Supabase chain stub. Records `.or()` args; every other
 * builder method (including `.ilike` — the pre-YUK-60 shape) returns the same
 * chain so call-order doesn't matter and a *reverted* branch still resolves
 * cleanly. The chain is awaitable (thenable) and resolves to an empty result
 * set — the route's branches short-circuit to a 404 on empty data, but only
 * *after* the `.or()` filters have been applied during query construction,
 * which is all this test asserts.
 *
 * `.ilike` is deliberately stubbed (not omitted): if a branch is reverted to
 * `.ilike("city", cityId)`, the call must succeed silently so the test fails
 * on the *assertion* (no `planning_city` `.or()` arg recorded) rather than on
 * a thrown TypeError from an unstubbed method.
 */
function makeChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  for (const method of ["select", "eq", "in", "neq", "not", "ilike", "order", "limit", "range"]) {
    chain[method] = ret;
  }
  chain.or = (arg: string) => {
    orArgs.push(arg);
    return chain;
  };
  // Awaiting the chain (or any builder call) resolves to an empty result.
  chain.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data: [], error: null });
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    from: () => makeChain(),
  })),
}));

import { POST } from "@/app/api/smart-prompts/recommend/route";

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/smart-prompts/recommend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** The `.or()` arg(s) that carry the city scope (vs the business_status `.or()`). */
function cityOrArgs(): string[] {
  return orArgs.filter((a) => a.includes("planning_city"));
}

const HUB = "kanazawa";
const baseBody = {
  cityId: HUB,
  tripBuilderData: { vibes: [], style: "balanced" },
  usedLocationIds: [],
};

describe("smart-prompts/recommend — strict planner-city filter (YUK-60)", () => {
  beforeEach(() => {
    orArgs = [];
  });

  it("add_meal branch emits the strict planning_city .or() clause", async () => {
    await POST(
      postRequest({
        ...baseBody,
        gap: { action: { type: "add_meal", mealType: "lunch", timeSlot: "afternoon" } },
      }),
    );
    expect(cityOrArgs()).toHaveLength(1);
    expect(cityOrArgs()[0]).toBe(
      "planning_city.eq.kanazawa,and(planning_city.is.null,city.ilike.kanazawa)",
    );
  });

  it("add_experience branch emits the strict planning_city .or() clause", async () => {
    await POST(
      postRequest({
        ...baseBody,
        gap: { action: { type: "add_experience", timeSlot: "morning" } },
      }),
    );
    expect(cityOrArgs()).toHaveLength(1);
    expect(cityOrArgs()[0]).toContain("planning_city.eq.kanazawa");
    expect(cityOrArgs()[0]).toContain("and(planning_city.is.null,city.ilike.kanazawa)");
  });

  it("fill_long_gap branch emits the strict planning_city .or() clause", async () => {
    await POST(
      postRequest({
        ...baseBody,
        gap: { action: { type: "fill_long_gap", gapMinutes: 120, timeSlot: "afternoon" } },
      }),
    );
    expect(cityOrArgs()).toHaveLength(1);
    expect(cityOrArgs()[0]).toContain("planning_city.eq.kanazawa");
    expect(cityOrArgs()[0]).toContain("and(planning_city.is.null,city.ilike.kanazawa)");
  });

  it("extend_day branch emits the strict planning_city .or() clause", async () => {
    await POST(
      postRequest({
        ...baseBody,
        gap: { action: { type: "extend_day", direction: "evening" } },
      }),
    );
    expect(cityOrArgs()).toHaveLength(1);
    expect(cityOrArgs()[0]).toContain("planning_city.eq.kanazawa");
    expect(cityOrArgs()[0]).toContain("and(planning_city.is.null,city.ilike.kanazawa)");
  });

  it("diversify_categories branch emits the strict planning_city .or() clause", async () => {
    await POST(
      postRequest({
        ...baseBody,
        gap: {
          action: {
            type: "diversify_categories",
            suggestedCategories: ["museum", "park"],
            timeSlot: "afternoon",
          },
        },
      }),
    );
    expect(cityOrArgs()).toHaveLength(1);
    expect(cityOrArgs()[0]).toContain("planning_city.eq.kanazawa");
    expect(cityOrArgs()[0]).toContain("and(planning_city.is.null,city.ilike.kanazawa)");
  });

  it("never emits a bare city.ilike clause (the pre-YUK-60 shape)", async () => {
    for (const action of [
      { type: "add_meal", mealType: "lunch", timeSlot: "afternoon" },
      { type: "add_experience", timeSlot: "morning" },
      { type: "fill_long_gap", gapMinutes: 120, timeSlot: "afternoon" },
      { type: "extend_day", direction: "evening" },
      { type: "diversify_categories", suggestedCategories: ["museum"], timeSlot: "afternoon" },
    ]) {
      orArgs = [];
      await POST(postRequest({ ...baseBody, gap: { action } }));
      // The city `.or()` arg must always wrap city.ilike inside the
      // planning_city-IS-NULL guard — never bare.
      for (const arg of cityOrArgs()) {
        expect(arg).not.toMatch(/(?<!planning_city\.is\.null,)city\.ilike\./);
      }
    }
  });
});

describe("cityScopedFilter — escapes PostgREST reserved characters", () => {
  // Direct unit test of the helper. `recommendRequestSchema.cityId` accepts
  // any string, so a `,` or `)` in the value must not break out of the
  // `.or()` filter expression.
  it("escapes a city slug that contains a reserved comma", async () => {
    // cityScopedFilter is module-private; exercise it via the route so the
    // test stays a black-box contract. A comma in cityId must appear
    // backslash-escaped in the emitted .or() arg, not as a raw separator.
    orArgs = [];
    await POST(
      postRequest({
        cityId: "a,b)c",
        tripBuilderData: { vibes: [], style: "balanced" },
        usedLocationIds: [],
        gap: { action: { type: "add_meal", mealType: "lunch", timeSlot: "afternoon" } },
      }),
    );
    const arg = cityOrArgs()[0] ?? "";
    expect(arg).toContain("planning_city.eq.a\\,b\\)c");
    expect(arg).toContain("city.ilike.a\\,b\\)c");
  });
});
