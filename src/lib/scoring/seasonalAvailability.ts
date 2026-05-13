/**
 * Seasonal availability logic for filtering locations based on trip dates.
 *
 * This module handles three types of availability rules:
 * - fixed_annual: Specific date each year (e.g., Oct 22 for Jidai Matsuri)
 * - floating_annual: Relative date (e.g., 3rd Saturday of March)
 * - date_range: Range of dates (with optional year for temporary events)
 */

import type { Location, LocationAvailability } from "@/types/location";
import { GATING_SEASONAL_TYPES } from "@/lib/scoring/seasonalTypes";
import { formatLocalDateISO } from "@/lib/utils/dateUtils";

export type AvailabilityCheckResult = {
  available: boolean;
  reason?: string;
};

/**
 * Get the nth occurrence of a day of week in a given month.
 * @param year - The year
 * @param month - The month (1-12)
 * @param dayOfWeek - Day of week (0=Sunday, 6=Saturday)
 * @param ordinal - Which occurrence (1=first, 2=second, ..., 5=last)
 * @returns Date object or null if invalid
 */
function getNthDayOfWeekInMonth(
  year: number,
  month: number,
  dayOfWeek: number,
  ordinal: number
): Date | null {
  // Handle "last" occurrence (ordinal = 5)
  if (ordinal === 5) {
    // Find last day of month
    const lastDay = new Date(year, month, 0); // month is 1-indexed, so month gives us last day of that month
    const lastDayOfWeek = lastDay.getDay();

    // Calculate how many days to subtract to get to the target day
    let daysToSubtract = (lastDayOfWeek - dayOfWeek + 7) % 7;
    if (daysToSubtract === 0 && lastDayOfWeek !== dayOfWeek) {
      daysToSubtract = 7;
    }

    const result = new Date(lastDay);
    result.setDate(result.getDate() - daysToSubtract);
    return result;
  }

  // Find first occurrence of the day in the month
  const firstOfMonth = new Date(year, month - 1, 1);
  const firstDayOfWeek = firstOfMonth.getDay();

  // Calculate days until first occurrence
  const daysUntilFirst = (dayOfWeek - firstDayOfWeek + 7) % 7;

  // Calculate the date of the nth occurrence
  const targetDay = 1 + daysUntilFirst + (ordinal - 1) * 7;

  // Check if this date is valid (within the month)
  const result = new Date(year, month - 1, targetDay);
  if (result.getMonth() !== month - 1) {
    return null; // Date overflowed to next month
  }

  return result;
}

/**
 * Check if a date matches a fixed annual availability rule.
 * For single-day events, matches exact date.
 * For multi-day events, matches if date falls within range.
 */
function matchesFixedAnnual(
  date: Date,
  rule: LocationAvailability
): boolean {
  const month = date.getMonth() + 1; // JavaScript months are 0-indexed
  const day = date.getDate();

  if (rule.monthStart === undefined || rule.dayStart === undefined) {
    return false;
  }

  // Single day event
  if (rule.monthEnd === undefined || rule.dayEnd === undefined) {
    return month === rule.monthStart && day === rule.dayStart;
  }

  // Multi-day event
  // Handle events that span across year boundary (e.g., Dec 31 - Jan 2)
  const startMonth = rule.monthStart;
  const startDay = rule.dayStart;
  const endMonth = rule.monthEnd;
  const endDay = rule.dayEnd;

  // Create comparable date values (month * 100 + day)
  const dateValue = month * 100 + day;
  const startValue = startMonth * 100 + startDay;
  const endValue = endMonth * 100 + endDay;

  if (startValue <= endValue) {
    // Normal case: event within same year
    return dateValue >= startValue && dateValue <= endValue;
  } else {
    // Event spans year boundary (e.g., Dec 30 - Jan 2)
    return dateValue >= startValue || dateValue <= endValue;
  }
}

/**
 * Check if a date matches a floating annual availability rule.
 * For example, "3rd Saturday of March" or "last Sunday of October".
 */
function matchesFloatingAnnual(
  date: Date,
  rule: LocationAvailability
): boolean {
  if (
    rule.monthStart === undefined ||
    rule.weekOrdinal === undefined ||
    rule.dayOfWeek === undefined
  ) {
    return false;
  }

  const year = date.getFullYear();
  const targetDate = getNthDayOfWeekInMonth(
    year,
    rule.monthStart,
    rule.dayOfWeek,
    rule.weekOrdinal
  );

  if (!targetDate) {
    return false;
  }

  // Check if dates match (comparing year, month, day)
  const matchesSingleDay =
    date.getFullYear() === targetDate.getFullYear() &&
    date.getMonth() === targetDate.getMonth() &&
    date.getDate() === targetDate.getDate();

  if (matchesSingleDay) {
    return true;
  }

  // For weekend events, check if date falls within the event period
  // (e.g., "3rd weekend of March" typically means Saturday and Sunday)
  if (
    rule.monthEnd !== undefined &&
    rule.dayEnd !== undefined &&
    rule.dayStart !== undefined &&
    rule.dayOfWeek !== undefined &&
    rule.weekOrdinal !== undefined
  ) {
    // Calculate end date for multi-day floating event
    const endTargetDate = getNthDayOfWeekInMonth(
      year,
      rule.monthEnd,
      (rule.dayOfWeek + (rule.dayEnd - rule.dayStart)) % 7,
      rule.weekOrdinal
    );

    if (endTargetDate) {
      return date >= targetDate && date <= endTargetDate;
    }
  }

  return false;
}

