import type { KnownCityId, KnownRegionId, CityId, RegionId } from "../types/trip";
import { getCityMetadata } from "@/lib/tripBuilder/cityRelevance";

export type Region = {
  id: KnownRegionId;
  name: string;
  cities: {
    id: KnownCityId;
    name: string;
  }[];
};

/**
 * Japan's 9 main regions with their major cities.
 *
 * This list is used for:
 * 1. Itinerary generation - grouping cities by region for efficient travel
 * 2. City-region validation - ensuring locations are in the correct region
 * 3. Trip builder UI - showing regional groupings
 *
 * Note: The region names here should match the "region" field in the locations table.
 */
export const REGIONS: readonly Region[] = [
  {
    id: "kansai",
    name: "Kansai",
    cities: [
      { id: "kyoto", name: "Kyoto" },
      { id: "osaka", name: "Osaka" },
      { id: "nara", name: "Nara" },
      { id: "kobe", name: "Kobe" },
      { id: "otsu", name: "Otsu" },
      { id: "himeji", name: "Himeji" },
      { id: "wakayama", name: "Wakayama" },
      { id: "iga", name: "Iga" },
      { id: "uji", name: "Uji" },
      { id: "kurama", name: "Kurama" },
      { id: "amanohashidate", name: "Amanohashidate" },
      { id: "ine", name: "Ine" },
      { id: "maizuru", name: "Maizuru" },
      { id: "miyama", name: "Miyama" },
    ],
  },
  {
    id: "kanto",
    name: "Kanto",
    cities: [
      { id: "tokyo", name: "Tokyo" },
      { id: "yokohama", name: "Yokohama" },
      { id: "kamakura", name: "Kamakura" },
      { id: "nikko", name: "Nikkō" },
      { id: "nasushiobara", name: "Nasushiobara" },
      { id: "hakone", name: "Hakone" },
      { id: "kawaguchiko", name: "Kawaguchiko" },
      { id: "kawagoe", name: "Kawagoe" },
      { id: "narita", name: "Narita" },
      { id: "chichibu", name: "Chichibu" },
    ],
  },
  {
    id: "chubu",
    name: "Chubu",
    cities: [
      { id: "nagoya", name: "Nagoya" },
      { id: "kanazawa", name: "Kanazawa" },
      { id: "hakusan", name: "Hakusan" },
      { id: "takayama", name: "Takayama" },
      { id: "nagano", name: "Nagano" },
      { id: "niigata", name: "Niigata" },
      { id: "nagaoka", name: "Nagaoka" },
      { id: "ise", name: "Ise" },
      { id: "toyama", name: "Toyama" },
      { id: "obama", name: "Obama" },
    ],
  },
  {
    id: "kyushu",
    name: "Kyushu",
    cities: [
      { id: "fukuoka", name: "Fukuoka" },
      { id: "dazaifu", name: "Dazaifu" },
      { id: "asakura", name: "Asakura" },
      { id: "nagasaki", name: "Nagasaki" },
      { id: "omura", name: "Omura" },
      { id: "kumamoto", name: "Kumamoto" },
      { id: "kagoshima", name: "Kagoshima" },
      { id: "oita", name: "Ōita" },
      { id: "yakushima", name: "Yakushima" },
      { id: "miyazaki", name: "Miyazaki" },
      { id: "kitakyushu", name: "Kitakyūshū" },
      { id: "arita", name: "Arita" },
      { id: "imari", name: "Imari" },
      { id: "kurokawa", name: "Kurokawa Onsen" },
      { id: "takachiho", name: "Takachiho" },
    ],
  },
  {
    id: "hokkaido",
    name: "Hokkaido",
    cities: [
      { id: "sapporo", name: "Sapporo" },
      { id: "hakodate", name: "Hakodate" },
      { id: "asahikawa", name: "Asahikawa" },
      { id: "kushiro", name: "Kushiro" },
      { id: "abashiri", name: "Abashiri" },
      { id: "wakkanai", name: "Wakkanai" },
      { id: "toyako", name: "Lake Toya" },
      { id: "noboribetsu", name: "Noboribetsu Onsen" },
      { id: "furano", name: "Furano" },
      { id: "shiretoko", name: "Shiretoko" },
      { id: "niseko", name: "Niseko" },
    ],
  },
  {
    id: "tohoku",
    name: "Tohoku",
    cities: [
      { id: "sendai", name: "Sendai" },
      { id: "morioka", name: "Morioka" },
      { id: "aomori", name: "Aomori" },
      { id: "akita", name: "Akita" },
      { id: "yamagata", name: "Yamagata" },
      { id: "aizuwakamatsu", name: "Aizu-Wakamatsu" },
      { id: "ginzan", name: "Ginzan Onsen" },
      { id: "zao", name: "Zao" },
      { id: "tazawako", name: "Lake Tazawa" },
      { id: "hiraizumi", name: "Hiraizumi" },
      { id: "hachimantai", name: "Hachimantai" },
    ],
  },
  {
    id: "chugoku",
    name: "Chugoku",
    cities: [
      { id: "hiroshima", name: "Hiroshima" },
      { id: "okayama", name: "Okayama" },
      { id: "maniwa", name: "Maniwa" },
      { id: "matsue", name: "Matsue" },
      { id: "tottori", name: "Tottori" },
      { id: "shimonoseki", name: "Shimonoseki" },
    ],
  },
  {
    id: "shikoku",
    name: "Shikoku",
    cities: [
      { id: "matsuyama", name: "Matsuyama" },
      { id: "takamatsu", name: "Takamatsu" },
      { id: "tokushima", name: "Tokushima" },
      { id: "kochi", name: "Kōchi" },
      { id: "iyavalley", name: "Iya Valley" },
    ],
  },
  {
    id: "okinawa",
    name: "Okinawa",
    cities: [
      { id: "naha", name: "Naha" },
      { id: "ishigaki", name: "Ishigaki" },
      { id: "miyako", name: "Miyako" },
      { id: "amami", name: "Amami" },
    ],
  },
] as const;

