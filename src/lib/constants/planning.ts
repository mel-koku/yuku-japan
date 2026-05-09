/**
 * Planning and itinerary engine constants.
 * Centralizes magic numbers used across scoring, gap detection, and scheduling.
 */

// Itinerary planner — distance/mode thresholds
/** Distance threshold (km) above which transit routing is preferred over walking */
export const TRANSIT_DISTANCE_THRESHOLD_KM = 1;
/** Travel time threshold (minutes) for short-distance train classification */
export const SHORT_DISTANCE_TRAIN_THRESHOLD_MIN = 60;
/** Travel time threshold (minutes) for long-distance shinkansen classification */
export const LONG_DISTANCE_TRAIN_THRESHOLD_MIN = 120;
/**
 * Inter-stop walk-fallback ceiling (minutes). When transit lookup fails for a
 * pair past TRANSIT_DISTANCE_THRESHOLD_KM and the resolution layer would
 * otherwise render a walk leg longer than this, we replace it with a heuristic
 * transit estimate (mode: "train", isEstimated: true). 45 min covers up to
 * ~3.4km of plausible urban walking; anything longer is almost certainly an
 * unusable fallback (e.g. the 142-min walk observed when NAVITIME and Google
 * both returned walk-only for a Hiroshima waterfront → dinner pair). Distinct
 * from MAX_AIRPORT_HOTEL_WALK_MIN (30) because inter-stop walks of 30–45 min
 * between landmarks are legitimately common in dense Japanese cities.
 */
export const MAX_INTER_STOP_WALK_FALLBACK_MIN = 45;
