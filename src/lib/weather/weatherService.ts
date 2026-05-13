import type { WeatherForecast, WeatherCondition } from "@/types/weather";
import type { CityId } from "@/types/trip";
import { logger } from "@/lib/logger";
import { parseLocalDate, formatLocalDateISO } from "@/lib/utils/dateUtils";
import { fetchWithTimeout } from "@/lib/api/fetchWithTimeout";
import { resolveCityCoordinates } from "@/data/cityCoordinates";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

/** Weather API timeout — 4s is plenty; mock data is fine if it's slower */
const WEATHER_TIMEOUT_MS = 4_000;

/** Cache forecasts for 6 hours */
const WEATHER_CACHE_TTL_SECONDS = 6 * 60 * 60;

/** Redis key prefix for weather cache */
const WEATHER_CACHE_KEY_PREFIX = "@yuku-japan/weather";

/** Redis client (initialized lazily) */
let redisClient: Redis | null = null;
let redisInitialized = false;
let redisAvailable = false;

function initializeRedis(): void {
  if (redisInitialized) return;
  redisInitialized = true;

  const redisUrl = env.upstashRedisRestUrl;
  const redisToken = env.upstashRedisRestToken;

  if (redisUrl && redisToken) {
    try {
      redisClient = new Redis({ url: redisUrl, token: redisToken });
      redisAvailable = true;
    } catch (error) {
      logger.warn("Failed to initialize Redis for weather cache", { error: String(error) });
      redisAvailable = false;
    }
  } else {
    redisAvailable = false;
  }
}

async function getCachedForecasts(
  cacheKey: string,
): Promise<Map<string, WeatherForecast> | null> {
  initializeRedis();
  if (!redisAvailable || !redisClient) return null;

  try {
    const raw = await redisClient.get<Record<string, WeatherForecast>>(cacheKey);
    if (!raw) return null;
    return new Map(Object.entries(raw));
  } catch {
    return null;
  }
}

async function setCachedForecasts(
  cacheKey: string,
  forecasts: Map<string, WeatherForecast>,
): Promise<void> {
  initializeRedis();
  if (!redisAvailable || !redisClient) return;

  try {
    const plain = Object.fromEntries(forecasts);
    await redisClient.set(cacheKey, plain, { ex: WEATHER_CACHE_TTL_SECONDS });
  } catch {
    // Non-fatal: forecasts still returned to caller
  }
}

/**
 * Map OpenWeatherMap condition codes to our WeatherCondition type
 */
function mapWeatherCondition(code: number): WeatherCondition {
  // OpenWeatherMap condition codes: https://openweathermap.org/weather-conditions
  if (code >= 200 && code < 300) return "thunderstorm";
  if (code >= 300 && code < 400) return "drizzle";
  if (code >= 500 && code < 600) return "rain";
  if (code >= 600 && code < 700) return "snow";
  if (code >= 700 && code < 800) {
    if (code === 701 || code === 741) return "mist";
    if (code === 721) return "haze";
    return "fog";
  }
  if (code === 800) return "clear";
  if (code >= 801 && code <= 804) return "clouds";
  return "clear"; // Default fallback
}

/**
 * Fetch weather forecast for a city and date range
 */
