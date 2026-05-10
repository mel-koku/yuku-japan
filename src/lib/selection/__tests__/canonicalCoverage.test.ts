import { describe, it, expect } from "vitest";
import { applyCanonicalCoverage } from "../canonicalCoverage";
import type { Itinerary, ItineraryActivity } from "@/types/itinerary";
import type { Location } from "@/types/location";

function makeLocation(overrides: Partial<Location> & { id: string; name: string }): Location {
  return {
    region: "Kanto",
    city: "Tokyo",
    category: "shrine",
    ...overrides,
  } as Location;
}

function makePlace(
  id: string,
  title: string,
  overrides: Partial<Extract<ItineraryActivity, { kind: "place" }>> = {},
): ItineraryActivity {
  return {
    kind: "place",
    id,
    title,
    timeOfDay: "morning",
    locationId: id,
    ...overrides,
  };
}

function makeItinerary(days: Itinerary["days"]): Itinerary {
  return { days, planningWarnings: [] };
}

const sensoji = makeLocation({
  id: "sensoji-temple-kanto-e02af533",
  name: "Sensoji Temple",
  city: "Tokyo",
  planningCity: "tokyo",
  canonicalForPersonas: ["first-timer"],
});

const meijiJingu = makeLocation({
  id: "meiji-jingu-kanto-abc",
  name: "Meiji Jingu",
  city: "Tokyo",
  planningCity: "tokyo",
  canonicalForPersonas: ["first-timer", "honeymooner"],
});

const fushimiInari = makeLocation({
  id: "fushimi-inari-kansai-d84870b6",
  name: "Fushimi Inari Taisha",
  city: "Kyoto",
  planningCity: "kyoto",
  canonicalForPersonas: ["first-timer"],
});

const cafeBreukelen = makeLocation({
  id: "cafe-breukelen",
  name: "Cafe Breukelen",
  city: "Tokyo",
  planningCity: "tokyo",
  canonicalForPersonas: undefined,
});

