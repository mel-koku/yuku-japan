import { defineType, defineField } from "sanity";
import {
  EDITORIAL_PROSE_BLOCK,
  maxWordsValidator,
  noEmDashesInPortableText,
} from "./_validators";

/**
 * Per-place editor notes — Smart Guidebook Stage 5 (top 150 places at launch).
 * Sensory + practical micro-essays, 30-60 words each.
 *
 * Read path: queried in the location detail loader by `location_slug`,
 * cached via `contentService.ts` two-tier cache. Surfaces on PlaceDetail (as
 * a pull-quote callout) and on itinerary stops with an editor note (same
 * pull-quote treatment). Not rendered on LocationCard — would crowd the card.
 *
 * Eng review note (locked decision): editor notes live ONLY in Sanity, NOT
 * on the `locations` table. Single source of truth.
 */
export const editorNote = defineType({
  name: "editorNote",
  title: "Editor Note",
  type: "document",
  fields: [
    defineField({
      name: "locationSlug",
      title: "Location Slug",
      type: "string",
      description:
        "Foreign key to `locations.id` (slug-style). Validated at read time via isValidLocationId().",
      validation: (rule) =>
        rule
          .required()
          .max(255)
          .custom((val) => {
            if (typeof val !== "string") return "Required.";
            if (!/^[A-Za-z0-9._-]+$/.test(val))
              return "Slug must be alphanumeric with hyphens, underscores, or dots only.";
            return true;
          }),
    }),
    defineField({
      name: "note",
      title: "Editor Note",
      type: "array",
      description:
        "Sensory + practical: best time, what's actually the draw, what to skip. 30-60 words. Voice anchor: editorNoteExample.",
      of: [EDITORIAL_PROSE_BLOCK],
      validation: (rule) =>
        rule.custom(maxWordsValidator(60)).custom(noEmDashesInPortableText),
    }),
    defineField({
      name: "flaggedClaims",
      title: "Flagged Claims (Pass 3 + Pass 4 review)",
      type: "array",
      description:
        "Auto-populated by the authoring pipeline. Yellow-underline markers in Studio. A bare entry is a Pass 3 hallucination / deny-list flag. An entry prefixed 'VERIFY-STALE:', 'VERIFY-CONTESTED:', or 'VERIFY-UNVERIFIABLE:' is a Pass 4 fact-check flag — STALE means a current source contradicts the value, CONTESTED means the claim is a legend or disputed, UNVERIFIABLE means no source could confirm it. Editor publishes only after every flag is dismissed or the prose is rewritten.",
      of: [{ type: "string" }],
      options: { layout: "tags" },
    }),
    defineField({
      name: "source",
      title: "Authoring Source",
      type: "string",
      description:
        "Which authoring workflow produced this note. Internal field for A/B audits.",
      options: {
        list: [
          { title: "Pipeline A", value: "pipeline-a" },
          { title: "Pipeline B", value: "pipeline-b" },
          { title: "Human-authored", value: "human" },
          { title: "Claude team", value: "claude-team" },
        ],
      },
    }),
    defineField({
      name: "sourceMetadata",
      title: "Authoring Metadata",
      type: "object",
      description:
        "Internal provenance for the workflow that produced this note. Optional; useful for A/B audits.",
      fields: [
        defineField({
          name: "authoredAt",
          title: "Authored At",
          type: "datetime",
        }),
        defineField({
          name: "claimsAudit",
          title: "Claims Audit",
          type: "array",
          description:
            "Each entry: '<claim text> :: INPUT-verbatim | INPUT-implied | unsourced'.",
          of: [{ type: "string" }],
        }),
      ],
    }),
  ],
  preview: {
    select: { slug: "locationSlug", source: "source" },
    prepare({ slug, source }) {
      const sourceLabel =
        source === "pipeline-a"
          ? "Pipeline A"
          : source === "pipeline-b"
            ? "Pipeline B"
            : source === "human"
              ? "Human"
              : source === "claude-team"
                ? "Claude team"
                : "Unset";
      return {
        title: slug || "Unassigned editor note",
        subtitle: `Editor Note · ${sourceLabel}`,
      };
    },
  },
});
