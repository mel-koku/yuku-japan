/**
 * Helper functions for filtering seasonal locations based on trip dates.
 *
 * These functions determine if a location's availability period overlaps
 * with the user's trip dates, enabling date-aware recommendations.
 */

import type { LocationAvailability, AvailabilityType } from "@/types/location";
import { GATING_SEASONAL_TYPES } from "@/lib/scoring/seasonalTypes";

/**
 * Database row type for location_availability table
 */
export type LocationAvailabilityRow = {
  id: string;
  location_id: string;
  availability_type: AvailabilityType;
  month_start: number | null;
  day_start: number | null;
  month_end: number | null;
  day_end: number | null;
  week_ordinal: number | null;
  day_of_week: number | null;
  year_start: number | null;
  year_end: number | null;
  is_available: boolean;
  description: string | null;
};

/**
 * Transform database row to LocationAvailability type
 */
export function transformAvailabilityRow(row: LocationAvailabilityRow): LocationAvailability {
  return {
    id: row.id,
    locationId: row.location_id,
    availabilityType: row.availability_type,
    monthStart: row.month_start ?? undefined,
    dayStart: row.day_start ?? undefined,
    monthEnd: row.month_end ?? undefined,
    dayEnd: row.day_end ?? undefined,
    weekOrdinal: row.week_ordinal ?? undefined,
    dayOfWeek: row.day_of_week ?? undefined,
    yearStart: row.year_start ?? undefined,
    yearEnd: row.year_end ?? undefined,
    isAvailable: row.is_available,
    description: row.description ?? undefined,
  };
}

/**
 * Check if trip dates overlap with a fixed_annual festival period.
 *
 * Fixed annual events occur on the same dates every year (e.g., July 24-25 for Tenjin Matsuri).
 *
 * @param tripStart - Trip start date (ISO yyyy-mm-dd)
 * @param tripEnd - Trip end date (ISO yyyy-mm-dd)
 * @param festivalMonthStart - Month the festival starts (1-12)
 * @param festivalDayStart - Day the festival starts (1-31)
 * @param festivalMonthEnd - Month the festival ends (1-12), defaults to start month
 * @param festivalDayEnd - Day the festival ends (1-31), defaults to start day
 * @returns true if the trip dates overlap with the festival period
 */