describe("applyCanonicalCoverage", () => {
  it("force-includes a canonical icon by replacing the lowest-priority pick", () => {
    const itinerary = makeItinerary([
      {
        id: "day-1",
        cityId: "tokyo",
        activities: [
          makePlace("nishiki-tenmangu", "Nishiki Tenmangu"),
          makePlace("b-side-label", "B-SIDE LABEL"),
          makePlace("gokonomiya", "Gokōnomiya"),
        ],
      },
    ]);

    const result = applyCanonicalCoverage({
      itinerary,
      personaId: "first-timer",
      allLocations: [sensoji, cafeBreukelen],
      perCityCap: 5,
    });

    const day1 = result.days[0]!;
    const titles = day1.activities.map((a) => a.kind === "place" ? a.title : "");
    expect(titles).toContain("Sensoji Temple");
    // Last pick (gokonomiya) was the lowest priority — it should be the one replaced.
    expect(titles).not.toContain("Gokōnomiya");
    // Earlier picks should be preserved.
    expect(titles).toContain("Nishiki Tenmangu");
    expect(titles).toContain("B-SIDE LABEL");
  });

  it("respects perCityCap by stopping after N force-includes per city", () => {
    const itinerary = makeItinerary([
      {
        id: "day-1",
        cityId: "tokyo",
        activities: [
          makePlace("a", "A"),
          makePlace("b", "B"),
          makePlace("c", "C"),
          makePlace("d", "D"),
        ],
      },
      {
        id: "day-2",
        cityId: "tokyo",
        activities: [
          makePlace("e", "E"),
          makePlace("f", "F"),
        ],
      },
    ]);

    const tokyoSkytree = makeLocation({
      id: "tokyo-skytree",
      name: "Tokyo Skytree",
      city: "Tokyo",
      planningCity: "tokyo",
      canonicalForPersonas: ["first-timer"],
    });
    const tokyoTower = makeLocation({
      id: "tokyo-tower",
      name: "Tokyo Tower",
      city: "Tokyo",
      planningCity: "tokyo",
      canonicalForPersonas: ["first-timer"],
    });

    const result = applyCanonicalCoverage({
      itinerary,
      personaId: "first-timer",
      allLocations: [sensoji, tokyoSkytree, tokyoTower, meijiJingu],
      perCityCap: 2,
    });

    const allTitles = result.days.flatMap((d) =>
      d.activities.map((a) => (a.kind === "place" ? a.title : "")),
    );
    // Cap is 2 per city — only the first two canonical candidates land.
    const canonicalAdded = ["Sensoji Temple", "Tokyo Skytree", "Tokyo Tower", "Meiji Jingu"]
      .filter((name) => allTitles.includes(name));
    expect(canonicalAdded).toHaveLength(2);
  });

  it("does not swap user-saved or LLM-pinned activities", () => {
    const itinerary = makeItinerary([
      {
        id: "day-1",
        cityId: "tokyo",
        activities: [
          makePlace("hidden-cafe", "Hidden Cafe", { tags: ["cafe", "saved"] }),
          makePlace("personal-pick", "Personal Pick", { tags: ["museum", "pinned"] }),
          makePlace("filler", "Filler"),
        ],
      },
    ]);

    const result = applyCanonicalCoverage({
      itinerary,
      personaId: "first-timer",
      allLocations: [sensoji],
      perCityCap: 5,
    });

    const titles = result.days[0]!.activities.map((a) =>
      a.kind === "place" ? a.title : "",
    );
    expect(titles).toContain("Hidden Cafe");
    expect(titles).toContain("Personal Pick");
    expect(titles).toContain("Sensoji Temple");
    // Filler was the only swappable slot — it gets replaced.
    expect(titles).not.toContain("Filler");
  });

  it("skips force-include when canonical is already in the itinerary", () => {
    const itinerary = makeItinerary([
      {
        id: "day-1",
        cityId: "tokyo",
        activities: [
          makePlace(sensoji.id, sensoji.name),
          makePlace("filler-1", "Filler 1"),
        ],
      },
    ]);

    const result = applyCanonicalCoverage({
      itinerary,
      personaId: "first-timer",
      allLocations: [sensoji],
      perCityCap: 5,
    });

    const titles = result.days[0]!.activities.map((a) =>
      a.kind === "place" ? a.title : "",
    );
    // No swap should happen — filler stays.
    expect(titles).toContain("Filler 1");
    // And only one Sensoji entry.
    const sensojiCount = titles.filter((t) => t === "Sensoji Temple").length;
    expect(sensojiCount).toBe(1);
  });

  it("is a no-op when personaId is empty", () => {
    const itinerary = makeItinerary([
      {
        id: "day-1",
        cityId: "tokyo",
        activities: [makePlace("filler", "Filler")],
      },
    ]);

    const result = applyCanonicalCoverage({
      itinerary,
      personaId: "",
      allLocations: [sensoji],
      perCityCap: 5,
    });

    expect(result).toBe(itinerary);
  });

  it("is a no-op when perCityCap is 0 (e.g. repeat-traveler)", () => {
    const itinerary = makeItinerary([
      {
        id: "day-1",
        cityId: "tokyo",
        activities: [makePlace("filler", "Filler")],
      },
    ]);

    const result = applyCanonicalCoverage({
      itinerary,
      personaId: "repeat",
      allLocations: [sensoji],
      perCityCap: 0,
    });

    expect(result).toBe(itinerary);
  });

  it("does not match a location to a different city", () => {
    const itinerary = makeItinerary([
      {
        id: "day-1",
        cityId: "kyoto",
        activities: [makePlace("filler-kyoto", "Filler Kyoto")],
      },
    ]);

    const result = applyCanonicalCoverage({
      itinerary,
      personaId: "first-timer",
      // Sensoji is in Tokyo. The trip is only in Kyoto.
      allLocations: [sensoji, fushimiInari],
      perCityCap: 5,
    });

    const titles = result.days[0]!.activities.map((a) =>
      a.kind === "place" ? a.title : "",
    );
    expect(titles).toContain("Fushimi Inari Taisha");
    expect(titles).not.toContain("Sensoji Temple");
  });

  it("applies coverage independently per city in a multi-city trip", () => {
    const itinerary = makeItinerary([
      {
        id: "day-1",
        cityId: "tokyo",
        activities: [makePlace("filler-tokyo", "Filler Tokyo")],
      },
      {
        id: "day-2",
        cityId: "kyoto",
        activities: [makePlace("filler-kyoto", "Filler Kyoto")],
      },
    ]);

    const result = applyCanonicalCoverage({
      itinerary,
      personaId: "first-timer",
      allLocations: [sensoji, fushimiInari],
      perCityCap: 5,
    });

    const day1Titles = result.days[0]!.activities.map((a) => a.kind === "place" ? a.title : "");
    const day2Titles = result.days[1]!.activities.map((a) => a.kind === "place" ? a.title : "");
    expect(day1Titles).toContain("Sensoji Temple");
    expect(day2Titles).toContain("Fushimi Inari Taisha");
  });

  it("does not match canonicals for a different persona", () => {
    const itinerary = makeItinerary([
      {
        id: "day-1",
        cityId: "tokyo",
        activities: [makePlace("filler", "Filler")],
      },
    ]);

    const honeymoonerOnly = makeLocation({
      id: "park-hyatt-tokyo",
      name: "Park Hyatt Tokyo",
      city: "Tokyo",
      planningCity: "tokyo",
      canonicalForPersonas: ["honeymooner"],
    });

    const result = applyCanonicalCoverage({
      itinerary,
      personaId: "first-timer",
      allLocations: [honeymoonerOnly],
      perCityCap: 5,
    });

    const titles = result.days[0]!.activities.map((a) =>
      a.kind === "place" ? a.title : "",
    );
    expect(titles).toContain("Filler");
    expect(titles).not.toContain("Park Hyatt Tokyo");
  });

  it("force-includes a container canonical even when one of its children is already in the itinerary", () => {
    // Editor-curated container canonicals (Dotonbori, Gion, Higashi Chaya)
    // ARE the area-walk experience, distinct from any individual child
    // venue. Smoke-test 2026-05-08 showed dedup-by-child suppressed Gion
    // 86% of first-timer trips because Kenninji (child) landed first.
    // Container canonicals always render; the area is its own slot.
    const dotonbori = makeLocation({
      id: "dotonbori-kansai-31988d77",
      name: "Dotonbori",
      city: "Osaka",
      planningCity: "osaka",
      category: "landmark",
      parentMode: "container",
      canonicalForPersonas: ["first-timer"],
    });
    const hozenjiTemple = makeLocation({
      id: "hozenji-temple-kansai-58d20329",
      name: "Hozenji Temple",
      city: "Osaka",
      planningCity: "osaka",
      category: "temple",
      parentId: "dotonbori-kansai-31988d77",
    });

    const itinerary = makeItinerary([
      {
        id: "day-1",
        cityId: "osaka",
        activities: [
          makePlace(hozenjiTemple.id, hozenjiTemple.name),
          makePlace("filler", "Filler"),
        ],
      },
    ]);

    const result = applyCanonicalCoverage({
      itinerary,
      personaId: "first-timer",
      allLocations: [dotonbori, hozenjiTemple],
      perCityCap: 5,
    });

    const titles = result.days[0]!.activities.map((a) =>
      a.kind === "place" ? a.title : "",
    );
    expect(titles).toContain("Dotonbori");
    expect(titles).toContain("Hozenji Temple");
    // Filler was the lowest-priority swappable slot — it gets replaced.
    expect(titles).not.toContain("Filler");
  });

  it("skips a child canonical when its parent container is already in the itinerary", () => {
    const dotonbori = makeLocation({
      id: "dotonbori-kansai-31988d77",
      name: "Dotonbori",
      city: "Osaka",
      planningCity: "osaka",
      category: "landmark",
      parentMode: "container",
    });
    const hozenjiCanonical = makeLocation({
      id: "hozenji-temple-kansai-58d20329",
      name: "Hozenji Temple",
      city: "Osaka",
      planningCity: "osaka",
      category: "temple",
      parentId: "dotonbori-kansai-31988d77",
      canonicalForPersonas: ["first-timer"],
    });

    const itinerary = makeItinerary([
      {
        id: "day-1",
        cityId: "osaka",
        activities: [
          makePlace(dotonbori.id, dotonbori.name),
          makePlace("filler", "Filler"),
        ],
      },
    ]);

    const result = applyCanonicalCoverage({
      itinerary,
      personaId: "first-timer",
      allLocations: [dotonbori, hozenjiCanonical],
      perCityCap: 5,
    });

    const titles = result.days[0]!.activities.map((a) =>
      a.kind === "place" ? a.title : "",
    );
    // Hozenji should NOT be force-included because its parent (Dotonbori) is already in.
    expect(titles).toContain("Dotonbori");
    expect(titles).toContain("Filler");
    expect(titles).not.toContain("Hozenji Temple");
  });

  it("replaces a corpus-duplicate orphan with the same name when force-including a canonical", () => {
    // Smoke-test 2026-05-08 caught two rows in Kyoto both named "Gion":
    // the canonical container row, and an orphan landmark row. The picker
    // picked the orphan (parent_mode null), and the canonical layer used
    // to skip force-include because the name was "already in" the
    // itinerary. Now the layer prefers same-named activities as swap
    // targets so the canonical replaces the orphan, eliminating the
    // duplicate as a side effect.
    const canonicalGion = makeLocation({
      id: "gion-kanto-788c33aa",
      name: "Gion",
      city: "Kyoto",
      planningCity: "kyoto",
      category: "landmark",
      parentMode: "container",
      canonicalForPersonas: ["first-timer"],
    });
    const orphanGion = makeLocation({
      id: "gion-kansai-9e059ae5",
      name: "Gion",
      city: "Kyoto",
      planningCity: "kyoto",
      category: "landmark",
    });

    const itinerary = makeItinerary([
      {
        id: "day-1",
        cityId: "kyoto",
        activities: [
          makePlace(orphanGion.id, orphanGion.name),
          makePlace("filler-1", "Filler 1"),
          makePlace("filler-2", "Filler 2"),
        ],
      },
    ]);

    const result = applyCanonicalCoverage({
      itinerary,
      personaId: "first-timer",
      allLocations: [canonicalGion, orphanGion],
      perCityCap: 5,
    });

    const day1 = result.days[0]!.activities;
    const titles = day1.map((a) => a.kind === "place" ? a.title : "");
    // The orphan should be replaced by the canonical (same title, different id).
    expect(titles.filter((t) => t === "Gion")).toHaveLength(1);
    // The replacement should be at index 0 (where the orphan was), not at
    // the lowest-priority slot — Pass 1 prefers the same-named target.
    const gionActivity = day1.find((a) => a.kind === "place" && a.title === "Gion") as Extract<ItineraryActivity, { kind: "place" }> | undefined;
    expect(gionActivity?.locationId).toBe(canonicalGion.id);
    // Filler slots stay intact because Pass 1 grabbed the orphan instead.
    expect(titles).toContain("Filler 1");
    expect(titles).toContain("Filler 2");
  });

  it("does not evict an organically-picked canonical to make room for another canonical", () => {
    // Regression guard: Itsukushima Jinja (canonical, picker-organic) was
    // evicted by Pass 2 to make room for Hiroshima Castle (canonical,
    // not-yet-injected) on the same day — net zero canonicals, since we
    // dropped one to gain one. Sim 2026-05-10 reproduced this 3-4/30 runs
    // before the fix; 0/30 after. Pass 2 must skip organic-canonical
    // activities for the active persona+city when picking swap-out targets.
    const itsukushima = makeLocation({
      id: "itsukushima-jinja",
      name: "Itsukushima Jinja",
      city: "Hatsukaichi",
      planningCity: "hiroshima",
      category: "shrine",
      canonicalForPersonas: ["first-timer"],
    });
    const hiroshimaCastle = makeLocation({
      id: "hiroshima-castle",
      name: "Hiroshima Castle",
      city: "Hiroshima",
      planningCity: "hiroshima",
      category: "landmark",
      canonicalForPersonas: ["first-timer"],
    });
    const filler = makeLocation({
      id: "filler",
      name: "Filler Cafe",
      city: "Hiroshima",
      planningCity: "hiroshima",
      category: "cafe",
    });

    // Picker organically placed Itsukushima last (lowest-priority slot),
    // with a filler in the middle. Hiroshima Castle is canonical but
    // wasn't picked organically — it must land via Pass 2 swap-in.
    const itinerary = makeItinerary([
      {
        id: "day-1",
        cityId: "hiroshima",
        activities: [
          makePlace("anchor", "Hotel"),
          makePlace(filler.id, filler.name, { timeOfDay: "afternoon" }),
          makePlace(itsukushima.id, itsukushima.name, { timeOfDay: "afternoon" }),
        ],
      },
    ]);

    const result = applyCanonicalCoverage({
      itinerary,
      personaId: "first-timer",
      allLocations: [itsukushima, hiroshimaCastle, filler],
      perCityCap: 6,
    });

    const titles = result.days[0]!.activities.map((a) =>
      a.kind === "place" ? a.title : "",
    );
    // Both canonicals must remain — Castle injected, Itsukushima preserved.
    expect(titles).toContain("Hiroshima Castle");
    expect(titles).toContain("Itsukushima Jinja");
    // Filler was the only non-canonical swappable, so it should be the one
    // evicted to make room for Hiroshima Castle.
    expect(titles).not.toContain("Filler Cafe");
  });

  it("returns the original itinerary reference unchanged when no canonical fires", () => {
    const itinerary = makeItinerary([
      {
        id: "day-1",
        cityId: "tokyo",
        activities: [makePlace("filler", "Filler")],
      },
    ]);

    // No locations have canonicalForPersonas set.
    const result = applyCanonicalCoverage({
      itinerary,
      personaId: "first-timer",
      allLocations: [cafeBreukelen],
      perCityCap: 5,
    });

    // Days array is cloned but contents are equivalent.
    expect(result.days).toHaveLength(1);
    expect(result.days[0]!.activities).toHaveLength(1);
    expect((result.days[0]!.activities[0]! as Extract<ItineraryActivity, { kind: "place" }>).title).toBe("Filler");
  });
});

