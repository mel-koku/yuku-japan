import { defineType, defineField } from "sanity";

export const tripBuilderConfig = defineType({
  name: "tripBuilderConfig",
  title: "Trip Builder Config",
  type: "document",
  fieldsets: [
    { name: "vibesData", title: "Vibes (Data)", options: { collapsible: true } },
    { name: "regionsData", title: "Regions (Data)", options: { collapsible: true } },
    { name: "introStep", title: "Intro Step", options: { collapsible: true, collapsed: true } },
    { name: "dateStep", title: "Date Step", options: { collapsible: true, collapsed: true } },
    { name: "entryPointStep", title: "Entry Point Step", options: { collapsible: true, collapsed: true } },
    { name: "vibeStep", title: "Vibe Step", options: { collapsible: true, collapsed: true } },
    { name: "regionStep", title: "Region Step", options: { collapsible: true, collapsed: true } },
    { name: "reviewStep", title: "Review Step", options: { collapsible: true, collapsed: true } },
    { name: "generatingOverlay", title: "Generating Overlay", options: { collapsible: true, collapsed: true } },
    { name: "navigation", title: "Navigation Labels", options: { collapsible: true, collapsed: true } },
    { name: "billing", title: "Billing / Free Access", options: { collapsible: true, collapsed: true } },
  ],
  fields: [
    // ── Vibes (Data) ────────────────────────────
    defineField({
      name: "vibes",
      fieldset: "vibesData",
      title: "Vibes",
      type: "array",
      description: "Travel style categories shown in the trip builder. IDs must match code enums.",
      of: [
        {
          type: "object",
          name: "vibe",
          title: "Vibe",
          fields: [
            defineField({
              name: "vibeId",
              title: "Vibe ID",
              type: "string",
              readOnly: true,
              description: "Must match code enum (e.g., temples_tradition)",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "name",
              title: "Display Name",
              type: "string",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "description",
              title: "Description",
              type: "string",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "icon",
              title: "Icon Name",
              type: "string",
              description: "Lucide icon name (e.g., Torii, Utensils, Camera)",
            }),
            defineField({
              name: "image",
              title: "Background Image",
              type: "image",
              options: { hotspot: true },
            }),
          ],
          preview: {
            select: { name: "name", vibeId: "vibeId" },
            prepare({ name, vibeId }) {
              return { title: name, subtitle: vibeId };
            },
          },
        },
      ],
    }),
    // ── Regions (Data) ─────────────────────────
    defineField({
      name: "regions",
      title: "Regions",
      type: "array",
      fieldset: "regionsData",
      description: "Region descriptions shown in the trip builder. IDs must match code enums.",
      of: [
        {
          type: "object",
          name: "region",
          title: "Region",
          fields: [
            defineField({
              name: "regionId",
              title: "Region ID",
              type: "string",
              readOnly: true,
              description: "Must match code enum (e.g., kansai, kanto)",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "name",
              title: "Display Name",
              type: "string",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "tagline",
              title: "Tagline",
              type: "string",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "description",
              title: "Description",
              type: "text",
              rows: 3,
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "highlights",
              title: "Highlights",
              type: "array",
              of: [{ type: "string" }],
              description: "Notable places in this region (shown as chips)",
            }),
            defineField({
              name: "heroImage",
              title: "Hero Image",
              type: "image",
              options: { hotspot: true },
            }),
            defineField({
              name: "galleryImages",
              title: "Gallery Images",
              type: "array",
              description: "Additional images for this region (used in review step composite). Hero image is always included.",
              of: [{ type: "image", options: { hotspot: true } }],
              validation: (rule) => rule.max(4),
            }),
          ],
          preview: {
            select: { name: "name", tagline: "tagline", regionId: "regionId" },
            prepare({ name, tagline, regionId }) {
              return { title: `${name} (${regionId})`, subtitle: tagline };
            },
          },
        },
      ],
    }),

    // ── Intro Step ──────────────────────────────
    defineField({
      name: "introHeading",
      title: "Heading",
      type: "string",
      fieldset: "introStep",
      initialValue: "Your Japan",
    }),
    defineField({
      name: "introSubheading",
      title: "Subheading",
      type: "string",
      fieldset: "introStep",
      initialValue: "starts here",
    }),
    defineField({
      name: "introDescription",
      title: "Description",
      type: "text",
      rows: 2,
      fieldset: "introStep",
      initialValue: "Tell us what you\u2019re into. We\u2019ll build the days around it.",
    }),
    defineField({
      name: "introCtaText",
      title: "CTA Button Text",
      type: "string",
      fieldset: "introStep",
      initialValue: "Start planning",
    }),
    defineField({
      name: "introEyebrow",
      title: "Eyebrow Text",
      type: "string",
      fieldset: "introStep",
      initialValue: "TRIP BUILDER",
    }),
    defineField({
      name: "introAccentImage",
      title: "Accent Panel Image",
      type: "image",
      options: { hotspot: true },
      fieldset: "introStep",
      description: "Featured image displayed in the right panel on desktop.",
    }),
    defineField({
      name: "introImageCaption",
      title: "Image Caption",
      type: "string",
      fieldset: "introStep",
      initialValue: "Kansai, Japan",
    }),

    // ── Date Step ───────────────────────────────
    defineField({
      name: "dateStepHeading",
      title: "Heading",
      type: "string",
      fieldset: "dateStep",
      initialValue: "When are you going?",
    }),
    defineField({
      name: "dateStepDescription",
      title: "Description",
      type: "text",
      rows: 2,
      fieldset: "dateStep",
      initialValue: "Your dates shape everything \u2014 cherry blossoms, festivals, fall foliage. Up to 21 days.",
    }),
    defineField({
      name: "dateStepBackgroundImage",
      title: "Background Image (global fallback)",
      type: "image",
      options: { hotspot: true },
      fieldset: "dateStep",
      description:
        "Used when no seasonal image is set for the current season. Leave empty to fall back to the curated Wikimedia seasonal photos.",
    }),
    defineField({
      name: "dateStepSeasonalImages",
      title: "Seasonal Hero Images",
      type: "object",
      fieldset: "dateStep",
      description:
        "One hero per season. The Date step picks by current month (Spring = Mar/Apr/May, Summer = Jun/Jul/Aug, Autumn = Sep/Oct/Nov, Winter = Dec/Jan/Feb). Leave any season empty to fall back to a curated Wikimedia photo.",
      fields: [
        defineField({
          name: "spring",
          title: "Spring (Mar/Apr/May)",
          type: "image",
          options: { hotspot: true },
        }),
        defineField({
          name: "summer",
          title: "Summer (Jun/Jul/Aug)",
          type: "image",
          options: { hotspot: true },
        }),
        defineField({
          name: "autumn",
          title: "Autumn (Sep/Oct/Nov)",
          type: "image",
          options: { hotspot: true },
        }),
        defineField({
          name: "winter",
          title: "Winter (Dec/Jan/Feb)",
          type: "image",
          options: { hotspot: true },
        }),
      ],
    }),
    defineField({
      name: "dateStepStartLabel",
      title: "Start Date Label",
      type: "string",
      fieldset: "dateStep",
      initialValue: "Start Date",
    }),
    defineField({
      name: "dateStepEndLabel",
      title: "End Date Label",
      type: "string",
      fieldset: "dateStep",
      initialValue: "End Date",
    }),

    // ── Entry Point Step ────────────────────────
    defineField({
      name: "entryPointHeading",
      title: "Heading",
      type: "string",
      fieldset: "entryPointStep",
      initialValue: "Where will you land?",
    }),
    defineField({
      name: "entryPointDescription",
      title: "Description",
      type: "string",
      fieldset: "entryPointStep",
      initialValue: "Optional. If you know your airport, we\u2019ll route from there.",
    }),
    defineField({
      name: "entryPointChangeText",
      title: "Change Button Text",
      type: "string",
      fieldset: "entryPointStep",
      initialValue: "Change",
    }),
    defineField({
      name: "entryPointSearchPlaceholder",
      title: "Search Placeholder",
      type: "string",
      fieldset: "entryPointStep",
      initialValue: "Search by name, city, or code...",
    }),
    defineField({
      name: "entryPointNoResults",
      title: "No Results Message",
      type: "string",
      fieldset: "entryPointStep",
      initialValue: "No airports found",
    }),
    defineField({
      name: "entryPointPopularLabel",
      title: "Popular Airports Label",
      type: "string",
      fieldset: "entryPointStep",
      initialValue: "Popular airports",
    }),

    // ── Vibe Step ───────────────────────────────
    defineField({
      name: "vibeStepHeading",
      title: "Heading",
      type: "string",
      fieldset: "vibeStep",
      initialValue: "What moves you?",
    }),
    defineField({
      name: "vibeStepDescription",
      title: "Description",
      type: "string",
      fieldset: "vibeStep",
      initialValue: "Choose up to 5. These shape the places we suggest.",
    }),
    defineField({
      name: "vibeStepMaxWarning",
      title: "Max Selection Warning",
      type: "string",
      fieldset: "vibeStep",
      description: "Use {max} as placeholder for the maximum number.",
      initialValue: "That\u2019s all {max}. Tap one to swap it out.",
    }),

    // ── Region Step ─────────────────────────────
    defineField({
      name: "regionStepHeading",
      title: "Heading",
      type: "string",
      fieldset: "regionStep",
      initialValue: "Where are you headed?",
    }),
    defineField({
      name: "regionStepDescription",
      title: "Description",
      type: "string",
      fieldset: "regionStep",
      initialValue: "Pick your cities. Highlighted ones match your vibes.",
    }),

    // ── Review Step ─────────────────────────────
    defineField({
      name: "reviewHeading",
      title: "Heading",
      type: "string",
      fieldset: "reviewStep",
      initialValue: "Almost there",
    }),
    defineField({
      name: "reviewDescription",
      title: "Description",
      type: "string",
      fieldset: "reviewStep",
      initialValue: "None of this is required, but it helps.",
    }),
    defineField({
      name: "reviewSavedPlacesLabel",
      title: "Saved Places Section Label",
      type: "string",
      fieldset: "reviewStep",
      initialValue: "Saved Places",
    }),
    defineField({
      name: "reviewBudgetTitle",
      title: "Budget Card Title",
      type: "string",
      fieldset: "reviewStep",
      initialValue: "Budget",
    }),
    defineField({
      name: "reviewBudgetTooltip",
      title: "Budget Tooltip",
      type: "string",
      fieldset: "reviewStep",
      initialValue: "Rough range for food and activities.",
    }),
    defineField({
      name: "reviewPaceTitle",
      title: "Pace Card Title",
      type: "string",
      fieldset: "reviewStep",
      initialValue: "Pace",
    }),
    defineField({
      name: "reviewPaceTooltip",
      title: "Pace Tooltip",
      type: "string",
      fieldset: "reviewStep",
      initialValue: "How packed should each day be?",
    }),
    defineField({
      name: "reviewGroupTitle",
      title: "Group Card Title",
      type: "string",
      fieldset: "reviewStep",
      initialValue: "Group",
    }),
    defineField({
      name: "reviewGroupTooltip",
      title: "Group Tooltip",
      type: "string",
      fieldset: "reviewStep",
      initialValue: "So we suggest the right kind of places.",
    }),
    defineField({
      name: "reviewAccessTitle",
      title: "Access Card Title",
      type: "string",
      fieldset: "reviewStep",
      initialValue: "Access",
    }),
    defineField({
      name: "reviewAccessTooltip",
      title: "Access Tooltip",
      type: "string",
      fieldset: "reviewStep",
      initialValue: "We\u2019ll filter for places that work for you.",
    }),
    defineField({
      name: "reviewDietaryLabel",
      title: "Dietary Subsection Label",
      type: "string",
      fieldset: "reviewStep",
      initialValue: "Dietary",
    }),
    defineField({
      name: "reviewNotesTitle",
      title: "Notes Card Title",
      type: "string",
      fieldset: "reviewStep",
      initialValue: "Notes",
    }),
    defineField({
      name: "reviewNotesTooltip",
      title: "Notes Tooltip",
      type: "string",
      fieldset: "reviewStep",
      initialValue: "Anything we should know: a birthday, an allergy, a must-visit spot.",
    }),
    defineField({
      name: "reviewNotesPlaceholder",
      title: "Notes Placeholder",
      type: "text",
      rows: 2,
      fieldset: "reviewStep",
      initialValue: "A birthday dinner in Kyoto, avoiding steep stairs, must-see spots...",
    }),

    // ── Generating Overlay ──────────────────────
    defineField({
      name: "generatingHeading",
      title: "Heading",
      type: "string",
      fieldset: "generatingOverlay",
      initialValue: "Building your itinerary",
    }),
    defineField({
      name: "generatingMessages",
      title: "Status Messages",
      type: "array",
      fieldset: "generatingOverlay",
      of: [{ type: "string" }],
      description: "Rotating messages shown during generation.",
      initialValue: [
        "Looking at what you picked...",
        "Working out the routes...",
        "Filling in the days...",
        "Almost done...",
      ],
    }),

    // ── Navigation Labels ───────────────────────
    defineField({
      name: "navBackLabel",
      title: "Back Button Label",
      type: "string",
      fieldset: "navigation",
      initialValue: "Back",
    }),
    defineField({
      name: "navContinueLabel",
      title: "Continue Button Label",
      type: "string",
      fieldset: "navigation",
      initialValue: "Continue",
    }),
    defineField({
      name: "navSkipLabel",
      title: "Skip Button Label",
      type: "string",
      fieldset: "navigation",
      initialValue: "Skip",
    }),
    defineField({
      name: "navStartPlanningLabel",
      title: "Start Planning Button Label",
      type: "string",
      fieldset: "navigation",
      initialValue: "Start planning",
    }),
    defineField({
      name: "navGenerateLabel",
      title: "Generate Button Label",
      type: "string",
      fieldset: "navigation",
      initialValue: "Build my itinerary",
    }),
    defineField({
      name: "navStartOverConfirmation",
      title: "Start Over Confirmation Text",
      type: "string",
      fieldset: "navigation",
      initialValue: "Start over? Everything you\u2019ve entered will be cleared.",
    }),

    // ── Billing / Free Access ───────────────────
    defineField({
      name: "freeAccessWindow",
      fieldset: "billing",
      title: "Free Access Window",
      description: "When set, all trips are fully unlocked without payment. Use for promotions or launch periods.",
      type: "object",
      fields: [
        defineField({
          name: "startDate",
          title: "Start Date",
          type: "date",
        }),
        defineField({
          name: "endDate",
          title: "End Date",
          type: "date",
        }),
      ],
    }),
  ],
  preview: {
    prepare() {
      return { title: "Trip Builder Config" };
    },
  },
});
