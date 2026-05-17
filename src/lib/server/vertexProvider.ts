import "server-only";
import { createVertex } from "@ai-sdk/google-vertex";
import { logger } from "@/lib/logger";

function buildVertexProvider() {
  const project = process.env.GOOGLE_VERTEX_PROJECT;
  if (!project) {
    throw new Error(
      "GOOGLE_VERTEX_PROJECT env var is required for Vertex AI calls",
    );
  }

  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  return createVertex({
    project,
    location: process.env.GOOGLE_VERTEX_LOCATION ?? "us-central1",
    ...(credentialsJson && {
      googleAuthOptions: {
        credentials: JSON.parse(credentialsJson),
      },
    }),
  });
}

// Lazy singleton: build the provider on first call so module imports (and tests
// that mock generateObject) don't blow up when GOOGLE_VERTEX_PROJECT is absent.
let cachedProvider: ReturnType<typeof buildVertexProvider> | null = null;
function getVertexProvider() {
  if (!cachedProvider) cachedProvider = buildVertexProvider();
  return cachedProvider;
}

// Proxy so `vertex(...)`, `vertex.textEmbeddingModel(...)`, `vertex.languageModel(...)`
// etc. all defer construction until first use. A bare wrapper function would strip
// the attached methods (textEmbeddingModel, embeddingModel, image, tools, ...).
export const vertex: ReturnType<typeof buildVertexProvider> = new Proxy(
  function () {} as unknown as ReturnType<typeof buildVertexProvider>,
  {
    apply(_target, _thisArg, args: unknown[]) {
      return (
        getVertexProvider() as unknown as (...a: unknown[]) => unknown
      )(...args);
    },
    get(_target, prop, receiver) {
      return Reflect.get(getVertexProvider() as object, prop, receiver);
    },
  },
);

/**
 * Shared providerOptions for all non-chat Gemini calls.
 *
 * `streamFunctionCallArguments: false` is load-bearing. @ai-sdk/google-vertex@4
 * defaults it to true, which makes Vertex return 400 "streaming function call
 * is not supported in unary API" on every generateObject/generateText call.
 *
 * No thinkingConfig override: gemini-2.5-flash's dynamic budget picks per
 * request. These generators do reasoning-heavy work (intent extraction, day
 * refinement, guide prose under a deny list), and thinking materially improves
 * output quality for cost measured in fractions of a cent per trip.
 */
export const VERTEX_GENERATE_OPTIONS = {
  google: {
    streamFunctionCallArguments: false,
  },
} as const;

/**
 * Shared providerOptions for the chat streaming path.
 *
 * Chat caps `thinkingBudget` at 512 because the chat UI is latency-sensitive:
 * users watch tokens stream in real time. The unary generators above prefer
 * dynamic budgets; chat prefers a predictable ceiling. Kept separate from
 * VERTEX_GENERATE_OPTIONS so the `streamFunctionCallArguments: false` line
 * can never drift between the two call shapes.
 */
export const VERTEX_CHAT_OPTIONS = {
  google: {
    streamFunctionCallArguments: false,
    thinkingConfig: { thinkingBudget: 512 },
  },
} as const;

/**
 * Shape of the result-like value passed to {@link logVertexUsage}.
 * Both `generateObject` / `generateText` results and the `streamText`
 * onFinish payload conform to this — the optional chaining handles either.
 */
type VertexUsageResultLike = {
  usage?: { inputTokens?: number; outputTokens?: number } | null;
  providerMetadata?: {
    google?: {
      usageMetadata?: {
        cachedContentTokenCount?: number | null;
        thoughtsTokenCount?: number | null;
      } | null;
    };
  } | null;
};

/**
 * Logs a structured `llm.usage` event with token counts and Vertex-specific
 * cache-hit / thinking-budget metadata. Used to settle the implicit-caching
 * question and to monitor thinkingBudget burn at scale. Pass the same
 * `source` value across calls so log queries can aggregate per pipeline pass.
 *
 * Safe to call with mocked results in tests — every field is optional and
 * missing values report as 0.
 */
export function logVertexUsage(
  source: string,
  result: VertexUsageResultLike,
  extra?: Record<string, unknown>,
): void {
  // @ai-sdk/google-vertex emits provider metadata under the `vertex` key, not
  // `google`. Reading `.google` here silently yields undefined → cached-token
  // and thinking-budget telemetry log 0 on every call.
  const cached =
    result.providerMetadata?.vertex?.usageMetadata?.cachedContentTokenCount ?? 0;
  const thoughts =
    result.providerMetadata?.vertex?.usageMetadata?.thoughtsTokenCount ?? 0;
  logger.info("llm.usage", {
    source,
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
    cachedTokens: cached,
    thoughtsTokens: thoughts,
    ...extra,
  });
}