export function tripOverlapsFixedAnnual(
  tripStart: string,
  tripEnd: string,
  festivalMonthStart: number,
  festivalDayStart: number,
  festivalMonthEnd?: number,
  festivalDayEnd?: number
): boolean {
  const tripStartDate = new Date(tripStart);
  const tripEndDate = new Date(tripEnd);

  // Default end to start if not specified (single-day event)
  const endMonth = festivalMonthEnd ?? festivalMonthStart;
  const endDay = festivalDayEnd ?? festivalDayStart;

  // For each year the trip spans, check if festival dates overlap
  const startYear = tripStartDate.getFullYear();
  const endYear = tripEndDate.getFullYear();

  for (let year = startYear; year <= endYear; year++) {
    // Create festival dates for this year
    // Note: JavaScript months are 0-indexed
    const festivalStart = new Date(year, festivalMonthStart - 1, festivalDayStart);
    const festivalEnd = new Date(year, endMonth - 1, endDay);

    // Handle year-spanning festivals (e.g., Dec 31 - Jan 2)
    if (festivalEnd < festivalStart) {
      // Festival spans year boundary
      // Check both the end-of-year portion and start-of-year portion
      const yearEndPortion = new Date(year, 11, 31); // Dec 31
      const nextYearStart = new Date(year + 1, endMonth - 1, endDay);

      // Check overlap with Dec portion
      if (!(tripEndDate < festivalStart || tripStartDate > yearEndPortion)) {
        return true;
      }
      // Check overlap with Jan portion (next year)
      const janStart = new Date(year + 1, 0, 1);
      if (!(tripEndDate < janStart || tripStartDate > nextYearStart)) {
        return true;
      }
    } else {
      // Normal case: festival doesn't span year boundary
      // Overlap check: not (tripEnd < festivalStart || tripStart > festivalEnd)
      if (!(tripEndDate < festivalStart || tripStartDate > festivalEnd)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get the nth occurrence of a day of week in a given month.
 *
 * @param year - The year
 * @param month - The month (1-12)
 * @param dayOfWeek - Day of week (0=Sunday, 6=Saturday)
 * @param weekOrdinal - Which occurrence (1-5, where 5 means "last")
 * @returns The Date of that occurrence, or null if invalid
 */
function getNthDayOfWeek(
  year: number,
  month: number,
  dayOfWeek: number,
  weekOrdinal: number
): Date | null {
  // Handle "last" (5th) occurrence specially
  if (weekOrdinal === 5) {
    // Start from the last day of the month and work backwards
    const lastDay = new Date(year, month, 0); // Day 0 of next month = last day of this month
    const lastDayOfWeek = lastDay.getDay();

    // Calculate days to subtract to get to the target day of week
    let daysToSubtract = lastDayOfWeek - dayOfWeek;
    if (daysToSubtract < 0) daysToSubtract += 7;

    return new Date(year, month - 1, lastDay.getDate() - daysToSubtract);
  }

  // For 1st-4th occurrence
  const firstOfMonth = new Date(year, month - 1, 1);
  const firstDayOfWeek = firstOfMonth.getDay();

  // Calculate days until the first occurrence of the target day
  let daysUntilFirst = dayOfWeek - firstDayOfWeek;
  if (daysUntilFirst < 0) daysUntilFirst += 7;

  // Add weeks for the nth occurrence
  const dayOfMonth = 1 + daysUntilFirst + (weekOrdinal - 1) * 7;

  // Check if this day is still in the target month
  const result = new Date(year, month - 1, dayOfMonth);
  if (result.getMonth() !== month - 1) {
    return null; // Date is in the next month (e.g., 5th Monday doesn't exist)
  }

  return result;
}

/**
 * Check if trip dates overlap with a floating_annual event.
 *
 * Floating annual events occur on relative dates like "3rd Saturday of March".
 *
 * @param tripStart - Trip start date (ISO yyyy-mm-dd)
 * @param tripEnd - Trip end date (ISO yyyy-mm-dd)
 * @param month - Month of the event (1-12)
 * @param weekOrdinal - Which week (1-5, where 5 means "last")
 * @param dayOfWeek - Day of week (0=Sunday, 6=Saturday)
 * @param durationDays - Optional duration in days (default 1)
 * @returns true if the trip dates overlap with the event
 */
export function tripOverlapsFloatingAnnual(
  tripStart: string,
  tripEnd: string,
  month: number,
  weekOrdinal: number,
  dayOfWeek: number,
  durationDays: number = 1
): boolean {
  const tripStartDate = new Date(tripStart);
  const tripEndDate = new Date(tripEnd);

  const startYear = tripStartDate.getFullYear();
  const endYear = tripEndDate.getFullYear();

  for (let year = startYear; year <= endYear; year++) {
    const eventStart = getNthDayOfWeek(year, month, dayOfWeek, weekOrdinal);
    if (!eventStart) continue;

    const eventEnd = new Date(eventStart);
    eventEnd.setDate(eventEnd.getDate() + durationDays - 1);

    // Overlap check
    if (!(tripEndDate < eventStart || tripStartDate > eventEnd)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if trip dates overlap with a date_range event.
 *
 * Date range events have specific start/end dates, optionally with year constraints.
 *
 * @param tripStart - Trip start date (ISO yyyy-mm-dd)
 * @param tripEnd - Trip end date (ISO yyyy-mm-dd)
 * @param monthStart - Start month (1-12)
 * @param dayStart - Start day (1-31)
 * @param monthEnd - End month (1-12)
 * @param dayEnd - End day (1-31)
 * @param yearStart - Optional start year constraint
 * @param yearEnd - Optional end year constraint
 * @returns true if the trip dates overlap with the event
 */
export function tripOverlapsDateRange(
  tripStart: string,
  tripEnd: string,
  monthStart: number,
  dayStart: number,
  monthEnd: number,
  dayEnd: number,
  yearStart?: number,
  yearEnd?: number
): boolean {
  const tripStartDate = new Date(tripStart);
  const tripEndDate = new Date(tripEnd);

  const tripYear = tripStartDate.getFullYear();

  // Check year constraints
  if (yearStart !== undefined && tripYear < yearStart) return false;
  if (yearEnd !== undefined && tripYear > yearEnd) return false;

  // If year is specified, use it; otherwise treat as annual
  const eventYear = yearStart ?? tripYear;

  // Create event dates
  const eventStart = new Date(eventYear, monthStart - 1, dayStart);
  const eventEnd = new Date(yearEnd ?? eventYear, monthEnd - 1, dayEnd);

  // Overlap check
  return !(tripEndDate < eventStart || tripStartDate > eventEnd);
}

/**
 * Check if a seasonal location is relevant for the given trip dates.
 *
 * @param isSeasonal - Whether the location is seasonal
 * @param availability - The availability rules for the location
 * @param tripStart - Trip start date (ISO yyyy-mm-dd)
 * @param tripEnd - Trip end date (ISO yyyy-mm-dd)
 * @returns true if the location should be shown for these dates
 */
export function isSeasonalLocationRelevant(
  isSeasonal: boolean | undefined | null,
  availability: LocationAvailability[] | undefined | null,
  tripStart: string | undefined,
  tripEnd: string | undefined,
  validMonths?: number[] | null,
  seasonalType?: string | null,
): boolean {
  // Non-seasonal locations are always relevant
  if (!isSeasonal) return true;

  // If no trip dates provided, exclude seasonal locations
  // (we can't determine if they're relevant)
  if (!tripStart || !tripEnd) return false;

  // If no availability rules, fall back to valid_months only for real gates.
  // Hero-marker types (cherry_blossom, autumn_foliage, etc.) are year-round venues
  // whose valid_months were cleared; any residual is ignored here.
  if (!availability || availability.length === 0) {
    if (
      validMonths &&
      validMonths.length > 0 &&
      GATING_SEASONAL_TYPES.has(seasonalType ?? "")
    ) {
      const startMonth = new Date(tripStart).getMonth() + 1;
      const endMonth = new Date(tripEnd).getMonth() + 1;
      if (startMonth === endMonth) {
        return validMonths.includes(startMonth);
      }
      for (let m = startMonth; m <= endMonth; m++) {
        if (validMonths.includes(m)) return true;
      }
      return false;
    }
    // No availability rules and not a real gate — treat as year-round relevant.
    return true;
  }

  // Check each availability rule
  for (const rule of availability) {
    // Skip unavailability rules (closures)
    if (!rule.isAvailable) continue;

    let overlaps = false;

    switch (rule.availabilityType) {
      case "fixed_annual":
        if (rule.monthStart !== undefined && rule.dayStart !== undefined) {
          overlaps = tripOverlapsFixedAnnual(
            tripStart,
            tripEnd,
            rule.monthStart,
            rule.dayStart,
            rule.monthEnd,
            rule.dayEnd
          );
        }
        break;

      case "floating_annual":
        if (
          rule.monthStart !== undefined &&
          rule.weekOrdinal !== undefined &&
          rule.dayOfWeek !== undefined
        ) {
          overlaps = tripOverlapsFloatingAnnual(
            tripStart,
            tripEnd,
            rule.monthStart,
            rule.weekOrdinal,
            rule.dayOfWeek
          );
        }
        break;

      case "date_range":
        if (
          rule.monthStart !== undefined &&
          rule.dayStart !== undefined &&
          rule.monthEnd !== undefined &&
          rule.dayEnd !== undefined
        ) {
          overlaps = tripOverlapsDateRange(
            tripStart,
            tripEnd,
            rule.monthStart,
            rule.dayStart,
            rule.monthEnd,
            rule.dayEnd,
            rule.yearStart,
            rule.yearEnd
          );
        }
        break;
    }

    if (overlaps) return true;
  }

  // No availability rules matched
  return false;
}

/**
 * Filter a list of locations by trip date relevance.
 *
 * Keeps non-seasonal locations and seasonal locations that overlap with trip dates.
 *
 * @param locations - Array of locations with isSeasonal and availability
 * @param tripStart - Trip start date (ISO yyyy-mm-dd)
 * @param tripEnd - Trip end date (ISO yyyy-mm-dd)
 * @returns Filtered array of relevant locations
 */
export function filterByTripDates<
  T extends {
    isSeasonal?: boolean | null;
    availability?: LocationAvailability[] | null;
    validMonths?: number[] | null;
    seasonalType?: string | null;
  }
>(locations: T[], tripStart: string | undefined, tripEnd: string | undefined): T[] {
  return locations.filter((location) =>
    isSeasonalLocationRelevant(
      location.isSeasonal,
      location.availability,
      tripStart,
      tripEnd,
      location.validMonths,
      location.seasonalType,
    )
  );
}
