import { describe, it, expect, vi } from "vitest";

// Mock server-only (no-op in test)
vi.mock("server-only", () => ({}));

import {
  parsePriceLevel,
  validateDayDuration,
  validateDayBudget,
  validateTotalBudget,
  validateNapScheduling,
  validateTripConstraints,
  convertItineraryToTrip,
  raceWithTimeout,
  PipelineTimeoutError,
} from "@/lib/server/itineraryEngine";
import type { Itinerary } from "@/types/itinerary";
import type { Trip, TripDay, TripActivity } from "@/types/tripDomain";
import type { TravelerProfile } from "@/types/traveler";
import type { TripBuilderData } from "@/types/trip";
import type { Location } from "@/types/location";
import { formatLocalDateISO } from "@/lib/utils/dateUtils";

// ── helpers ─────────────────────────────────────────────────────────────────

const baseProfile: TravelerProfile = {
  pace: "balanced",
  budget: { level: "moderate" },
  mobility: { required: false },
  interests: [],
  group: { size: 1, type: "solo" },
  dietary: { restrictions: [] },
};

function makeActivity(overrides: Partial<TripActivity> = {}): TripActivity {
  return {
    id: "act-1",
    locationId: "loc-1",
    timeSlot: "morning",
    duration: 60,
    ...overrides,
  };
}

function makeDay(overrides: Partial<TripDay> = {}): TripDay {
  return {
    id: "day-1",
    date: "2026-05-01",
    cityId: "kyoto",
    activities: [makeActivity()],
    ...overrides,
  };
}

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-1",
    travelerProfile: baseProfile,
    dates: { start: "2026-05-01", end: "2026-05-03" },
    regions: [],
    cities: ["kyoto"],
    status: "planned",
    days: [makeDay()],
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

// ── parsePriceLevel ─────────────────────────────────────────────────────────

describe("parsePriceLevel", () => {
  it("returns zero for undefined", () => {
    expect(parsePriceLevel(undefined)).toEqual({ level: 0, type: "numeric" });
  });

  it("returns zero for empty string", () => {
    expect(parsePriceLevel("")).toEqual({ level: 0, type: "numeric" });
  });

  it("parses numeric yen values", () => {
    expect(parsePriceLevel("¥400")).toEqual({ level: 400, type: "numeric" });
  });

  it("parses numeric with whitespace", () => {
    expect(parsePriceLevel("¥ 1500")).toEqual({ level: 1500, type: "numeric" });
  });

  it("parses bare numeric without yen sign", () => {
    expect(parsePriceLevel("3000")).toEqual({ level: 3000, type: "numeric" });
  });

  it("counts yen symbols", () => {
    expect(parsePriceLevel("¥¥¥")).toEqual({ level: 3, type: "symbol" });
  });

  it("single symbol", () => {
    expect(parsePriceLevel("¥")).toEqual({ level: 1, type: "symbol" });
  });

  it("numeric takes precedence over symbol count when both present", () => {
    // "¥¥¥ (1500)" — regex matches the number first
    expect(parsePriceLevel("¥¥¥ (1500)")).toEqual({ level: 1500, type: "numeric" });
  });

  it("non-yen string with no digits returns zero", () => {
    expect(parsePriceLevel("free")).toEqual({ level: 0, type: "numeric" });
  });
});

// ── validateDayDuration ─────────────────────────────────────────────────────

describe("validateDayDuration", () => {
  it("passes at exactly 12h (720 min)", () => {
    const day = makeDay({
      activities: [makeActivity({ duration: 720 })],
    });
    expect(validateDayDuration(day, 0)).toEqual([]);
  });

  it("flags at 12h01 (721 min)", () => {
    const day = makeDay({
      activities: [makeActivity({ duration: 721 })],
    });
    const issues = validateDayDuration(day, 0);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("Day 1");
    expect(issues[0]).toContain("overpacked");
  });

  it("sums across multiple activities", () => {
    const day = makeDay({
      activities: [
        makeActivity({ id: "a", duration: 400 }),
        makeActivity({ id: "b", duration: 400 }),
      ],
    });
    expect(validateDayDuration(day, 2)).toHaveLength(1);
  });

  it("empty day passes", () => {
    const day = makeDay({ activities: [] });
    expect(validateDayDuration(day, 0)).toEqual([]);
  });
});

