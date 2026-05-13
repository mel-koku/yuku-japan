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
      seasonalType: "snow_winter",
      validMonths: [12, 1, 2, 3],
    };
    const result = scoreSeasonalMatch(loc, 7);
    expect(result.scoreAdjustment).toBe(-15);
  });

  it("does not penalize a real gate type that is in window", () => {
    const loc: Location = {
      ...base,
      isSeasonal: true,
      seasonalType: "snow_winter",
      validMonths: [12, 1, 2, 3],
    };
    const result = scoreSeasonalMatch(loc, 1);
    expect(result.scoreAdjustment).toBeGreaterThanOrEqual(0);
  });

  it("ignores residual valid_months on a hero-marker type (cherry_blossom)", () => {
    // A cherry_blossom row that still has validMonths set must NOT get -15 in June.
    const loc: Location = {
      ...base,
      isSeasonal: true,
      seasonalType: "cherry_blossom",
      validMonths: [1, 2, 3, 4, 5],
    };
    const result = scoreSeasonalMatch(loc, 6);
    expect(result.scoreAdjustment).toBeGreaterThan(-15);
  });
});
