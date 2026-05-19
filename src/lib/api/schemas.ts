/**
 * Zod validation schemas for API route inputs
 */

import { z } from "zod";
import { INTEREST_CATEGORIES } from "@/data/interests";
import { normalizeVibeId } from "@/data/vibes";

/**
 * Schema for location ID parameter
 */
export const locationIdSchema = z
  .string()
  .min(1, "Location ID cannot be empty")
  .max(255, "Location ID too long")
  .regex(/^[A-Za-z0-9._-]+$/, "Location ID contains invalid characters")
  .refine((val) => !val.includes("..") && !val.includes("//"), {
    message: "Location ID contains path traversal characters",
  });

/**
 * Schema for photo name parameter (Google Places API format)
 */
export const photoNameSchema = z
  .string()
  .min(1, "Photo name cannot be empty")
  .max(500, "Photo name too long")
  .regex(/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/, "Invalid photo name format");

/**
 * Schema for positive integer query parameters
 */
export const positiveIntSchema = z
  .string()
  .regex(/^\d+$/, "Must be a positive integer")
  .transform((val) => Number.parseInt(val, 10))
  .pipe(z.number().int().positive().max(10000));

/**
 * Schema for optional positive integer query parameters with max value
 */
export function createMaxDimensionSchema(maxValue: number) {
  return z
    .string()
    .regex(/^\d+$/, "Must be a positive integer")
    .transform((val) => Number.parseInt(val, 10))
    .pipe(z.number().int().positive().max(maxValue))
    .optional();
}

/**
 * Schema for preview route slug parameter
 * Must be a safe path segment
 */
export const previewSlugSchema = z
  .string()
  .min(1, "Slug cannot be empty")
  .max(500, "Slug too long")
  .refine(
    (val) => {
      // Reject path traversal
      if (val.includes("..") || val.includes("//") || val.includes("\\")) {
        return false;
      }
      // Allow relative paths starting with /
      if (val.startsWith("/")) {
        const segments = val.split("/").filter((s) => s.length > 0);
        return segments.every((seg) => /^[A-Za-z0-9._-]+$/.test(seg));
      }
      // Allow simple slugs
      return /^[A-Za-z0-9._/-]+$/.test(val);
    },
    {
      message: "Slug contains invalid characters or path traversal attempts",
    },
  );

/**
 * Schema for redirect URL parameter (preview/exit route)
 * Must be a safe relative path or same-origin URL
 */
export const redirectUrlSchema = z
  .string()
  .min(1, "Redirect URL cannot be empty")
  .max(2048, "Redirect URL too long")
  .refine(
    (val) => {
      const trimmed = val.trim();
      // Reject protocol-relative URLs
      if (trimmed.startsWith("//")) {
        return false;
      }
      // Reject dangerous protocols
      const lowerTrimmed = trimmed.toLowerCase();
      const dangerousProtocols = ["javascript:", "data:", "vbscript:", "file:", "about:"];
      if (dangerousProtocols.some((proto) => lowerTrimmed.startsWith(proto))) {
        return false;
      }
      // Allow relative paths
      if (trimmed.startsWith("/")) {
        return !trimmed.includes("..") && !trimmed.includes("//");
      }
      // Reject absolute URLs (open redirect prevention)
      try {
        new URL(trimmed);
        return false; // Absolute URLs not allowed
      } catch {
        // Not a valid URL, treat as relative path
        return !trimmed.includes("..") && !trimmed.includes("//");
      }
    },
    {
      message: "Invalid or unsafe redirect URL",
    },
  );

/**
 * Schema for secret parameter (preview/revalidate routes)
 */
export const secretSchema = z
  .string()
  .min(1, "Secret cannot be empty")
  .max(500, "Secret too long")
  .refine((val) => !val.includes("\n") && !val.includes("\r"), {
    message: "Secret contains invalid characters",
  });

/**
 * Schema for trip ID validation
 */
export const tripIdSchema = z
  .string()
  .min(1, "Trip ID cannot be empty")
  .max(255, "Trip ID too long")
  .regex(/^[A-Za-z0-9._-]+$/, "Trip ID contains invalid characters")
  .optional();

/**
 * Schema for date strings (ISO format: YYYY-MM-DD)
 */
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in ISO format (YYYY-MM-DD)")
  .refine((val) => {
    // Validate date components directly to avoid timezone-dependent Date parsing
    const [y, m, d] = val.split("-").map(Number);
    return y !== undefined && m !== undefined && d !== undefined &&
      y >= 2020 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  }, "Invalid date")
  .optional();

