import "server-only";

import { logger } from "@/lib/logger";
import { callContentVertexGrounded } from "./_callContentVertexGrounded";
import type { VerifiableClaim } from "./extractVerifiableClaims";
import type { EditorNoteFactBundle } from "./extractFacts";
import type { AuthoringBudget } from "./authoringBudget";

/**
 * Pass 4 — fact verification.
 *
 * Pass 3 catches hallucinations (claims not in INPUT). It is structurally
 * blind to three failure modes Pass 4 closes:
 *   1. Stale facts — a claim true when the DB was last updated but wrong now
 *      ("3 Michelin stars for 15 consecutive years" → 17 as of 2026). Pass 3
 *      checks "is this in INPUT", not "is INPUT current".
 *   2. Legends stated as fact — a founding myth in the DB `description`
 *      ("1,900 years old") that Pass 3 happily passes through as sourced.
 *   3. Bad DB transit data — a wrong `nearest_station` flowing from INPUT.
 *
 * Pass 4 takes the verifiable claim shapes from `extractVerifiableClaims`,
 * verifies them against current web sources via a grounded Pro call, and
 * FLAGS (never silently rewrites) anything stale, contested, or
 * unverifiable. Flags land in `editorNote.flaggedClaims[]` — the same field
 * Pass 3 uses — string-prefixed with the verdict so the existing Studio
 * yellow-underline marker renders them without component changes.
 *
 * Pass 4 is purely additive: it runs after Pass 3, does not weaken it, and
 * is skipped entirely when `extractVerifiableClaims` returns no claims
 * (~87% of notes, per the 2026-05-16 measurement).
 *
 * Cost discipline: one grounded request per *note* (not per claim) — all of
 * a note's claims are verified in a single search context. Grounded request
 * = $0.035 fee + Pro tokens, recorded on the AuthoringBudget ledger.
 */

/**
 * Verdict for one claim. Only the last three produce a flag — `verified`
 * claims are dropped silently.
 */
export type ClaimVerdict =
  | "verified" // current sources confirm the claim
  | "stale" // claim was true but is now outdated
  | "contested" // claim is disputed, a legend, or not consensus
  | "unverifiable"; // no source could confirm or deny

/**
 * Prefix tags written into `flaggedClaims[]`. The Studio reviewer reads the
 * tag to know why a span is underlined. Pass 3's own flags stay un-prefixed,
 * so a bare entry = Pass 3 / deny-list, a `VERIFY-*` entry = Pass 4.
 */
const VERDICT_PREFIX: Record<Exclude<ClaimVerdict, "verified">, string> = {
  stale: "VERIFY-STALE",
  contested: "VERIFY-CONTESTED",
  unverifiable: "VERIFY-UNVERIFIABLE",
};

export type ClaimVerificationResult = {
  claim: string;
  verdict: ClaimVerdict;
  /** One-line rationale from the model. */
  rationale: string;
};

export type Pass4Result = {
  /** Flags ready to merge into `flaggedClaims[]`. One per non-`verified`
   *  claim, string-prefixed with the verdict. Empty if all claims verified. */
  flags: string[];
  /** Full per-claim verdicts, for logging / metrics. */
  verifications: ClaimVerificationResult[];
  /** True if the grounded call actually issued a web query (billed the fee). */
  grounded: boolean;
};

/**
 * Builds the grounded-verification prompt for one note's claims.
 *
 * Three load-bearing prompt elements:
 *  - The CURRENT DATE. A grounded search paraphrases the top-ranked article,
 *    which can itself be stale. The model must judge "as of <today>".
 *  - The legend-calibration rule. For founding/age claims, the legend is
 *    often also what sources surface — a naive search "confirms" the myth.
 *    Age claims over ~1,000 years are CONTESTED by convention regardless.
 *  - A strict one-line-per-claim output format. Grounding is mutually
 *    exclusive with structured output, so the format is enforced in-prompt
 *    and parsed from text.
 */
function buildVerificationPrompt(
  claims: VerifiableClaim[],
  facts: EditorNoteFactBundle,
  todayISO: string,
): string {
  const lines: string[] = [];
  lines.push(
    `You are a fact-checker for a Japan travel publication. Today's date is ${todayISO}.`,
  );
  lines.push("");
  lines.push(
    `Verify each CLAIM below about this place: "${facts.name}"${
      facts.nameJapanese ? ` (${facts.nameJapanese})` : ""
    }${
      facts.city || facts.prefecture
        ? `, ${[facts.city, facts.prefecture].filter(Boolean).join(", ")}`
        : ""
    }${facts.category ? `. Category: ${facts.category}` : ""}.`,
  );
  lines.push("");
  lines.push("Use web search. Judge each claim as of TODAY, not as of whatever");
  lines.push("date the highest-ranked article was written. A claim that was");
  lines.push("true in a past year but is now outdated is STALE, not VERIFIED.");
  lines.push("");
  lines.push("Verdict rules:");
  lines.push(
    "- VERIFIED: current, reliable sources confirm the claim as stated.",
  );
  lines.push(
    "- STALE: the claim was once true but a current source shows a different value (e.g. a count, a year span, a ranking that has since changed).",
  );
  lines.push(
    "- CONTESTED: the claim is disputed, is a founding legend rather than documented history, or is not the consensus view. IMPORTANT: any founding-age or 'X years old' claim greater than ~1,000 years is CONTESTED by convention — founding dates that old are legend, not record, even when many sources repeat them.",
  );
  lines.push(
    "- UNVERIFIABLE: no reliable source could confirm or deny the claim.",
  );
  lines.push("");
  lines.push("CLAIMS:");
  claims.forEach((c, i) => {
    lines.push(`${i + 1}. [${c.family}] "${c.text}"`);
  });
  lines.push("");
  lines.push(
    "Return exactly one line per claim, in this format, nothing else:",
  );
  lines.push("CLAIM <number> :: <VERDICT> :: <one-sentence rationale>");
  lines.push("");
  lines.push("Example:");
  lines.push(
    "CLAIM 1 :: STALE :: The restaurant now holds the rating for 17 consecutive years, not 15, per the 2026 guide.",
  );
  return lines.join("\n");
}

