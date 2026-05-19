import { describe, expect, it } from "vitest";
import { formatCityRegion } from "@/lib/locationNameUtils";

describe("formatCityRegion", () => {
  it("joins city and region with a comma when both are present and distinct", () => {
    expect(formatCityRegion("Kyoto", "Kansai")).toBe("Kyoto, Kansai");
  });

  it("returns city only when region is undefined", () => {
    expect(formatCityRegion("Kyoto", undefined)).toBe("Kyoto");
  });

  it("returns city only when region is null", () => {
    expect(formatCityRegion("Kyoto", null)).toBe("Kyoto");
  });

  it("returns city only when region equals city, avoiding 'Tokyo, Tokyo'", () => {
    expect(formatCityRegion("Tokyo", "Tokyo")).toBe("Tokyo");
  });
});
