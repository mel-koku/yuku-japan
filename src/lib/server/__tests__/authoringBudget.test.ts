import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "@/lib/logger";

vi.mock("server-only", () => ({}));

// `contentAuthoringModel` imports the Vertex provider; mock it so this test
// doesn't need GOOGLE_VERTEX_PROJECT in env. The budget module only consumes
// the `CONTENT_AUTHORING_MODEL` string constant from that file.
vi.mock("../vertexProvider", () => ({
  vertex: () => "mock-pro-model",
  VERTEX_GENERATE_OPTIONS: { google: { streamFunctionCallArguments: false } },
}));

import {
  AuthoringBudget,
  loadBudgetLimitsFromEnv,
} from "../contentGen/authoringBudget";

describe("AuthoringBudget", () => {
  const originalWarn = logger.warn;
  const originalError = logger.error;
  const originalInfo = logger.info;

  let warnSpy: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.fn>;
  let infoSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    warnSpy = vi.fn();
    errorSpy = vi.fn();
    infoSpy = vi.fn();
    logger.warn = warnSpy as unknown as typeof logger.warn;
    logger.error = errorSpy as unknown as typeof logger.error;
    logger.info = infoSpy as unknown as typeof logger.info;
  });

  afterEach(() => {
    logger.warn = originalWarn;
    logger.error = originalError;
    logger.info = originalInfo;
  });

  describe("constructor validation", () => {
    it("rejects non-positive hardKillUsd", () => {
      expect(() => new AuthoringBudget({ hardKillUsd: 0, escalateUsd: 0 })).toThrow(
        /hardKillUsd/,
      );
      expect(() => new AuthoringBudget({ hardKillUsd: -1, escalateUsd: 0 })).toThrow(
        /hardKillUsd/,
      );
    });

    it("rejects escalateUsd > hardKillUsd", () => {
      expect(
        () => new AuthoringBudget({ hardKillUsd: 10, escalateUsd: 20 }),
      ).toThrow(/escalateUsd/);
    });

    it("rejects negative escalateUsd", () => {
      expect(
        () => new AuthoringBudget({ hardKillUsd: 10, escalateUsd: -1 }),
      ).toThrow(/escalateUsd/);
    });

    it("accepts escalateUsd === hardKillUsd (no separate warning band)", () => {
      expect(
        () => new AuthoringBudget({ hardKillUsd: 10, escalateUsd: 10 }),
      ).not.toThrow();
    });

    it("accepts escalateUsd === 0 (escalate fires immediately)", () => {
      expect(
        () => new AuthoringBudget({ hardKillUsd: 10, escalateUsd: 0 }),
      ).not.toThrow();
    });
  });

  describe("recordCall accumulation", () => {
    it("starts at zero spend, zero calls", () => {
      const b = new AuthoringBudget({ hardKillUsd: 30, escalateUsd: 10 });
      expect(b.spentUsd()).toBe(0);
      expect(b.summary().calls).toBe(0);
      expect(b.shouldHalt()).toBe(false);
    });

    it("accumulates spend across multiple calls using Pro pricing", () => {
      const b = new AuthoringBudget({ hardKillUsd: 30, escalateUsd: 10 });
      // Pro: 1250 tc/M input, 10000 tc/M output.
      // 100k input + 1k output = (100_000 * 1250 + 1_000 * 10_000) / 1M = 125 + 10 = 135 tc = $0.135
      b.recordCall({ inputTokens: 100_000, outputTokens: 1_000 });
      expect(b.spentUsd()).toBeCloseTo(0.135, 4);
      expect(b.summary().calls).toBe(1);

      b.recordCall({ inputTokens: 100_000, outputTokens: 1_000 });
      expect(b.spentUsd()).toBeCloseTo(0.27, 3);
      expect(b.summary().calls).toBe(2);
    });

    it("clamps negative or missing token counts to zero", () => {
      const b = new AuthoringBudget({ hardKillUsd: 30, escalateUsd: 10 });
      b.recordCall({ inputTokens: -100, outputTokens: 0 });
      b.recordCall({
        inputTokens: undefined as unknown as number,
        outputTokens: undefined as unknown as number,
      });
      expect(b.spentUsd()).toBe(0);
      expect(b.summary().calls).toBe(2);
    });
  });

  describe("escalate threshold", () => {
    it("fires warn once when spend crosses escalateUsd", () => {
      const b = new AuthoringBudget({ hardKillUsd: 30, escalateUsd: 0.1 });
      // 100k input → $0.125 — just past $0.10 escalate.
      b.recordCall({ inputTokens: 100_000, outputTokens: 0 });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        "content_authoring_budget_escalate",
        expect.objectContaining({
          spentUsd: expect.any(Number),
          escalateUsd: 0.1,
          hardKillUsd: 30,
          calls: 1,
        }),
      );
    });

    it("does NOT fire warn again on subsequent calls past the threshold", () => {
      const b = new AuthoringBudget({ hardKillUsd: 30, escalateUsd: 0.1 });
      b.recordCall({ inputTokens: 100_000, outputTokens: 0 });
      b.recordCall({ inputTokens: 100_000, outputTokens: 0 });
      b.recordCall({ inputTokens: 100_000, outputTokens: 0 });
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it("does not fire warn when spend stays below escalateUsd", () => {
      const b = new AuthoringBudget({ hardKillUsd: 30, escalateUsd: 10 });
      b.recordCall({ inputTokens: 100_000, outputTokens: 1_000 }); // $0.135
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe("hard-kill threshold", () => {
    it("shouldHalt() flips to true once spend reaches hardKillUsd", () => {
      const b = new AuthoringBudget({ hardKillUsd: 1, escalateUsd: 0.5 });
      expect(b.shouldHalt()).toBe(false);
      // 800k input → $1.00 exactly.
      b.recordCall({ inputTokens: 800_000, outputTokens: 0 });
      expect(b.shouldHalt()).toBe(true);
    });

    it("logs error with summary on the call that crosses hard-kill", () => {
      const b = new AuthoringBudget({ hardKillUsd: 1, escalateUsd: 0.5 });
      b.recordCall({ inputTokens: 800_000, outputTokens: 0 });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const [msg, err, ctx] = errorSpy.mock.calls[0]!;
      expect(msg).toBe("content_authoring_budget_halt");
      expect(err).toBeInstanceOf(Error);
      expect(ctx).toEqual(
        expect.objectContaining({
          spentUsd: expect.any(Number),
          hardKillUsd: 1,
          summary: expect.objectContaining({
            calls: 1,
            spentUsd: expect.any(Number),
            cacheHitRate: expect.any(Number),
          }),
        }),
      );
    });

    it("logs error only once even if subsequent calls keep spending", () => {
      const b = new AuthoringBudget({ hardKillUsd: 1, escalateUsd: 0.5 });
      b.recordCall({ inputTokens: 800_000, outputTokens: 0 });
      b.recordCall({ inputTokens: 100_000, outputTokens: 0 });
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it("remainingUsd() floors at zero past hard-kill", () => {
      const b = new AuthoringBudget({ hardKillUsd: 1, escalateUsd: 0.5 });
      b.recordCall({ inputTokens: 1_600_000, outputTokens: 0 }); // $2.00, double the cap
      expect(b.remainingUsd()).toBe(0);
    });
  });

  describe("cache hit rate", () => {
    it("computes cache hit rate as cached / total input tokens", () => {
      const b = new AuthoringBudget({ hardKillUsd: 30, escalateUsd: 10 });
      b.recordCall({ inputTokens: 1_000, outputTokens: 100, cachedTokens: 750 });
      b.recordCall({ inputTokens: 1_000, outputTokens: 100, cachedTokens: 500 });
      expect(b.summary().cacheHitRate).toBeCloseTo(0.625, 4);
      expect(b.summary().totalInputTokens).toBe(2_000);
    });

    it("returns zero cache hit rate when no calls recorded", () => {
      const b = new AuthoringBudget({ hardKillUsd: 30, escalateUsd: 10 });
      expect(b.summary().cacheHitRate).toBe(0);
    });

    it("clamps cachedTokens to inputTokens (never negative or > input)", () => {
      const b = new AuthoringBudget({ hardKillUsd: 30, escalateUsd: 10 });
      b.recordCall({ inputTokens: 1_000, outputTokens: 0, cachedTokens: 5_000 });
      b.recordCall({ inputTokens: 1_000, outputTokens: 0, cachedTokens: -100 });
      // First call: 5000 cached clamped to 1000 = 1000.
      // Second call: -100 clamped to 0.
      // Total cached: 1000 / 2000 = 0.5
      expect(b.summary().cacheHitRate).toBe(0.5);
    });
  });

  describe("grounding fees (Pass 4)", () => {
    it("adds the $0.035/grounded-request fee on top of token cost", () => {
      const b = new AuthoringBudget({ hardKillUsd: 30, escalateUsd: 10 });
      // 1000 input + 500 output Pro tokens =
      //   (1000 * 1250 + 500 * 10000) / 1M = 1.25 + 5 = 6.25 → ceil 7 tc
      // + 1 grounded request = 35 tc
      // total = 42 tc = $0.042
      b.recordCall({
        inputTokens: 1_000,
        outputTokens: 500,
        groundedRequests: 1,
      });
      expect(b.spentUsd()).toBeCloseTo(0.042, 4);
    });

    it("charges no grounding fee when groundedRequests is 0 or omitted", () => {
      const b = new AuthoringBudget({ hardKillUsd: 30, escalateUsd: 10 });
      // Pure token cost: (100k * 1250 + 1k * 10000) / 1M = 125 + 10 = 135 tc
      b.recordCall({ inputTokens: 100_000, outputTokens: 1_000 });
      expect(b.spentUsd()).toBeCloseTo(0.135, 4);
      b.recordCall({
        inputTokens: 100_000,
        outputTokens: 1_000,
        groundedRequests: 0,
      });
      expect(b.spentUsd()).toBeCloseTo(0.27, 3);
    });

    it("accumulates grounding fees across calls and exposes the count", () => {
      const b = new AuthoringBudget({ hardKillUsd: 30, escalateUsd: 10 });
      b.recordCall({ inputTokens: 0, outputTokens: 0, groundedRequests: 1 });
      b.recordCall({ inputTokens: 0, outputTokens: 0, groundedRequests: 1 });
      b.recordCall({ inputTokens: 0, outputTokens: 0, groundedRequests: 1 });
      // 3 grounded requests × 35 tc = 105 tc = $0.105
      expect(b.spentUsd()).toBeCloseTo(0.105, 4);
      expect(b.summary().groundedRequests).toBe(3);
    });

    it("floors negative / fractional groundedRequests", () => {
      const b = new AuthoringBudget({ hardKillUsd: 30, escalateUsd: 10 });
      b.recordCall({ inputTokens: 0, outputTokens: 0, groundedRequests: -3 });
      b.recordCall({ inputTokens: 0, outputTokens: 0, groundedRequests: 1.9 });
      // -3 → 0, 1.9 → 1. Total 1 grounded = 35 tc = $0.035
      expect(b.spentUsd()).toBeCloseTo(0.035, 4);
      expect(b.summary().groundedRequests).toBe(1);
    });

    it("counts grounding fees toward the hard-kill threshold", () => {
      // The accounting-bug guard: without grounding fees on the ledger, a
      // grounding-only run would never trip the hard-kill.
      const b = new AuthoringBudget({ hardKillUsd: 1, escalateUsd: 0.5 });
      expect(b.shouldHalt()).toBe(false);
      // 29 grounded requests × 35 tc = 1015 tc = $1.015 > $1 hard-kill
      for (let i = 0; i < 29; i++) {
        b.recordCall({ inputTokens: 0, outputTokens: 0, groundedRequests: 1 });
      }
      expect(b.shouldHalt()).toBe(true);
    });
  });

  describe("logRunComplete", () => {
    it("emits info log with summary fields", () => {
      const b = new AuthoringBudget({ hardKillUsd: 30, escalateUsd: 10 });
      b.recordCall({ inputTokens: 1_000, outputTokens: 100, cachedTokens: 500 });
      b.logRunComplete({ stage: "smoke-test" });
      expect(infoSpy).toHaveBeenCalledWith(
        "content_authoring_run_complete",
        expect.objectContaining({
          spentUsd: expect.any(Number),
          calls: 1,
          cacheHitRate: 0.5,
          groundedRequests: 0,
          stage: "smoke-test",
        }),
      );
    });
  });
});

describe("loadBudgetLimitsFromEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.CONTENT_AUTHORING_BUDGET_USD;
    delete process.env.CONTENT_AUTHORING_ESCALATE_USD;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("falls back to $30/$10 defaults when env unset", () => {
    expect(loadBudgetLimitsFromEnv()).toEqual({
      hardKillUsd: 30,
      escalateUsd: 10,
    });
  });

  it("reads valid env overrides", () => {
    process.env.CONTENT_AUTHORING_BUDGET_USD = "50";
    process.env.CONTENT_AUTHORING_ESCALATE_USD = "20";
    expect(loadBudgetLimitsFromEnv()).toEqual({
      hardKillUsd: 50,
      escalateUsd: 20,
    });
  });

  it("throws on non-numeric hardKill", () => {
    process.env.CONTENT_AUTHORING_BUDGET_USD = "not-a-number";
    expect(() => loadBudgetLimitsFromEnv()).toThrow(
      /CONTENT_AUTHORING_BUDGET_USD/,
    );
  });

  it("throws when escalate exceeds hardKill", () => {
    process.env.CONTENT_AUTHORING_BUDGET_USD = "10";
    process.env.CONTENT_AUTHORING_ESCALATE_USD = "15";
    expect(() => loadBudgetLimitsFromEnv()).toThrow(
      /CONTENT_AUTHORING_ESCALATE_USD/,
    );
  });

  it("treats empty string as unset and uses default", () => {
    process.env.CONTENT_AUTHORING_BUDGET_USD = "";
    expect(loadBudgetLimitsFromEnv().hardKillUsd).toBe(30);
  });
});
