import "server-only";
import { NextResponse } from "next/server";
import { reserveCost, costLimitResponse } from "./costLimit";
import { logger } from "../logger";

const MODEL_ID = "gemini-2.5-flash";

// Per-route worst-case token estimates. Pessimistic — accurate-enough for
// abuse circuit-breaking without threading reservationId through deep call
// graphs (see itineraryEngine: plan fans out into 4 Gemini passes). Real
// calls are usually well under these caps; we don't reconcile because
// pessimistic accounting is the correct safety bias for exploit prevention.
//
// Sized so a real user planning 1-3 trips/day stays well below the $2/day
// per-user cap (USER_DAILY_LIMIT_TC in costLimit.ts), while a spammer trips
// the cap after ~15-20 plan calls. Chat is the exception — it's variable-
// length streaming, so it does proper reserve+reconcile inline.
export const COST_ESTIMATES = {
  itineraryPlan: { inputTokens: 30_000, maxOutputTokens: 15_000 },
  itineraryRefine: { inputTokens: 20_000, maxOutputTokens: 10_000 },
  nearbyFood: { inputTokens: 2_000, maxOutputTokens: 1_500 },
} as const satisfies Record<string, { inputTokens: number; maxOutputTokens: number }>;

export type CostEstimateKey = keyof typeof COST_ESTIMATES;

/**
 * At-the-door Vertex cost gate. Reserves a worst-case spend estimate against
 * the user's daily / global hourly budget (see USER_DAILY_LIMIT_TC and
 * GLOBAL_HOURLY_LIMIT_TC in costLimit.ts).
 *
 * - Allow: returns null. Caller proceeds. Reservation TTLs out of Redis.
 * - Deny: returns a 429 NextResponse with Retry-After + budget headers.
 *
 * Call AFTER the route's cache check so cache hits don't burn budget.
 */
export async function gateOnDailyCost(opts: {
  costKey: string;
  estimate: CostEstimateKey;
  routeName: string;
  requestId: string;
}): Promise<NextResponse | null> {
  const estimate = COST_ESTIMATES[opts.estimate];
  const reservation = await reserveCost({
    key: opts.costKey,
    model: MODEL_ID,
    inputTokens: estimate.inputTokens,
    maxOutputTokens: estimate.maxOutputTokens,
  });
  if (!reservation.allowed) {
    logger.warn(`${opts.routeName} blocked by cost limit`, {
      scope: reservation.scope,
      usedCents: reservation.usedCents,
      limitCents: reservation.limitCents,
      requestId: opts.requestId,
    });
    return costLimitResponse(reservation);
  }
  return null;
}
