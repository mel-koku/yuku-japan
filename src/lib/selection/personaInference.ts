/**
 * Direction 4 runtime activation (2026-05-09): infer persona id from
 * TripBuilderData shape. Feeds into the post-scoring canonical-coverage
 * layer (`canonicalCoverage.ts`) via `generateItinerary` options.
 *
 * Pure function — same input always produces same output, so the existing
 * itinerary cache key (which derives from builderData) stays correct
 * without invalidation.
 *
 * Confidence floor: when the shape isn't clearly diagnostic, returns
 * `undefined` so the planner runs as it does today (no behavior change).
 *
 * See: docs/superpowers/plans/2026-05-09-persona-inference-runtime-activation.md
 */
import type { TripBuilderData } from "@/types/trip";

/**
 * Cities that signal a repeat-Japan traveler. Sourced from
 * PERSONA_REPEAT_TRAVELER.cityPool in scripts/simulate-planner.test.ts —
 * keep these in sync if the simulation harness changes.
 */
const REPEAT_LEANING_CITIES = new Set<string>([
  "kanazawa",
  "takayama",
  "matsue",
  "tottori",
  "wakayama",
  "ise",
  "sendai",
  "aizuwakamatsu",
  "hiraizumi",
  "aomori",
  "hakodate",
  "naha",
]);

export function inferPersonaId(data: TripBuilderData): string | undefined {
  // Primary signal — explicit user input.
  // The "First time in Japan" toggle in OptionsSection.tsx is the
  // strongest signal we have. Beats all shape inference, including
  // honeymoon-shape (couple + 14d + zen_wellness): a first-time
  // honeymooner needs the brand-promise icons more than the zen
  // curation.
  if (data.isFirstTimeVisitor === true) return "first-timer";

  // Family is also explicit — group.type comes from a UI selection.
  if (data.group?.type === "family") return "family";

  const vibes = data.vibes ?? [];
  const cities = data.cities ?? [];
  const groupType = data.group?.type;
  const duration = data.duration ?? 0;

  // Honeymooner: couple + long stay + signature zen_wellness vibe.
  // More specific than first-timer (requires three conditions), so
  // checked first.
  if (
    groupType === "couple" &&
    duration >= 14 &&
    vibes.includes("zen_wellness")
  ) {
    return "honeymooner";
  }

  // Repeat traveler: signature local_secrets vibe, or any
  // repeat-leaning city. The local_secrets vibe is the diagnostic
  // signal — even a Tokyo+Kyoto trip with that vibe is a repeat
  // shape, not a first-timer shape. (Editorial defense: the user
  // chose a "deep cuts" vibe explicitly; serving Sensoji/Fushimi
  // Inari icons would feel patronizing.)
  if (vibes.includes("local_secrets")) return "repeat";
  for (const city of cities) {
    if (REPEAT_LEANING_CITIES.has(city)) return "repeat";
  }

  // First-timer shape: Tokyo+Kyoto core, no local_secrets, couple/solo,
  // 7-14 day duration. local_secrets check is redundant given the
  // earlier branch, but kept for clarity.
  const hasTokyo = cities.includes("tokyo");
  const hasKyoto = cities.includes("kyoto");
  const coupleOrSolo = groupType === "couple" || groupType === "solo";
  const inFirstTimerDurationRange = duration >= 7 && duration <= 14;
  if (
    hasTokyo &&
    hasKyoto &&
    coupleOrSolo &&
    inFirstTimerDurationRange &&
    !vibes.includes("local_secrets")
  ) {
    return "first-timer";
  }

  // Confidence floor — shape isn't clearly diagnostic. Falls through
  // to current production behavior (no force-include fires).
  return undefined;
}
