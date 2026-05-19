/**
 * Centralized rate limit configuration for all API routes.
 * Each entry specifies maxRequests per windowMs (milliseconds).
 */
export const RATE_LIMITS = {
  LOCATIONS: { maxRequests: 60, windowMs: 60_000 },
  LOCATIONS_BATCH: { maxRequests: 100, windowMs: 60_000 },
  PLACES: { maxRequests: 60, windowMs: 60_000 },
  ITINERARY_PLAN: { maxRequests: 20, windowMs: 60_000 },
  /** Stricter limit for unauthenticated itinerary generation (expensive AI) */
  ITINERARY_PLAN_UNAUTH: { maxRequests: 5, windowMs: 60_000, keySuffix: "unauth" },
  ITINERARY_REFINE: { maxRequests: 10, windowMs: 60_000 },
  ITINERARY_SCHEDULE: { maxRequests: 30, windowMs: 60_000 },
  ITINERARY_AVAILABILITY: { maxRequests: 60, windowMs: 60_000 },
  SMART_PROMPTS: { maxRequests: 30, windowMs: 60_000 },
  ROUTING: { maxRequests: 100, windowMs: 60_000 },
  WEBHOOK: { maxRequests: 30, windowMs: 60_000 },
  HEALTH: { maxRequests: 200, windowMs: 60_000 },
  CHAT: { maxRequests: 20, windowMs: 60_000 },
  TRIPS: { maxRequests: 100, windowMs: 60_000 },
  RATINGS: { maxRequests: 60, windowMs: 60_000 },
  BOOKINGS: { maxRequests: 10, windowMs: 60_000 },
  SHARED: { maxRequests: 60, windowMs: 60_000 },
  GEOCODE: { maxRequests: 60, windowMs: 60_000 },
  PEOPLE: { maxRequests: 100, windowMs: 60_000 },
  EXPERIENCES: { maxRequests: 100, windowMs: 60_000 },
  CITIES: { maxRequests: 100, windowMs: 60_000 },
  INQUIRIES: { maxRequests: 10, windowMs: 60_000 },
  CONCIERGE_INQUIRIES: { maxRequests: 5, windowMs: 15 * 60_000 },
  LOCATION_REPORTS: { maxRequests: 5, windowMs: 60 * 60_000 },
  DAY_TRIPS_SUGGEST: { maxRequests: 20, windowMs: 60_000 },
  DAY_TRIPS_PLAN: { maxRequests: 10, windowMs: 60_000 },
  BILLING_CHECKOUT: { maxRequests: 5, windowMs: 60_000 },
  BILLING_VERIFY: { maxRequests: 30, windowMs: 60_000 },
  BILLING_WEBHOOK: { maxRequests: 50, windowMs: 60_000 },
  BILLING_COMPLETE: { maxRequests: 5, windowMs: 60_000 },
  CONTACT: { maxRequests: 5, windowMs: 15 * 60_000 },
  ADDRESS_SEARCH: { maxRequests: 30, windowMs: 60_000 },
  /** Server-side PDF generation — expensive (~200MB RAM + 3–15s CPU per call) */
  PDF: { maxRequests: 5, windowMs: 60_000 },
} as const;

/**
 * Daily quota configuration for expensive AI/external API endpoints.
 * Caps total usage per user (or IP) per calendar day to control costs.
 * Works alongside per-minute rate limits in RATE_LIMITS above.
 */
export const DAILY_QUOTAS = {
  ITINERARY_PLAN: { name: "itinerary-plan", maxPerDay: 15 },
  ITINERARY_REFINE: { name: "itinerary-refine", maxPerDay: 50 },
  CHAT: { name: "chat", maxPerDay: 50 },
  DAY_TRIPS_PLAN: { name: "day-trip-plan", maxPerDay: 10 },
  SMART_PROMPTS: { name: "smart-prompts", maxPerDay: 30 },
  PLACES: { name: "places", maxPerDay: 200 },
} as const;