// ── validateDayBudget ───────────────────────────────────────────────────────

describe("validateDayBudget", () => {
  function activityWithBudget(minBudget: string): TripActivity {
    return makeActivity({
      location: { id: "loc", name: "n", city: "kyoto", region: "kansai", category: "culture", minBudget } as unknown as Location,
    });
  }

  it("within budget passes", () => {
    const day = makeDay({ activities: [activityWithBudget("¥1000")] });
    const { issues, cost } = validateDayBudget(day, 0, 2000);
    expect(cost).toBe(1000);
    expect(issues).toEqual([]);
  });

  it("passes at 10% tolerance boundary", () => {
    // 10% over = 1100; with BUDGET_TOLERANCE = 1.1, a cost of exactly 1100 against 1000 budget is allowed
    const day = makeDay({ activities: [activityWithBudget("¥1100")] });
    const { issues } = validateDayBudget(day, 0, 1000);
    expect(issues).toEqual([]);
  });

  it("flags at 10% + 1", () => {
    const day = makeDay({ activities: [activityWithBudget("¥1101")] });
    const { issues } = validateDayBudget(day, 0, 1000);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("exceeds per-day budget");
  });

  it("symbol prices are not counted as numeric cost", () => {
    const day = makeDay({ activities: [activityWithBudget("¥¥¥")] });
    const { cost, issues } = validateDayBudget(day, 0, 100);
    expect(cost).toBe(0);
    expect(issues).toEqual([]);
  });

  it("activities without location return zero cost", () => {
    const day = makeDay({ activities: [makeActivity()] });
    const { cost } = validateDayBudget(day, 0, 100);
    expect(cost).toBe(0);
  });

  it("undefined perDayBudget never flags", () => {
    const day = makeDay({ activities: [activityWithBudget("¥99999")] });
    const { issues } = validateDayBudget(day, 0, undefined);
    expect(issues).toEqual([]);
  });
});

// ── validateTotalBudget ─────────────────────────────────────────────────────

describe("validateTotalBudget", () => {
  it("within budget passes", () => {
    expect(validateTotalBudget(5000, 10000)).toEqual([]);
  });

  it("passes at 10% tolerance", () => {
    expect(validateTotalBudget(11000, 10000)).toEqual([]);
  });

  it("flags over tolerance", () => {
    const issues = validateTotalBudget(11001, 10000);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("exceeds total budget");
  });

  it("undefined budget never flags", () => {
    expect(validateTotalBudget(999999, undefined)).toEqual([]);
  });
});

// ── validateNapScheduling ───────────────────────────────────────────────────

describe("validateNapScheduling", () => {
  it("flags activity starting at 13:00 (lower boundary)", () => {
    const day = makeDay({
      activities: [makeActivity({ startTime: "13:00" })],
    });
    expect(validateNapScheduling(day, 0)).toHaveLength(1);
  });

  it("flags activity starting at 14:59 (upper boundary, still in range)", () => {
    const day = makeDay({
      activities: [makeActivity({ startTime: "14:59" })],
    });
    expect(validateNapScheduling(day, 0)).toHaveLength(1);
  });

  it("does not flag 12:59 (just before nap window)", () => {
    const day = makeDay({
      activities: [makeActivity({ startTime: "12:59" })],
    });
    expect(validateNapScheduling(day, 0)).toEqual([]);
  });

  it("does not flag 15:00 (just after nap window)", () => {
    const day = makeDay({
      activities: [makeActivity({ startTime: "15:00" })],
    });
    expect(validateNapScheduling(day, 0)).toEqual([]);
  });

  it("ignores activities without startTime", () => {
    const day = makeDay({
      activities: [makeActivity({ startTime: undefined })],
    });
    expect(validateNapScheduling(day, 0)).toEqual([]);
  });

  it("ignores malformed startTime strings", () => {
    const day = makeDay({
      activities: [makeActivity({ startTime: "not-a-time" })],
    });
    expect(validateNapScheduling(day, 0)).toEqual([]);
  });
});

// ── validateTripConstraints: nap-age boundary ───────────────────────────────

