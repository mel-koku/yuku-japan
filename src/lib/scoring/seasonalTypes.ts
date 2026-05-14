// Seasonal types that represent real availability gates (venue is closed/inaccessible
// outside the window). valid_months on these rows is a hard constraint, not a hero tag.
// All other seasonal_types are hero-season markers — the venue operates year-round.
export const GATING_SEASONAL_TYPES = new Set([
  "winter_closure",
  "seasonal_attraction",
  "winter_festival",
]);
