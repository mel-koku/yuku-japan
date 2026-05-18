import { tool } from "ai";
import { z } from "zod";
import {
  searchLocationsForChat,
  searchNearbyLocations,
  getLocationDetailForChat,
} from "./locationSearch";
import { getOpenStatus, formatOpenStatus } from "@/lib/availability/isOpenNow";
import { fetchMatchingGuidance } from "@/lib/tips/guidanceService";
import { getPublishedGuides } from "@/lib/guides/guideService";
import { getPublishedExperiences } from "@/lib/experiences/experienceService";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

import { parseLocalDate } from "@/lib/utils/dateUtils";
import { ALL_CITY_IDS, REGIONS, deriveRegionsFromCities } from "@/data/regions";
import { VIBES, normalizeVibeId } from "@/data/vibes";
import type { VibeId, TripStyle, KnownCityId } from "@/types/trip";

// Zod enum wants a non-empty tuple literal; ALL_CITY_IDS is a runtime readonly
// array. Cast preserves the full 54-city union at the tool-call boundary so the
// LLM isn't silently restricted to a stale hand-picked subset.
const CITY_ID_ENUM = ALL_CITY_IDS as unknown as readonly [KnownCityId, ...KnownCityId[]];

export const chatTools = {
  searchLocations: tool({
    description:
      "Search for locations in Japan by text query and/or structured filters like city, region, category, price level. Use for place discovery queries.",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe("Text search query (e.g. 'ramen', 'hidden temple')"),
      city: z
        .string()
        .optional()
        .describe("Filter by city name (e.g. 'Tokyo', 'Kyoto', 'Osaka')"),
      region: z
        .string()
        .optional()
        .describe(
          "Filter by region (e.g. 'Kanto', 'Kansai', 'Hokkaido', 'Tohoku')",
        ),
      category: z
        .string()
        .optional()
        .describe(
          "Filter by category: restaurant, nature, landmark, culture, shrine, museum, park, temple, shopping, entertainment, market, wellness, viewpoint, bar, garden, onsen, craft",
        ),
      priceLevel: z
        .number()
        .optional()
        .describe("Max price level (1=cheap, 2=moderate, 3=expensive, 4=very expensive)"),
      jtaApproved: z
        .boolean()
        .optional()
        .describe("If true, only return JTA-approved locations (Japan Tourism Agency certified)"),
    }),
    execute: async (params) => {
      const results = await searchLocationsForChat({
        query: params.query,
        city: params.city,
        region: params.region,
        category: params.category,
        priceLevel: params.priceLevel,
        jtaApproved: params.jtaApproved,
      });
      return { locations: results, count: results.length };
    },
  }),

  getLocationDetails: tool({
    description:
      "Get full details for a specific location by its ID. Use when the user asks about a specific place and you have its ID from a previous search.",
    inputSchema: z.object({
      locationId: z.string().describe("The location ID to look up"),
    }),
    execute: async ({ locationId }) => {
      const result = await getLocationDetailForChat(locationId);
      if (!result) return { error: "Location not found" };
      const openStatus = getOpenStatus(result.operatingHours);
      return {
        location: result,
        openStatus: {
          state: openStatus.state,
          label: formatOpenStatus(openStatus),
        },
      };
    },
  }),

  searchNearby: tool({
    description:
      "Find locations near a geographic point. Use for proximity queries like 'restaurants near Fushimi Inari' or 'things to do near Shinjuku Station'.",
    inputSchema: z.object({
      lat: z.number().describe("Latitude of the center point"),
      lng: z.number().describe("Longitude of the center point"),
      radiusKm: z
        .number()
        .optional()
        .describe("Search radius in kilometers (default 2)"),
      category: z
        .string()
        .optional()
        .describe("Filter results by category"),
      openNow: z
        .boolean()
        .optional()
        .describe("Only return locations currently open"),
    }),
    execute: async (params) => {
      const results = await searchNearbyLocations(params);
      return { locations: results, count: results.length };
    },
  }),

  getTravelTips: tool({
    description:
      "Get etiquette tips, practical advice, and seasonal information for traveling in Japan. Use for questions about customs, manners, seasonal events, and practical travel logistics.",
    inputSchema: z.object({
      category: z
        .string()
        .optional()
        .describe(
          "Category context (e.g. 'temple', 'shrine', 'restaurant', 'onsen')",
        ),
      city: z
        .string()
        .optional()
        .describe("City context for location-specific tips"),
      region: z
        .string()
        .optional()
        .describe("Region context"),
      season: z
        .enum(["spring", "summer", "fall", "winter"])
        .optional()
        .describe("Season for seasonal tips"),
    }),
    execute: async (params) => {
      try {
        const supabase = await createClient();
        const tips = await fetchMatchingGuidance(
          {
            category: params.category,
            city: params.city?.toLowerCase(),
            region: params.region,
            season: params.season,
          },
          supabase,
        );
        const topTips = tips.slice(0, 5).map((t) => ({
          title: t.title,
          content: t.content,
          guidanceType: t.guidanceType,
          priority: t.priority,
        }));
        return { tips: topTips, count: topTips.length };
      } catch (error) {
        logger.error(
          "Chat getTravelTips error",
          error instanceof Error ? error : new Error(String(error)),
        );
        return { tips: [], count: 0 };
      }
    },
  }),

  searchGuides: tool({
    description:
      "Search for travel guides and articles about Japan destinations. Returns guide summaries with titles, cities, regions, and types.",
    inputSchema: z.object({
      city: z
        .string()
        .optional()
        .describe("Filter guides by city"),
      region: z
        .string()
        .optional()
        .describe("Filter guides by region"),
      query: z
        .string()
        .optional()
        .describe("Text search in guide titles"),
    }),
    execute: async (params) => {
      try {
        const allGuides = await getPublishedGuides();
        let results = allGuides;

        if (params.city) {
          const cityLower = params.city.toLowerCase();
          results = results.filter(
            (g) => g.city?.toLowerCase().includes(cityLower),
          );
        }
        if (params.region) {
          const regionLower = params.region.toLowerCase();
          results = results.filter(
            (g) => g.region?.toLowerCase().includes(regionLower),
          );
        }
        if (params.query) {
          const queryLower = params.query.toLowerCase();
          results = results.filter(
            (g) =>
              g.title.toLowerCase().includes(queryLower) ||
              g.summary?.toLowerCase().includes(queryLower),
          );
        }

        const topResults = results.slice(0, 6).map((g) => ({
          id: g.id,
          title: g.title,
          summary: g.summary,
          city: g.city,
          region: g.region,
          guideType: g.guideType,
        }));

        return { guides: topResults, count: topResults.length };
      } catch (error) {
        logger.error(
          "Chat searchGuides error",
          error instanceof Error ? error : new Error(String(error)),
        );
        return { guides: [], count: 0 };
      }
    },
  }),

  searchExperiences: tool({
    description:
      "Search for bookable experiences, workshops, tours, and activities in Japan. Returns experience summaries with types, cities, and durations.",
    inputSchema: z.object({
      type: z
        .string()
        .optional()
        .describe(
          "Experience type: workshop, cruise, tour, experience, adventure, rental",
        ),
      city: z
        .string()
        .optional()
        .describe("Filter by city"),
      region: z
        .string()
        .optional()
        .describe("Filter by region"),
      query: z
        .string()
        .optional()
        .describe("Text search in experience titles"),
    }),
    execute: async (params) => {
      try {
        const allExperiences = await getPublishedExperiences();
        let results = allExperiences;

        if (params.type) {
          const typeLower = params.type.toLowerCase();
          results = results.filter(
            (e) => e.experienceType?.toLowerCase() === typeLower,
          );
        }
        if (params.city) {
          const cityLower = params.city.toLowerCase();
          results = results.filter(
            (e) => e.city?.toLowerCase().includes(cityLower),
          );
        }
        if (params.region) {
          const regionLower = params.region.toLowerCase();
          results = results.filter(
            (e) => e.region?.toLowerCase().includes(regionLower),
          );
        }
        if (params.query) {
          const queryLower = params.query.toLowerCase();
          results = results.filter(
            (e) =>
              e.title.toLowerCase().includes(queryLower) ||
              e.summary?.toLowerCase().includes(queryLower),
          );
        }

        const topResults = results.slice(0, 6).map((e) => ({
          id: e._id,
          title: e.title,
          slug: e.slug,
          summary: e.summary,
          experienceType: e.experienceType,
          city: e.city,
          region: e.region,
          duration: e.duration,
        }));

        return { experiences: topResults, count: topResults.length };
      } catch (error) {
        logger.error(
          "Chat searchExperiences error",
          error instanceof Error ? error : new Error(String(error)),
        );
        return { experiences: [], count: 0 };
      }
    },
  }),

  compareLocations: tool({
    description:
      "Compare 2-3 locations side by side. Use when the user asks to compare places, e.g. 'compare Senso-ji and Meiji Shrine' or 'which ryokan is better'.",
    inputSchema: z.object({
      locationIds: z
        .array(z.string())
        .min(2)
        .max(3)
        .describe("Location IDs to compare"),
    }),
    execute: async ({ locationIds }) => {
      const results = await Promise.all(
        locationIds.map((id) => getLocationDetailForChat(id)),
      );
      const locations = results
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .map((loc) => {
          const openStatus = getOpenStatus(loc.operatingHours);
          return {
            id: loc.id,
            slug: loc.slug,
            name: loc.name,
            category: loc.category,
            city: loc.city,
            region: loc.region,
            rating: loc.rating,
            reviewCount: loc.reviewCount,
            priceLevel: loc.priceLevel,
            estimatedDuration: loc.estimatedDuration,
            shortDescription: loc.shortDescription,
            openStatus: {
              state: openStatus.state,
              label: formatOpenStatus(openStatus),
            },
          };
        });
      if (locations.length < 2) {
        return { error: "Could not find enough locations to compare" };
      }
      return { locations, count: locations.length };
    },
  }),

  buildTripPlan: tool({
    description:
      "Build a structured trip plan from the user's natural language description. Use when the user wants to plan a trip, create an itinerary, or describes travel dates/destinations. Call this with the FULL set of params each time (not incremental).",
    inputSchema: z.object({
      startDate: z
        .string()
        .optional()
        .describe("Trip start date in YYYY-MM-DD format"),
      endDate: z
        .string()
        .optional()
        .describe("Trip end date in YYYY-MM-DD format"),
      duration: z
        .number()
        .min(1)
        .max(21)
        .optional()
        .describe("Trip duration in days (1-21). Used if no exact dates given."),
      cities: z
        .array(z.enum(CITY_ID_ENUM))
        .min(1)
        .describe("Lowercase city IDs the user wants to visit."),
      vibes: z
        .array(
          z.enum([
            "temples_tradition",
            "foodie_paradise",
            "nature_adventure",
            "zen_wellness",
            "modern_japan",
            "art_architecture",
            "local_secrets",
            "family_fun",
            "history_buff",
          ]),
        )
        .max(3)
        .optional()
        .describe("Up to 3 travel vibes that match the user's interests."),
      style: z
        .enum(["relaxed", "balanced", "fast"])
        .optional()
        .describe(
          "Trip pace: relaxed (fewer activities, more downtime), balanced (mix of sightseeing and rest), fast (packed schedule, see as much as possible)",
        ),
      entryAirport: z
        .string()
        .optional()
        .describe("IATA airport code for arrival (e.g. NRT, KIX, HND)"),
    }),
    execute: async (params) => {
      const validCities: KnownCityId[] = params.cities;
      const regions = deriveRegionsFromCities(validCities);

      // Validate vibes
      const validVibes: VibeId[] = [];
      if (params.vibes) {
        for (const vibe of params.vibes.slice(0, 3)) {
          const normalized = normalizeVibeId(vibe);
          if (normalized) {
            validVibes.push(normalized);
          }
        }
      }

      // Calculate duration from dates if both provided
      let duration = params.duration;
      if (params.startDate && params.endDate) {
        const start = parseLocalDate(params.startDate);
        const end = parseLocalDate(params.endDate);
        if (start && end) {
          const diffMs = end.getTime() - start.getTime();
          const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
          if (diffDays > 0 && diffDays <= 14) {
            duration = diffDays;
          }
        }
      }

      // Build city display names
      const cityNames = validCities.map((cityId) => {
        for (const region of REGIONS) {
          const city = region.cities.find((c) => c.id === cityId);
          if (city) return city.name;
        }
        return cityId;
      });

      // Build vibe display names
      const vibeNames = validVibes.map((vibeId) => {
        const vibe = VIBES.find((v) => v.id === vibeId);
        return vibe ? vibe.name : vibeId;
      });

      return {
        type: "tripPlan" as const,
        plan: {
          startDate: params.startDate,
          endDate: params.endDate,
          duration,
          cities: validCities,
          regions,
          vibes: validVibes,
          style: (params.style as TripStyle) || undefined,
          entryAirport: params.entryAirport,
        },
        cityNames,
        vibeNames,
      };
    },
  }),
};
