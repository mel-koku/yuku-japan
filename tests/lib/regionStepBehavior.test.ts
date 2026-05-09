/**
 * Building-block tests for RegionStep's two fixes:
 *
 * 1. getRegionSelectionState resolves child cities (e.g. "tsukuba") to their
 *    parent region (kanto) so the region row's selection indicator reflects
 *    a child-only pick.
 * 2. Augment-on-divergence's coverage check correctly identifies whether a
 *    selection set already represents the exit region — both via direct
 *    known-city match AND via child→parent resolution.
 *
 * These tests pin the underlying data invariants the RegionStep effect
 * relies on. Component-level rendering is covered by manual QA on the dev
 * server (RegionStep mounts Mapbox-heavy children that aren't worth mocking).
 */

import { describe, expect, test } from "vitest";

import { getChildCityMapping } from "@/lib/tripBuilder/cityRelevance";
import { getRegionForCity, REGIONS } from "@/data/regions";
import type { CityId, KnownRegionId } from "@/types/trip";

/**
 * Mirrors the predicate used inside RegionStep's augment-on-divergence effect.
 * Exported here as a free function so the behavior can be exercised without
 * mounting the component tree.
 */
function isExitRegionCoveredBySelections(
  selectedCities: Set<CityId>,
  exitRegion: KnownRegionId,
  childMap: Map<string, { planningCity: string; childName: string }>,
): boolean {
  return Array.from(selectedCities).some((cityId) => {
    const lower = cityId.toLowerCase();
    if (getRegionForCity(lower as CityId) === exitRegion) return true;
    const parent = childMap.get(lower)?.planningCity;
    if (!parent) return false;
    return getRegionForCity(parent.toLowerCase() as CityId) === exitRegion;
  });
}

/**
 * Mirrors the dynamic-selected check used inside RegionStep's
 * getRegionSelectionState. Returns true when at least one selected city
 * belongs to `regionId` either directly (planning city) or transitively
 * (child city whose parent is a known city in the region).
 */
function regionHasDynamicSelected(
  selectedCities: Set<CityId>,
  regionId: KnownRegionId,
  childMap: Map<string, { planningCity: string; childName: string }>,
): boolean {
  const regionDef = REGIONS.find((r) => r.id === regionId);
  if (!regionDef) return false;
  const knownCityIds = regionDef.cities.map((c) => c.id as CityId);
  return Array.from(selectedCities).some((cityId) => {
    if (knownCityIds.includes(cityId)) return false;
    const lower = cityId.toLowerCase();
    const directRegion = getRegionForCity(lower as CityId);
    if (directRegion === regionId) return true;
    const parent = childMap.get(lower)?.planningCity;
    if (!parent) return false;
    return knownCityIds.includes(parent.toLowerCase() as CityId);
  });
}

describe("Fix 1 — child cities flip parent region selection state", () => {
  test("Tsukuba (Tokyo child) resolves to Kanto via child mapping", () => {
    const childMap = getChildCityMapping();
    const entry = childMap.get("tsukuba");
    expect(entry?.planningCity).toBe("tokyo");
    expect(getRegionForCity("tokyo" as CityId)).toBe("kanto");
  });

  test("regionHasDynamicSelected: Kanto sees Tsukuba as a child match", () => {
    const childMap = getChildCityMapping();
    const selected = new Set<CityId>(["osaka", "kyoto", "tsukuba"] as CityId[]);
    expect(regionHasDynamicSelected(selected, "kanto", childMap)).toBe(true);
  });

  test("regionHasDynamicSelected: Kansai is unaffected by a Kanto-child pick", () => {
    const childMap = getChildCityMapping();
    const selected = new Set<CityId>(["tsukuba"] as CityId[]);
    expect(regionHasDynamicSelected(selected, "kansai", childMap)).toBe(false);
  });

  test("regionHasDynamicSelected: known cities don't trigger the dynamic path", () => {
    // Tokyo is already in REGIONS.kanto.cities → returns false (dynamic
    // means "outside the known list"). The "full"/"partial" fold elsewhere
    // adds the known-city contribution.
    const childMap = getChildCityMapping();
    const selected = new Set<CityId>(["tokyo"] as CityId[]);
    expect(regionHasDynamicSelected(selected, "kanto", childMap)).toBe(false);
  });
});

describe("Fix 2 — augment-on-divergence coverage check", () => {
  test("Kansai-only selection does NOT cover Kanto exit", () => {
    const childMap = getChildCityMapping();
    const selected = new Set<CityId>(["osaka", "kyoto"] as CityId[]);
    expect(isExitRegionCoveredBySelections(selected, "kanto", childMap)).toBe(false);
  });

  test("Tokyo (known city) covers Kanto exit directly", () => {
    const childMap = getChildCityMapping();
    const selected = new Set<CityId>(["osaka", "tokyo"] as CityId[]);
    expect(isExitRegionCoveredBySelections(selected, "kanto", childMap)).toBe(true);
  });

  test("Tsukuba (child city) covers Kanto exit transitively", () => {
    // The key case: a user who manually picks a child via the search bar
    // shouldn't get Tokyo auto-appended on top of it.
    const childMap = getChildCityMapping();
    const selected = new Set<CityId>(["osaka", "kyoto", "tsukuba"] as CityId[]);
    expect(isExitRegionCoveredBySelections(selected, "kanto", childMap)).toBe(true);
  });

  test("Kobe (Kansai child of Osaka? No — known Kansai city) does NOT cover Kanto", () => {
    const childMap = getChildCityMapping();
    const selected = new Set<CityId>(["kobe"] as CityId[]);
    expect(isExitRegionCoveredBySelections(selected, "kanto", childMap)).toBe(false);
  });
});

describe("Fix 3 — planning cities are never childCityMap entries", () => {
  // The source `cityInterests.json` lists planning cities (Kyoto, Tokyo, etc.)
  // under multiple parents' `childCities`. Without filtering, Map.set's
  // last-wins overwrite mis-attributes Kyoto→Tottori (Chugoku) and similar,
  // which made unselected regions show a partial-selection pill.
  test("getChildCityMapping omits known planning cities", () => {
    const childMap = getChildCityMapping();
    for (const region of REGIONS) {
      for (const city of region.cities) {
        expect(childMap.has(city.id)).toBe(false);
      }
    }
  });

  test("Kyoto-only selection leaves Chugoku 'none', not 'partial'", () => {
    const childMap = getChildCityMapping();
    const selected = new Set<CityId>(["kyoto"] as CityId[]);
    expect(regionHasDynamicSelected(selected, "chugoku", childMap)).toBe(false);
  });

  test("Tokyo + Kyoto selection doesn't bleed into any third region", () => {
    const childMap = getChildCityMapping();
    const selected = new Set<CityId>(["tokyo", "kyoto"] as CityId[]);
    const otherRegions: KnownRegionId[] = [
      "chubu",
      "kyushu",
      "hokkaido",
      "tohoku",
      "chugoku",
      "shikoku",
      "okinawa",
    ];
    for (const region of otherRegions) {
      expect(regionHasDynamicSelected(selected, region, childMap)).toBe(false);
    }
  });
});
