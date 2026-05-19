import type { Location } from "@/types/location";

/**
 * Gets the display name for a location, preferring the official Google Places displayName
 * when available, falling back to the location's stored name.
 *
 * @param displayName - The displayName from Google Places API (may be undefined)
 * @param location - The location object with the stored name
 * @returns The best name to display
 */
export function getLocationDisplayName(
  displayName: string | undefined | null,
  location: Location,
): string {
  // Use Google's official displayName if available, otherwise use the stored name
  if (displayName && displayName.trim().length > 0) {
    return displayName.trim();
  }

  return location.name;
}

/**
 * Formats a location's geographic context as "City, Region" for display near a
 * photo (e.g. "Kyoto, Kansai"). Falls back to city-only when region is absent or
 * identical to the city, so city-as-region rows don't render "Kyoto, Kyoto".
 */
export function formatCityRegion(
  city: string,
  region: string | undefined | null,
): string {
  if (region && region !== city) {
    return `${city}, ${region}`;
  }
  return city;
}