/**
 * Schema for travel dates
 * Validates that start date is not more than 1 day in the past (timezone grace)
 * and that end date is strictly after start date (no 0-day trips).
 */
export const travelDatesSchema = z.object({
  start: isoDateSchema,
  end: isoDateSchema,
}).strict().refine(
  (dates) => {
    // Allow if start is missing (optional field)
    if (!dates.start) {
      return true;
    }
    // start must be >= yesterday UTC (1-day grace period for timezone differences)
    const now = new Date();
    now.setUTCDate(now.getUTCDate() - 1);
    const yesterday = now.toISOString().slice(0, 10);
    return dates.start >= yesterday;
  },
  {
    message: "Start date cannot be more than 1 day in the past",
    path: ["start"],
  },
).refine(
  (dates) => {
    // Allow if either date is missing (optional fields)
    if (!dates.start || !dates.end) {
      return true;
    }
    // end must be strictly after start (no 0-day trips)
    return dates.end > dates.start;
  },
  {
    message: "End date must be after start date",
    path: ["end"],
  },
);

/**
 * Schema for entry point type (airports only)
 */
const entryPointTypeSchema = z.literal("airport");

/**
 * Schema for coordinates
 */
// Japan bounding box (covers Okinawa to Hokkaido with a small buffer).
// Rejects coordinates from outside Japan, which otherwise produce nonsensical
// itineraries (e.g., JFK entry-point → 10,000 km transit to Kyoto).
const coordinatesSchema = z.object({
  lat: z.number().min(20).max(46),
  lng: z.number().min(122).max(154),
}).strict();

/**
 * Schema for known region IDs (Japan's 9 main regions)
 */
const knownRegionIdSchema = z.enum([
  "kansai",
  "kanto",
  "chubu",
  "kyushu",
  "hokkaido",
  "tohoku",
  "chugoku",
  "shikoku",
  "okinawa",
]);

/**
 * Schema for entry point (airports only)
 */
const entryPointSchema = z.object({
  type: entryPointTypeSchema,
  id: z.string().min(1).max(255).regex(/^[A-Za-z0-9._-]+$/),
  name: z.string().min(1).max(500),
  coordinates: coordinatesSchema,
  cityId: z.string().max(255).nullish().transform(v => v ?? undefined),
  iataCode: z.string().length(3).regex(/^[A-Z]{3}$/).nullish().transform(v => v ?? undefined),
  region: knownRegionIdSchema.nullish().transform(v => v ?? undefined),
}).strict().optional();

/**
 * Schema for region ID (allows any string but validates format)
 */
const regionIdSchema = z.string().min(1).max(255).regex(/^[A-Za-z0-9._-]+$/);

/**
 * Schema for city ID (allows city names with spaces, hyphens, and common characters)
 * City names come from the database and may include spaces (e.g., "Mount Yoshino", "Minami Aizu")
 * Also allows special characters like en-dash (−) and other unicode characters
 */
const cityIdSchema = z.string().min(1).max(255);

/**
 * Schema for interest ID (must be valid interest from INTEREST_CATEGORIES)
 */
const interestIdSchema = z.enum(
  INTEREST_CATEGORIES.map((cat) => cat.id) as [string, ...string[]]
);

/**
 * Schema for vibe ID (accepts current IDs and legacy aliases)
 */
