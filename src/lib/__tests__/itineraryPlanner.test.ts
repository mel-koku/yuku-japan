import { describe, it, expect, vi, beforeEach } from "vitest";

import type { Itinerary } from "@/types/itinerary";
import type { Location } from "@/types/location";
import type { RoutingRequest } from "../routing/types";
import { planItinerary } from "../itineraryPlanner";

const mockRequestRoute = vi.fn();

// Create mock locations for the test itinerary
const mockLocations: Record<string, Location> = {
  "day1-activity-1": {
    id: "kyoto-fushimi-inari-taisha",
    name: "Fushimi Inari Taisha",
    region: "Kansai",
    city: "Kyoto",
    category: "shrine",
    image: "/images/fushimi-inari.jpg",
    coordinates: { lat: 34.9671, lng: 135.7727 },
    operatingHours: {
      periods: [
        { day: "monday", open: "00:00", close: "23:59" },
        { day: "tuesday", open: "00:00", close: "23:59" },
        { day: "wednesday", open: "00:00", close: "23:59" },
        { day: "thursday", open: "00:00", close: "23:59" },
        { day: "friday", open: "00:00", close: "23:59" },
        { day: "saturday", open: "00:00", close: "23:59" },
        { day: "sunday", open: "00:00", close: "23:59" },
      ],
    },
    recommendedVisit: {
      typicalMinutes: 120,
      minMinutes: 60,
    },
    preferredTransitModes: ["train", "bus"],
    timezone: "Asia/Tokyo",
  },
  "day1-activity-2": {
    id: "kyoto-nishiki-market",
    name: "Nishiki Market",
    region: "Kansai",
    city: "Kyoto",
    category: "market",
    image: "/images/nishiki-market.jpg",
    coordinates: { lat: 35.0050, lng: 135.7648 },
    // No operatingHours - this will result in "tentative" schedule status
    recommendedVisit: {
      typicalMinutes: 90,
      minMinutes: 45,
    },
    preferredTransitModes: ["walk", "bus"],
    timezone: "Asia/Tokyo",
  },
};

// Mock findLocationsForActivities
vi.mock("../itineraryLocations", () => ({
  findLocationsForActivities: vi.fn().mockImplementation(async (activities) => {
    const result = new Map();
    for (const activity of activities) {
      result.set(activity.id, mockLocations[activity.id] ?? null);
    }
    return result;
  }),
}));

// Mock logger to avoid console noise
vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock Google Places to avoid network calls
vi.mock("../googlePlaces", () => ({
  fetchLocationDetails: vi.fn().mockResolvedValue(null),
}));

vi.mock("../routing", () => ({
  requestRoute: (request: unknown) => mockRequestRoute(request),
}));

beforeEach(() => {
  mockRequestRoute.mockReset();
});

const buildRoute = (mode: RoutingRequest["mode"], durationSeconds: number, instruction?: string) => {
  const stepMode = mode === "transit" || mode === "train" ? "transit" : mode === "walk" ? "walk" : "drive";
  return {
    provider: "mock",
    mode,
    durationSeconds,
    distanceMeters: 7800,
    legs: [
      {
        mode,
        durationSeconds,
        distanceMeters: 7800,
        summary: `${mode} leg`,
        steps: instruction ? [{ instruction, stepMode }] : [],
      },
    ],
    warnings: [],
    fetchedAt: new Date().toISOString(),
  };
};

const createTestItinerary = (): Itinerary => ({
  timezone: "Asia/Tokyo",
  days: [
    {
      id: "day-1",
      dateLabel: "Kyoto Day",
      timezone: "Asia/Tokyo",
      weekday: "tuesday",
      bounds: {
        startTime: "08:00",
        endTime: "20:00",
      },
      activities: [
        {
          kind: "place",
          id: "day1-activity-1",
          title: "Fushimi Inari Taisha",
          timeOfDay: "morning",
          durationMin: 120,
          locationId: "kyoto-fushimi-inari-taisha",
          tags: ["culture"],
        },
        {
          kind: "place",
          id: "day1-activity-2",
          title: "Nishiki Market",
          timeOfDay: "afternoon",
          durationMin: 90,
          locationId: "kyoto-nishiki-market",
          tags: ["food"],
        },
      ],
    },
  ],
});

