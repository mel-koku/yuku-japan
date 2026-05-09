import { describe, it, expect } from "vitest";
import { inferPersonaId } from "../personaInference";
import type { TripBuilderData } from "@/types/trip";

function makeData(overrides: Partial<TripBuilderData> = {}): TripBuilderData {
  return {
    dates: { start: "2026-06-01", end: "2026-06-10" },
    ...overrides,
  };
}

describe("inferPersonaId — primary signals (explicit user input)", () => {
  it("returns 'first-timer' when isFirstTimeVisitor is true, regardless of shape", () => {
    const data = makeData({
      isFirstTimeVisitor: true,
      // Honeymoon-shaped: couple + 14d + zen_wellness — would otherwise
      // match honeymooner. Explicit signal must win.
      group: { type: "couple" },
      duration: 14,
      vibes: ["zen_wellness"],
      cities: ["kyoto", "hakone"],
    });
    expect(inferPersonaId(data)).toBe("first-timer");
  });

  it("returns 'family' when group.type is family", () => {
    const data = makeData({
      group: { type: "family", childrenAges: [8, 11] },
      cities: ["tokyo", "osaka"],
      duration: 7,
    });
    expect(inferPersonaId(data)).toBe("family");
  });
});

describe("inferPersonaId — secondary signals (shape diagnostics)", () => {
  it("returns 'honeymooner' for couple + 14d + zen_wellness", () => {
    const data = makeData({
      group: { type: "couple" },
      duration: 14,
      vibes: ["zen_wellness", "temples_tradition"],
      cities: ["kyoto", "hakone", "tokyo"],
    });
    expect(inferPersonaId(data)).toBe("honeymooner");
  });

  it("returns 'honeymooner' for couple + 21d + zen_wellness", () => {
    const data = makeData({
      group: { type: "couple" },
      duration: 21,
      vibes: ["zen_wellness", "art_architecture"],
      cities: ["kyoto", "hakone", "kanazawa"],
    });
    // 21d couple + zen_wellness AND kanazawa (repeat-leaning city).
    // Honeymooner check runs first so honeymooner wins.
    expect(inferPersonaId(data)).toBe("honeymooner");
  });

  it("returns 'repeat' when local_secrets vibe is present", () => {
    const data = makeData({
      group: { type: "couple" },
      duration: 7,
      vibes: ["local_secrets", "temples_tradition"],
      cities: ["kyoto", "tokyo"],
    });
    expect(inferPersonaId(data)).toBe("repeat");
  });

  it("returns 'repeat' when a repeat-leaning city is in cities", () => {
    const data = makeData({
      group: { type: "solo" },
      duration: 7,
      vibes: ["temples_tradition", "art_architecture"],
      cities: ["matsue", "tottori"],
    });
    expect(inferPersonaId(data)).toBe("repeat");
  });

  it("returns 'first-timer' for Tokyo+Kyoto + couple + 10d + non-local_secrets vibes", () => {
    const data = makeData({
      group: { type: "couple" },
      duration: 10,
      vibes: ["temples_tradition", "foodie_paradise"],
      cities: ["tokyo", "kyoto", "osaka"],
    });
    expect(inferPersonaId(data)).toBe("first-timer");
  });

  it("returns 'first-timer' for Tokyo+Kyoto + solo + 7d", () => {
    const data = makeData({
      group: { type: "solo" },
      duration: 7,
      vibes: ["art_architecture"],
      cities: ["tokyo", "kyoto"],
    });
    expect(inferPersonaId(data)).toBe("first-timer");
  });
});

describe("inferPersonaId — tiebreaker fixtures (advisor-flagged)", () => {
  it("Tokyo+Kyoto+local_secrets+couple → 'repeat' (local_secrets beats first-timer-shape)", () => {
    const data = makeData({
      group: { type: "couple" },
      duration: 10,
      vibes: ["local_secrets", "temples_tradition"],
      cities: ["tokyo", "kyoto"],
    });
    expect(inferPersonaId(data)).toBe("repeat");
  });

  it("isFirstTimeVisitor=true + honeymoon-shape → 'first-timer' (explicit beats inferred)", () => {
    const data = makeData({
      isFirstTimeVisitor: true,
      group: { type: "couple" },
      duration: 14,
      vibes: ["zen_wellness", "temples_tradition"],
      cities: ["kyoto", "hakone", "tokyo"],
    });
    expect(inferPersonaId(data)).toBe("first-timer");
  });
});

describe("inferPersonaId — confidence floor (returns undefined)", () => {
  it("returns undefined for empty builderData", () => {
    expect(inferPersonaId(makeData())).toBeUndefined();
  });

  it("returns undefined for solo trip with one obscure city + no diagnostic vibes", () => {
    const data = makeData({
      group: { type: "solo" },
      duration: 5,
      vibes: ["foodie_paradise"],
      cities: ["nagoya"],
    });
    expect(inferPersonaId(data)).toBeUndefined();
  });

  it("returns undefined for Tokyo-only trip without diagnostic signals", () => {
    const data = makeData({
      group: { type: "couple" },
      duration: 5,
      vibes: ["modern_japan"],
      cities: ["tokyo"],
    });
    expect(inferPersonaId(data)).toBeUndefined();
  });

  it("returns undefined for Tokyo+Kyoto + 5d (too short for first-timer range)", () => {
    const data = makeData({
      group: { type: "couple" },
      duration: 5,
      vibes: ["temples_tradition"],
      cities: ["tokyo", "kyoto"],
    });
    expect(inferPersonaId(data)).toBeUndefined();
  });

  it("returns undefined for friends group without diagnostic city/vibe", () => {
    const data = makeData({
      group: { type: "friends" },
      duration: 7,
      vibes: ["foodie_paradise"],
      cities: ["osaka"],
    });
    expect(inferPersonaId(data)).toBeUndefined();
  });
});

describe("inferPersonaId — purity", () => {
  it("does not mutate the input", () => {
    const data = makeData({
      isFirstTimeVisitor: true,
      cities: ["tokyo", "kyoto"],
      vibes: ["temples_tradition"],
      group: { type: "couple" },
      duration: 10,
    });
    const snapshot = JSON.parse(JSON.stringify(data));
    inferPersonaId(data);
    expect(data).toEqual(snapshot);
  });

  it("is deterministic — same input produces same output", () => {
    const data = makeData({
      isFirstTimeVisitor: true,
      cities: ["tokyo", "kyoto"],
      duration: 10,
      group: { type: "couple" },
    });
    expect(inferPersonaId(data)).toBe(inferPersonaId(data));
  });
});