describe("validateTripConstraints nap-age boundary", () => {
  function tripWithChild(age: number | undefined): Trip {
    const childrenAges = age === undefined ? undefined : [age];
    return makeTrip({
      travelerProfile: {
        ...baseProfile,
        group: { size: 2, type: "family", childrenAges },
      },
      days: [
        makeDay({
          activities: [makeActivity({ startTime: "14:00", duration: 60 })],
        }),
      ],
    });
  }

  it("child age 4 triggers nap check (on boundary)", () => {
    const { issues } = validateTripConstraints(tripWithChild(4));
    expect(issues.some((i) => i.includes("nap time"))).toBe(true);
  });

  it("child age 5 does NOT trigger nap check", () => {
    const { issues } = validateTripConstraints(tripWithChild(5));
    expect(issues.some((i) => i.includes("nap time"))).toBe(false);
  });

  it("child age 0 triggers nap check", () => {
    const { issues } = validateTripConstraints(tripWithChild(0));
    expect(issues.some((i) => i.includes("nap time"))).toBe(true);
  });

  it("family without childrenAges does NOT trigger nap check", () => {
    const { issues } = validateTripConstraints(tripWithChild(undefined));
    expect(issues.some((i) => i.includes("nap time"))).toBe(false);
  });

  it("non-family group with young child does NOT trigger nap check", () => {
    const trip = makeTrip({
      travelerProfile: {
        ...baseProfile,
        group: { size: 2, type: "couple", childrenAges: [2] },
      },
      days: [
        makeDay({
          activities: [makeActivity({ startTime: "14:00", duration: 60 })],
        }),
      ],
    });
    const { issues } = validateTripConstraints(trip);
    expect(issues.some((i) => i.includes("nap time"))).toBe(false);
  });
});

// ── convertItineraryToTrip ──────────────────────────────────────────────────

function makeBuilderData(
  overrides: Partial<TripBuilderData> = {},
): TripBuilderData {
  return {
    dates: { start: "2026-05-01" },
    cities: ["kyoto"],
    regions: [],
    vibes: [],
    ...overrides,
  } as TripBuilderData;
}

function makeItineraryWithDays(dayCount: number): Itinerary {
  return {
    id: "it-1",
    days: Array.from({ length: dayCount }, (_, i) => ({
      id: `day-${i + 1}`,
      cityId: "kyoto" as const,
      activities: [
        {
          kind: "place" as const,
          id: `act-${i}`,
          title: `Kinkaku-ji`,
          timeOfDay: "morning" as const,
        },
      ],
    })),
  } as unknown as Itinerary;
}

describe("convertItineraryToTrip date arithmetic", () => {
  it("computes end date across month boundary", () => {
    const trip = convertItineraryToTrip(
      makeItineraryWithDays(5),
      makeBuilderData({ dates: { start: "2026-01-30" }, duration: 5 }),
      "trip-x",
      [],
    );
    expect(trip.dates.start).toBe("2026-01-30");
    expect(trip.dates.end).toBe("2026-02-03");
    expect(trip.days[0]?.date).toBe("2026-01-30");
    expect(trip.days[4]?.date).toBe("2026-02-03");
  });

  it("handles leap-year February correctly (2024-02-27 + 5d → 2024-03-02)", () => {
    const trip = convertItineraryToTrip(
      makeItineraryWithDays(5),
      makeBuilderData({ dates: { start: "2024-02-27" }, duration: 5 }),
      "trip-y",
      [],
    );
    expect(trip.dates.end).toBe("2024-03-02");
    expect(trip.days[2]?.date).toBe("2024-02-29"); // leap day present
  });

  it("handles non-leap-year February correctly (2025-02-27 + 5d → 2025-03-03)", () => {
    const trip = convertItineraryToTrip(
      makeItineraryWithDays(5),
      makeBuilderData({ dates: { start: "2025-02-27" }, duration: 5 }),
      "trip-z",
      [],
    );
    expect(trip.dates.end).toBe("2025-03-03");
    expect(trip.days.some((d) => d.date === "2025-02-29")).toBe(false);
  });

  it("crosses year boundary", () => {
    const trip = convertItineraryToTrip(
      makeItineraryWithDays(3),
      makeBuilderData({ dates: { start: "2026-12-30" }, duration: 3 }),
      "trip-eoy",
      [],
    );
    expect(trip.dates.end).toBe("2027-01-01");
  });

  it("silently falls back to today when start date is missing (documented behaviour)", () => {
    // The `if (!startDate) throw ...` guard is unreachable because the `??`
    // fallback always produces a non-empty ISO date. Callers that forget to
    // set a start date get today's date, not an error. Flagged as a latent
    // issue: the API schema allows `dates.start` to be undefined, so this
    // silent fallback can mask frontend bugs.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    try {
      const today = formatLocalDateISO(new Date());
      const trip = convertItineraryToTrip(
        makeItineraryWithDays(1),
        { ...makeBuilderData(), dates: { start: undefined } } as unknown as TripBuilderData,
        "trip-missing",
        [],
      );
      expect(trip.dates.start).toBe(today);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws on malformed start date", () => {
    expect(() =>
      convertItineraryToTrip(
        makeItineraryWithDays(1),
        makeBuilderData({ dates: { start: "not-a-date" } }),
        "trip-bad",
        [],
      ),
    ).toThrow(/Invalid start date/);
  });
});

