import { describe, expect, it } from "vitest";
import { checkOpeningHoursFit, scoreTimeOfDayFit, EVENING_APPROPRIATE_CATEGORIES } from "../timeOptimization";
import type { Location } from "@/types/location";

describe("Time Optimization", () => {
  describe("checkOpeningHoursFit", () => {
    it("should return true when location is open during the time slot", () => {
      const location: Location = {
        id: "test-location",
        name: "Test Location",
        city: "Kyoto",
        region: "Kansai",
        category: "temple",
        operatingHours: {
          timezone: "Asia/Tokyo",
          periods: [
            { day: "monday", open: "09:00", close: "17:00" },
            { day: "tuesday", open: "09:00", close: "17:00" },
          ],
        },
      };

      // Monday morning (9am-12pm) - should fit (180min overlap)
      const result = checkOpeningHoursFit(location, "morning", "2024-01-01"); // Monday
      expect(result.fits).toBe(true);
      expect(result.reasoning).toContain("Open during morning");
      expect(result.reasoning).toContain("180min available");
    });

    it("should return true when location opens mid-slot (bug fix)", () => {
      const location: Location = {
        id: "test-location",
        name: "Test Location",
        city: "Kyoto",
        region: "Kansai",
        category: "temple",
        operatingHours: {
          timezone: "Asia/Tokyo",
          periods: [
            { day: "monday", open: "10:00", close: "18:00" },
          ],
        },
      };

      // Monday morning (9am-12pm) - location opens at 10am
      // This should fit because 9-12 overlaps with 10-18
      const result = checkOpeningHoursFit(location, "morning", "2024-01-01"); // Monday
      expect(result.fits).toBe(true);
      expect(result.reasoning).toContain("Open during morning");
    });

    it("should return true when location closes mid-slot", () => {
      const location: Location = {
        id: "test-location",
        name: "Test Location",
        city: "Kyoto",
        region: "Kansai",
        category: "temple",
        operatingHours: {
          timezone: "Asia/Tokyo",
          periods: [
            { day: "monday", open: "09:00", close: "11:00" },
          ],
        },
      };

      // Monday morning (9am-12pm) - location closes at 11am
      // This should fit because 9-12 overlaps with 9-11
      const result = checkOpeningHoursFit(location, "morning", "2024-01-01"); // Monday
      expect(result.fits).toBe(true);
    });

    it("should return false when location is closed during the time slot", () => {
      const location: Location = {
        id: "test-location",
        name: "Test Location",
        city: "Kyoto",
        region: "Kansai",
        category: "temple",
        operatingHours: {
          timezone: "Asia/Tokyo",
          periods: [
            { day: "monday", open: "14:00", close: "18:00" },
          ],
        },
      };

      // Monday morning (9am-12pm) - location opens at 2pm, 0 overlap
      const result = checkOpeningHoursFit(location, "morning", "2024-01-01"); // Monday
      expect(result.fits).toBe(false);
      expect(result.reasoning).toContain("Insufficient opening hours during morning");
    });

    it("should return false when location closes before time slot starts", () => {
      const location: Location = {
        id: "test-location",
        name: "Test Location",
        city: "Kyoto",
        region: "Kansai",
        category: "temple",
        operatingHours: {
          timezone: "Asia/Tokyo",
          periods: [
            { day: "monday", open: "09:00", close: "11:00" },
          ],
        },
      };

      // Monday afternoon (12pm-5pm) - location closes at 11am
      const result = checkOpeningHoursFit(location, "afternoon", "2024-01-01"); // Monday
      expect(result.fits).toBe(false);
    });

    it("should return true for overnight periods", () => {
      const location: Location = {
        id: "test-location",
        name: "Test Location",
        city: "Kyoto",
        region: "Kansai",
        category: "shrine",
        operatingHours: {
          timezone: "Asia/Tokyo",
          periods: [
            { day: "monday", open: "00:00", close: "23:59", isOvernight: true },
          ],
        },
      };

      // Should fit any time slot
      const morningResult = checkOpeningHoursFit(location, "morning", "2024-01-01");
      const afternoonResult = checkOpeningHoursFit(location, "afternoon", "2024-01-01");
      const eveningResult = checkOpeningHoursFit(location, "evening", "2024-01-01");

      expect(morningResult.fits).toBe(true);
      expect(afternoonResult.fits).toBe(true);
      expect(eveningResult.fits).toBe(true);
    });

    it("should return true when no opening hours information available", () => {
      const location: Location = {
        id: "test-location",
        name: "Test Location",
        city: "Kyoto",
        region: "Kansai",
        category: "temple",
      };

      const result = checkOpeningHoursFit(location, "morning", "2024-01-01");
      expect(result.fits).toBe(true);
      expect(result.reasoning).toContain("No opening hours information available");
    });

    it("should match weekday correctly", () => {
      const location: Location = {
        id: "test-location",
        name: "Test Location",
        city: "Kyoto",
        region: "Kansai",
        category: "temple",
        operatingHours: {
          timezone: "Asia/Tokyo",
          periods: [
            { day: "monday", open: "09:00", close: "17:00" },
            { day: "tuesday", open: "09:00", close: "17:00" },
            { day: "wednesday", open: "09:00", close: "17:00" },
          ],
        },
      };

      // Monday - should match
      const mondayResult = checkOpeningHoursFit(location, "morning", "2024-01-01"); // Monday
      expect(mondayResult.fits).toBe(true);

      // Sunday - should not match (no period for Sunday)
      const sundayResult = checkOpeningHoursFit(location, "morning", "2023-12-31"); // Sunday
      expect(sundayResult.fits).toBe(false);
    });

    it("should handle afternoon slot correctly", () => {
      const location: Location = {
        id: "test-location",
        name: "Test Location",
        city: "Kyoto",
        region: "Kansai",
        category: "restaurant",
        operatingHours: {
          timezone: "Asia/Tokyo",
          periods: [
            { day: "monday", open: "11:00", close: "22:00" },
          ],
        },
      };

      // Afternoon (12pm-5pm) - should fit
      const result = checkOpeningHoursFit(location, "afternoon", "2024-01-01");
      expect(result.fits).toBe(true);
    });

    it("should handle evening slot correctly", () => {
      const location: Location = {
        id: "test-location",
        name: "Test Location",
        city: "Kyoto",
        region: "Kansai",
        category: "bar",
        operatingHours: {
          timezone: "Asia/Tokyo",
          periods: [
            { day: "monday", open: "17:00", close: "23:00" },
          ],
        },
      };

      // Evening (5pm-9pm) - should fit
      const result = checkOpeningHoursFit(location, "evening", "2024-01-01");
      expect(result.fits).toBe(true);
    });

    it("should reject when overlap is less than minimum visit duration", () => {
      const location: Location = {
        id: "test-location",
        name: "Test Location",
        city: "Kyoto",
        region: "Kansai",
        category: "landmark",
        operatingHours: {
          timezone: "Asia/Tokyo",
          periods: [
            { day: "monday", open: "09:00", close: "17:20" },
          ],
        },
      };

      // Evening slot (17:00-21:00) — only 20min overlap (17:00-17:20), below 30min default
      const result = checkOpeningHoursFit(location, "evening", "2024-01-01");
      expect(result.fits).toBe(false);
      expect(result.reasoning).toContain("Insufficient opening hours");
    });

    it("should accept when overlap meets minimum visit duration", () => {
      const location: Location = {
        id: "test-location",
        name: "Test Location",
        city: "Kyoto",
        region: "Kansai",
        category: "landmark",
        operatingHours: {
          timezone: "Asia/Tokyo",
          periods: [
            { day: "monday", open: "09:00", close: "17:30" },
          ],
        },
      };

      // Evening slot (17:00-21:00) — 30min overlap (17:00-17:30), exactly meets 30min default
      const result = checkOpeningHoursFit(location, "evening", "2024-01-01");
      expect(result.fits).toBe(true);
      expect(result.reasoning).toContain("30min available");
    });

    it("should respect custom minVisitMinutes parameter", () => {
      const location: Location = {
        id: "test-location",
        name: "Test Location",
        city: "Kyoto",
        region: "Kansai",
        category: "landmark",
        operatingHours: {
          timezone: "Asia/Tokyo",
          periods: [
            { day: "monday", open: "09:00", close: "17:30" },
          ],
        },
      };

      // 30min overlap — passes with default 30, fails with 60
      expect(checkOpeningHoursFit(location, "evening", "2024-01-01", 30).fits).toBe(true);
      expect(checkOpeningHoursFit(location, "evening", "2024-01-01", 60).fits).toBe(false);
    });
  });

  describe("scoreTimeOfDayFit", () => {
    it("should give high score for optimal time slot", () => {
      const location: Location = {
        id: "test-temple",
        name: "Test Temple",
        city: "Kyoto",
        region: "Kansai",
        category: "temple",
      };

      // Temple optimal times: morning, evening
      const morningResult = scoreTimeOfDayFit(location, "morning");
      expect(morningResult.scoreAdjustment).toBe(8);
      expect(morningResult.reasoning).toContain("morning is an optimal time");

      const eveningResult = scoreTimeOfDayFit(location, "evening");
      expect(eveningResult.scoreAdjustment).toBe(8);
    });

    it("should give penalty for non-optimal time slot", () => {
      const location: Location = {
        id: "test-temple",
        name: "Test Temple",
        city: "Kyoto",
        region: "Kansai",
        category: "temple",
      };

      // Temple optimal times: morning, evening (not afternoon)
      const afternoonResult = scoreTimeOfDayFit(location, "afternoon");
      expect(afternoonResult.scoreAdjustment).toBeLessThan(8);
    });

    it("should give small boost for adjacent optimal time", () => {
      const location: Location = {
        id: "test-shrine",
        name: "Test Shrine",
        city: "Kyoto",
        region: "Kansai",
        category: "shrine",
      };

      // Shrine optimal: morning, evening
      // Afternoon is adjacent to both, should get small boost
      const afternoonResult = scoreTimeOfDayFit(location, "afternoon");
      expect(afternoonResult.scoreAdjustment).toBe(3);
    });

    it("should return neutral for categories without time preference", () => {
      const location: Location = {
        id: "test-unknown",
        name: "Test Location",
        city: "Kyoto",
        region: "Kansai",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Testing unknown category handling
        category: "unknown" as any,
      };

      const result = scoreTimeOfDayFit(location, "morning");
      expect(result.scoreAdjustment).toBe(0);
      expect(result.reasoning).toContain("No specific time preference");
    });
  });

  describe("EVENING_APPROPRIATE_CATEGORIES", () => {
    it("includes evening-appropriate categories", () => {
      expect(EVENING_APPROPRIATE_CATEGORIES.has("restaurant")).toBe(true);
      expect(EVENING_APPROPRIATE_CATEGORIES.has("bar")).toBe(true);
      expect(EVENING_APPROPRIATE_CATEGORIES.has("entertainment")).toBe(true);
      expect(EVENING_APPROPRIATE_CATEGORIES.has("theater")).toBe(true);
      expect(EVENING_APPROPRIATE_CATEGORIES.has("onsen")).toBe(true);
      expect(EVENING_APPROPRIATE_CATEGORIES.has("wellness")).toBe(true);
      expect(EVENING_APPROPRIATE_CATEGORIES.has("shopping")).toBe(true);
    });

    it("excludes landmark (admit famous night exceptions via NIGHT_FRIENDLY_LOCATION_IDS)", () => {
      expect(EVENING_APPROPRIATE_CATEGORIES.has("landmark")).toBe(false);
    });

    it("excludes historic_site", () => {
      expect(EVENING_APPROPRIATE_CATEGORIES.has("historic_site")).toBe(false);
    });

    it("excludes viewpoint (admit night observation decks via NIGHT_FRIENDLY_LOCATION_IDS)", () => {
      expect(EVENING_APPROPRIATE_CATEGORIES.has("viewpoint")).toBe(false);
    });

    it("excludes other daytime categories", () => {
      expect(EVENING_APPROPRIATE_CATEGORIES.has("museum")).toBe(false);
      expect(EVENING_APPROPRIATE_CATEGORIES.has("temple")).toBe(false);
      expect(EVENING_APPROPRIATE_CATEGORIES.has("shrine")).toBe(false);
      expect(EVENING_APPROPRIATE_CATEGORIES.has("castle")).toBe(false);
      expect(EVENING_APPROPRIATE_CATEGORIES.has("nature")).toBe(false);
    });
  });

  describe("scoreTimeOfDayFit evening penalties", () => {
    const makeLocation = (category: string): Location => ({
      id: "test",
      name: "Test",
      city: "Tokyo",
      region: "Kanto",
      category,
    });

    it("gives strong penalty for non-allowlisted landmark in evening slot", () => {
      // Mozu/Daisen Kofun shape: landmark category, not in NIGHT_FRIENDLY_LOCATION_IDS
      const result = scoreTimeOfDayFit(makeLocation("landmark"), "evening");
      expect(result.scoreAdjustment).toBe(-15);
      expect(result.reasoning).toContain("daytime activity");
    });

    it("does not penalize allowlisted landmark in evening slot", () => {
      // Tokyo Tower / Skytree / Dotonbori shape — landmark in NIGHT_FRIENDLY_LOCATION_IDS
      const tokyoTower: Location = {
        id: "tokyo-tower-kanto-db632e17",
        name: "Tokyo Tower",
        city: "Tokyo",
        region: "Kanto",
        category: "viewpoint",
      };
      const result = scoreTimeOfDayFit(tokyoTower, "evening");
      // Should NOT receive the -15 daytime-mismatch penalty.
      // (viewpoint's optimal times include "evening", so it gets +8.)
      expect(result.scoreAdjustment).toBeGreaterThan(-15);
    });

    it("gives strong penalty for museum in evening slot", () => {
      const result = scoreTimeOfDayFit(makeLocation("museum"), "evening");
      expect(result.scoreAdjustment).toBeLessThanOrEqual(-10);
    });

    it("gives positive score for restaurant in evening slot", () => {
      const result = scoreTimeOfDayFit(makeLocation("restaurant"), "evening");
      expect(result.scoreAdjustment).toBeGreaterThan(0);
    });

    it("gives positive score for bar in evening slot", () => {
      const result = scoreTimeOfDayFit(makeLocation("bar"), "evening");
      expect(result.scoreAdjustment).toBeGreaterThan(0);
    });

    it("gives positive score for landmark in afternoon slot", () => {
      const result = scoreTimeOfDayFit(makeLocation("landmark"), "afternoon");
      expect(result.scoreAdjustment).toBeGreaterThan(0);
    });
  });
});

