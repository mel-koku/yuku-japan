import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Mock every pipeline-stage module at its seam ──────────────────────────
// The point of this file is to test the Pass 4 *wiring* in authorOneEditorNote
// — that Pass 4 is claim-gated, budget-gated, and that its flags reach the
// Sanity write merged with Pass 3's. So each stage is a controllable stub.

const extractFactsMock = vi.fn();
vi.mock("../contentGen/extractFacts", () => ({
  extractEditorNoteFacts: (...a: unknown[]) => extractFactsMock(...a),
  // renderFactBundleForPrompt is imported by sibling modules; harmless stub.
  renderFactBundleForPrompt: () => "facts",
}));

const generateProseMock = vi.fn();
vi.mock("../contentGen/generateProse", () => ({
  generateEditorNoteProse: (...a: unknown[]) => generateProseMock(...a),
}));

const critiqueMock = vi.fn();
vi.mock("../contentGen/critiqueProse", () => ({
  critiqueEditorNoteProse: (...a: unknown[]) => critiqueMock(...a),
}));

const extractClaimsMock = vi.fn();
vi.mock("../contentGen/extractVerifiableClaims", () => ({
  extractVerifiableClaims: (...a: unknown[]) => extractClaimsMock(...a),
}));

const verifyClaimsMock = vi.fn();
vi.mock("../contentGen/verifyClaims", () => ({
  verifyEditorNoteClaims: (...a: unknown[]) => verifyClaimsMock(...a),
}));

// Voice anchors: skip the real Sanity load; mark anchors "ready".
vi.mock("../contentGen/voiceAnchorsLoader", () => ({
  loadVoiceAnchors: vi.fn().mockResolvedValue({
    editorNote: { temple: "t", restaurant: "r" },
  }),
  assertReadyForBatch: vi.fn(),
}));

vi.mock("../contentGen/promptCache", () => ({
  buildEditorNotePromptPrefix: () => ({ prefix: "p", approxTokens: 2000 }),
  buildCritiquePromptPrefix: () => ({ prefix: "c", approxTokens: 2000 }),
}));

// Capture the Sanity write payload.
const createOrReplaceMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/sanity/client", () => ({
  sanityWriteClient: { createOrReplace: (...a: unknown[]) => createOrReplaceMock(...a) },
}));

import { authorEditorNotesBatch } from "../contentGen/pipeline";
import { AuthoringBudget } from "../contentGen/authoringBudget";
import type { SupabaseClient } from "@supabase/supabase-js";

const fakeClient = {} as SupabaseClient;

/** A budget whose halt state the test controls. */
function budgetWith(shouldHalt: boolean): AuthoringBudget {
  return {
    recordCall: vi.fn(),
    shouldHalt: () => shouldHalt,
    summary: () => ({
      spentUsd: 0,
      calls: 0,
      cacheHitRate: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      groundedRequests: 0,
    }),
    logRunComplete: vi.fn(),
  } as unknown as AuthoringBudget;
}

beforeEach(() => {
  extractFactsMock.mockReset();
  generateProseMock.mockReset();
  critiqueMock.mockReset();
  extractClaimsMock.mockReset();
  verifyClaimsMock.mockReset();
  createOrReplaceMock.mockClear();

  // Default happy-path stubs for the first three passes.
  extractFactsMock.mockResolvedValue({ locationId: "loc-1", name: "Place" });
  generateProseMock.mockResolvedValue({
    prose: "Some 30-word editor note about the place.",
    denyListViolation: null,
    wordCount: 30,
  });
  critiqueMock.mockResolvedValue({
    prose: "Some 30-word editor note about the place.",
    flaggedClaims: ["pass-3-flag"],
    rationale: "ok",
  });
});