describe("convertItineraryToTrip location lookup", () => {
  const locations: Location[] = [
    {
      id: "loc-kyoto-kinkakuji",
      name: "Kinkaku-ji",
      city: "kyoto",
      region: "kansai",
      category: "culture",
    } as unknown as Location,
  ];

  it("links activities to locations by name", () => {
    const trip = convertItineraryToTrip(
      makeItineraryWithDays(1),
      makeBuilderData({ duration: 1 }),
      "trip-link",
      locations,
    );
    const activity = trip.days[0]?.activities[0];
    expect(activity?.locationId).toBe("loc-kyoto-kinkakuji");
    expect(activity?.location?.name).toBe("Kinkaku-ji");
  });

  it("uses unknown-${id} locationId when name does not match", () => {
    const trip = convertItineraryToTrip(
      makeItineraryWithDays(1),
      makeBuilderData({ duration: 1 }),
      "trip-unk",
      [],
    );
    const activity = trip.days[0]?.activities[0];
    expect(activity?.locationId).toContain("unknown-");
  });

  it("duplicate name collision falls back to last-wins only when activity has no locationId", () => {
    // Activities without an explicit locationId still fall through to the
    // name-keyed Map, which is last-wins. The id-first fix below prevents
    // this path from being hit for activities that carry a locationId.
    const duplicates: Location[] = [
      { id: "first", name: "Kinkaku-ji", city: "kyoto" } as unknown as Location,
      { id: "second", name: "Kinkaku-ji", city: "osaka" } as unknown as Location,
    ];
    const trip = convertItineraryToTrip(
      makeItineraryWithDays(1),
      makeBuilderData({ duration: 1 }),
      "trip-dup",
      duplicates,
    );
    expect(trip.days[0]?.activities[0]?.locationId).toBe("second");
  });

  it("activity with explicit locationId bypasses name collision (id-first lookup)", () => {
    // Regression fix: previously, when two locations shared a name, activities
    // were linked to the last-seen by name even when the activity carried a
    // canonical locationId. The fix looks up by id first.
    const duplicates: Location[] = [
      { id: "kyoto-kinkakuji", name: "Kinkaku-ji", city: "kyoto" } as unknown as Location,
      { id: "osaka-kinkakuji", name: "Kinkaku-ji", city: "osaka" } as unknown as Location,
    ];
    const itinerary = {
      id: "it-ids",
      days: [
        {
          id: "day-1",
          cityId: "kyoto" as const,
          activities: [
            {
              kind: "place" as const,
              id: "act-1",
              title: "Kinkaku-ji",
              timeOfDay: "morning" as const,
              locationId: "kyoto-kinkakuji",
            },
          ],
        },
      ],
    } as unknown as Itinerary;

    const trip = convertItineraryToTrip(
      itinerary,
      makeBuilderData({ duration: 1 }),
      "trip-ids",
      duplicates,
    );
    expect(trip.days[0]?.activities[0]?.locationId).toBe("kyoto-kinkakuji");
    expect(trip.days[0]?.activities[0]?.location?.city).toBe("kyoto");
  });

  it("propagates isCanonical from ItineraryActivity to TripActivity", () => {
    // Regression guard: `refineTooBusy` reads `TripActivity.isCanonical` to
    // protect editor-curated brand-promise icons. If this propagation is
    // dropped from the mapper, the protection silently breaks even though
    // canonicalCoverage.ts still sets the flag on the source side.
    const itinerary = {
      id: "it-canon",
      days: [
        {
          id: "day-1",
          cityId: "kyoto" as const,
          activities: [
            {
              kind: "place" as const,
              id: "kinkaku-ji-d1-canon",
              title: "Kinkaku-ji",
              timeOfDay: "morning" as const,
              locationId: "kinkaku-ji",
              isCanonical: true,
            },
            {
              kind: "place" as const,
              id: "filler",
              title: "Filler",
              timeOfDay: "afternoon" as const,
              locationId: "filler-loc",
            },
          ],
        },
      ],
    } as unknown as Itinerary;

    const trip = convertItineraryToTrip(
      itinerary,
      makeBuilderData({ duration: 1 }),
      "trip-canon",
      [],
    );
    expect(trip.days[0]?.activities[0]?.isCanonical).toBe(true);
    // Non-canonical activities must not pick up the flag.
    expect(trip.days[0]?.activities[1]?.isCanonical).toBeUndefined();
  });

  it("filters out non-place activities (notes)", () => {
    const itinerary = {
      id: "it-mixed",
      days: [
        {
          id: "day-1",
          cityId: "kyoto" as const,
          activities: [
            {
              kind: "place" as const,
              id: "act-1",
              title: "Kinkaku-ji",
              timeOfDay: "morning" as const,
            },
            {
              kind: "note" as const,
              id: "note-1",
              title: "Note" as const,
              timeOfDay: "afternoon" as const,
              notes: "Skip-the-line pass recommended",
            },
          ],
        },
      ],
    } as unknown as Itinerary;

    const trip = convertItineraryToTrip(
      itinerary,
      makeBuilderData({ duration: 1 }),
      "trip-notes",
      [],
    );
    expect(trip.days[0]?.activities).toHaveLength(1);
    expect(trip.days[0]?.activities[0]?.id).toBe("act-1");
  });
});