/**
 * Check if a date matches a date range availability rule.
 * For temporary events or seasonal closures with specific years.
 */
function matchesDateRange(
  date: Date,
  rule: LocationAvailability
): boolean {
  if (
    rule.monthStart === undefined ||
    rule.dayStart === undefined ||
    rule.monthEnd === undefined ||
    rule.dayEnd === undefined
  ) {
    return false;
  }

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  // Check year constraints if specified
  if (rule.yearStart !== undefined && year < rule.yearStart) {
    return false;
  }
  if (rule.yearEnd !== undefined && year > rule.yearEnd) {
    return false;
  }

  // Create comparable date values
  const dateValue = month * 100 + day;
  const startValue = rule.monthStart * 100 + rule.dayStart;
  const endValue = rule.monthEnd * 100 + rule.dayEnd;

  if (startValue <= endValue) {
    return dateValue >= startValue && dateValue <= endValue;
  } else {
    // Range spans year boundary
    return dateValue >= startValue || dateValue <= endValue;
  }
}

/**
 * Check if a location is available on a specific date.
 *
 * @param location - The location to check
 * @param date - The date to check availability for
 * @param availability - Optional pre-loaded availability rules
 * @returns Object with availability status and reason
 */
export function isLocationAvailableOnDate(
  location: Location,
  date: Date,
  availability?: LocationAvailability[]
): AvailabilityCheckResult {
  // Non-seasonal locations are always available
  if (!location.isSeasonal) {
    return { available: true };
  }

  // Get availability rules
  const rules = availability ?? location.availability ?? [];

  // If no availability rules, fall back to valid_months only for real gates.
  // Hero-marker types (cherry_blossom, autumn_foliage, etc.) are year-round venues
  // whose valid_months were cleared; any residual is ignored here.
  if (rules.length === 0) {
    if (
      location.validMonths &&
      location.validMonths.length > 0 &&
      GATING_SEASONAL_TYPES.has(location.seasonalType ?? "")
    ) {
      const month = date.getMonth() + 1;
      if (location.validMonths.includes(month)) {
        return { available: true, reason: `Available in month ${month}` };
      }
      return {
        available: false,
        reason: `${location.name} not available in month ${month} (operates ${location.validMonths.join(", ")})`,
      };
    }
    // No availability rules and not a real gate — treat as available.
    return { available: true };
  }

  // Check each rule
  for (const rule of rules) {
    let matches = false;

    switch (rule.availabilityType) {
      case "fixed_annual":
        matches = matchesFixedAnnual(date, rule);
        break;
      case "floating_annual":
        matches = matchesFloatingAnnual(date, rule);
        break;
      case "date_range":
        matches = matchesDateRange(date, rule);
        break;
    }

    if (matches) {
      // If the rule indicates availability, location is available
      if (rule.isAvailable) {
        return {
          available: true,
          reason: rule.description ?? `Available during this period`,
        };
      } else {
        // If the rule indicates closure, location is unavailable
        return {
          available: false,
          reason: rule.description ?? `Closed during this period`,
        };
      }
    }
  }

  // No matching rules found
  // For seasonal locations, default to unavailable (e.g., festival not happening)
  return {
    available: false,
    reason: `${location.name} is not available on ${formatLocalDateISO(date)}`,
  };
}

/**
 * Check if a location is available during any date in a trip date range.
 * Useful for filtering locations during itinerary planning.
 *
 * @param location - The location to check
 * @param startDate - Trip start date
 * @param endDate - Trip end date
 * @param availability - Optional pre-loaded availability rules
 * @returns Object with availability status and reason
 */
export function isLocationAvailableDuringTrip(
  location: Location,
  startDate: Date,
  endDate: Date,
  availability?: LocationAvailability[]
): AvailabilityCheckResult {
  // Non-seasonal locations are always available
  if (!location.isSeasonal) {
    return { available: true };
  }

  // Check each day of the trip
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const result = isLocationAvailableOnDate(location, currentDate, availability);
    if (result.available) {
      return {
        available: true,
        reason: `Available on ${formatLocalDateISO(currentDate)}: ${result.reason}`,
      };
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // No available dates found
  return {
    available: false,
    reason: `${location.name} is not available during your trip dates`,
  };
}

/**
 * Get the specific date(s) when a location is available within a trip period.
 * Useful for scheduling seasonal events on the correct day.
 *
 * @param location - The location to check
 * @param startDate - Trip start date
 * @param endDate - Trip end date
 * @param availability - Optional pre-loaded availability rules
 * @returns Array of available dates
 */
export function getAvailableDatesInTrip(
  location: Location,
  startDate: Date,
  endDate: Date,
  availability?: LocationAvailability[]
): Date[] {
  // Non-seasonal locations are available every day
  if (!location.isSeasonal) {
    const dates: Date[] = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      dates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
  }

  const availableDates: Date[] = [];
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const result = isLocationAvailableOnDate(location, currentDate, availability);
    if (result.available) {
      availableDates.push(new Date(currentDate));
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return availableDates;
}
