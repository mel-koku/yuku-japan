// Live integration smoke for Pass 4 fact verification (verifyEditorNoteClaims).
// Skipped unless RUN_VERIFY_CLAIMS_SMOKE=1 — otherwise it'd burn real Vertex
// spend on every CI run (one grounded Pro call ≈ $0.035 fee + Pro tokens).
//
// Sibling of _groundingSmoke.test.ts: that one exercises the raw grounded
// primitive; this one exercises the whole Pass 4 path — prompt construction,
// the grounded Pro call, verdict-line parsing, and grounding-fee accounting on
// a real AuthoringBudget ledger.
//
// To execute (from the main checkout, not a worktree — the .env-blocking Bash
// hook rejects --env-file=.env.local commands inside this repo's worktrees):
//   RUN_VERIFY_CLAIMS_SMOKE=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run src/lib/server/__tests__/verifyClaims.smoke.test.ts

import { describe, it, expect, vi } from "vitest";

// Only `server-only` is stubbed. The logger is intentionally NOT mocked — if
// the budget escalate/halt warnings fire, this human-gated smoke should show
// them.
vi.mock("server-only", () => ({}));

import { verifyEditorNoteClaims } from "../contentGen/verifyClaims";
import { AuthoringBudget } from "../contentGen/authoringBudget";
import type { VerifiableClaim } from "../contentGen/extractVerifiableClaims";
import type { EditorNoteFactBundle } from "../contentGen/extractFacts";

const RUN_LIVE = process.env.RUN_VERIFY_CLAIMS_SMOKE === "1";

// Per the design: 12.7% of notes trigger Pass 4, projecting to ~$0.047 of
// grounded spend per *triggered* note. This smoke produces the first MEASURED
// per-note number — the output compares against this estimate explicitly.
const DESIGN_PER_NOTE_USD = 0.047;

describe.skipIf(!RUN_LIVE)("Pass 4 verification smoke (live)", () => {
  it("verifies real claims against grounded Vertex and accounts the fee", async () => {
    if (!process.env.GOOGLE_VERTEX_PROJECT) {
      throw new Error(
        "GOOGLE_VERTEX_PROJECT not set — load .env.local before running this smoke",
      );
    }

    // A real, well-known place. Senso-ji gives one claim per verdict family
    // with predictable outcomes, so the eyeball pass is meaningful:
    //  - founding-age over ~1,000 years → the legend-calibration rule should
    //    push this to CONTESTED regardless of how many sources repeat 645 AD.
    //  - a checkable superlative.
    //  - a checkable transit/station distance.
    const facts: EditorNoteFactBundle = {
      locationId: "senso-ji-tokyo",
      name: "Sensō-ji",
      nameJapanese: "浅草寺",
      category: "temple",
      categoryParent: "culture",
      city: "Tokyo",
      prefecture: "Tokyo",
      rating: null,
      reviewCount: null,
      editorialSummary: null,
      description: null,
      hoursSummary: null,
      tags: [],
      insiderTip: null,
      subExperiences: [],
      relatedTips: [],
    };

    const claims: VerifiableClaim[] = [
      { text: "founded in 645 AD", family: "founding-age" },
      { text: "the oldest temple in Tokyo", family: "superlative" },
      { text: "a 5-minute walk from Asakusa Station", family: "transit" },
    ];

    // A real budget instance so groundingFeeTenthsCent() actually runs and
    // summary() reports a measured spend. Small explicit limits — one grounded
    // call is ≈ $0.05, so a $5 hard-kill is a generous defensive bound.
    const budget = new AuthoringBudget({ hardKillUsd: 5, escalateUsd: 2 });

    const res = await verifyEditorNoteClaims({ claims, facts, budget });
    const summary = budget.summary();

    // --- human eyeball surface -------------------------------------------
    // This smoke is RUN_*-gated; the whole point is reading the output, not
    // just asserting shape.
    /* eslint-disable no-console */
    console.log("\n=== PASS 4 SMOKE — RESULT ===");
    console.log("grounded:", res.grounded);
    console.log("flags:", JSON.stringify(res.flags, null, 2));
    console.log("verifications:", JSON.stringify(res.verifications, null, 2));
    console.log("\n=== PASS 4 SMOKE — BUDGET ===");
    console.log("spentUsd:", summary.spentUsd);
    console.log("groundedRequests:", summary.groundedRequests);
    console.log("calls:", summary.calls);
    console.log(
      "totalInputTokens / totalOutputTokens:",
      summary.totalInputTokens,
      "/",
      summary.totalOutputTokens,
    );
    console.log(
      `\nmeasured per-note cost $${summary.spentUsd.toFixed(4)} vs design estimate $${DESIGN_PER_NOTE_USD} ` +
        `(${(summary.spentUsd / DESIGN_PER_NOTE_USD).toFixed(2)}× estimate)`,
    );
    console.log("=============================\n");
    /* eslint-enable no-console */

    // The grounded call must actually issue a web query. A non-grounded result
    // means the smoke proved nothing about the grounded path — fail loudly.
    expect(res.grounded).toBe(true);
    // One grounded request, billed on the ledger.
    expect(summary.groundedRequests).toBe(1);
    expect(summary.spentUsd).toBeGreaterThan(0);
    // Verdict lines parsed into one structured result per claim.
    expect(res.verifications).toHaveLength(claims.length);
    for (const v of res.verifications) {
      expect(["verified", "stale", "contested", "unverifiable"]).toContain(
        v.verdict,
      );
    }
  }, 120_000);
});
