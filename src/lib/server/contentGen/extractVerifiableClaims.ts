import "server-only";

/**
 * Pass 4 — Step A: deterministic claim extraction.
 *
 * Pass 4 (fact verification) is expensive: every triggered note costs one
 * grounded Vertex request ($0.035 fee + Pro tokens). This module is the
 * zero-cost gate in front of it. It scans Pass 3's prose for *claim shapes*
 * worth verifying and returns them; if it returns an empty array, Pass 4 is
 * skipped entirely for that note.
 *
 * The 12.7% measurement: run against the 425 published editorNote docs
 * (2026-05-16), only 54/425 contained any verifiable claim shape. Gating on
 * this is what keeps a batch affordable — a Shape-1 (~451 note) batch costs
 * ~$2.70 of Pass 4 spend, not ~$15.
 *
 * Scope of what Pass 4 verifies (per the deny-list-misses gap):
 * - The HALLUCINATION_DENY_LIST catches banned *words* and triggers a Pass 2
 *   regen. It does NOT catch contestable *claims* whose words are clean.
 * - Pass 3 checks "is this claim in INPUT" — not "is INPUT still current". A
 *   stale fact verbatim-copied from INPUT sails through Pass 3.
 * - Pass 4 closes that gap: it verifies load-bearing factual claims against
 *   current external sources.
 *
 * This file is the claim *shapes*; the verification logic is verifyClaims.ts.
 */

/**
 * The claim family a matched span belongs to. Drives how verifyClaims.ts
 * frames the verification question (a distance is a number to check; a
 * superlative is a ranking to check; an age claim has a legend-calibration
 * rule).
 */
export type ClaimFamily =
  | "temporal-superlative" // "Nth consecutive year", "since YYYY"
  | "founding-age" // founding dates, "X years old", "centuries-old"
  | "superlative" // "the oldest/largest/only", "world-famous"
  | "transit"; // station names, "N-minute walk"

export type VerifiableClaim = {
  /** The exact substring matched in the prose. Used both as the verification
   *  subject and (prefixed) as the flaggedClaims entry so the Studio
   *  yellow-underline marker can render it. */
  text: string;
  /** Which family the claim belongs to. */
  family: ClaimFamily;
};

/**
 * Per-family regex sets. Calibrated against the 425-doc corpus (2026-05-16):
 * the families and their hit rates were `temporal-superlative` 1.9%,
 * `founding-age` 4.0%, `superlative` 2.6%, `transit` 5.6%.
 *
 * These are a deliberate *superset* of HALLUCINATION_DENY_LIST: the deny-list
 * shapes are re-used (founding dates, "the X-est") AND extended with the
 * descriptive phrasings the deny-list misses ("1,900 years old",
 * "centuries-old", "since 1903", "15-minute walk"). The deny-list flags
 * banned words; this flags contestable claim shapes regardless of wording.
 */
const FAMILY_PATTERNS: Record<ClaimFamily, RegExp[]> = {
  "temporal-superlative": [
    // "15 consecutive years", "for 17 straight years", "3 years running"
    /\b\d+\s*(?:consecutive|straight|years?\s+running)\b/i,
    /\bfor\s+(?:over\s+)?\d+\s+(?:consecutive\s+)?years\b/i,
    // "15th consecutive year", "the 17th year"
    /\b\d+(?:st|nd|rd|th)\s+(?:consecutive\s+)?year\b/i,
    // "since 1903", "opened in 1936" — a year a claim is anchored to
    /\bsince\s+\d{3,4}\b/i,
    /\bopened\s+in\s+\d{3,4}\b/i,
  ],
  "founding-age": [
    /\b\d{3,4}\s*(?:AD|BC|CE|BCE)\b/i, // "794 AD"
    /\b\d{1,2}(?:st|nd|rd|th)[\s-]*century\b/i, // "8th century", "16th-century"
    /\bfounded\s+in\b/i,
    /\bdating\s+(?:back\s+)?to\b/i,
    /\bestablished\s+in\b/i,
    /\bbuilt\s+in\s+(?:the\s+)?\d{3,4}\b/i, // "built in 1397"
    /\b[\d,]+[\s-]year[s]?[\s-]old\b/i, // "300-year-old", "1,900-year-old"
    /\b[\d,]+\s+years\s+old\b/i, // "1,900 years old"
    /\bcenturies[\s-]old\b/i,
    /\bover\s+[\d,]+\s+years\b/i, // "over 1,000 years"
  ],
  superlative: [
    /\bthe\s+oldest\b/i,
    /\bthe\s+largest\b/i,
    /\bthe\s+(?:first|earliest)\b/i,
    /\bthe\s+only\b/i,
    /\bthe\s+(?:biggest|tallest|highest|longest)\b/i,
    /\bthe\s+most[\s-](?:visited|popular|famous)\b/i,
    /\bworld[\s-](?:class|famous|renowned)\b/i,
    // "one of the world's longest", "one of the oldest"
    /\bone\s+of\s+the\s+(?:world['’]s|largest|oldest|biggest|tallest|longest|most)\b/i,
  ],
  transit: [
    // distance/duration claims — a number to verify
    /\b\d+[\s-]minute[s]?\s+(?:walk|stroll|ride)\b/i,
    /\b\d+[\s-]min(?:ute)?\s+(?:walk|from)\b/i,
    // station adjacency — an existence/adjacency claim to verify (bad-DB case)
    /\bnearest\s+station\b/i,
    /\b[A-Z][a-z]+\s+Station\b/, // "Shibuya Station"
  ],
};

/**
 * Caps how many claims one note can send to Pass 4. The 425-doc corpus
 * topped out at 4 claims/note; this cap (8) is a defensive ceiling so a
 * pathological note can't balloon the verification prompt — not a limit
 * expected to bind in practice.
 */
const MAX_CLAIMS_PER_NOTE = 8;

/**
 * Extracts the verifiable claim shapes from one note's prose.
 *
 * Deterministic and zero-cost — no LLM, no network. Returns claims deduped on
 * `text` (the same span may match multiple patterns in a family), preserving
 * first-seen order. An empty array means the orchestrator skips Pass 4 for
 * this note.
 */
export function extractVerifiableClaims(prose: string): VerifiableClaim[] {
  if (!prose || !prose.trim()) return [];

  const seen = new Set<string>();
  const claims: VerifiableClaim[] = [];

  for (const [family, patterns] of Object.entries(FAMILY_PATTERNS) as [
    ClaimFamily,
    RegExp[],
  ][]) {
    for (const pattern of patterns) {
      // Global clone so a single pattern catches every occurrence in the note.
      const flags = pattern.flags.includes("g")
        ? pattern.flags
        : pattern.flags + "g";
      const global = new RegExp(pattern.source, flags);
      const matches = prose.match(global);
      if (!matches) continue;
      for (const raw of matches) {
        const text = raw.trim();
        if (!text) continue;
        // Dedupe case-insensitively so "the Oldest" and "the oldest" collapse.
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        claims.push({ text, family });
        if (claims.length >= MAX_CLAIMS_PER_NOTE) return claims;
      }
    }
  }

  return claims;
}
