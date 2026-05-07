import { describe, it, expect } from "vitest";
import { pickLocationForTimeSlot } from "../locationPicker";
import type { Location } from "@/types/location";

function makeLocation(overrides: Partial<Location> & { id: string; name: string; category: string }): Location {
  return {
    region: "Kanto",
    city: "Tokyo",
    ...overrides,
  } as Location;
}

describe("pickLocationForTimeSlot evening category filter", () => {
  // Mozu/Daisen Kofun shape — landmark category, no operating hours, NOT in
  // NIGHT_FRIENDLY_LOCATION_IDS. Should be filtered out of evening slots.
  const daytimeLandmark = makeLocation({
    id: "mozu-mounded-tombs-kansai-8a3ee78a",
    name: "Mozu Mounded Tombs",
    category: "landmark",
  });

  // Generic landmark with confirmed evening hours — admitted via the
  // hours-fit branch, even though it isn't on the allowlist.
  const landmarkWithEveningHours = makeLocation({
    id: "some-tower",
    name: "Some Observation Tower",
    category: "landmark",
    operatingHours: {
      timezone: "Asia/Tokyo",
      periods: [
        { day: "monday", open: "09:00", close: "22:00" },
        { day: "tuesday", open: "09:00", close: "22:00" },
        { day: "wednesday", open: "09:00", close: "22:00" },
        { day: "thursday", open: "09:00", close: "22:00" },
        { day: "friday", open: "09:00", close: "22:00" },
        { day: "saturday", open: "09:00", close: "22:00" },
        { day: "sunday", open: "09:00", close: "22:00" },
      ],
    },
  });

  // Tokyo Tower shape — viewpoint category, NO operating hours, but IS in
  // NIGHT_FRIENDLY_LOCATION_IDS. Should be admitted by the allowlist.
  const allowlistedNightLandmark = makeLocation({
    id: "tokyo-tower-kanto-db632e17",
    name: "Tokyo Tower",
    category: "viewpoint",
  });

  const restaurant = makeLocation({
    id: "ramen-shop",
    name: "Ramen Shop",
    category: "restaurant",
  });

  const museum = makeLocation({
    id: "peace-museum",
    name: "Peace Museum",
    category: "museum",
  });

  it("filters daytime landmark from evening slot when not allowlisted (regression: Mozu Kofun at 21:00)", () => {
    const result = pickLocationForTimeSlot(
      [daytimeLandmark],
      "culture",
      new Set(),
      120,
      10,
      undefined, [], "balanced", ["culture"],
      undefined, undefined, undefined, undefined,
      "evening", "2024-01-01",
    );
    expect(result).toBeUndefined();
  });

  it("admits allowlisted night landmark in evening slot (Tokyo Tower)", () => {
    const result = pickLocationForTimeSlot(
      [allowlistedNightLandmark],
      "culture",
      new Set(),
      120,
      10,
      undefined, [], "balanced", ["culture"],
      undefined, undefined, undefined, undefined,
      "evening", "2024-01-01",
    );
    expect(result).toBeDefined();
    expect(result?.id).toBe("tokyo-tower-kanto-db632e17");
  });

  it("admits restaurant in evening slot", () => {
    const result = pickLocationForTimeSlot(
      [restaurant],
      "food",
      new Set(),
      120,
      10,
      undefined, [], "balanced", ["food"],
      undefined, undefined, undefined, undefined,
      "evening", "2024-01-01",
    );
    expect(result).toBeDefined();
    expect(result?.id).toBe("ramen-shop");
  });

  it("admits non-allowlisted landmark when operating hours confirm evening open", () => {
    const result = pickLocationForTimeSlot(
      [landmarkWithEveningHours],
      "culture",
      new Set(),
      120,
      10,
      undefined, [], "balanced", ["culture"],
      undefined, undefined, undefined, undefined,
      "evening", "2024-01-01",
    );
    expect(result).toBeDefined();
    expect(result?.id).toBe("some-tower");
  });

  it("filters daytime landmark from evening slot at start of evening (regression: first-evening-slot bypass hole)", () => {
    // Previously the hard filter only kicked in at availableMinutes <= 180
    // (~60 min into the evening slot), letting the first evening pick bypass.
    const result = pickLocationForTimeSlot(
      [daytimeLandmark],
      "culture",
      new Set(),
      220, // start of evening slot — used to bypass the filter
      10,
      undefined, [], "balanced", ["culture"],
      undefined, undefined, undefined, undefined,
      "evening", "2024-01-01",
    );
    expect(result).toBeUndefined();
  });

  it("filters category-allowed location when its hours do not fit evening (e.g. cafe-tagged-restaurant closing 14:00)", () => {
    // The new evening rule runs hours validation even for category-allowed
    // picks, closing the bypass that admitted shopping at 17:00-closing markets.
    // Mistagged or early-closing venues should now be filtered.
    const earlyClosingRestaurant = makeLocation({
      id: "morning-only-cafe",
      name: "Morning Only Cafe",
      category: "restaurant",
      operatingHours: {
        timezone: "Asia/Tokyo",
        periods: [
          { day: "monday", open: "07:00", close: "14:00" },
        ],
      },
    });
    const result = pickLocationForTimeSlot(
      [earlyClosingRestaurant],
      "food",
      new Set(),
      120,
      10,
      undefined, [], "balanced", ["food"],
      undefined, undefined, undefined, undefined,
      "evening", "2024-01-01",
    );
    expect(result).toBeUndefined();
  });

  it("admits category-allowed location when it has no hours data (preserves the no-hours-no-info case)", () => {
    // Many DB rows lack operatingHours. Those should not be punished — the
    // hours-fit branch only kicks in when periods are present.
    const result = pickLocationForTimeSlot(
      [restaurant],
      "food",
      new Set(),
      120,
      10,
      undefined, [], "balanced", ["food"],
      undefined, undefined, undefined, undefined,
      "evening", "2024-01-01",
    );
    expect(result).toBeDefined();
    expect(result?.id).toBe("ramen-shop");
  });

  it("filters museum without hours from evening slot", () => {
    const result = pickLocationForTimeSlot(
      [museum],
      "culture",
      new Set(),
      120,
      10,
      undefined, [], "balanced", ["culture"],
      undefined, undefined, undefined, undefined,
      "evening", "2024-01-01",
    );
    expect(result).toBeUndefined();
  });
});