// ── raceWithTimeout ─────────────────────────────────────────────────────────

describe("raceWithTimeout", () => {
  it("resolves with the inner promise when it beats the timer", async () => {
    const result = await raceWithTimeout(
      "test-stage",
      Promise.resolve("ok"),
      1_000,
    );
    expect(result).toBe("ok");
  });

  it("throws PipelineTimeoutError with stage and budget in message", async () => {
    const never = new Promise<string>(() => {
      /* never resolves */
    });
    await expect(raceWithTimeout("stuck-stage", never, 10)).rejects.toBeInstanceOf(
      PipelineTimeoutError,
    );
    await expect(raceWithTimeout("stuck-stage", never, 10)).rejects.toThrow(
      /stuck-stage exceeded 10ms/,
    );
  });

  it("propagates inner rejection without timeout wrapping", async () => {
    const innerError = new Error("supabase RPC rejected");
    await expect(
      raceWithTimeout("inner-fail", Promise.reject(innerError), 1_000),
    ).rejects.toBe(innerError);
  });
});

describe("convertItineraryToTrip city fallbacks", () => {
  it("falls back to builderData.cities[0] when day has no cityId", () => {
    const itinerary = {
      id: "it-nocity",
      days: [
        {
          id: "day-1",
          activities: [
            {
              kind: "place" as const,
              id: "a",
              title: "x",
              timeOfDay: "morning" as const,
            },
          ],
        },
      ],
    } as unknown as Itinerary;

    const trip = convertItineraryToTrip(
      itinerary,
      makeBuilderData({ cities: ["osaka"], duration: 1 }),
      "t",
      [],
    );
    expect(trip.days[0]?.cityId).toBe("osaka");
  });

  it("falls back to 'kyoto' when no builder cities and no day cityId", () => {
    const itinerary = {
      id: "it-nocity2",
      days: [
        {
          id: "day-1",
          activities: [
            {
              kind: "place" as const,
              id: "a",
              title: "x",
              timeOfDay: "morning" as const,
            },
          ],
        },
      ],
    } as unknown as Itinerary;

    const trip = convertItineraryToTrip(
      itinerary,
      makeBuilderData({ cities: [], duration: 1 }),
      "t",
      [],
    );
    expect(trip.days[0]?.cityId).toBe("kyoto");
  });
});
