import { describe, expect, it } from "vitest";
import {
  isLocationAvailableOnDate,
  isLocationAvailableDuringTrip,
  getAvailableDatesInTrip,
} from "../seasonalAvailability";
import type { Location, LocationAvailability } from "@/types/location";

describe("Seasonal Availability", () => {
  // Helper function to create a basic location
  const createLocation = (overrides: Partial<Location> = {}): Location => ({
    id: "test-location",
    name: "Test Location",
    region: "Kansai",
    city: "Kyoto",
    category: "landmark",
    image: "test.jpg",
    ...overrides,
  });

  describe("Non-seasonal locations", () => {
    it("should always be available if not marked as seasonal", () => {
      const location = createLocation({ isSeasonal: false });
      const result = isLocationAvailableOnDate(location, new Date("2025-06-15"));

      expect(result.available).toBe(true);
    });

    it("should always be available if isSeasonal is undefined", () => {
      const location = createLocation();
      const result = isLocationAvailableOnDate(location, new Date("2025-06-15"));

      expect(result.available).toBe(true);
    });
  });

  describe("Fixed Annual availability (fixed_annual)", () => {
    it("should match exact single-day event date (Jidai Matsuri on Oct 22)", () => {
      const location = createLocation({
        name: "Jidai Matsuri",
        isSeasonal: true,
        seasonalType: "festival",
      });

      const availability: LocationAvailability[] = [
        {
          id: "jidai-matsuri-rule",
          locationId: "test-location",
          availabilityType: "fixed_annual",
          monthStart: 10,
          dayStart: 22,
          isAvailable: true,
          description: "Jidai Matsuri occurs annually on October 22",
        },
      ];

      // Should be available on Oct 22
      const oct22 = isLocationAvailableOnDate(location, new Date("2025-10-22"), availability);
      expect(oct22.available).toBe(true);

      // Should NOT be available on Oct 21
      const oct21 = isLocationAvailableOnDate(location, new Date("2025-10-21"), availability);
      expect(oct21.available).toBe(false);

      // Should NOT be available on Oct 23
      const oct23 = isLocationAvailableOnDate(location, new Date("2025-10-23"), availability);
      expect(oct23.available).toBe(false);

      // Should NOT be available in January
      const jan22 = isLocationAvailableOnDate(location, new Date("2025-01-22"), availability);
      expect(jan22.available).toBe(false);
    });

    it("should match multi-day event range (Apr 14-16)", () => {
      const location = createLocation({
        name: "Nagahama Hikiyama Festival",
        isSeasonal: true,
        seasonalType: "festival",
      });

      const availability: LocationAvailability[] = [
        {
          id: "nagahama-rule",
          locationId: "test-location",
          availabilityType: "fixed_annual",
          monthStart: 4,
          dayStart: 14,
          monthEnd: 4,
          dayEnd: 16,
          isAvailable: true,
          description: "Nagahama Hikiyama Festival occurs April 14-16",
        },
      ];

      // Should be available on Apr 14, 15, 16
      expect(isLocationAvailableOnDate(location, new Date("2025-04-14"), availability).available).toBe(true);
      expect(isLocationAvailableOnDate(location, new Date("2025-04-15"), availability).available).toBe(true);
      expect(isLocationAvailableOnDate(location, new Date("2025-04-16"), availability).available).toBe(true);

      // Should NOT be available on Apr 13 or Apr 17
      expect(isLocationAvailableOnDate(location, new Date("2025-04-13"), availability).available).toBe(false);
      expect(isLocationAvailableOnDate(location, new Date("2025-04-17"), availability).available).toBe(false);
    });

    it("should handle events spanning year boundary (Dec 31 - Jan 2)", () => {
      const location = createLocation({
        name: "New Year Festival",
        isSeasonal: true,
        seasonalType: "festival",
      });

      const availability: LocationAvailability[] = [
        {
          id: "new-year-rule",
          locationId: "test-location",
          availabilityType: "fixed_annual",
          monthStart: 12,
          dayStart: 31,
          monthEnd: 1,
          dayEnd: 2,
          isAvailable: true,
          description: "New Year Festival Dec 31 - Jan 2",
        },
      ];

      // Should be available on Dec 31, Jan 1, Jan 2
      expect(isLocationAvailableOnDate(location, new Date("2025-12-31"), availability).available).toBe(true);
      expect(isLocationAvailableOnDate(location, new Date("2026-01-01"), availability).available).toBe(true);
      expect(isLocationAvailableOnDate(location, new Date("2026-01-02"), availability).available).toBe(true);

      // Should NOT be available on Dec 30 or Jan 3
      expect(isLocationAvailableOnDate(location, new Date("2025-12-30"), availability).available).toBe(false);
      expect(isLocationAvailableOnDate(location, new Date("2026-01-03"), availability).available).toBe(false);
    });
  });

  describe("Floating Annual availability (floating_annual)", () => {
    it("should match 3rd Sunday of May (Mifune Matsuri)", () => {
      const location = createLocation({
        name: "Mifune Matsuri",
        isSeasonal: true,
        seasonalType: "festival",
      });

      const availability: LocationAvailability[] = [
        {
          id: "mifune-rule",
          locationId: "test-location",
          availabilityType: "floating_annual",
          monthStart: 5,
          weekOrdinal: 3,
          dayOfWeek: 0, // Sunday
          isAvailable: true,
          description: "Mifune Matsuri occurs on the 3rd Sunday of May",
        },
      ];

      // 2025: 3rd Sunday of May is May 18
      const may18_2025 = isLocationAvailableOnDate(location, new Date("2025-05-18"), availability);
      expect(may18_2025.available).toBe(true);

      // Should NOT be available on May 11 (2nd Sunday)
      const may11_2025 = isLocationAvailableOnDate(location, new Date("2025-05-11"), availability);
      expect(may11_2025.available).toBe(false);

      // Should NOT be available on May 25 (4th Sunday)
      const may25_2025 = isLocationAvailableOnDate(location, new Date("2025-05-25"), availability);
      expect(may25_2025.available).toBe(false);

      // 2026: 3rd Sunday of May is May 17
      const may17_2026 = isLocationAvailableOnDate(location, new Date("2026-05-17"), availability);
      expect(may17_2026.available).toBe(true);
    });

    it("should match 3rd weekend of March (Saturday)", () => {
      const location = createLocation({
        name: "Sagicho Fire Festival",
        isSeasonal: true,
        seasonalType: "festival",
      });

      const availability: LocationAvailability[] = [
        {
          id: "sagicho-rule",
          locationId: "test-location",
          availabilityType: "floating_annual",
          monthStart: 3,
          weekOrdinal: 3,
          dayOfWeek: 6, // Saturday
          isAvailable: true,
          description: "Sagicho Fire Festival occurs on the 3rd weekend of March",
        },
      ];

      // 2025: 3rd Saturday of March is March 15
      const mar15_2025 = isLocationAvailableOnDate(location, new Date("2025-03-15"), availability);
      expect(mar15_2025.available).toBe(true);

      // Should NOT be available on March 8 (2nd Saturday)
      const mar8_2025 = isLocationAvailableOnDate(location, new Date("2025-03-08"), availability);
      expect(mar8_2025.available).toBe(false);
    });

    it("should match last Sunday of October (ordinal 5)", () => {
      const location = createLocation({
        name: "Last Sunday Festival",
        isSeasonal: true,
        seasonalType: "festival",
      });

      const availability: LocationAvailability[] = [
        {
          id: "last-sunday-rule",
          locationId: "test-location",
          availabilityType: "floating_annual",
          monthStart: 10,
          weekOrdinal: 5, // Last
          dayOfWeek: 0, // Sunday
          isAvailable: true,
          description: "Festival occurs on the last Sunday of October",
        },
      ];

      // 2025: Last Sunday of October is October 26
      const oct26_2025 = isLocationAvailableOnDate(location, new Date("2025-10-26"), availability);
      expect(oct26_2025.available).toBe(true);

      // Should NOT be available on October 19 (2nd to last Sunday)
      const oct19_2025 = isLocationAvailableOnDate(location, new Date("2025-10-19"), availability);
      expect(oct19_2025.available).toBe(false);
    });
  });

  describe("Date Range availability (date_range)", () => {
    it("should match seasonal range with year constraints", () => {
      const location = createLocation({
        name: "Temporary Exhibition",
        isSeasonal: true,
        seasonalType: "seasonal_attraction",
      });

      const availability: LocationAvailability[] = [
        {
          id: "exhibition-rule",
          locationId: "test-location",
          availabilityType: "date_range",
          monthStart: 3,
          dayStart: 1,
          monthEnd: 5,
          dayEnd: 31,
          yearStart: 2025,
          yearEnd: 2025,
          isAvailable: true,
          description: "Special exhibition March-May 2025 only",
        },
      ];

      // Should be available during the range in 2025
      expect(isLocationAvailableOnDate(location, new Date("2025-04-15"), availability).available).toBe(true);

      // Should NOT be available in 2026 (year constraint)
      expect(isLocationAvailableOnDate(location, new Date("2026-04-15"), availability).available).toBe(false);

      // Should NOT be available outside the date range in 2025
      expect(isLocationAvailableOnDate(location, new Date("2025-06-15"), availability).available).toBe(false);
    });

    it("should match annual seasonal range without year constraints", () => {
      const location = createLocation({
        name: "Cherry Blossom Viewing",
        isSeasonal: true,
        seasonalType: "seasonal_attraction",
      });

      const availability: LocationAvailability[] = [
        {
          id: "sakura-rule",
          locationId: "test-location",
          availabilityType: "date_range",
          monthStart: 3,
          dayStart: 20,
          monthEnd: 4,
          dayEnd: 20,
          isAvailable: true,
          description: "Cherry blossom season typically March 20 - April 20",
        },
      ];

      // Should be available during sakura season any year
      expect(isLocationAvailableOnDate(location, new Date("2025-04-01"), availability).available).toBe(true);
      expect(isLocationAvailableOnDate(location, new Date("2030-04-01"), availability).available).toBe(true);

      // Should NOT be available outside sakura season
      expect(isLocationAvailableOnDate(location, new Date("2025-06-01"), availability).available).toBe(false);
    });
  });

  describe("Closure rules (isAvailable = false)", () => {
    it("should mark location as unavailable during closure period", () => {
      const location = createLocation({
        name: "Alpine Route",
        isSeasonal: true,
        seasonalType: "winter_closure",
      });

      const availability: LocationAvailability[] = [
        {
          id: "alpine-open-rule",
          locationId: "test-location",
          availabilityType: "date_range",
          monthStart: 4,
          dayStart: 15,
          monthEnd: 11,
          dayEnd: 30,
          isAvailable: true,
          description: "Alpine Route open April 15 - November 30",
        },
      ];

      // Should be available during open period
      expect(isLocationAvailableOnDate(location, new Date("2025-07-01"), availability).available).toBe(true);

      // Should NOT be available during winter closure
      expect(isLocationAvailableOnDate(location, new Date("2025-01-15"), availability).available).toBe(false);
      expect(isLocationAvailableOnDate(location, new Date("2025-12-15"), availability).available).toBe(false);
    });
  });

  describe("Trip date range checking", () => {
    it("should return available if location is available on any trip day", () => {
      const location = createLocation({
        name: "Jidai Matsuri",
        isSeasonal: true,
        seasonalType: "festival",
      });

      const availability: LocationAvailability[] = [
        {
          id: "jidai-rule",
          locationId: "test-location",
          availabilityType: "fixed_annual",
          monthStart: 10,
          dayStart: 22,
          isAvailable: true,
        },
      ];

      // Trip includes the festival date
      const result = isLocationAvailableDuringTrip(
        location,
        new Date("2025-10-20"),
        new Date("2025-10-25"),
        availability
      );

      expect(result.available).toBe(true);
      expect(result.reason).toContain("2025-10-22");
    });

    it("should return unavailable if location is not available during entire trip", () => {
      const location = createLocation({
        name: "Jidai Matsuri",
        isSeasonal: true,
        seasonalType: "festival",
      });

      const availability: LocationAvailability[] = [
        {
          id: "jidai-rule",
          locationId: "test-location",
          availabilityType: "fixed_annual",
          monthStart: 10,
          dayStart: 22,
          isAvailable: true,
        },
      ];

      // Trip does NOT include the festival date
      const result = isLocationAvailableDuringTrip(
        location,
        new Date("2025-10-01"),
        new Date("2025-10-10"),
        availability
      );

      expect(result.available).toBe(false);
    });
  });

  describe("Get available dates in trip", () => {
    it("should return specific available dates for seasonal locations", () => {
      const location = createLocation({
        name: "Multi-day Festival",
        isSeasonal: true,
        seasonalType: "festival",
      });

      const availability: LocationAvailability[] = [
        {
          id: "festival-rule",
          locationId: "test-location",
          availabilityType: "fixed_annual",
          monthStart: 7,
          dayStart: 14,
          monthEnd: 7,
          dayEnd: 17,
          isAvailable: true,
        },
      ];

      const dates = getAvailableDatesInTrip(
        location,
        new Date("2025-07-10"),
        new Date("2025-07-20"),
        availability
      );

      expect(dates).toHaveLength(4); // July 14, 15, 16, 17
      expect(dates.map((d) => d.getDate())).toEqual([14, 15, 16, 17]);
    });

    it("should return all dates for non-seasonal locations", () => {
      const location = createLocation({ isSeasonal: false });

      const dates = getAvailableDatesInTrip(
        location,
        new Date("2025-01-01"),
        new Date("2025-01-05")
      );

      expect(dates).toHaveLength(5);
    });
  });

  describe("Edge cases", () => {
    it("should handle gating-type seasonal location with valid_months but no availability rules", () => {
      // seasonal_attraction is a gating type — genuinely closed outside its window.
      // With valid_months set and no availability rules, the valid_months gate applies.
      const location = createLocation({
        name: "Alpine Trail",
        isSeasonal: true,
        seasonalType: "seasonal_attraction",
        validMonths: [5, 6, 7, 8, 9, 10],
        availability: [],
      });

      // Outside window — blocked
      const result = isLocationAvailableOnDate(location, new Date("2025-01-15"));
      expect(result.available).toBe(false);
      expect(result.reason).toContain("not available in month 1");

      // Inside window — available
      const summer = isLocationAvailableOnDate(location, new Date("2025-07-15"));
      expect(summer.available).toBe(true);
    });

    it("should allow seasonal location via valid_months when no availability rules exist", () => {
      const location = createLocation({
        name: "Cherry Blossom Park",
        isSeasonal: true,
        seasonalType: "seasonal_attraction",
        availability: [],
        validMonths: [3, 4, 5],
      });

      // March — within valid_months
      const available = isLocationAvailableOnDate(location, new Date("2025-03-20"));
      expect(available.available).toBe(true);

      // August — outside valid_months
      const unavailable = isLocationAvailableOnDate(location, new Date("2025-08-10"));
      expect(unavailable.available).toBe(false);
      expect(unavailable.reason).toContain("not available in month 8");
    });

    it("should handle location with availability passed as parameter", () => {
      const location = createLocation({
        name: "Test Festival",
        isSeasonal: true,
        seasonalType: "festival",
      });

      // Availability rules passed separately (not on location object)
      const availability: LocationAvailability[] = [
        {
          id: "test-rule",
          locationId: "test-location",
          availabilityType: "fixed_annual",
          monthStart: 6,
          dayStart: 15,
          isAvailable: true,
        },
      ];

      const result = isLocationAvailableOnDate(location, new Date("2025-06-15"), availability);
      expect(result.available).toBe(true);
    });
  });
});