describe("pipeline — Pass 4 wiring in authorOneEditorNote", () => {
  it("calls Pass 4 and merges its flags into the Sanity write when claims exist", async () => {
    extractClaimsMock.mockReturnValue([
      { text: "the oldest", family: "superlative" },
    ]);
    verifyClaimsMock.mockResolvedValue({
      flags: ["VERIFY-CONTESTED: the oldest"],
      verifications: [],
      grounded: true,
    });

    const summary = await authorEditorNotesBatch(fakeClient, ["loc-1"], {
      allowDrafts: true,
      budgetOverride: budgetWith(false),
    });

    expect(verifyClaimsMock).toHaveBeenCalledTimes(1);
    expect(summary.succeeded).toBe(1);

    // The Sanity write must carry BOTH the Pass 3 flag and the Pass 4 flag.
    const payload = createOrReplaceMock.mock.calls[0]?.[0];
    expect(payload.flaggedClaims).toContain("pass-3-flag");
    expect(payload.flaggedClaims).toContain("VERIFY-CONTESTED: the oldest");
    expect(summary.outcomes[0]).toMatchObject({
      kind: "ok",
      flaggedClaimCount: 2,
    });
  });

  it("SKIPS Pass 4 entirely when extractVerifiableClaims returns no claims", async () => {
    // The cost gate: ~87% of notes. Pass 4's grounded call must not fire.
    extractClaimsMock.mockReturnValue([]);

    const summary = await authorEditorNotesBatch(fakeClient, ["loc-1"], {
      allowDrafts: true,
      budgetOverride: budgetWith(false),
    });

    expect(verifyClaimsMock).not.toHaveBeenCalled();
    expect(summary.succeeded).toBe(1);
    // Only the Pass 3 flag survives.
    const payload = createOrReplaceMock.mock.calls[0]?.[0];
    expect(payload.flaggedClaims).toEqual(["pass-3-flag"]);
  });

  it("SKIPS Pass 4 when the budget halts mid-note, after Pass 3 spend", async () => {
    // Pass 4's grounded request costs money. The pipeline re-checks
    // `budget.shouldHalt()` right before Pass 4 — so a budget that was fine
    // when the note started but is exhausted by the time Passes 2+3 finished
    // must still gate Pass 4. A budget whose halt flips true on the 3rd
    // shouldHalt() read models that: read 1 = loop pre-check (note proceeds),
    // reads 2+ = the Pass-4 gate (halted).
    extractClaimsMock.mockReturnValue([
      { text: "the oldest", family: "superlative" },
    ]);
    let shouldHaltReads = 0;
    const flippingBudget = {
      recordCall: vi.fn(),
      shouldHalt: () => {
        shouldHaltReads += 1;
        return shouldHaltReads >= 2;
      },
      summary: () => ({
        spentUsd: 0,
        calls: 0,
        cacheHitRate: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        groundedRequests: 0,
      }),
      logRunComplete: vi.fn(),
    } as unknown as AuthoringBudget;

    const summary = await authorEditorNotesBatch(fakeClient, ["loc-1"], {
      allowDrafts: true,
      budgetOverride: flippingBudget,
    });

    // The note WAS authored (loop pre-check passed), Pass 3 ran, but Pass 4
    // was gated by the mid-note halt re-check.
    expect(critiqueMock).toHaveBeenCalledTimes(1);
    expect(verifyClaimsMock).not.toHaveBeenCalled();
    expect(summary.succeeded).toBe(1);
    // Pass 3's flag still persisted — the note is not lost.
    const payload = createOrReplaceMock.mock.calls[0]?.[0];
    expect(payload.flaggedClaims).toEqual(["pass-3-flag"]);
  });

  it("does not merge anything when Pass 4 returns no flags", async () => {
    extractClaimsMock.mockReturnValue([
      { text: "the oldest", family: "superlative" },
    ]);
    verifyClaimsMock.mockResolvedValue({
      flags: [],
      verifications: [],
      grounded: true,
    });

    await authorEditorNotesBatch(fakeClient, ["loc-1"], {
      allowDrafts: true,
      budgetOverride: budgetWith(false),
    });

    expect(verifyClaimsMock).toHaveBeenCalledTimes(1);
    const payload = createOrReplaceMock.mock.calls[0]?.[0];
    expect(payload.flaggedClaims).toEqual(["pass-3-flag"]);
  });

  it("Pass 3 still runs and its flags persist regardless of Pass 4", async () => {
    // Guards the "Pass 4 is additive, never weakens Pass 3" constraint.
    extractClaimsMock.mockReturnValue([]);

    await authorEditorNotesBatch(fakeClient, ["loc-1"], {
      allowDrafts: true,
      budgetOverride: budgetWith(false),
    });

    expect(critiqueMock).toHaveBeenCalledTimes(1);
    const payload = createOrReplaceMock.mock.calls[0]?.[0];
    expect(payload.flaggedClaims).toContain("pass-3-flag");
  });
});
