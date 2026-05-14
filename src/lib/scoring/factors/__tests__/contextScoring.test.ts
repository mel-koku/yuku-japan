import { describe, expect, it } from "vitest";
import { scoreSeasonalMatch } from "../contextScoring";
import type { Location } from "@/types/location";

const base: Location = {
  id: "test",
  name: "Test",
  region: "Hokkaido",
  city: "Sapporo",
  category: "landmark",
  image: "test.jpg",
};

describe("scoreSeasonalMatch — valid_months gating predicate", () => {
  it("applies -15 when a real gate type is out of window", () => {
    const loc: Location = {
      ...base,
      isSeasonal: true,
      seasonalType: "winter_closure",
      validMonths: [12, 1, 2, 3],
    };
    const result = scoreSeasonalMatch(loc, 7);
    expect(result.scoreAdjustment).toBe(-15);
  });

  it("does not penalize a real gate type that is in window", () => {
    const loc: Location = {
      ...base,
      isSeasonal: true,
      seasonalType: "winter_closure",
      validMonths: [12, 1, 2, 3],
    };
    const result = scoreSeasonalMatch(loc, 1);
    expect(result.scoreAdjustment).toBeGreaterThanOrEqual(0);
  });

  it("applies -15 when winter_festival is out of window", () => {
    // Post-2026-05-14 reclassify, the 2 remaining winter_festival rows
    // (Sapporo Snow Festival, Hakodate Christmas Fantasy) are genuine
    // winter-event-only venues. valid_months is a hard gate.
    const loc: Location = {
      ...base,
      isSeasonal: true,
      seasonalType: "winter_festival",
      validMonths: [2],
    };
    const result = scoreSeasonalMatch(loc, 7);
    expect(result.scoreAdjustment).toBe(-15);
  });

  it("ignores residual valid_months on a hero-marker type (festival)", () => {
    // A festival row that still has validMonths set must NOT get -15 outside its window.
    const loc: Location = {
      ...base,
      isSeasonal: true,
      seasonalType: "festival",
      validMonths: [1, 2, 3, 4, 5],
    };
    const result = scoreSeasonalMatch(loc, 6);
    expect(result.scoreAdjustment).toBeGreaterThanOrEqual(0);
  });
});
