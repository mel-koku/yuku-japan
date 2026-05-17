import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock the grounded Vertex call at the module seam — verifyClaims.ts is a
// pure unit under test; the live grounded round trip is covered separately by
// a human-gated smoke test.
const groundedMock = vi.fn();
vi.mock("../contentGen/_callContentVertexGrounded", () => ({
  callContentVertexGrounded: (...args: unknown[]) => groundedMock(...args),
}));

import { verifyEditorNoteClaims } from "../contentGen/verifyClaims";
import type { VerifiableClaim } from "../contentGen/extractVerifiableClaims";
import type { EditorNoteFactBundle } from "../contentGen/extractFacts";
import type { AuthoringBudget } from "../contentGen/authoringBudget";

/** Minimal fact bundle — verifyClaims only reads identity fields. */
function fakeFacts(over: Partial<EditorNoteFactBundle> = {}): EditorNoteFactBundle {
  return {
    locationId: "hyotei-kyoto",
    name: "Hyotei",
    nameJapanese: "瓢亭",
    category: "restaurant",
    categoryParent: "food",
    city: "Kyoto",
    prefecture: "Kyoto",
    rating: null,
    reviewCount: null,
    editorialSummary: null,
    description: null,
    hoursSummary: null,
    tags: [],
    insiderTip: null,
    subExperiences: [],
    relatedTips: [],
    ...over,
  };
}

/** A budget stub — verifyClaims only calls shouldHalt indirectly via the
 *  grounded call, which is mocked, so a no-op stub is enough. */
function fakeBudget(): AuthoringBudget {
  return {
    recordCall: vi.fn(),
    shouldHalt: () => false,
  } as unknown as AuthoringBudget;
}

const CLAIMS: VerifiableClaim[] = [
  { text: "15 consecutive years", family: "temporal-superlative" },
];

beforeEach(() => {
  groundedMock.mockReset();
});

