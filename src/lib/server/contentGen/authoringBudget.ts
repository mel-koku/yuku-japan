import "server-only";

import { logger } from "@/lib/logger";
import {
  estimateCostTenthsCent,
  groundingFeeTenthsCent,
} from "@/lib/api/costPrices";
import { CONTENT_AUTHORING_MODEL } from "./contentAuthoringModel";

/**
 * In-process cost ledger for content-authoring batch runs.
 *
 * Distinct from the user-facing cost gate at `src/lib/api/costGate.ts`:
 * - User gate is Redis-backed, scoped per-user-day ($2) + global-hour ($50),
 *   designed as an abuse circuit-breaker on user-triggered routes.
 * - This ledger is in-process, scoped per-batch-run, designed to halt
 *   runaway authoring batches (infinite retries, accidental re-runs, broken
 *   prompts) without depleting the user-facing global-hourly cap.
 *
 * Thresholds (per cost-model gate locked 2026-05-04):
 * - escalateUsd ($10 default) — log warning; pipeline continues. Signal that
 *   the run has crossed the worst-case projection; assumptions may be off.
 * - hardKillUsd ($30 default) — pipeline halts before the next call. ~2.5×
 *   the worst-case projection ($11-12); leaves room for prompt-iteration
 *   retries without false-firing mid-run.
 *
 * Both env-tunable via CONTENT_AUTHORING_BUDGET_USD and
 * CONTENT_AUTHORING_ESCALATE_USD.
 */

export type BudgetLimits = {
  hardKillUsd: number;
  escalateUsd: number;
};

export type VertexUsage = {
  inputTokens: number;
  outputTokens: number;
  /**
   * Tokens served from Vertex implicit cache. Sourced from
   * `result.providerMetadata.vertex.usageMetadata.cachedContentTokenCount`
   * (already surfaced by `logVertexUsage` in vertexProvider.ts).
   */
  cachedTokens?: number;
  /**
   * Number of grounded requests this call made — a call billed the
   * $35/1k Vertex AI Search grounding fee per request that actually invoked
   * the search tool (≥1 web query). 0 (or omitted) for non-grounded calls.
   *
   * Pass 4 (fact verification) is the only authoring pass that grounds;
   * Pass 2 / Pass 3 never set this. Without it the budget ledger would
   * silently under-count Pass 4 spend and the $30 hard-kill would fire late.
   */
  groundedRequests?: number;
};

export type BudgetSummary = {
  spentUsd: number;
  calls: number;
  /** Fraction of total input tokens served from cache. 0..1. */
  cacheHitRate: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  /** Total grounded requests recorded across the run (Pass 4 fact checks). */
  groundedRequests: number;
};

const DEFAULT_HARD_KILL_USD = 30;
const DEFAULT_ESCALATE_USD = 10;

export class AuthoringBudget {
  private spentTc = 0;
  private callCount = 0;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCachedTokens = 0;
  private totalGroundedRequests = 0;
  private escalateLogged = false;
  private haltLogged = false;

  constructor(private readonly limits: BudgetLimits) {
    if (!Number.isFinite(limits.hardKillUsd) || limits.hardKillUsd <= 0) {
      throw new Error(
        `AuthoringBudget: invalid hardKillUsd ${limits.hardKillUsd}`,
      );
    }
    if (
      !Number.isFinite(limits.escalateUsd) ||
      limits.escalateUsd < 0 ||
      limits.escalateUsd > limits.hardKillUsd
    ) {
      throw new Error(
        `AuthoringBudget: invalid escalateUsd ${limits.escalateUsd} (must be 0..hardKillUsd)`,
      );
    }
  }