// ── Placement-by-time-of-day ─────────────────────────────────────────────
//
// Regression guard for KOK-54 (Direction 4 prod smoke 7/10): canonicals with
// daytime-only operating hours (Meiji Jingu close 17:00, Kinkaku-ji close
// 17:00, Tsukiji Outer close 14:00) were inheriting evening slots via Pass
// 2's "latest swappable" pick, then getting silently dropped by
// `planItinerary`'s operating-hours pre-check.
describe("applyCanonicalCoverage — placement by canonical's open hours", () => {
  it("places a 17:00-close shrine into an afternoon slot when an evening alternative exists", () => {
    const meijiWithHours = makeLocation({
      id: "meiji-jingu-with-hours",
      name: "Meiji Jingu",
      city: "Tokyo",
      planningCity: "tokyo",
      canonicalForPersonas: ["first-timer"],
      operatingHours: {
        timezone: "Asia/Tokyo",
        periods: [
          { day: "monday", open: "09:00", close: "17:00" },
          { day: "tuesday", open: "09:00", close: "17:00" },
          { day: "wednesday", open: "09:00", close: "17:00" },
          { day: "thursday", open: "09:00", close: "17:00" },
          { day: "friday", open: "09:00", close: "17:00" },
          { day: "saturday", open: "09:00", close: "17:00" },
          { day: "sunday", open: "09:00", close: "17:00" },
        ],
      },
    });

    const itinerary = makeItinerary([
      {
        id: "day-1",
        cityId: "tokyo",
        activities: [
          makePlace("morning-pick", "Morning Pick", { timeOfDay: "morning" }),
          makePlace("afternoon-pick", "Afternoon Pick", { timeOfDay: "afternoon" }),
          makePlace("evening-pick", "Evening Bar", { timeOfDay: "evening" }),
        ],
      },
    ]);

    const result = applyCanonicalCoverage({
      itinerary,
      personaId: "first-timer",
      allLocations: [meijiWithHours],
      perCityCap: 5,
    });

    const day1 = result.days[0]!;
    const meijiActivity = day1.activities.find(
      (a) => a.kind === "place" && a.title === "Meiji Jingu",
    ) as Extract<ItineraryActivity, { kind: "place" }>;
    expect(meijiActivity).toBeDefined();
    expect(meijiActivity.timeOfDay).not.toBe("evening");
    expect(["morning", "afternoon"]).toContain(meijiActivity.timeOfDay);
    // Canonical-injected activities must carry isCanonical=true so refineTooBusy
    // can protect them. The id suffix is decorative; the flag is the contract.
    expect(meijiActivity.isCanonical).toBe(true);

    // Evening pick is preserved because we preferred the afternoon slot
    expect(
      day1.activities.some(
        (a) => a.kind === "place" && a.title === "Evening Bar",
      ),
    ).toBe(true);
  });

  it("falls back to latest-position when no swappable in the canonical's open buckets", () => {
    // Canonical is morning-only (closes 11:00); the day has only an
    // evening swappable. We still place the canonical (brand-promise),
    // accepting that downstream operating-hours checks may flag it —
    // an evening placement is still better than no placement at all.
    const morningOnly = makeLocation({
      id: "early-market",
      name: "Early Market",
      city: "Tokyo",
      planningCity: "tokyo",
      canonicalForPersonas: ["first-timer"],
      operatingHours: {
        timezone: "Asia/Tokyo",
        periods: [
          { day: "monday", open: "05:00", close: "11:00" },
          { day: "tuesday", open: "05:00", close: "11:00" },
          { day: "wednesday", open: "05:00", close: "11:00" },
          { day: "thursday", open: "05:00", close: "11:00" },
          { day: "friday", open: "05:00", close: "11:00" },
          { day: "saturday", open: "05:00", close: "11:00" },
          { day: "sunday", open: "05:00", close: "11:00" },
        ],
      },
    });

    const itinerary = makeItinerary([
      {
        id: "day-1",
        cityId: "tokyo",
        activities: [
          makePlace("evening-1", "Evening 1", { timeOfDay: "evening" }),
          makePlace("evening-2", "Evening 2", { timeOfDay: "evening" }),
        ],
      },
    ]);

    const result = applyCanonicalCoverage({
      itinerary,
      personaId: "first-timer",
      allLocations: [morningOnly],
      perCityCap: 5,
    });

    const day1 = result.days[0]!;
    expect(
      day1.activities.some(
        (a) => a.kind === "place" && a.title === "Early Market",
      ),
    ).toBe(true);
  });

  it("ignores time-of-day preference for 24/7 canonicals (no operating hours)", () => {
    // Sensoji has null operating hours in our corpus — should fall through
    // to plain latest-position semantics, identical to pre-fix behavior.
    const itinerary = makeItinerary([
      {
        id: "day-1",
        cityId: "tokyo",
        activities: [
          makePlace("morning-pick", "Morning Pick", { timeOfDay: "morning" }),
          makePlace("afternoon-pick", "Afternoon Pick", { timeOfDay: "afternoon" }),
          makePlace("evening-pick", "Evening Pick", { timeOfDay: "evening" }),
        ],
      },
    ]);

    const result = applyCanonicalCoverage({
      itinerary,
      personaId: "first-timer",
      // sensoji fixture defined at top of file has no operatingHours
      allLocations: [sensoji],
      perCityCap: 5,
    });

    const day1 = result.days[0]!;
    const sensojiActivity = day1.activities.find(
      (a) => a.kind === "place" && a.title === "Sensoji Temple",
    ) as Extract<ItineraryActivity, { kind: "place" }>;
    expect(sensojiActivity).toBeDefined();
    // Latest swappable was evening-pick → canonical inherits "evening"
    expect(sensojiActivity.timeOfDay).toBe("evening");
  });
});
