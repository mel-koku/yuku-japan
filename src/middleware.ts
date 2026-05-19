import { NextRequest, NextResponse } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";

/**
 * Public API routes that skip auth entirely (read-only or unauthenticated access).
 * These get the X-Request-ID header but no supabase.auth.getUser() call.
 *
 * SECURITY: Default-protect — all /api/ routes require auth UNLESS listed here.
 * When adding a new API route, decide explicitly: add it here if public, otherwise
 * it's automatically protected.
 */
const PUBLIC_API_ROUTES = [
  "/api/locations",
  "/api/places",
  "/api/health",
  "/api/chat",
  "/api/itinerary/plan",
  "/api/itinerary/schedule",
  "/api/itinerary/refine",
  "/api/itinerary/replacements",
  "/api/itinerary/availability",
  "/api/routing",
  "/api/smart-prompts",
  "/api/sanity/webhook",
  "/api/airports",
  "/api/cities",
  "/api/shared",
  "/api/geocode",
  "/api/experiences/workshops",
  "/api/experiences/all",
  "/api/people",
  "/api/availability",
  "/api/bookings/availability",
  "/api/bookings/pricing",
  "/api/day-trips",
  "/api/csp-report",
  "/api/billing/stripe-webhook",
  "/api/concierge/inquiries",
];

/**
 * Auth-required sub-routes that fall under a public prefix.
 * Checked BEFORE PUBLIC_API_ROUTES to prevent bypass.
 */
const AUTH_REQUIRED_SUB_ROUTES = [
  "/copy",  // POST /api/shared/[token]/copy
];

/**
 * Auth-related routes that authenticated users should be redirected away from.
 */
const AUTH_ROUTES = [
  "/signin",
];

/**
 * Checks if a path is an auth route.
 */
function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => pathname.startsWith(route));
}

/**
 * Generates a unique request ID for tracing.
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Edge middleware for centralized request handling.
 *
 * Responsibilities:
 * 1. Auth session refresh - keeps auth tokens fresh
 * 2. Protected route enforcement - redirects unauthenticated users
 * 3. Request ID generation - for request tracing
 * 4. Request logging
 */
export async function middleware(request: NextRequest) {
  const requestId = generateRequestId();
  const startTime = Date.now();

  // Create response to pass through
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Add request ID header for tracing
  response.headers.set("X-Request-ID", requestId);
  response.headers.set("X-Start-Time", String(startTime));

  // Skip auth for public API routes — no session needed, saves a network round-trip
  const pathname = request.nextUrl.pathname;
  const isAuthRequiredSubRoute = AUTH_REQUIRED_SUB_ROUTES.some((suffix) => pathname.endsWith(suffix));
  if (!isAuthRequiredSubRoute && PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route))) {
    return response;
  }

  // Create Supabase client for middleware
  const supabase = createMiddlewareClient(request, response);

  // If Supabase is not configured, skip auth checks
  if (!supabase) {
    return response;
  }

  // Refresh session if needed - this will update cookies on the response
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // Default-protect: all /api/ routes require auth unless explicitly public
  if (pathname.startsWith("/api/") && (error || !user)) {
    return NextResponse.json(
      {
        error: "Authentication required",
        code: "UNAUTHORIZED",
        requestId,
      },
      {
        status: 401,
        headers: {
          "X-Request-ID": requestId,
        },
      }
    );
  }

  // Redirect authenticated users away from auth pages
  if (isAuthRoute(pathname) && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

/**
 * Matcher configuration for the middleware.
 *
 * Positive list — only paths that actually need session refresh or
 * default-protected API auth run middleware. Public page routes
 * (landing, /guides, /places, /pricing, /about, etc.) skip the matcher
 * entirely so page navigations don't pay the supabase.auth.getUser()
 * round-trip on every request (saves ~100–300ms TTFB; see KOK-35).
 *
 * Includes:
 * - /api/*           — default-protect; PUBLIC_API_ROUTES short-circuits inside
 * - /dashboard(/*)   — auth-required, redirects guests to /signin
 * - /account(/*)     — auth-required
 * - /saved(/*)       — auth-required
 * - /trips(/*)       — auth-required (per-trip pages)
 * - /itinerary(/*)   — kept as safe default per KOK-35; profiling-driven removal is fast-follow
 * - /signin(/*)      — redirects authenticated users away
 *
 * Excludes (handled outside middleware):
 * - All public page routes (landing, /guides, /places, /pricing, /about, /contact, …)
 * - /auth/callback   — calls supabase.auth.exchangeCodeForSession() directly, no middleware refresh needed
 * - /studio/*        — Sanity Studio
 * - Static assets    — never matched anyway
 *
 * Security headers (CSP, HSTS, etc.) are emitted by next.config.ts `headers()`
 * for every path and are unaffected by this matcher.
 */
export const config = {
  matcher: [
    // Sub-paths: /dashboard/foo, /api/anything, /itinerary/[id], etc.
    "/((?:dashboard|account|saved|trips|itinerary|signin|api)/.*)",
    // Bare matches: /dashboard, /account, /saved, /trips, /itinerary, /signin
    // (no /api page exists, so it's intentionally omitted here)
    "/(dashboard|account|saved|trips|itinerary|signin)",
  ],
};