describe("verifyEditorNoteClaims", () => {
  describe("verdict → flag mapping", () => {
    it("produces a VERIFY-STALE flag from a STALE verdict", async () => {
      groundedMock.mockResolvedValue({
        text: "CLAIM 1 :: STALE :: It is now 17 consecutive years per the 2026 guide.",
        grounded: true,
      });
      const res = await verifyEditorNoteClaims({
        claims: CLAIMS,
        facts: fakeFacts(),
        budget: fakeBudget(),
        now: new Date("2026-05-16"),
      });
      expect(res.flags).toEqual(["VERIFY-STALE: 15 consecutive years"]);
      expect(res.verifications[0]?.verdict).toBe("stale");
    });

    it("produces a VERIFY-CONTESTED flag from a CONTESTED verdict", async () => {
      groundedMock.mockResolvedValue({
        text: "CLAIM 1 :: CONTESTED :: The 1,900-year founding date is legend, not record.",
        grounded: true,
      });
      const res = await verifyEditorNoteClaims({
        claims: [{ text: "1,900 years old", family: "founding-age" }],
        facts: fakeFacts({ name: "Nezu Shrine" }),
        budget: fakeBudget(),
        now: new Date("2026-05-16"),
      });
      expect(res.flags).toEqual(["VERIFY-CONTESTED: 1,900 years old"]);
    });

    it("produces NO flag from a VERIFIED verdict", async () => {
      groundedMock.mockResolvedValue({
        text: "CLAIM 1 :: VERIFIED :: Current sources confirm 15 consecutive years.",
        grounded: true,
      });
      const res = await verifyEditorNoteClaims({
        claims: CLAIMS,
        facts: fakeFacts(),
        budget: fakeBudget(),
        now: new Date("2026-05-16"),
      });
      expect(res.flags).toEqual([]);
      expect(res.verifications[0]?.verdict).toBe("verified");
    });

    it("flags a mixed-verdict note only for the non-verified claims", async () => {
      const claims: VerifiableClaim[] = [
        { text: "the oldest", family: "superlative" },
        { text: "Kichijoji Station", family: "transit" },
        { text: "since 1801", family: "temporal-superlative" },
      ];
      groundedMock.mockResolvedValue({
        text: [
          "CLAIM 1 :: CONTESTED :: 'Oldest' is disputed among local historians.",
          "CLAIM 2 :: VERIFIED :: The museum is adjacent to Kichijoji Station.",
          "CLAIM 3 :: STALE :: The shop's records date the dish to 1805, not 1801.",
        ].join("\n"),
        grounded: true,
      });
      const res = await verifyEditorNoteClaims({
        claims,
        facts: fakeFacts(),
        budget: fakeBudget(),
        now: new Date("2026-05-16"),
      });
      expect(res.flags).toEqual([
        "VERIFY-CONTESTED: the oldest",
        "VERIFY-STALE: since 1801",
      ]);
    });
  });

  describe("bypass-red: the test fails if the verdict→flag path is removed", () => {
    // This is the PM-lens guard. If verifyEditorNoteClaims stopped mapping
    // non-verified verdicts to flags (the code under test bypassed), this
    // assertion would go red — the flag array would be empty.
    it("a STALE verdict MUST yield a non-empty flag set", async () => {
      groundedMock.mockResolvedValue({
        text: "CLAIM 1 :: STALE :: Outdated.",
        grounded: true,
      });
      const res = await verifyEditorNoteClaims({
        claims: CLAIMS,
        facts: fakeFacts(),
        budget: fakeBudget(),
        now: new Date("2026-05-16"),
      });
      // If Pass 4's flag-mapping were bypassed, res.flags would be [] and
      // this would fail. That is the intended red signal.
      expect(res.flags.length).toBeGreaterThan(0);
    });
  });

  describe("resilient parsing (grounding output is not schema-constrained)", () => {
    it("tolerates extra prose around the CLAIM lines", async () => {
      groundedMock.mockResolvedValue({
        text:
          "I checked the latest sources.\n\n" +
          "CLAIM 1 :: STALE :: The count has changed.\n\n" +
          "Let me know if you need more detail.",
        grounded: true,
      });
      const res = await verifyEditorNoteClaims({
        claims: CLAIMS,
        facts: fakeFacts(),
        budget: fakeBudget(),
        now: new Date("2026-05-16"),
      });
      expect(res.flags).toEqual(["VERIFY-STALE: 15 consecutive years"]);
    });

    it("fails safe to UNVERIFIABLE when a claim has no parseable line", async () => {
      // Model returned a verdict for claim 1 but dropped claim 2.
      groundedMock.mockResolvedValue({
        text: "CLAIM 1 :: VERIFIED :: Confirmed.",
        grounded: true,
      });
      const res = await verifyEditorNoteClaims({
        claims: [
          { text: "the oldest", family: "superlative" },
          { text: "since 1900", family: "temporal-superlative" },
        ],
        facts: fakeFacts(),
        budget: fakeBudget(),
        now: new Date("2026-05-16"),
      });
      // Claim 2 had no line → unverifiable → surfaced as a flag, not dropped.
      expect(res.verifications[1]?.verdict).toBe("unverifiable");
      expect(res.flags).toContain("VERIFY-UNVERIFIABLE: since 1900");
    });

    it("ignores an unrecognized verdict word", async () => {
      groundedMock.mockResolvedValue({
        text: "CLAIM 1 :: PROBABLY :: Not a real verdict word.",
        grounded: true,
      });
      const res = await verifyEditorNoteClaims({
        claims: CLAIMS,
        facts: fakeFacts(),
        budget: fakeBudget(),
        now: new Date("2026-05-16"),
      });
      // Unparseable verdict → claim falls through to the fail-safe.
      expect(res.verifications[0]?.verdict).toBe("unverifiable");
    });
  });

  describe("degrades safely on a failed grounded call", () => {
    it("returns empty flags (does not throw) when the grounded call rejects", async () => {
      groundedMock.mockRejectedValue(new Error("Vertex 503"));
      const res = await verifyEditorNoteClaims({
        claims: CLAIMS,
        facts: fakeFacts(),
        budget: fakeBudget(),
        now: new Date("2026-05-16"),
      });
      expect(res.flags).toEqual([]);
      expect(res.verifications).toEqual([]);
      expect(res.grounded).toBe(false);
    });
  });

  describe("prompt construction", () => {
    it("passes the current date into the verification prompt", async () => {
      groundedMock.mockResolvedValue({
        text: "CLAIM 1 :: VERIFIED :: ok",
        grounded: true,
      });
      await verifyEditorNoteClaims({
        claims: CLAIMS,
        facts: fakeFacts(),
        budget: fakeBudget(),
        now: new Date("2026-05-16T12:00:00Z"),
      });
      const promptArg = groundedMock.mock.calls[0]?.[0]?.prompt as string;
      expect(promptArg).toContain("2026-05-16");
      // The legend-calibration rule must be in the prompt.
      expect(promptArg).toMatch(/1,?000 years/);
    });
  });
});