  /**
   * Records actual usage from a completed Vertex call. Wire into the pipeline
   * via the `logVertexUsage` callback path or directly after each
   * `generateObject` resolves.
   */
  recordCall(usage: VertexUsage): void {
    const inputTokens = Math.max(0, usage.inputTokens || 0);
    const outputTokens = Math.max(0, usage.outputTokens || 0);
    const cachedTokens = Math.min(
      Math.max(0, usage.cachedTokens || 0),
      inputTokens,
    );
    const groundedRequests = Math.max(
      0,
      Math.floor(usage.groundedRequests || 0),
    );

    // Token cost + the Vertex AI Search grounding fee ($0.035/grounded
    // request). Both go onto the same ledger so the $30 hard-kill reflects
    // total spend — token cost alone would under-count any Pass 4 run.
    const tc =
      estimateCostTenthsCent(CONTENT_AUTHORING_MODEL, inputTokens, outputTokens) +
      groundingFeeTenthsCent(groundedRequests);
    this.spentTc += tc;
    this.callCount++;
    this.totalInputTokens += inputTokens;
    this.totalOutputTokens += outputTokens;
    this.totalCachedTokens += cachedTokens;
    this.totalGroundedRequests += groundedRequests;

    if (!this.escalateLogged && this.spentUsd() >= this.limits.escalateUsd) {
      this.escalateLogged = true;
      logger.warn("content_authoring_budget_escalate", {
        spentUsd: this.spentUsd(),
        escalateUsd: this.limits.escalateUsd,
        hardKillUsd: this.limits.hardKillUsd,
        calls: this.callCount,
      });
    }

    if (!this.haltLogged && this.shouldHalt()) {
      this.haltLogged = true;
      logger.error(
        "content_authoring_budget_halt",
        new Error("content_authoring_hard_kill"),
        {
          spentUsd: this.spentUsd(),
          hardKillUsd: this.limits.hardKillUsd,
          summary: this.summary(),
        },
      );
    }
  }

  spentUsd(): number {
    // tenths-cent → USD: 1000 tc = 100¢ = $1.00
    return this.spentTc / 1000;
  }

  remainingUsd(): number {
    return Math.max(0, this.limits.hardKillUsd - this.spentUsd());
  }

  shouldHalt(): boolean {
    return this.spentUsd() >= this.limits.hardKillUsd;
  }

  summary(): BudgetSummary {
    const cacheHitRate =
      this.totalInputTokens > 0
        ? this.totalCachedTokens / this.totalInputTokens
        : 0;
    return {
      spentUsd: this.spentUsd(),
      calls: this.callCount,
      cacheHitRate,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      groundedRequests: this.totalGroundedRequests,
    };
  }

  /**
   * Emit a structured run-completion log. Call once at the end of every
   * authoring run (success, partial, or halt) so the batch cost is
   * recoverable from observability search 6 months later.
   */
  logRunComplete(extra?: Record<string, unknown>): void {
    logger.info("content_authoring_run_complete", {
      ...this.summary(),
      ...extra,
    });
  }
}

/**
 * Reads `CONTENT_AUTHORING_BUDGET_USD` and `CONTENT_AUTHORING_ESCALATE_USD`
 * from env, falling back to the locked defaults ($30 / $10). Throws on
 * invalid values rather than silently falling back — a misconfigured budget
 * is an operational error, not a degradation.
 */
export function loadBudgetLimitsFromEnv(): BudgetLimits {
  const rawHardKill = process.env.CONTENT_AUTHORING_BUDGET_USD;
  const rawEscalate = process.env.CONTENT_AUTHORING_ESCALATE_USD;

  const hardKillUsd =
    rawHardKill !== undefined && rawHardKill !== ""
      ? Number(rawHardKill)
      : DEFAULT_HARD_KILL_USD;
  const escalateUsd =
    rawEscalate !== undefined && rawEscalate !== ""
      ? Number(rawEscalate)
      : DEFAULT_ESCALATE_USD;

  if (!Number.isFinite(hardKillUsd) || hardKillUsd <= 0) {
    throw new Error(
      `Invalid CONTENT_AUTHORING_BUDGET_USD: ${rawHardKill}`,
    );
  }
  if (
    !Number.isFinite(escalateUsd) ||
    escalateUsd < 0 ||
    escalateUsd > hardKillUsd
  ) {
    throw new Error(
      `Invalid CONTENT_AUTHORING_ESCALATE_USD: ${rawEscalate} (must be 0..${hardKillUsd})`,
    );
  }

  return { hardKillUsd, escalateUsd };
}