export const ALL_CITY_IDS = REGIONS.flatMap((region) =>
  region.cities.map((city) => city.id)
) as readonly KnownCityId[];

export const CITY_TO_REGION: Record<KnownCityId, KnownRegionId> = REGIONS.reduce(
  (acc, region) => {
    region.cities.forEach((city) => {
      acc[city.id] = region.id;
    });
    return acc;
  },
  {} as Record<KnownCityId, KnownRegionId>,
);

/**
 * Check if a city ID is a known static city
 */
export function isKnownCity(cityId: string): cityId is KnownCityId {
  return ALL_CITY_IDS.includes(cityId as KnownCityId);
}

/** Map from lowercase region name to region ID for dynamic city lookup */
const REGION_NAME_TO_ID = new Map<string, KnownRegionId>(
  REGIONS.map((r) => [r.name.toLowerCase(), r.id])
);

/**
 * Get the region for a city, returns undefined for unknown cities.
 * Falls back to cityInterests metadata for dynamic (non-known) cities.
 */
export function getRegionForCity(cityId: CityId): RegionId | undefined {
  // Normalize to lowercase — known city IDs are lowercase, but user input
  // or dynamic cities may arrive in mixed case (e.g. "Kyoto" vs "kyoto")
  const normalized = cityId.toLowerCase() as CityId;
  if (isKnownCity(normalized)) {
    return CITY_TO_REGION[normalized];
  }
  // Dynamic city — look up region from cityInterests metadata
  const meta = getCityMetadata(cityId);
  if (meta?.region) {
    return REGION_NAME_TO_ID.get(meta.region.toLowerCase());
  }
  return undefined;
}

export type WeatherRegion = "tropical_south" | "temperate" | "subarctic_north";

const TROPICAL_SOUTH_CITIES = new Set<string>([
  "naha", "ishigaki", "miyako", "amami",
]);

const SUBARCTIC_NORTH_CITIES = new Set<string>([
  "sapporo", "hakodate", "asahikawa", "kushiro", "abashiri", "wakkanai",
]);

/**
 * Climate-aware bucketing. Coarser than the 9 tourism regions because Japan's
 * climate spans subtropical (Okinawa) to subarctic (Hokkaido) but most cities
 * are temperate. Used by seasonal-period lookups that must vary by climate
 * (cherry blossom timing, tsuyu rainy season, etc.).
 */
export function getWeatherRegion(cityId: CityId): WeatherRegion {
  // Match getRegionForCity: normalize to lowercase so callers passing
  // mixed-case IDs (e.g. "Sapporo") don't silently fall through to temperate
  // and get the wrong tsuyu/sakura warnings.
  const normalized = cityId.toLowerCase();
  if (TROPICAL_SOUTH_CITIES.has(normalized)) return "tropical_south";
  if (SUBARCTIC_NORTH_CITIES.has(normalized)) return "subarctic_north";
  return "temperate";
}

/**
 * Derive unique region IDs from a list of selected cities.
 * Used to keep `data.regions` in sync when selection is city-driven.
 * Supports both known (43 static) and dynamic cities via metadata lookup.
 */
export function deriveRegionsFromCities(cityIds: CityId[]): KnownRegionId[] {
  const regionSet = new Set<KnownRegionId>();
  for (const cityId of cityIds) {
    if (isKnownCity(cityId)) {
      regionSet.add(CITY_TO_REGION[cityId]);
    } else {
      const regionId = getRegionForCity(cityId);
      if (regionId && REGION_NAME_TO_ID.has(regionId) || REGIONS.some((r) => r.id === regionId)) {
        regionSet.add(regionId as KnownRegionId);
      }
    }
  }
  return Array.from(regionSet);
}
