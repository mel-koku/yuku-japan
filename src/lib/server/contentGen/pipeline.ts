import "server-only";

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sanityWriteClient } from "@/sanity/client";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/utils/errorUtils";

import {
  AuthoringBudget,
  loadBudgetLimitsFromEnv,
} from "./authoringBudget";
import {
  loadVoiceAnchors,
  assertReadyForBatch,
  type VoiceAnchorBundle,
} from "./voiceAnchorsLoader";
import { buildEditorNotePromptPrefix, buildCritiquePromptPrefix } from "./promptCache";
import {
  extractEditorNoteFacts,
  type EditorNoteFactBundle,
} from "./extractFacts";
import { generateEditorNoteProse } from "./generateProse";
import { critiqueEditorNoteProse } from "./critiqueProse";
import { extractVerifiableClaims } from "./extractVerifiableClaims";
import { verifyEditorNoteClaims } from "./verifyClaims";

/**
 * Orchestrator for the Smart Guidebook content authoring pipeline.
 *
 * Launch scope (Stages 0–2): editor notes only. ~150 places. Output is one
 * Sanity `editorNote` draft per place, with `flaggedClaims[]` populated for
 * the yellow-underline review surface (B2).
 *
 * Post-launch scope (Stages 3, 4, 4.5): region pages, city prose modules,
 * neighborhood pages. Same primitives, longer prose, larger fact bundles —
 * Pass 1 becomes an LLM step at that point. Stub orchestrators below.
 *
 * This module wires:
 *   - AuthoringBudget ($30/$10 ledger, env-tunable; tracks grounding fees)
 *   - Voice anchors (refuse to run at scale if drafts only)
 *   - Cacheable prompt prefix (built once per run for Vertex implicit caching)
 *   - Pass 1 deterministic fact extraction
 *   - Pass 2 prose generation (with one deny-list retry)
 *   - Pass 3 critique (with plausible-but-unsourced flagging)
 *   - Pass 4 fact verification (claim-gated grounded verification — only
 *     fires on the ~13% of notes carrying a verifiable claim shape)
 *   - Sanity draft write
 */

export type EditorNoteOutcome =
  | {
      kind: "ok";
      locationId: string;
      sanityDocId: string;
      flaggedClaimCount: number;
      retried: boolean;
    }
  | {
      kind: "skipped";
      locationId: string;
      reason: string;
    }
  | {
      kind: "halted";
      locationId: string;
      reason: "budget_hard_kill";
    };

export type EditorNoteBatchSummary = {
  totalRequested: number;
  succeeded: number;
  skipped: number;
  haltedAt: string | null;
  outcomes: EditorNoteOutcome[];
  budgetSummary: ReturnType<AuthoringBudget["summary"]>;
};

export type RunOptions = {
  /** Allow drafts-only voice anchors. Use for smoke-test runs only. */
  allowDrafts?: boolean;
  /** Cap the batch size for incremental rollout. */
  limit?: number;
  /** Optional abort signal. */
  signal?: AbortSignal;
  /** Override the loaded voice anchor bundle (tests). */
  voiceAnchorsOverride?: VoiceAnchorBundle;
  /** Override the budget instance (tests). */
  budgetOverride?: AuthoringBudget;
};

/**
 * Runs the editor-note authoring pipeline against the given location IDs.
 * Returns a structured summary; never throws on per-entity failures (those
 * become `skipped` outcomes). Throws only on setup errors (anchors missing,
 * budget env invalid).
 */
export async function authorEditorNotesBatch(
  client: SupabaseClient,
  locationIds: string[],
  opts: RunOptions = {},
): Promise<EditorNoteBatchSummary> {
  // ── Setup ──────────────────────────────────────────────────────────────
  const budget =
    opts.budgetOverride ?? new AuthoringBudget(loadBudgetLimitsFromEnv());

  const voiceAnchors =
    opts.voiceAnchorsOverride ?? (await loadVoiceAnchors());
  assertReadyForBatch(voiceAnchors, { allowDrafts: opts.allowDrafts });

  const generatePrefix = buildEditorNotePromptPrefix(voiceAnchors);
  const critiquePrefix = buildCritiquePromptPrefix(voiceAnchors);

  const slugs = opts.limit
    ? locationIds.slice(0, opts.limit)
    : locationIds;

  const outcomes: EditorNoteOutcome[] = [];
  let haltedAt: string | null = null;

  // Sequential, not parallel — keeps the budget ledger's halt check sharp,
  // and Pro is slow enough per call that parallelism doesn't dramatically
  // improve wall-clock for ~150 calls. Easy to swap for parallel later via
  // _llmBatchPrimitives.settleInOrder if observation shows it's worth it.
  for (const locationId of slugs) {
    if (budget.shouldHalt()) {
      outcomes.push({
        kind: "halted",
        locationId,
        reason: "budget_hard_kill",
      });
      haltedAt = locationId;
      break;
    }
    if (opts.signal?.aborted) {
      outcomes.push({
        kind: "skipped",
        locationId,
        reason: "aborted by caller",
      });
      break;
    }

    try {
      const outcome = await authorOneEditorNote(
        client,
        locationId,
        generatePrefix,
        critiquePrefix,
        budget,
        opts.signal,
      );
      outcomes.push(outcome);
    } catch (err) {
      logger.warn("editor note batch: per-entity failure", {
        locationId,
        error: getErrorMessage(err),
      });
      outcomes.push({
        kind: "skipped",
        locationId,
        reason: getErrorMessage(err),
      });
    }
  }

  budget.logRunComplete({
    pipeline: "authorEditorNotesBatch",
    requested: locationIds.length,
    completed: outcomes.filter((o) => o.kind === "ok").length,
    haltedAt,
  });

  return {
    totalRequested: locationIds.length,
    succeeded: outcomes.filter((o) => o.kind === "ok").length,
    skipped: outcomes.filter((o) => o.kind === "skipped").length,
    haltedAt,
    outcomes,
    budgetSummary: budget.summary(),
  };
}