const vibeIdSchema = z.string().transform((val, ctx) => {
  const normalized = normalizeVibeId(val);
  if (!normalized) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid vibe ID: ${val}`,
    });
    return z.NEVER;
  }
  return normalized;
});

/**
 * Schema for trip style
 */
const tripStyleSchema = z.enum(["relaxed", "balanced", "fast"]).optional();

/**
 * Schema for budget level
 */
const budgetLevelSchema = z.enum(["budget", "moderate", "luxury"]).optional();

/**
 * Schema for budget information
 */
const budgetSchema = z.object({
  total: z.number().positive().max(10000000).optional(),
  perDay: z.number().positive().max(1000000).optional(),
  level: budgetLevelSchema,
}).strict().optional();

/**
 * Schema for group type
 */
const groupTypeSchema = z.enum(["solo", "couple", "family", "friends", "business"]).optional();

/**
 * Schema for group information
 * Uses nullish() to accept both null and undefined (UI may send null for unset values)
 */
const groupSchema = z.object({
  size: z.number().int().positive().max(100).nullish().transform(v => v ?? undefined),
  type: groupTypeSchema,
  childrenAges: z.array(z.number().int().min(0).max(18)).max(20).optional(),
}).strict().optional();

/**
 * Schema for accessibility information
 */
const accessibilitySchema = z.object({
  mobility: z.boolean().optional(),
  dietary: z.array(z.string().max(500)).max(50).optional(),
  dietaryOther: z.string().max(1000).optional(),
  notes: z.string().max(5000).optional(),
}).strict().optional();

/**
 * Schema for weather preferences
 */
const weatherPreferencesSchema = z.object({
  preferIndoorOnRain: z.boolean().optional(),
  minTemperature: z.number().min(-50).max(50).optional(),
  maxTemperature: z.number().min(-50).max(50).optional(),
}).strict().optional();

/**
 * Schema for traveler profile (used in TripBuilderData)
 * Matches the TravelerProfile type from @/types/traveler.ts
 */
const travelerProfileSchema = z.object({
  pace: z.enum(["relaxed", "balanced", "fast"]),
  budget: z.object({
    total: z.number().positive().max(10000000).optional(),
    perDay: z.number().positive().max(1000000).optional(),
    level: z.enum(["budget", "moderate", "luxury"]),
  }).strict(),
  mobility: z.object({
    required: z.boolean(),
    needs: z.array(z.string().max(500)).max(20).optional(),
  }).strict(),
  interests: z.array(interestIdSchema).max(20),
  group: z.object({
    size: z.number().int().positive().max(100),
    type: z.enum(["solo", "couple", "family", "friends", "business"]),
    childrenAges: z.array(z.number().int().min(0).max(18)).max(20).optional(),
  }).strict(),
  dietary: z.object({
    restrictions: z.array(z.string().max(500)).max(50),
    notes: z.string().max(1000).optional(),
  }).strict(),
  weatherPreferences: z.object({
    preference: z.enum(["indoor_alternatives", "outdoor_preferred", "no_preference"]),
  }).strict().optional(),
}).strict().optional();

/**
 * Comprehensive schema for TripBuilderData
 * Validates all fields with proper types and constraints
 */
/**
 * Schema for time in HH:MM format (24-hour)
 */
const timeSchema = z
  .string()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Time must be in HH:MM format (24-hour)")
  .optional();

/**
 * Schema for content context (guide/experience → trip builder bridge)
 */
const contentContextSchema = z.object({
  type: z.enum(["guide", "experience"]),
  slug: z.string().min(1).max(500),
  title: z.string().min(1).max(500),
  locationIds: z.array(z.string().min(1).max(255)).max(50),
  city: z.string().max(255).optional(),
  region: z.string().max(255).optional(),
}).strict().optional();

export const tripBuilderDataSchema = z.object({
  duration: z.number().int().min(1).max(21).optional(),
  dates: travelDatesSchema,
  regions: z.array(regionIdSchema).max(50).optional(),
  cities: z.array(cityIdSchema).max(50).optional(),
  vibes: z.array(vibeIdSchema).max(5).optional(),
  style: tripStyleSchema,
  entryPoint: entryPointSchema,
  exitPoint: entryPointSchema,
  sameAsEntry: z.boolean().optional(),
  accessibility: accessibilitySchema,
  budget: budgetSchema,
  group: groupSchema,
  weatherPreferences: weatherPreferencesSchema,
  // travelerProfile is optional and will be built from other fields if not provided
  travelerProfile: travelerProfileSchema,
  // Day start time in HH:MM format (24-hour)
  dayStartTime: timeSchema,
  // Flight arrival time in HH:MM format (24-hour)
  arrivalTime: timeSchema,
  // Flight departure time in HH:MM format (24-hour)
  departureTime: timeSchema,
  // Content context from guide/experience CTA
  contentContext: contentContextSchema,
  // First-time visitor flag
  isFirstTimeVisitor: z.boolean().optional(),
  // Per-city day allocation overrides (array = new format, record = legacy)
  cityDays: z.union([
    z.array(z.number().int().min(1).max(21)),
    z.record(cityIdSchema, z.number().int().min(1).max(21)),
  ]).optional(),
  // Custom city order flag
  customCityOrder: z.boolean().optional(),
  // Accommodation style preference
  accommodationStyle: z.enum(["hotel", "ryokan", "hostel", "mix"]).optional(),
  // Parsed flight details (display-only metadata)
  flightDetails: z.object({
    arrival: z.object({
      airline: z.string().max(100).optional(),
      flightNumber: z.string().max(20).optional(),
    }).strict().optional(),
    departure: z.object({
      airline: z.string().max(100).optional(),
      flightNumber: z.string().max(20).optional(),
    }).strict().optional(),
  }).strict().optional(),
  // Pre-generation accommodation coordinates keyed by city ID
  accommodations: z.record(
    cityIdSchema,
    z.object({
      name: z.string().min(1).max(500),
      coordinates: coordinatesSchema,
      placeId: z.string().max(500).optional(),
    }).strict(),
  ).optional(),
}).strict();

/**
 * Schema for itinerary plan request
 */
export const planRequestSchema = z.object({
  builderData: tripBuilderDataSchema,
  tripId: tripIdSchema,
  savedIds: z.array(z.string().min(1).max(255)).max(200).optional(),
}).strict().superRefine((data, ctx) => {
  // When both cityDays and duration are provided, their sum must match.
  // Without this check the generator crashes with "City info not found for
  // day N" when it advances past the last allocated city.
  const { cityDays, duration } = data.builderData;
  if (cityDays && duration != null) {
    const days = Array.isArray(cityDays) ? cityDays : Object.values(cityDays);
    const sum = days.reduce((acc, n) => acc + n, 0);
    if (sum !== duration) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["builderData", "cityDays"],
        message: `cityDays sum (${sum}) must equal duration (${duration})`,
      });
    }
  }
});

/**
 * Schema for availability check request
 */
export const availabilityRequestSchema = z.object({
  activities: z.array(z.object({
    // ItineraryActivity.id is required — findLocationsForActivities crashes
    // on `activityId.match(...)` if it's missing. Enforce at the boundary.
    id: z.string().min(1).max(500),
    locationId: z.string().min(1).max(255).optional(),
    startTime: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
    endTime: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  }).passthrough()).min(1).max(100),
});

/**
 * Schema for smart prompt recommendation request
 */
export const recommendRequestSchema = z.object({
  gap: z.object({ action: z.object({ type: z.string().min(1) }).passthrough() }).passthrough(),
  dayActivities: z.array(z.unknown()).optional(),
  cityId: z.string().max(255).optional(),
  tripBuilderData: z.unknown().optional(),
  usedLocationIds: z.array(z.string()).max(500).optional(),
  excludeLocationIds: z.array(z.string()).max(500).optional(),
  refinementFilters: z.unknown().optional(),
  tripDate: z.string().max(20).optional(),
});

/**
 * Helper to validate query parameters
 */
export function validateQueryParams<T extends z.ZodSchema>(
  searchParams: URLSearchParams,
  schema: T,
) {
  const params: Record<string, string | null> = {};
  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }
  return schema.safeParse(params);
}

/**
 * Helper to validate request body JSON
 */
export async function validateRequestBody<T extends z.ZodSchema>(
  request: Request,
  schema: T,
  maxSize: number = 1024 * 1024, // 1MB default
) {
  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    return {
      success: false,
      error: {
        issues: [
          {
            code: "invalid_type",
            expected: "application/json",
            received: contentType || "unknown",
            path: [],
            message: "Content-Type must be application/json",
          },
        ],
      },
    } as { success: false; error: { issues: Array<{ code: string; path: unknown[]; message: string; expected?: string; received?: string }> } };
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > maxSize) {
    return {
      success: false,
      error: {
        issues: [
          {
            code: "too_big",
            maximum: maxSize,
            type: "string",
            inclusive: true,
            path: [],
            message: `Request body too large (max ${maxSize} bytes)`,
          },
        ],
      },
    } as { success: false; error: { issues: Array<{ code: string; path: unknown[]; message: string; maximum?: number; type?: string; inclusive?: boolean }> } };
  }

  try {
    const text = await request.text();
    if (text.length > maxSize) {
      return {
        success: false,
        error: {
          issues: [
            {
              code: "too_big",
              maximum: maxSize,
              type: "string",
              inclusive: true,
              path: [],
              message: `Request body too large (max ${maxSize} bytes)`,
            },
          ],
        },
      } as { success: false; error: { issues: Array<{ code: string; path: unknown[]; message: string; maximum?: number; type?: string; inclusive?: boolean }> } };
    }

    const json = JSON.parse(text);
    return schema.safeParse(json);
  } catch (error) {
    return {
      success: false,
      error: {
        issues: [
          {
            code: "custom",
            path: [],
            message: error instanceof Error ? error.message : "Invalid JSON",
          },
        ],
      },
    } as { success: false; error: { issues: Array<{ code: string; path: unknown[]; message: string }> } };
  }
}