describe("planItinerary", () => {
  it("injects travel segments and schedules visits against opening hours", async () => {
    // The planner now makes 2 calls per activity pair: walk check + single transit call
    // (Previously made 6 calls: walk + 5 transit modes)
    mockRequestRoute.mockImplementation((request: RoutingRequest) => {
      switch (request.mode) {
        case "walk":
        case "walking":
          return Promise.resolve(buildRoute("walk", 1800)); // 30 min walk triggers transit search
        case "transit":
          return Promise.resolve(buildRoute("transit", 1200, "Take transit toward destination"));
        default:
          return Promise.resolve(buildRoute(request.mode, 1400));
      }
    });

    const itinerary = createTestItinerary();

    const result = await planItinerary(itinerary, {
      defaultDayStart: "08:00",
      transitionBufferMinutes: 10,
    });

    // 2 calls: walk check + transit
    expect(mockRequestRoute).toHaveBeenCalledTimes(2);
    const plannedDay = result.days[0];
    const [firstActivity, secondActivity] = plannedDay.activities;

    expect(firstActivity.kind).toBe("place");
    if (firstActivity.kind === "place") {
      expect(firstActivity.schedule?.arrivalTime).toBe("08:00");
      expect(firstActivity.schedule?.departureTime).toBe("10:00");
      expect(firstActivity.schedule?.operatingWindow?.status).toBe("within");
    }

    expect(secondActivity.kind).toBe("place");
    if (secondActivity.kind === "place") {
      // When transit result is used, mode is set to "train"
      expect(secondActivity.travelFromPrevious?.mode).toBe("train");
      expect(secondActivity.travelFromPrevious?.departureTime).toBe("10:10");
      expect(secondActivity.travelFromPrevious?.arrivalTime).toBe("10:30"); // 20 min transit
      expect(secondActivity.travelFromPrevious?.instructions).toEqual([
        "Take transit toward destination",
      ]);
      expect(secondActivity.schedule?.arrivalTime).toBe("10:30");
      expect(secondActivity.schedule?.departureTime).toBe("12:00");
      expect(secondActivity.schedule?.status).toBe("tentative");
    }
  });

  it("clears stale travelFromPrevious on the now-first activity after a reorder", async () => {
    // Regression: when a route optimizer reorders activities so a stop that
    // *was* mid-day becomes the first place activity of the day, the first
    // activity has no incoming route. The spread previously preserved its
    // stale `travelFromPrevious.arrivalTime` (e.g. "19:54" from when it was
    // an evening stop), causing the renderer to display the prior time.
    mockRequestRoute.mockImplementation((request: RoutingRequest) => {
      switch (request.mode) {
        case "walk":
        case "walking":
          return Promise.resolve(buildRoute("walk", 1800));
        case "transit":
          return Promise.resolve(buildRoute("transit", 1200));
        default:
          return Promise.resolve(buildRoute(request.mode, 1400));
      }
    });

    const itinerary = createTestItinerary();
    const firstActivity = itinerary.days[0]?.activities[0];
    if (firstActivity?.kind === "place") {
      // Stale evening arrival time from a prior layout
      firstActivity.travelFromPrevious = {
        mode: "train",
        durationMinutes: 12,
        arrivalTime: "19:54",
        departureTime: "19:42",
      };
    }

    const result = await planItinerary(itinerary, {
      defaultDayStart: "08:00",
      transitionBufferMinutes: 10,
    });

    const replanned = result.days[0]?.activities[0];
    expect(replanned?.kind).toBe("place");
    if (replanned?.kind === "place") {
      // First activity: no resolved route → travelFromPrevious must be cleared.
      expect(replanned.travelFromPrevious).toBeUndefined();
      // Schedule reflects the day start.
      expect(replanned.schedule?.arrivalTime).toBe("08:00");
    }
  });

  it("refreshes timeOfDay to match the fresh schedule", async () => {
    // Regression: `timeOfDay` is set at generation and can mismatch the
    // post-replan schedule (e.g. a stop tagged "evening" gets rescheduled to
    // 13:22 but keeps the "evening" tag). Downstream consumers — meal-slot
    // positions, lifestyle/timing detectors — bucket on `timeOfDay`, so a
    // stale value pushes them to the wrong slot. Planner now re-derives.
    mockRequestRoute.mockImplementation(() =>
      Promise.resolve(buildRoute("walk", 600)),
    );

    const itinerary = createTestItinerary();
    // Tag the activities as "evening" (e.g. from a prior layout) and verify
    // the planner overwrites them.
    for (const activity of itinerary.days[0]?.activities ?? []) {
      if (activity.kind === "place") {
        activity.timeOfDay = "evening";
      }
    }

    const result = await planItinerary(itinerary, {
      defaultDayStart: "08:00",
      transitionBufferMinutes: 10,
    });

    const [first, second] = result.days[0]?.activities ?? [];
    expect(first?.kind).toBe("place");
    if (first?.kind === "place") {
      // Scheduled at 08:00 → morning bucket
      expect(first.timeOfDay).toBe("morning");
    }
    expect(second?.kind).toBe("place");
    if (second?.kind === "place") {
      // Scheduled at ~10:30 (8 + 2h visit + 10m transit) → still morning
      expect(second.timeOfDay).toBe("morning");
    }
  });

  it("computes airport→hotel transit segment on Day 1 when both anchor and hotel are set", async () => {
    // Regression: when Day 1 has an arrival anchor (NRT) AND a hotel set as
    // the day's startPoint, the planner must route NRT→hotel as a real travel
    // segment instead of jumping `prevCoords`. The leg consumes time on the
    // day clock and renders as a map line via anchor.travelToNext.
    mockRequestRoute.mockImplementation((request: RoutingRequest) => {
      switch (request.mode) {
        case "walk":
        case "walking":
          return Promise.resolve(buildRoute("walk", 1800));
        case "transit":
          return Promise.resolve(buildRoute("transit", 3600, "Take the Skyliner from NRT")); // 60 min
        default:
          return Promise.resolve(buildRoute(request.mode, 1400));
      }
    });

    // Build an itinerary whose Day 1 starts with an arrival anchor at NRT
    // (Narita), followed by a single Kyoto stop (fixture data).
    const itinerary: Itinerary = {
      timezone: "Asia/Tokyo",
      days: [
        {
          id: "day-1",
          dateLabel: "Arrival Day",
          timezone: "Asia/Tokyo",
          weekday: "tuesday",
          bounds: { startTime: "08:00", endTime: "20:00" },
          activities: [
            {
              kind: "place",
              id: "anchor-arrival-nrt",
              title: "Arrive at Narita International Airport",
              isAnchor: true,
              coordinates: { lat: 35.7647, lng: 140.3863 },
              durationMin: 30,
              tags: ["airport"],
              timeOfDay: "morning",
              schedule: {
                arrivalTime: "08:00",
                departureTime: "08:30",
                status: "scheduled",
              },
            },
            {
              kind: "place",
              id: "day1-activity-1",
              title: "Fushimi Inari Taisha",
              timeOfDay: "morning",
              durationMin: 120,
              locationId: "kyoto-fushimi-inari-taisha",
              tags: ["culture"],
            },
          ],
        },
      ],
    };

    // Hotel ~70km from NRT (real-world airport→central Tokyo distance).
    const hotelCoords = { lat: 35.6895, lng: 139.6917 };
    const dayId = itinerary.days[0]!.id;
    const result = await planItinerary(
      itinerary,
      { defaultDayStart: "08:00", transitionBufferMinutes: 10 },
      { [dayId!]: { startPoint: { coordinates: hotelCoords } } },
    );

    const plannedDay = result.days[0]!;
    const [anchor, stop1] = plannedDay.activities;

    expect(anchor?.kind).toBe("place");
    if (anchor?.kind === "place") {
      // Anchor preserves its pre-set schedule.
      expect(anchor.isAnchor).toBe(true);
      expect(anchor.schedule?.arrivalTime).toBe("08:00");
      expect(anchor.schedule?.departureTime).toBe("08:30");
      // Anchor's outgoing segment is the airport→hotel transit.
      expect(anchor.travelToNext).toBeDefined();
      expect(anchor.travelToNext?.mode).toBe("train");
      expect(anchor.travelToNext?.durationMinutes).toBe(60);
      // Departs 08:40 (anchor depart 08:30 + 10-min transition buffer),
      // arrives 09:40 (after 60-min transit).
      expect(anchor.travelToNext?.departureTime).toBe("08:40");
      expect(anchor.travelToNext?.arrivalTime).toBe("09:40");
    }

    // Cursor advanced by transit duration → stop1 schedule reflects the full
    // airport→hotel→stop1 chain (not airport→stop1 directly).
    expect(stop1?.kind).toBe("place");
    if (stop1?.kind === "place") {
      // stop1.travelFromPrevious is the hotel→stop1 leg (departs after the
      // transit settled at 09:40, so 09:40 + walk-to-transit-fallback duration).
      expect(stop1.travelFromPrevious?.departureTime).toBe("09:40");
      // Schedule arrival is well after 08:00, confirming the transit was
      // accounted for on the day clock.
      const arrivalMin =
        Number(stop1.schedule?.arrivalTime?.split(":")[0]) * 60 +
        Number(stop1.schedule?.arrivalTime?.split(":")[1]);
      expect(arrivalMin).toBeGreaterThan(9 * 60 + 40);
    }
  });

  it("does not synthesize an airport→hotel leg when hotel startPoint is absent", async () => {
    // Counter-regression: arrival anchor with no hotel startPoint should leave
    // anchor.travelToNext set by the regular routing path (anchor→stop1), not
    // a fabricated airport→hotel segment.
    mockRequestRoute.mockImplementation((request: RoutingRequest) => {
      switch (request.mode) {
        case "walk":
        case "walking":
          return Promise.resolve(buildRoute("walk", 1800));
        case "transit":
          return Promise.resolve(buildRoute("transit", 1200));
        default:
          return Promise.resolve(buildRoute(request.mode, 1400));
      }
    });

    const itinerary: Itinerary = {
      timezone: "Asia/Tokyo",
      days: [
        {
          id: "day-1",
          dateLabel: "Arrival Day",
          timezone: "Asia/Tokyo",
          weekday: "tuesday",
          bounds: { startTime: "08:00", endTime: "20:00" },
          activities: [
            {
              kind: "place",
              id: "anchor-arrival-nrt",
              title: "Arrive at Narita",
              isAnchor: true,
              coordinates: { lat: 35.7647, lng: 140.3863 },
              durationMin: 30,
              tags: ["airport"],
              timeOfDay: "morning",
              schedule: {
                arrivalTime: "08:00",
                departureTime: "08:30",
                status: "scheduled",
              },
            },
            {
              kind: "place",
              id: "day1-activity-1",
              title: "Fushimi Inari Taisha",
              timeOfDay: "morning",
              durationMin: 120,
              locationId: "kyoto-fushimi-inari-taisha",
              tags: ["culture"],
            },
          ],
        },
      ],
    };

    // No dayEntryPoints argument → no startPoint → no airport→hotel leg.
    const result = await planItinerary(itinerary, {
      defaultDayStart: "08:00",
      transitionBufferMinutes: 10,
    });

    const [anchor, stop1] = result.days[0]!.activities;

    // The anchor's travelToNext is set by the regular routing path (the
    // anchor→stop1 leg, which comes from prevCoords=anchor → stop1 routing).
    // Critically, it's NOT the synthetic airport→hotel transit (60 min in
    // the previous test); it should match the anchor→stop1 mock route.
    expect(anchor?.kind).toBe("place");
    if (anchor?.kind === "place" && stop1?.kind === "place") {
      expect(anchor.travelToNext).toBeDefined();
      // anchor.travelToNext should equal stop1.travelFromPrevious (the
      // anchor→stop1 leg). Both reference the same routed segment.
      expect(anchor.travelToNext).toEqual(stop1.travelFromPrevious);
    }
  });

  it("does not wrap cursor past midnight when transit lookup fails for the airport→hotel pair", async () => {
    // Repro for the wrap-around bug observed in production (PR #125 revert):
    //
    // When NAVITIME (or whichever transit provider) fails to return a transit
    // route for the synthetic airport→hotel pair, the resolution layer falls
    // back to the walk result. For a 70km airport-to-hotel, that walk is
    // ~840min. cursorMinutes += 840 advances the day clock past midnight, and
    // formatTime() wraps subsequent activity arrival times into the next-day
    // hours (e.g. "00:08", "01:07"). Cursor monotonicity must hold.
    //
    // Mock: walk fetch returns a 14h walk for the long airport→hotel pair
    // (70km at walking speed) and 30min for short pairs. Transit fetch returns
    // a successful transit shape but with NO transit steps — this triggers
    // the planner's `hasTransitSteps` gate to fall back to walk.
    // Airport coords for matching "this is the airport→hotel leg". The wrap
    // bug is specific to this synthetic pair — every other leg in the day is a
    // normal hotel-to-stop or stop-to-stop pair.
    const NRT_LAT = 35.7647;
    const NRT_LNG = 140.3863;
    const isFromNrt = (lat: number, lng: number) =>
      Math.abs(lat - NRT_LAT) < 0.001 && Math.abs(lng - NRT_LNG) < 0.001;

    mockRequestRoute.mockImplementation((request: RoutingRequest) => {
      const fromAirport = isFromNrt(request.origin.lat, request.origin.lng);
      switch (request.mode) {
        case "walk":
        case "walking":
          // Airport→hotel walk fallback: 14h for ~70km. Otherwise 30min walk.
          return Promise.resolve(buildRoute("walk", fromAirport ? 50400 : 1800));
        case "transit":
          // No instruction → no transit step → hasTransitSteps === false
          // → planner treats this as transit-failed and falls back to walk.
          return Promise.resolve(buildRoute("transit", 1200));
        default:
          return Promise.resolve(buildRoute(request.mode, 1400));
      }
    });

    const itinerary: Itinerary = {
      timezone: "Asia/Tokyo",
      days: [
        {
          id: "day-1",
          dateLabel: "Arrival Day",
          timezone: "Asia/Tokyo",
          weekday: "tuesday",
          bounds: { startTime: "08:00", endTime: "20:00" },
          activities: [
            {
              kind: "place",
              id: "anchor-arrival-nrt",
              title: "Arrive at Narita",
              isAnchor: true,
              coordinates: { lat: 35.7647, lng: 140.3863 },
              durationMin: 30,
              tags: ["airport"],
              timeOfDay: "morning",
              schedule: {
                arrivalTime: "08:00",
                departureTime: "08:30",
                status: "scheduled",
              },
            },
            {
              kind: "place",
              id: "day1-activity-1",
              title: "Fushimi Inari Taisha",
              timeOfDay: "morning",
              durationMin: 120,
              locationId: "kyoto-fushimi-inari-taisha",
              tags: ["culture"],
            },
            {
              kind: "place",
              id: "day1-activity-2",
              title: "Nishiki Market",
              timeOfDay: "afternoon",
              durationMin: 90,
              locationId: "kyoto-nishiki-market",
              tags: ["food"],
            },
          ],
        },
      ],
    };

    // Hotel ~70km from NRT (e.g. central Tokyo).
    const hotelCoords = { lat: 35.6895, lng: 139.6917 };
    const dayId = itinerary.days[0]!.id;
    const result = await planItinerary(
      itinerary,
      { defaultDayStart: "08:00", transitionBufferMinutes: 10 },
      { [dayId!]: { startPoint: { coordinates: hotelCoords } } },
    );

    const activities = result.days[0]!.activities;
    const placeActivities = activities.filter(
      (a): a is Extract<typeof a, { kind: "place" }> => a.kind === "place",
    );

    // Invariant: arrival times across Day 1 must be monotonically increasing
    // within the same day (no wrap past midnight). A schedule that crosses
    // midnight indicates the cursor was advanced by an unrealistic walk
    // fallback for an unwalkable airport→hotel distance.
    const arrivalMinutes = placeActivities.map((a) => {
      const t = a.schedule?.arrivalTime ?? "00:00";
      const [h, m] = t.split(":").map(Number);
      return (h ?? 0) * 60 + (m ?? 0);
    });
    for (let i = 1; i < arrivalMinutes.length; i++) {
      expect(arrivalMinutes[i]).toBeGreaterThanOrEqual(arrivalMinutes[i - 1]!);
    }

    // Stronger bound: even with transit failures, no Day 1 stop should be
    // scheduled past 22:00 — that indicates the airport→hotel "walk" fallback
    // consumed the entire day clock.
    for (const arrival of arrivalMinutes) {
      expect(arrival).toBeLessThan(22 * 60);
    }

    // The anchor's travelToNext must not be the unrealistic walk fallback.
    // Either the segment was dropped (undefined) or — in the future — replaced
    // with a heuristic estimate. Either way, no 14-hour walks.
    const anchor = placeActivities[0];
    if (anchor?.travelToNext) {
      expect(anchor.travelToNext.durationMinutes).toBeLessThanOrEqual(180);
    }
  });

  it("first-plan path (no pre-set anchor schedule) also routes airport→hotel without wrap-around", async () => {
    // Counter-coverage for the hypothesis in the redo handoff: the original
    // PR's tests only exercised the re-plan branch (anchor with pre-set
    // schedule). The first-plan branch — used by the engine's initial
    // `generateTripFromBuilderData` call where the arrival anchor is injected
    // *without* a schedule — was never test-covered, and the handoff flagged
    // it as a candidate site for a separate bug. Verify it produces a
    // sensible schedule (no past-midnight wrap) under the same transit-fail
    // conditions.
    const NRT_LAT = 35.7647;
    const NRT_LNG = 140.3863;
    const isFromNrt = (lat: number, lng: number) =>
      Math.abs(lat - NRT_LAT) < 0.001 && Math.abs(lng - NRT_LNG) < 0.001;

    mockRequestRoute.mockImplementation((request: RoutingRequest) => {
      const fromAirport = isFromNrt(request.origin.lat, request.origin.lng);
      switch (request.mode) {
        case "walk":
        case "walking":
          return Promise.resolve(buildRoute("walk", fromAirport ? 50400 : 1800));
        case "transit":
          return Promise.resolve(buildRoute("transit", 1200));
        default:
          return Promise.resolve(buildRoute(request.mode, 1400));
      }
    });

    const itinerary: Itinerary = {
      timezone: "Asia/Tokyo",
      days: [
        {
          id: "day-1",
          dateLabel: "Arrival Day",
          timezone: "Asia/Tokyo",
          weekday: "tuesday",
          // Note: no `bounds` set — first-plan path mirrors what the engine
          // produces when arrivalTime is unknown (no schedule pre-set on the
          // anchor either).
          activities: [
            {
              kind: "place",
              id: "anchor-arrival-nrt",
              title: "Arrive at Narita",
              isAnchor: true,
              coordinates: { lat: NRT_LAT, lng: NRT_LNG },
              durationMin: 30,
              tags: ["airport"],
              timeOfDay: "morning",
              // No schedule — exercises the first-plan branch
            },
            {
              kind: "place",
              id: "day1-activity-1",
              title: "Fushimi Inari Taisha",
              timeOfDay: "morning",
              durationMin: 120,
              locationId: "kyoto-fushimi-inari-taisha",
              tags: ["culture"],
            },
          ],
        },
      ],
    };

    const hotelCoords = { lat: 35.6895, lng: 139.6917 };
    const dayId = itinerary.days[0]!.id;
    const result = await planItinerary(
      itinerary,
      { defaultDayStart: "09:00", transitionBufferMinutes: 10 },
      { [dayId!]: { startPoint: { coordinates: hotelCoords } } },
    );

    const placeActivities = result.days[0]!.activities.filter(
      (a): a is Extract<typeof a, { kind: "place" }> => a.kind === "place",
    );

    const arrivalMinutes = placeActivities.map((a) => {
      const t = a.schedule?.arrivalTime ?? "00:00";
      const [h, m] = t.split(":").map(Number);
      return (h ?? 0) * 60 + (m ?? 0);
    });
    for (let i = 1; i < arrivalMinutes.length; i++) {
      expect(arrivalMinutes[i]).toBeGreaterThanOrEqual(arrivalMinutes[i - 1]!);
    }
    for (const arrival of arrivalMinutes) {
      expect(arrival).toBeLessThan(22 * 60);
    }
  });

  it("does not synthesize an airport→hotel leg when no arrival anchor is present", async () => {
    // Counter-regression: a normal mid-trip day with a hotel startPoint but
    // no arrival anchor should NOT produce a synthetic airport→hotel
    // segment. The synthetic pair is gated on the first place activity being
    // an arrival anchor.
    mockRequestRoute.mockImplementation((request: RoutingRequest) => {
      switch (request.mode) {
        case "walk":
        case "walking":
          return Promise.resolve(buildRoute("walk", 1800));
        case "transit":
          return Promise.resolve(buildRoute("transit", 1200, "Take transit to destination"));
        default:
          return Promise.resolve(buildRoute(request.mode, 1400));
      }
    });

    const itinerary = createTestItinerary();
    const dayId = itinerary.days[0]!.id;

    // Hotel set but the day starts with a regular (non-anchor) place.
    const hotelCoords = { lat: 35.0050, lng: 135.7600 };
    const result = await planItinerary(
      itinerary,
      { defaultDayStart: "08:00", transitionBufferMinutes: 10 },
      { [dayId!]: { startPoint: { coordinates: hotelCoords } } },
    );

    const [first] = result.days[0]!.activities;

    // First activity is a regular place; it has travelFromPrevious (hotel→
    // first) but the anchor branch never fires, so no synthetic leg exists.
    expect(first?.kind).toBe("place");
    if (first?.kind === "place") {
      expect(first.isAnchor).toBeUndefined();
      // travelFromPrevious is the regular hotel→stop1 leg (transit 20 min).
      expect(first.travelFromPrevious?.mode).toBe("train");
      expect(first.travelFromPrevious?.durationMinutes).toBe(20);
      // No anchor → no synthetic airport→hotel chain. Schedule arrival aligns
      // with day start + travel duration (not + 60-min skyliner transit).
      expect(first.schedule?.arrivalTime).toBe("08:20");
    }
  });

  it("keeps walking mode when the walk is short", async () => {
    // Return short distance (<1km) so transit lookup is NOT triggered
    mockRequestRoute.mockImplementation((request: RoutingRequest) => {
      return Promise.resolve({
        ...buildRoute(request.mode, 480),
        distanceMeters: 800, // 0.8km — below TRANSIT_DISTANCE_THRESHOLD_KM
      });
    });

    const itinerary = createTestItinerary();

    const result = await planItinerary(itinerary, {
      defaultDayStart: "08:00",
      transitionBufferMinutes: 10,
    });

    expect(mockRequestRoute).toHaveBeenCalledTimes(1);
    const secondActivity = result.days[0]?.activities[1];

    expect(secondActivity?.kind).toBe("place");
    if (secondActivity?.kind === "place") {
      expect(secondActivity.travelFromPrevious?.mode).toBe("walk");
    }
  });

  it("rescues unusable inter-stop walk fallback with a heuristic transit estimate", async () => {
    // Repro for the Hiroshima-waterfront → dinner case where NAVITIME and the
    // Google retry both returned walk-only for a ~10km transit-distance pair,
    // and the planner rendered a 142-min walk between activity #5 and the
    // dinner anchor. UX-breaking regardless of which venue triggered it; this
    // test proves the cap holds across persona/scoring changes.
    //
    // Mock setup:
    //   - walk fetch: 142 min over 10km (the "bad" fallback we never want)
    //   - transit fetch: returns a transit shape with NO transit steps so the
    //     resolution layer falls into the walk-fallback branch (mirroring the
    //     airport→hotel test pattern at line 467+).
    mockRequestRoute.mockImplementation((request: RoutingRequest) => {
      switch (request.mode) {
        case "walk":
        case "walking":
          // 142 min ≈ 8520 s. Distance > 1km so transit lookup IS triggered.
          return Promise.resolve({
            ...buildRoute("walk", 8520),
            distanceMeters: 10_000,
          });
        case "transit":
          // No instruction → no transit step → hasTransitSteps === false →
          // planner walks unless the new cap+swap intervenes.
          return Promise.resolve(buildRoute("transit", 1200));
        default:
          return Promise.resolve(buildRoute(request.mode, 1400));
      }
    });

    const itinerary = createTestItinerary();

    const result = await planItinerary(itinerary, {
      defaultDayStart: "08:00",
      transitionBufferMinutes: 10,
    });

    const secondActivity = result.days[0]?.activities[1];
    expect(secondActivity?.kind).toBe("place");
    if (secondActivity?.kind === "place") {
      const segment = secondActivity.travelFromPrevious;
      expect(segment).toBeDefined();
      // Cap holds: under no circumstance should the user see a 142-min walk
      // between two stops. 45 min is the inter-stop ceiling.
      expect(segment!.durationMinutes).toBeLessThanOrEqual(45);
      // Mode swapped to train, flagged as estimated so the UI shows "(est.)".
      expect(segment!.mode).toBe("train");
      expect(segment!.isEstimated).toBe(true);
    }
  });
});

