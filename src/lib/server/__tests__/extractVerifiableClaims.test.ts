import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  extractVerifiableClaims,
  type ClaimFamily,
} from "../contentGen/extractVerifiableClaims";

/** Helper: collect the families present in an extraction result. */
function families(prose: string): Set<ClaimFamily> {
  return new Set(extractVerifiableClaims(prose).map((c) => c.family));
}

describe("extractVerifiableClaims", () => {
  describe("the zero-cost gate (empty result = Pass 4 skipped)", () => {
    it("returns [] for a clean operational note", () => {
      // The 87% case — no verifiable claim shape, Pass 4 must be skipped.
      const prose =
        "Arrive before 9 AM to beat the tour buses. The east gate is the quiet entrance; skip the gift hall and head straight for the moss garden.";
      expect(extractVerifiableClaims(prose)).toEqual([]);
    });

    it("returns [] for empty or whitespace-only prose", () => {
      expect(extractVerifiableClaims("")).toEqual([]);
      expect(extractVerifiableClaims("   \n  ")).toEqual([]);
    });
  });

  describe("temporal-superlative family (stale-claim shapes)", () => {
    it("catches 'N consecutive years'", () => {
      const claims = extractVerifiableClaims(
        "It has held three Michelin stars for 15 consecutive years.",
      );
      expect(claims.some((c) => c.family === "temporal-superlative")).toBe(true);
    });

    it("catches 'Nth consecutive year'", () => {
      expect(families("Now in its 17th consecutive year of the rating.")).toContain(
        "temporal-superlative",
      );
    });

    it("catches 'since YYYY'", () => {
      const claims = extractVerifiableClaims(
        "The pavilion cafe has served the same hayashi rice since 1903.",
      );
      const m = claims.find((c) => c.family === "temporal-superlative");
      expect(m?.text.toLowerCase()).toContain("since 1903");
    });
  });

  describe("founding-age family", () => {
    it("catches descriptive age claims the deny-list misses ('X years old')", () => {
      // The Nezu Shrine legend-as-fact case.
      const claims = extractVerifiableClaims(
        "The shrine is often described as 1,900 years old.",
      );
      expect(claims.some((c) => c.family === "founding-age")).toBe(true);
    });

    it("catches hyphenated age claims ('300-year-old')", () => {
      expect(
        families("matcha behind 300-year-old pines"),
      ).toContain("founding-age");
    });

    it("catches 'founded in' and century shapes", () => {
      expect(families("founded in the Edo period")).toContain("founding-age");
      expect(families("Dating to the 16th century")).toContain("founding-age");
    });

    it("catches 'centuries-old'", () => {
      expect(families("a centuries-old merchant house")).toContain(
        "founding-age",
      );
    });
  });

  describe("superlative family", () => {
    it("catches 'the oldest / largest / only / first'", () => {
      expect(families("the oldest wooden structure in the prefecture")).toContain(
        "superlative",
      );
      expect(families("the largest example of medieval Zen architecture")).toContain(
        "superlative",
      );
      expect(families("the only branch that still serves the original dish")).toContain(
        "superlative",
      );
    });

    it("catches 'one of the world's longest'", () => {
      expect(
        families("one of the world's longest suspension bridges"),
      ).toContain("superlative");
    });

    it("catches 'world-class'", () => {
      expect(families("world-class ramen and udon houses")).toContain(
        "superlative",
      );
    });
  });

  describe("transit family (bad-DB-data shapes)", () => {
    it("catches 'N-minute walk' distance claims", () => {
      const claims = extractVerifiableClaims(
        "It is a 15-minute walk from the stadium.",
      );
      expect(claims.some((c) => c.family === "transit")).toBe(true);
    });

    it("catches bare station-name mentions (nearest_station verification)", () => {
      // A wrong nearest_station flows from INPUT; Pass 4 should still verify
      // station adjacency even when phrased as operational guidance.
      const claims = extractVerifiableClaims(
        "Walk in from Kichijoji Station; there is no parking.",
      );
      const m = claims.find((c) => c.family === "transit");
      expect(m?.text).toBe("Kichijoji Station");
    });

    it("catches 'nearest station' phrasing", () => {
      expect(families("The nearest station is a 10-minute bus ride.")).toContain(
        "transit",
      );
    });
  });

  describe("dedupe + cap", () => {
    it("dedupes the same span case-insensitively", () => {
      const claims = extractVerifiableClaims(
        "The Oldest hall here. Also the oldest gate in the city.",
      );
      const oldestHits = claims.filter(
        (c) => c.text.toLowerCase() === "the oldest",
      );
      expect(oldestHits).toHaveLength(1);
    });

    it("caps a pathological note at 8 claims", () => {
      // String with many distinct superlative + age + transit shapes.
      const prose =
        "the oldest, the largest, the first, the only, the tallest, " +
        "founded in 700, dating to the 8th century, world-class, " +
        "since 1900, a 5-minute walk, the most popular";
      const claims = extractVerifiableClaims(prose);
      expect(claims.length).toBeLessThanOrEqual(8);
    });
  });

  describe("multi-family extraction", () => {
    it("returns claims from every family present in one note", () => {
      const prose =
        "Dating to the 16th century, it is the largest hall of its kind, " +
        "a 20-minute walk from the station, serving the same dish since 1801.";
      const fams = families(prose);
      expect(fams).toContain("founding-age");
      expect(fams).toContain("superlative");
      expect(fams).toContain("transit");
      expect(fams).toContain("temporal-superlative");
    });
  });
});