async function authorOneEditorNote(
  client: SupabaseClient,
  locationId: string,
  generatePrefix: ReturnType<typeof buildEditorNotePromptPrefix>,
  critiquePrefix: ReturnType<typeof buildCritiquePromptPrefix>,
  budget: AuthoringBudget,
  signal?: AbortSignal,
): Promise<EditorNoteOutcome> {
  // Pass 1 — deterministic fact extraction.
  const facts: EditorNoteFactBundle = await extractEditorNoteFacts(
    client,
    locationId,
  );

  // Pass 2 — generate; one retry on deny-list violation.
  let pass2 = await generateEditorNoteProse({
    facts,
    prefix: generatePrefix,
    budget,
    abortSignal: signal,
  });
  let retried = false;
  if (pass2.denyListViolation) {
    retried = true;
    pass2 = await generateEditorNoteProse({
      facts,
      prefix: generatePrefix,
      budget,
      isRetry: true,
      prevViolation: pass2.denyListViolation,
      abortSignal: signal,
    });
  }

  // Pass 3 — critique. Always runs, even if Pass 2 produced clean prose;
  // the critique catches hallucinations the deny-list can't see.
  const critique = await critiqueEditorNoteProse({
    prose: pass2.prose,
    facts,
    prefix: critiquePrefix,
    budget,
    abortSignal: signal,
  });

  // Pass 4 — fact verification. Additive to Pass 3, not a replacement.
  // Claim-gated: extractVerifiableClaims is a zero-cost regex scan; only the
  // ~13% of notes with a verifiable claim shape incur the grounded call.
  // Skipped if the budget is exhausted — Pass 4's grounded request costs the
  // $0.035 fee + Pro tokens, so it must respect the same halt the loop does.
  let flaggedClaims = critique.flaggedClaims;
  const verifiableClaims = extractVerifiableClaims(critique.prose);
  if (verifiableClaims.length > 0 && !budget.shouldHalt()) {
    const pass4 = await verifyEditorNoteClaims({
      claims: verifiableClaims,
      facts,
      budget,
      abortSignal: signal,
    });
    // Merge Pass 4 flags into the Pass 3 set, deduped within this run.
    // extractVerifiableClaims is deterministic, but the grounded verification
    // is not fully so — a re-run on a different day can surface a different
    // top-ranked source and thus a different verdict. `createOrReplace`
    // overwrites, so re-running the batch can resurrect a flag an editor
    // already dismissed in Studio. Known wrinkle; acceptable because a batch
    // re-run is a deliberate act, not a routine one.
    if (pass4.flags.length > 0) {
      flaggedClaims = [...new Set([...flaggedClaims, ...pass4.flags])];
    }
  }

  // Write Sanity draft. Editor publishes from Studio after reviewing flags.
  const sanityDocId = await writeEditorNoteDraft({
    locationId,
    note: critique.prose,
    flaggedClaims,
  });

  return {
    kind: "ok",
    locationId,
    sanityDocId,
    flaggedClaimCount: flaggedClaims.length,
    retried,
  };
}

/**
 * Builds the deterministic Sanity doc ID for a location's editor note.
 * Sanity caps doc IDs at 128 chars; the prefix "drafts.editorNote-" eats 18,
 * leaving 110 for the slug. Long slugs (e.g. multi-word Japanese transliterations)
 * exceed that — we truncate and append an 8-char SHA-1 to preserve idempotency.
 */
function buildEditorNoteDocId(locationId: string): string {
  const PREFIX = "drafts.editorNote-";
  const MAX_LEN = 128;
  const naive = `${PREFIX}${locationId}`;
  if (naive.length <= MAX_LEN) return naive;

  // 8 hex chars = 32 bits collision space; with a "-" separator that's 9 chars.
  // Available slug budget = MAX_LEN - PREFIX.length - 9 = 101 chars.
  const HASH_LEN = 8;
  const slugBudget = MAX_LEN - PREFIX.length - 1 - HASH_LEN;
  const hash = createHash("sha1").update(locationId).digest("hex").slice(0, HASH_LEN);
  return `${PREFIX}${locationId.slice(0, slugBudget)}-${hash}`;
}

/**
 * Writes an `editorNote` draft to Sanity. The doc ID is deterministic from
 * the location slug so re-running the pipeline against the same locations
 * updates the existing draft instead of creating duplicates.
 */
async function writeEditorNoteDraft(opts: {
  locationId: string;
  note: string;
  flaggedClaims: string[];
}): Promise<string> {
  // Sanity doc IDs prefixed with `drafts.` are draft-only and won't appear
  // in published queries. The editor publishes from Studio.
  const docId = buildEditorNoteDocId(opts.locationId);

  const noteAsPortableText = [
    {
      _type: "block",
      _key: `block-${opts.locationId}`,
      style: "normal",
      children: [
        {
          _type: "span",
          _key: `span-${opts.locationId}`,
          text: opts.note,
          marks: [],
        },
      ],
      markDefs: [],
    },
  ];

  await sanityWriteClient.createOrReplace({
    _id: docId,
    _type: "editorNote",
    locationSlug: opts.locationId,
    note: noteAsPortableText,
    flaggedClaims: opts.flaggedClaims,
  });

  return docId;
}
