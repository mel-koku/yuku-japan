import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only (no-op in test)
vi.mock("server-only", () => ({}));

// Mock location fetchers
vi.mock("@/lib/locations/locationService", () => ({
  fetchLocationsByCity: vi.fn().mockResolvedValue([]),
  fetchLocationsByCategories: vi.fn().mockResolvedValue([]),
}));

// Mock scoring (not reached when candidates are empty, but needed for import)
vi.mock("@/lib/scoring/locationScoring", () => ({
  scoreLocation: vi.fn(),
}));

import { refineDay } from "../refinementEngine";
import type { Trip, TripDay } from "@/types/tripDomain";

function makeTripDay(overrides?: Partial<TripDay>): TripDay {
  return {
    id: "day-1",
    date: "2026-04-10",
    cityId: "tokyo",
    activities: [
      {
        id: "a1",
        locationId: "loc-1",
        timeSlot: "morning",
        duration: 90,
      },
      {
        id: "a2",
        locationId: "loc-2",
        timeSlot: "afternoon",
        duration: 60,
      },
    ],
    ...overrides,
  };
}

function makeTrip(dayOverrides?: Partial<TripDay>): Trip {
  return {
    id: "trip-1",
    travelerProfile: {
      interests: ["culture", "food"],
      pace: "balanced",
      budget: { level: "moderate", total: 3000, perDay: 200 },
      mobility: { required: false },
      group: { type: "couple", size: 2 },
    },
    dates: { start: "2026-04-10", end: "2026-04-12" },
    regions: ["kanto"],
    cities: ["tokyo"],
    days: [makeTripDay(dayOverrides)],
    status: "planned",
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
  } as Trip;
}

describe("refinementEngine no-op messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return message when no food candidates available", async () => {
    const trip = makeTrip();
    const result = await refineDay({ trip, dayIndex: 0, type: "more_food" });

    expect(result.message).toBe("No additional food locations available in tokyo.");
    // Activities should be unchanged
    expect(result.activities).toEqual(trip.days[0].activities);
  });

  it("should return message when no cultural candidates available", async () => {
    const trip = makeTrip();
    const result = await refineDay({ trip, dayIndex: 0, type: "more_culture" });

    expect(result.message).toBe("No additional cultural locations available in tokyo.");
    expect(result.activities).toEqual(trip.days[0].activities);
  });

  it("should return message when no kid-friendly candidates available", async () => {
    const trip = makeTrip();
    const result = await refineDay({ trip, dayIndex: 0, type: "more_kid_friendly" });

    expect(result.message).toBe("No additional kid-friendly locations available in tokyo.");
    expect(result.activities).toEqual(trip.days[0].activities);
  });

  it("should return message when no craft candidates available", async () => {
    const trip = makeTrip();
    const result = await refineDay({ trip, dayIndex: 0, type: "more_craft" });

    expect(result.message).toBe("No additional craft locations available in tokyo.");
    expect(result.activities).toEqual(trip.days[0].activities);
  });

  it("should return message when no locations available for too_light", async () => {
    const trip = makeTrip();
    const result = await refineDay({ trip, dayIndex: 0, type: "too_light" });

    expect(result.message).toBe("No additional locations available in tokyo.");
    expect(result.activities).toEqual(trip.days[0].activities);
  });

  it("should return message when too_busy day already has minimal activities", async () => {
    const trip = makeTrip({
      activities: [
        { id: "a1", locationId: "loc-1", timeSlot: "morning", duration: 90 },
        { id: "a2", locationId: "loc-2", timeSlot: "afternoon", duration: 60 },
      ],
    });
    const result = await refineDay({ trip, dayIndex: 0, type: "too_busy" });

    expect(result.message).toBe("This day already has the minimum number of activities.");
  });

  it("should return message when more_rest day already has minimal activities", async () => {
    const trip = makeTrip({
      activities: [
        { id: "a1", locationId: "loc-1", timeSlot: "morning", duration: 90 },
      ],
    });
    const result = await refineDay({ trip, dayIndex: 0, type: "more_rest" });

    expect(result.message).toBe("This day already has minimal activities for adding rest time.");
  });
});

// Regression guard for KOK-54: canonical-injected activities carry
// `isCanonical: true` (set by `applyCanonicalCoverage`, propagated through
// `convertItineraryToTrip`) and represent editor-curated brand-promise icons.
// Refine "too_busy" should treat them as protected, the same way it protects
// airport anchors. The flag — not the id suffix — is the contract.
describe("refinementEngine — too_busy protects canonical-injected activities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should not remove activities flagged isCanonical", async () => {
    const trip = makeTrip({
      activities: [
        // 5 picker activities + 1 canonical injected in middle. Plain
        // refineTooBusy would drop middle (canonical) on a 5-activity day.
        { id: "p1", locationId: "loc-p1", timeSlot: "morning", duration: 90 },
        { id: "p2", locationId: "loc-p2", timeSlot: "morning", duration: 90 },
        // Canonical injected on day index 1 (1-based: day 1)
        { id: "meiji-jingu-shrine-kanto-3ef2fe4a-d1-canon", locationId: "meiji-jingu-shrine-kanto-3ef2fe4a", timeSlot: "afternoon", duration: 90, isCanonical: true },
        { id: "p3", locationId: "loc-p3", timeSlot: "afternoon", duration: 60 },
        { id: "p4", locationId: "loc-p4", timeSlot: "evening", duration: 60 },
        { id: "p5", locationId: "loc-p5", timeSlot: "evening", duration: 60 },
      ],
    });

    const result = await refineDay({ trip, dayIndex: 0, type: "too_busy" });

    const ids = result.activities.map((a) => a.id);
    expect(ids).toContain("meiji-jingu-shrine-kanto-3ef2fe4a-d1-canon");
    // Some non-canonical middle activities should be removed (otherwise
    // we're not actually testing the refine path).
    expect(result.activities.length).toBeLessThan(6);
  });

  it("should still surface the no-op message when only canonicals + anchors leave fewer than 3 removables", async () => {
    const trip = makeTrip({
      activities: [
        { id: "anchor-arrival-hnd", locationId: "hnd", timeSlot: "morning", duration: 60, isAnchor: true },
        { id: "fushimi-inari-d1-canon", locationId: "fushimi-inari", timeSlot: "morning", duration: 90, isCanonical: true },
        { id: "p1", locationId: "loc-p1", timeSlot: "afternoon", duration: 90 },
        { id: "p2", locationId: "loc-p2", timeSlot: "evening", duration: 60 },
      ],
    });

    const result = await refineDay({ trip, dayIndex: 0, type: "too_busy" });

    // Removable count after excluding anchor + canonical = 2 → no-op.
    expect(result.message).toBe("This day already has the minimum number of activities.");
    expect(result.activities.map((a) => a.id)).toContain("fushimi-inari-d1-canon");
  });
});