const VERDICT_WORDS = new Set([
  "VERIFIED",
  "STALE",
  "CONTESTED",
  "UNVERIFIABLE",
]);

/**
 * Parses the grounded model's free-form text into per-claim verdicts.
 *
 * Resilient by design — grounding output is not schema-constrained:
 *  - Tolerates extra prose around the CLAIM lines.
 *  - A claim line that can't be parsed, or a claim with no line at all,
 *    defaults to `unverifiable` (fail safe: surface to the editor rather
 *    than silently drop).
 */
function parseVerdicts(
  text: string,
  claims: VerifiableClaim[],
): ClaimVerificationResult[] {
  const byIndex = new Map<number, { verdict: ClaimVerdict; rationale: string }>();

  // Match "CLAIM 1 :: STALE :: rationale" tolerantly (case-insensitive,
  // flexible whitespace around the separators).
  const lineRe = /CLAIM\s+(\d+)\s*::\s*([A-Za-z]+)\s*::\s*(.+?)\s*$/gim;
  for (const match of text.matchAll(lineRe)) {
    const idx = Number(match[1]) - 1;
    const verdictWord = (match[2] ?? "").toUpperCase();
    const rationale = (match[3] ?? "").trim();
    if (idx < 0 || idx >= claims.length) continue;
    if (!VERDICT_WORDS.has(verdictWord)) continue;
    byIndex.set(idx, {
      verdict: verdictWord.toLowerCase() as ClaimVerdict,
      rationale: rationale || "(no rationale given)",
    });
  }

  return claims.map((c, i) => {
    const parsed = byIndex.get(i);
    if (parsed) {
      return { claim: c.text, verdict: parsed.verdict, rationale: parsed.rationale };
    }
    // No parseable line for this claim — fail safe to a reviewer-visible flag.
    return {
      claim: c.text,
      verdict: "unverifiable" as ClaimVerdict,
      rationale: "Pass 4 could not parse a verdict for this claim.",
    };
  });
}

/**
 * Runs Pass 4 fact verification for one note.
 *
 * Caller contract:
 *  - `claims` must be non-empty (the orchestrator skips Pass 4 otherwise).
 *  - Caller must check `budget.shouldHalt()` BEFORE calling this.
 *
 * Never throws on a verification failure — a failed grounded call degrades to
 * an empty flag set and a logged warning, so one bad note can't abort the
 * batch. (The note still gets Pass 3's flags; Pass 4 just adds nothing.)
 */
export async function verifyEditorNoteClaims(opts: {
  claims: VerifiableClaim[];
  facts: EditorNoteFactBundle;
  budget: AuthoringBudget;
  /** Injectable for deterministic tests; defaults to now. */
  now?: Date;
  abortSignal?: AbortSignal;
}): Promise<Pass4Result> {
  const todayISO = (opts.now ?? new Date()).toISOString().slice(0, 10);
  const prompt = buildVerificationPrompt(opts.claims, opts.facts, todayISO);

  let text: string;
  let grounded: boolean;
  try {
    const res = await callContentVertexGrounded({
      prompt,
      source: "editorNote-pass4",
      budget: opts.budget,
      // 60s — matches Pass 2 / Pass 3. A grounded Pro call does a web round
      // trip plus reasoning over several claims; the default 30s is tight.
      timeoutMs: 60_000,
      abortSignal: opts.abortSignal,
    });
    text = res.text;
    grounded = res.grounded;
  } catch (err) {
    logger.warn("editor note Pass 4 verification failed; skipping flags", {
      locationId: opts.facts.locationId,
      claimCount: opts.claims.length,
      error: err instanceof Error ? err.message : String(err),
    });
    return { flags: [], verifications: [], grounded: false };
  }

  const verifications = parseVerdicts(text, opts.claims);

  const flags: string[] = [];
  for (const v of verifications) {
    if (v.verdict === "verified") continue;
    const prefix = VERDICT_PREFIX[v.verdict];
    flags.push(`${prefix}: ${v.claim}`);
  }

  if (flags.length > 0) {
    logger.info("editor note Pass 4 raised flags", {
      locationId: opts.facts.locationId,
      flagCount: flags.length,
      verdicts: verifications.map((v) => v.verdict),
    });
  }

  return { flags, verifications, grounded };
}