describe("parseEstimatedDuration", () => {
  // Import the function directly since it's exported for testing
  let parseEstimatedDuration: (text?: string | null) => number | null;

  beforeEach(async () => {
    const mod = await import("../itineraryPlanner");
    parseEstimatedDuration = mod.parseEstimatedDuration;
  });

  it("parses bare integer as minutes", () => {
    expect(parseEstimatedDuration("90")).toBe(90);
    expect(parseEstimatedDuration("45")).toBe(45);
    expect(parseEstimatedDuration("120")).toBe(120);
    expect(parseEstimatedDuration("15")).toBe(15);
  });

  it("parses hours format", () => {
    expect(parseEstimatedDuration("2 hours")).toBe(120);
    expect(parseEstimatedDuration("1.5 hr")).toBe(90);
  });

  it("parses minutes format", () => {
    expect(parseEstimatedDuration("45 min")).toBe(45);
    expect(parseEstimatedDuration("30 minutes")).toBe(30);
  });

  it("returns null for empty/null", () => {
    expect(parseEstimatedDuration("")).toBeNull();
    expect(parseEstimatedDuration(null)).toBeNull();
    expect(parseEstimatedDuration(undefined)).toBeNull();
  });

  it("returns null for non-numeric text", () => {
    expect(parseEstimatedDuration("varies")).toBeNull();
  });

  it("rejects zero and negative", () => {
    expect(parseEstimatedDuration("0")).toBeNull();
  });
});


