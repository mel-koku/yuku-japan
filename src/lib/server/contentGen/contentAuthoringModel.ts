import "server-only";

import { vertex, VERTEX_GENERATE_OPTIONS } from "../vertexProvider";
import type { LanguageModelV3 } from "@ai-sdk/provider";

/**
 * Content authoring runs on `gemini-2.5-pro`, NOT the `gemini-2.5-flash` used
 * by every user-facing route (itineraryEngine, dayRefinement, guideProseGenerator,
 * dailyBriefingGenerator, intentExtractor, searchQueryRewriter,
 * dayIntroGenerator, chat).
 *
 * Boundary discipline (locked 2026-05-04, see
 * docs/superpowers/plans/2026-05-04-smart-guidebook-stages-0-2-cost-model.md):
 * the new `src/lib/server/contentGen/` pipeline imports this factory; the
 * existing 8 user-facing call sites continue to import `getModel()` from
 * `../llmProvider` and stay on Flash.
 *
 * Rationale: at content-authoring batch sizes (e.g. 150 editor notes × 3
 * passes), the absolute cost differential between Flash and Pro is single-
 * digit dollars, but Pro's lift in first-pass editorial acceptance saves real
 * reviewer time. User-facing routes have the opposite calculus — high call
 * volume, latency-sensitive, Flash's quality already proven (<1% deny-list
 * violation rate in the existing 4-pass pipeline).
 *
 * Authoring batches do NOT go through the user-facing cost gate
 * (`gateOnDailyCost`) — that's a Redis-backed abuse circuit-breaker scoped
 * per-user/global. Authoring uses {@link AuthoringBudget} from
 * `./authoringBudget`, an in-process ledger with $30/$10 thresholds.
 */
const CONTENT_AUTHORING_MODEL_ID = "gemini-2.5-pro";

/**
 * Returns the Vertex Pro model handle used by all `src/lib/server/contentGen/`
 * pipelines. Throws if Vertex credentials aren't configured — content
 * authoring is a deliberate batch run, not a user-facing path with a
 * graceful-degradation fallback.
 */
export function getContentAuthoringModel(): LanguageModelV3 {
  return vertex(CONTENT_AUTHORING_MODEL_ID);
}

/**
 * Re-exported so authoring callers don't need a second import. The
 * `streamFunctionCallArguments: false` flag is load-bearing: @ai-sdk/google-vertex
 * defaults it to true, which makes Vertex return 400 on every generateObject
 * call. See `vertexProvider.ts` for the full rationale.
 */
export { VERTEX_GENERATE_OPTIONS };

/** Exported for tests + telemetry (`logVertexUsage` source tags). */
export const CONTENT_AUTHORING_MODEL = CONTENT_AUTHORING_MODEL_ID;
