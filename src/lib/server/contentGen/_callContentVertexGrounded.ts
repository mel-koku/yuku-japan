import "server-only";

import { generateText } from "ai";
import {
  getContentAuthoringModel,
  VERTEX_GENERATE_OPTIONS,
} from "./contentAuthoringModel";
import { vertex, logVertexUsage } from "../vertexProvider";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/utils/errorUtils";
import type { AuthoringBudget } from "./authoringBudget";

/**
 * Pro-model Vertex call with `googleSearch` grounding + budget-ledger
 * integration. The grounded sibling of `_callContentVertex.ts`.
 *
 * Why a separate file rather than a flag on `callContentVertex`, or reusing
 * `_llmBatchPrimitives.callVertexGroundedText`:
 *   - `callVertexGroundedText` is hard-pinned to `gemini-2.5-flash` and reports
 *     usage to the user-facing `onUsage` callback, not the in-process
 *     `AuthoringBudget` ledger. Pass 4 is authoring-side, so it must run on
 *     Pro (boundary discipline, locked 2026-05-04) and bill the authoring
 *     ledger.
 *   - Vertex grounding is mutually exclusive with structured output: a
 *     grounded call uses `generateText` with no Zod schema. `callContentVertex`
 *     is `generateObject`-only. The two call shapes can't share one function.
 *
 * Output is free-form text. Shape constraints belong in the prompt, and the
 * caller (verifyClaims.ts) parses the text into structured verdicts.
 *
 * Cost: each grounded request is billed ~$35/1k ($0.035) on top of token
 * spend. This function records BOTH onto the budget ledger via
 * `recordCall({ ..., groundedRequests })` — `groundedRequests` is 1 only when
 * the model actually issued ≥1 web query (tool offered + zero queries = no
 * fee). The caller must check `budget.shouldHalt()` BEFORE calling this.
 */
export async function callContentVertexGrounded(opts: {
  prompt: string;
  source: string;
  budget: AuthoringBudget;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}): Promise<{ text: string; grounded: boolean }> {
  const perCallTimeout = AbortSignal.timeout(opts.timeoutMs ?? 30_000);
  const combined = opts.abortSignal
    ? AbortSignal.any([perCallTimeout, opts.abortSignal])
    : perCallTimeout;

  try {
    const result = await generateText({
      model: getContentAuthoringModel(),
      providerOptions: VERTEX_GENERATE_OPTIONS,
      // `vertex.tools.googleSearch({})` returns a ProviderToolFactory that TS
      // doesn't unify with generateText's stricter ToolSet constraint. Runtime
      // shape is correct; the cast bridges a known SDK type-export gap. Same
      // pattern as `_llmBatchPrimitives.callVertexGroundedText`.
      tools: { google_search: vertex.tools.googleSearch({}) } as never,
      prompt: opts.prompt,
      abortSignal: combined,
    });

    const groundingMeta = result.providerMetadata?.google?.groundingMetadata as
      | { webSearchQueries?: unknown[] | null }
      | null
      | undefined;
    const groundingQueryCount = groundingMeta?.webSearchQueries?.length ?? 0;
    // Vertex bills the $35/1k fee per request that used the tool, not per
    // sub-query. Tool offered + zero queries = no fee.
    const grounded = groundingQueryCount > 0;

    logVertexUsage(opts.source, result, {
      model: "gemini-2.5-pro",
      grounded: true,
      groundingQueryCount,
    });

    opts.budget.recordCall({
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      groundedRequests: grounded ? 1 : 0,
    });

    return { text: result.text, grounded };
  } catch (err) {
    logger.warn("content authoring grounded Vertex call failed", {
      source: opts.source,
      error: getErrorMessage(err),
    });
    throw err;
  }
}