export async function fetchWeatherForecast(
  cityId: CityId,
  startDate: string, // ISO date string (yyyy-mm-dd)
  endDate: string, // ISO date string (yyyy-mm-dd)
): Promise<Map<string, WeatherForecast>> {
  const cacheKey = `${WEATHER_CACHE_KEY_PREFIX}:${cityId}:${startDate}:${endDate}`;

  const cached = await getCachedForecasts(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.OPENWEATHER_API_KEY;

  if (!apiKey) {
    logger.warn("OpenWeatherMap API key not configured, returning mock weather data");
    return getMockWeatherForecast(startDate, endDate);
  }

  const coords = resolveCityCoordinates(cityId);
  if (!coords) {
    logger.error(
      `Weather forecast requested for unknown city: ${cityId} — no coordinates found`,
      new Error(`Unknown cityId: ${cityId}`),
      { cityId, startDate, endDate },
    );
    return new Map();
  }

  try {
    // OpenWeatherMap 5-day forecast API
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${coords.lat}&lon=${coords.lon}&appid=${apiKey}&units=metric`;

    const response = await fetchWithTimeout(url, {}, WEATHER_TIMEOUT_MS);
    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }

    const data = await response.json();
    const forecasts = new Map<string, WeatherForecast>();

    // Group forecasts by date
    const forecastsByDate = new Map<string, Array<{
      temp: number;
      condition: WeatherCondition;
      precipitation: number;
      humidity: number;
      wind: number;
    }>>();

    for (const item of data.list || []) {
      const date = new Date(item.dt * 1000);
      const dateKey = formatLocalDateISO(date);

      if (!dateKey) continue;

      const condition = mapWeatherCondition(item.weather[0]?.id ?? 800);
      const temp = item.main.temp;
      const precipitation = item.rain?.["3h"] ?? item.snow?.["3h"] ?? 0;
      const humidity = item.main.humidity ?? 0;
      // OWM returns wind.speed in m/s (units=metric). Some slots omit wind entirely.
      const wind = typeof item.wind?.speed === "number" ? item.wind.speed : 0;

      if (!forecastsByDate.has(dateKey)) {
        forecastsByDate.set(dateKey, []);
      }
      forecastsByDate.get(dateKey)?.push({
        temp,
        condition,
        precipitation,
        humidity,
        wind,
      });
    }

    // Aggregate forecasts per day
    for (const [dateKey, dayForecasts] of forecastsByDate.entries()) {
      if (dayForecasts.length === 0) continue;

      const temps = dayForecasts.map((f) => f.temp);
      const minTemp = Math.min(...temps);
      const maxTemp = Math.max(...temps);

      // Use most common condition, or rain if any rain exists
      const hasRain = dayForecasts.some((f) => f.condition === "rain" || f.condition === "drizzle");
      const condition = hasRain
        ? "rain"
        : dayForecasts[Math.floor(dayForecasts.length / 2)]?.condition ?? "clear";

      const totalPrecipitation = dayForecasts.reduce((sum, f) => sum + f.precipitation, 0);
      const avgHumidity = dayForecasts.reduce((sum, f) => sum + f.humidity, 0) / dayForecasts.length;
      // Daily max wind, not avg: sustained gusts matter more for tip triggers.
      // reduce() rather than Math.max(...spread) so a future refactor that
      // passes an empty array won't silently return -Infinity.
      const maxWind = dayForecasts.reduce((m, f) => Math.max(m, f.wind), 0);

      // Get description from condition
      const conditionDescriptions: Record<string, string> = {
        clear: "Clear sky",
        clouds: "Cloudy",
        rain: "Rainy",
        drizzle: "Light rain",
        thunderstorm: "Thunderstorm",
        snow: "Snowy",
        mist: "Misty",
        fog: "Foggy",
        haze: "Hazy",
      };
      const description = conditionDescriptions[condition] ?? "Clear sky";

      forecasts.set(dateKey, {
        date: dateKey,
        condition,
        temperature: {
          min: Math.round(minTemp),
          max: Math.round(maxTemp),
        },
        precipitation: {
          probability: hasRain ? Math.min(100, Math.round(totalPrecipitation * 10)) : 0,
          amount: totalPrecipitation > 0 ? Math.round(totalPrecipitation * 10) / 10 : undefined,
        },
        humidity: Math.round(avgHumidity),
        windSpeed: maxWind > 0 ? Math.round(maxWind * 10) / 10 : undefined,
        description,
      });
    }

    await setCachedForecasts(cacheKey, forecasts);

    return forecasts;
  } catch (error) {
    logger.error("Failed to fetch weather forecast", error instanceof Error ? error : new Error(String(error)), {
      cityId,
      startDate,
      endDate,
    });
    // Fallback to mock data
    return getMockWeatherForecast(startDate, endDate);
  }
}

/**
 * Approximate central Japan temperature ranges by month (°C).
 * Based on Tokyo/Osaka averages.
 */
function getSeasonalTemperature(month: number): { min: number; max: number; rainyChance: number } {
  const temps: Record<number, { min: number; max: number; rainyChance: number }> = {
    0:  { min: 1, max: 9, rainyChance: 0.15 },   // Jan
    1:  { min: 2, max: 10, rainyChance: 0.15 },   // Feb
    2:  { min: 5, max: 14, rainyChance: 0.25 },   // Mar
    3:  { min: 10, max: 19, rainyChance: 0.25 },   // Apr
    4:  { min: 15, max: 24, rainyChance: 0.25 },   // May
    5:  { min: 19, max: 27, rainyChance: 0.45 },   // Jun (tsuyu)
    6:  { min: 23, max: 31, rainyChance: 0.35 },   // Jul
    7:  { min: 24, max: 33, rainyChance: 0.30 },   // Aug
    8:  { min: 20, max: 28, rainyChance: 0.35 },   // Sep
    9:  { min: 14, max: 22, rainyChance: 0.25 },   // Oct
    10: { min: 8, max: 17, rainyChance: 0.15 },    // Nov
    11: { min: 3, max: 12, rainyChance: 0.15 },    // Dec
  };
  return temps[month] ?? { min: 12, max: 22, rainyChance: 0.20 };
}

/**
 * Generate mock weather forecast for development/testing.
 * Uses seasonal temperature ranges so scoring behaves realistically.
 */
function getMockWeatherForecast(
  startDate: string,
  endDate: string,
): Map<string, WeatherForecast> {
  logger.warn("Using mock weather data — no API key configured or API call failed");

  const forecasts = new Map<string, WeatherForecast>();
  const start = parseLocalDate(startDate)!;
  const end = parseLocalDate(endDate)!;

  const current = new Date(start);
  while (current <= end) {
    // Local YYYY-MM-DD via formatLocalDateISO. Using toISOString() here
    // would convert to UTC first and shift the date by one for users east
    // of GMT (every JST user would have gotten yesterday's mock forecast).
    const dateKey = formatLocalDateISO(current);
    if (!dateKey) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    const { min, max, rainyChance } = getSeasonalTemperature(current.getMonth());
    const dayOfYear = Math.floor((current.getTime() - new Date(current.getFullYear(), 0, 0).getTime()) / 86400000);
    // Deterministic rain based on day-of-year and seasonal chance
    const isRainy = (dayOfYear % Math.round(1 / rainyChance)) === 0;

    forecasts.set(dateKey, {
      date: dateKey,
      condition: isRainy ? "rain" : "clear",
      temperature: { min, max },
      precipitation: isRainy
        ? {
            probability: 60,
            amount: 5.2,
          }
        : undefined,
      humidity: isRainy ? 75 : 50,
      description: isRainy ? "Light rain" : "Clear sky",
    });

    current.setDate(current.getDate() + 1);
  }

  return forecasts;
}
