import type { CityId, KnownCityId } from "@/types/trip";
import { isKnownCity } from "@/data/regions";

export type CityCoordinates = { lat: number; lon: number };

/**
 * City-center approximations for all known Japanese city IDs.
 * Source: Wikipedia / OSM city-hall coordinates, rounded to 4 dp (~10m).
 * Used for earthquake-proximity gating — 150 km radius absorbs any
 * reasonable definition of "city center."
 */
export const CITY_COORDINATES: Record<KnownCityId, CityCoordinates> = {
  // Kansai
  kyoto:      { lat: 35.0116, lon: 135.7681 },
  osaka:      { lat: 34.6937, lon: 135.5023 },
  nara:       { lat: 34.6851, lon: 135.8048 },
  kobe:       { lat: 34.6901, lon: 135.1956 },
  otsu:       { lat: 35.0045, lon: 135.8686 },
  himeji:     { lat: 34.8151, lon: 134.6854 },
  wakayama:   { lat: 34.2261, lon: 135.1675 },
  iga:        { lat: 34.7689, lon: 136.1335 },  // Iga-Ueno Station / castle approach
  uji:        { lat: 34.8841, lon: 135.7991 },  // Uji Station / Byōdōin approach
  kurama:     { lat: 35.1194, lon: 135.7672 },  // Kurama-Kibune valley / midway between Kurama-dera and Kifune Shrine
  // Kanto
  tokyo:        { lat: 35.6762, lon: 139.6503 },
  yokohama:     { lat: 35.4437, lon: 139.6380 },
  kamakura:     { lat: 35.3192, lon: 139.5467 },
  nikko:        { lat: 36.7199, lon: 139.6982 },
  nasushiobara: { lat: 36.9711, lon: 140.0440 },  // Nasushiobara station / Shiobara Onsen entry
  hakone:       { lat: 35.2324, lon: 139.1069 },
  kawaguchiko:  { lat: 35.5171, lon: 138.7519 },
  kawagoe:      { lat: 35.9251, lon: 139.4858 },  // Kawagoe Station / Crea Mall — Koedo old town entry
  narita:       { lat: 35.7771, lon: 140.3186 },  // Narita Station / approach to Naritasan Shinshoji
  chichibu:     { lat: 35.9919, lon: 139.0855 },  // Chichibu Station / Chichibu Shrine vicinity
  // Chubu
  nagoya:    { lat: 35.1815, lon: 136.9066 },
  kanazawa:  { lat: 36.5613, lon: 136.6562 },
  hakusan:   { lat: 36.5147, lon: 136.5658 },  // Hakusan City Hall (Tsurugi area)
  takayama:  { lat: 36.1458, lon: 137.2524 },
  nagano:    { lat: 36.6485, lon: 138.1811 },
  niigata:   { lat: 37.9026, lon: 139.0232 },
  nagaoka:   { lat: 37.4470, lon: 138.8482 },  // Nagaoka station
  ise:       { lat: 34.4875, lon: 136.7090 },
  toyama:    { lat: 36.6959, lon: 137.2137 },
  obama:     { lat: 35.4956, lon: 135.7424 },  // Obama old-town preservation district / Saba Kaido terminus
  // Kyushu
  fukuoka:    { lat: 33.5904, lon: 130.4017 },
  dazaifu:    { lat: 33.5128, lon: 130.5239 },  // Dazaifu city center / Tenmangu approach
  asakura:    { lat: 33.4234, lon: 130.6657 },  // Asakura City Hall / upper Chikugo River
  nagasaki:   { lat: 32.7503, lon: 129.8777 },
  omura:      { lat: 32.9201, lon: 129.9617 },  // Kushima Castle Park / Omura station vicinity
  kumamoto:   { lat: 32.7898, lon: 130.7417 },
  kagoshima:  { lat: 31.5966, lon: 130.5571 },
  oita:       { lat: 33.2382, lon: 131.6126 },
  yakushima:  { lat: 30.3911, lon: 130.6578 },
  miyazaki:   { lat: 31.9111, lon: 131.4239 },
  kitakyushu: { lat: 33.8834, lon: 130.8750 },
  arita:      { lat: 33.2050, lon: 129.9160 },
  imari:      { lat: 33.2350, lon: 129.8930 },  // Okawachiyama valley, where the kiln content lives
  kurokawa:   { lat: 33.0780, lon: 131.1416 },
  takachiho:  { lat: 32.7110, lon: 131.3100 },
  // Hokkaido
  sapporo:   { lat: 43.0618, lon: 141.3545 },
  hakodate:  { lat: 41.7688, lon: 140.7288 },
  asahikawa: { lat: 43.7706, lon: 142.3650 },
  kushiro:   { lat: 42.9849, lon: 144.3814 },
  abashiri:  { lat: 44.0209, lon: 144.2734 },
  wakkanai:  { lat: 45.4155, lon: 141.6731 },
  toyako:      { lat: 42.5667, lon: 140.8500 },  // Lake Toya south shore (onsen town)
  noboribetsu: { lat: 42.4929, lon: 141.1481 },  // Noboribetsu Onsen town center
  furano:      { lat: 43.3416, lon: 142.3833 },  // Furano station
  shiretoko:   { lat: 44.0732, lon: 144.9990 },  // Utoro gateway town
  niseko:      { lat: 42.8625, lon: 140.6928 },  // Hirafu village, the international resort hub
  // Tohoku
  sendai:        { lat: 38.2682, lon: 140.8694 },
  morioka:       { lat: 39.7036, lon: 141.1527 },
  aomori:        { lat: 40.8244, lon: 140.7400 },
  akita:         { lat: 39.7186, lon: 140.1024 },
  yamagata:      { lat: 38.2404, lon: 140.3636 },
  aizuwakamatsu: { lat: 37.4945, lon: 139.9296 },
  ginzan:        { lat: 38.5720, lon: 140.5288 },  // Ginzan Onsen wooden ryokan strip
  zao:           { lat: 38.1672, lon: 140.3942 },  // Zao Onsen village
  tazawako:      { lat: 39.7169, lon: 140.6545 },  // Lake Tazawa east shore
  hiraizumi:     { lat: 38.9891, lon: 141.1104 },  // Chuson-ji area
  hachimantai:   { lat: 39.9400, lon: 140.8550 },  // Plateau center between Iwate and Akita
  // Chugoku
  hiroshima:    { lat: 34.3853, lon: 132.4553 },
  okayama:      { lat: 34.6617, lon: 133.9352 },
  maniwa:       { lat: 35.0810, lon: 133.7256 },  // Maniwa City Hall, Hiruzen Highlands gateway
  matsue:       { lat: 35.4723, lon: 133.0505 },
  tottori:      { lat: 35.5011, lon: 134.2351 },
  shimonoseki:  { lat: 33.9578, lon: 130.9414 },
  // Shikoku
  matsuyama:  { lat: 33.8392, lon: 132.7657 },
  takamatsu:  { lat: 34.3428, lon: 134.0466 },
  tokushima:  { lat: 34.0703, lon: 134.5548 },
  kochi:      { lat: 33.5597, lon: 133.5311 },
  iyavalley:  { lat: 33.8827, lon: 133.8176 },
  // Okinawa
  naha:      { lat: 26.2124, lon: 127.6809 },
  ishigaki:  { lat: 24.3448, lon: 124.1572 },
  miyako:    { lat: 24.8054, lon: 125.2812 },
  amami:     { lat: 28.3775, lon: 129.4936 },
};

/**
 * Resolve lat/lon for a city. Returns null for dynamic/unknown cities —
 * callers must treat absence as "cannot geo-filter against this city."
 */
export function resolveCityCoordinates(cityId: CityId): CityCoordinates | null {
  // Normalize to lowercase to match getRegionForCity / getWeatherRegion; callers
  // may pass mixed-case IDs (e.g. "Kyoto" vs "kyoto"). See src/data/regions.ts.
  const normalized = cityId.toLowerCase();
  if (isKnownCity(normalized)) {
    return CITY_COORDINATES[normalized];
  }
  return null;
}
