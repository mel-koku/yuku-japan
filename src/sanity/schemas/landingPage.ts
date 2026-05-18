import { defineType, defineField } from "sanity";

export const landingPage = defineType({
  name: "landingPage",
  title: "Landing Page",
  type: "document",
  fieldsets: [
    { name: "hero", title: "Hero Section", options: { collapsible: true } },
    { name: "philosophy", title: "Philosophy Section", options: { collapsible: true } },
    { name: "showcase", title: "Showcase Section", options: { collapsible: true } },
    { name: "featuredLocations", title: "Featured Locations Section", options: { collapsible: true } },
    { name: "featuredExperiences", title: "Featured Experiences Section", options: { collapsible: true } },
    { name: "testimonials", title: "Feature Showcase Section", options: { collapsible: true } },
    { name: "featuredGuides", title: "Featured Guides Section", options: { collapsible: true } },
    { name: "seasonalSpotlight", title: "Seasonal Spotlight Section", options: { collapsible: true } },
    { name: "finalCta", title: "Final CTA Section", options: { collapsible: true } },
  ],
  fields: [
    // ── Hero ──────────────────────────────────────
    defineField({
      name: "heroHeadline",
      title: "Headline",
      type: "string",
      fieldset: "hero",
      description:
        "Main editorial statement (max ~60 chars). e.g. 'Travel Japan like the people who live here'",
      initialValue: "Travel Japan like the people who live here",
    }),
    defineField({
      name: "heroTagline",
      title: "Tagline",
      type: "string",
      fieldset: "hero",
      initialValue: "Beyond the Japan guidebook",
    }),
    defineField({
      name: "heroDescription",
      title: "Description",
      type: "text",
      rows: 2,
      fieldset: "hero",
      initialValue: "Days planned around how you actually travel. {locationCount}+ places we'd stake our name on.",
      description: "Use {locationCount} as a placeholder for the dynamic count",
    }),
    defineField({
      name: "heroPrimaryCtaText",
      title: "Primary CTA Text",
      type: "string",
      fieldset: "hero",
      initialValue: "Build my trip",
    }),
    defineField({
      name: "heroSecondaryCtaText",
      title: "Secondary CTA Text",
      type: "string",
      fieldset: "hero",
      initialValue: "Start Browsing",
    }),
    defineField({
      name: "heroImage",
      title: "Hero Background Image",
      type: "image",
      options: { hotspot: true },
      fieldset: "hero",
      description:
        "Full-viewport background (100dvh). Preferred ratio: 16:9 landscape or wider. Min width 1920px. Use hotspot to keep the subject in frame on mobile (9:16 crop).",
    }),

    // ── Philosophy ───────────────────────────────
    defineField({
      name: "philosophyEyebrow",
      title: "Eyebrow Text",
      type: "string",
      fieldset: "philosophy",
    }),
    defineField({
      name: "philosophyHeading",
      title: "Heading",
      type: "string",
      fieldset: "philosophy",
      initialValue: "Curated for how you actually travel",
    }),
    defineField({
      name: "philosophyImage",
      title: "Background Image",
      type: "image",
      options: { hotspot: true },
      fieldset: "philosophy",
      description:
        "Reserved for future use — not currently rendered. Preferred ratio: 16:9 landscape. Min width 1920px.",
    }),
    defineField({
      name: "philosophyStats",
      title: "Stats",
      type: "array",
      fieldset: "philosophy",
      of: [
        {
          type: "object",
          name: "stat",
          title: "Stat",
          fields: [
            defineField({
              name: "value",
              title: "Value",
              type: "string",
              description: "e.g. '47', '100%'. Use {locationCount} for dynamic count.",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "suffix",
              title: "Suffix",
              type: "string",
              description: "e.g. '+' after the number",
            }),
            defineField({
              name: "label",
              title: "Label",
              type: "string",
              description: "e.g. 'Places', 'Prefectures', 'Local'",
              validation: (rule) => rule.required(),
            }),
          ],
          preview: {
            select: { value: "value", suffix: "suffix", label: "label" },
            prepare({ value, suffix, label }) {
              return { title: `${value}${suffix || ""} ${label}` };
            },
          },
        },
      ],
      validation: (rule) => rule.max(4),
    }),

    // ── Showcase ─────────────────────────────────
    defineField({
      name: "showcaseActs",
      title: "Showcase Acts",
      type: "array",
      fieldset: "showcase",
      of: [
        {
          type: "object",
          name: "showcaseAct",
          title: "Act",
          fields: [
            defineField({
              name: "number",
              title: "Number",
              type: "string",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "eyebrow",
              title: "Eyebrow",
              type: "string",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "title",
              title: "Title",
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
              name: "image",
              title: "Image",
              type: "image",
              options: { hotspot: true },
              description:
                "Acts 1 & 2: displayed at 4:3 (e.g. 1200×900px). Act 3 (the full-width cinematic act): displayed at 16:7 on large screens — upload at least 1600×700px. A 4:3 shot works for all three; use hotspot to keep the subject centred.",
            }),
            defineField({
              name: "alt",
              title: "Image Alt Text",
              type: "string",
            }),
          ],
          preview: {
            select: { number: "number", eyebrow: "eyebrow", title: "title" },
            prepare({ number, eyebrow, title }) {
              return { title: `${number} — ${eyebrow}`, subtitle: title };
            },
          },
        },
      ],
      validation: (rule) => rule.length(3),
    }),

    defineField({
      name: "testimonialBackgroundImage",
      title: "Feature Showcase Image",
      type: "image",
      options: { hotspot: true },
      fieldset: "testimonials",
      description:
        "Background image behind the 'Every day, routed and timed' feature showcase. Preferred ratio: 16:9 landscape. Min width 1920px. Used when no real testimonials are configured.",
    }),

    // ── Featured Locations ───────────────────────
    defineField({
      name: "featuredLocationsEyebrow",
      title: "Eyebrow",
      type: "string",
      fieldset: "featuredLocations",
      initialValue: "Editor's Picks",
    }),
    defineField({
      name: "featuredLocationsHeading",
      title: "Heading",
      type: "string",
      fieldset: "featuredLocations",
      initialValue: "Places that stay with you",
    }),
    defineField({
      name: "featuredLocationsDescription",
      title: "Description",
      type: "text",
      rows: 2,
      fieldset: "featuredLocations",
      initialValue:
        "Backstreet temples. Neighborhood staples. Places worth the detour.",
    }),

    defineField({
      name: "featuredLocationsCtaText",
      title: "CTA Button Text",
      type: "string",
      fieldset: "featuredLocations",
      initialValue: "Explore all",
    }),

    // ── Featured Experiences ────────────────────────
    defineField({
      name: "featuredExperiencesEyebrow",
      title: "Eyebrow",
      type: "string",
      fieldset: "featuredExperiences",
      initialValue: "Experiences",
    }),
    defineField({
      name: "featuredExperiencesHeading",
      title: "Heading",
      type: "string",
      fieldset: "featuredExperiences",
      initialValue: "Go beyond sightseeing",
    }),
    defineField({
      name: "featuredExperiencesDescription",
      title: "Description",
      type: "text",
      rows: 2,
      fieldset: "featuredExperiences",
      initialValue:
        "Workshops, cruises, and adventures that connect you with the culture, not just the scenery.",
    }),

    defineField({
      name: "featuredExperiencesCtaText",
      title: "CTA Button Text",
      type: "string",
      fieldset: "featuredExperiences",
      initialValue: "Explore experiences",
    }),

    // ── Testimonials ─────────────────────────────
    defineField({
      name: "testimonials",
      title: "Testimonials",
      type: "array",
      fieldset: "testimonials",
      of: [
        {
          type: "object",
          name: "testimonial",
          title: "Testimonial",
          fields: [
            defineField({
              name: "quote",
              title: "Quote",
              type: "text",
              rows: 3,
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "authorName",
              title: "Author Name",
              type: "string",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "authorLocation",
              title: "Author Location",
              type: "string",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "image",
              title: "Image",
              type: "image",
              options: { hotspot: true },
              description:
                "Used as a full-bleed background for the featured (first) testimonial. Preferred ratio: 16:9 landscape. Min width 1920px. Use hotspot to anchor the key subject. Subsequent testimonials don't show their image.",
            }),
            defineField({
              name: "alt",
              title: "Image Alt Text",
              type: "string",
            }),
          ],
          preview: {
            select: { author: "authorName", location: "authorLocation" },
            prepare({ author, location }) {
              return { title: author, subtitle: location };
            },
          },
        },
      ],
      validation: (rule) => rule.min(1).max(15),
    }),

    // ── Featured Guides ──────────────────────────
    defineField({
      name: "featuredGuidesEyebrow",
      title: "Eyebrow",
      type: "string",
      fieldset: "featuredGuides",
      initialValue: "Travel Guides",
    }),
    defineField({
      name: "featuredGuidesHeading",
      title: "Heading",
      type: "string",
      fieldset: "featuredGuides",
      initialValue: "Start reading",
    }),
    defineField({
      name: "featuredGuidesDescription",
      title: "Description",
      type: "text",
      rows: 2,
      fieldset: "featuredGuides",
      initialValue:
        "Local insights, seasonal tips, and curated itineraries to help you plan a trip that goes beyond the surface.",
    }),

    defineField({
      name: "featuredGuidesCtaText",
      title: "CTA Button Text",
      type: "string",
      fieldset: "featuredGuides",
      initialValue: "Read all guides",
    }),

    // ── Final CTA ────────────────────────────────
    defineField({
      name: "finalCtaHeading",
      title: "Heading",
      type: "string",
      fieldset: "finalCta",
      initialValue: "Your Japan is waiting",
    }),
    defineField({
      name: "finalCtaDescription",
      title: "Description",
      type: "string",
      fieldset: "finalCta",
      initialValue: "Tell us your dates. We'll build the days, route the trains, and find the right places along the way.",
    }),
    defineField({
      name: "finalCtaPrimaryText",
      title: "Primary CTA Text",
      type: "string",
      fieldset: "finalCta",
      initialValue: "Build my trip",
    }),
    defineField({
      name: "finalCtaSecondaryText",
      title: "Secondary CTA Text",
      type: "string",
      fieldset: "finalCta",
      initialValue: "See what\u2019s out there",
    }),
    defineField({
      name: "finalCtaSubtext",
      title: "Subtext",
      type: "string",
      fieldset: "finalCta",
      initialValue: "Free to use. No account required.",
    }),
    defineField({
      name: "finalCtaImage",
      title: "Background Image",
      type: "image",
      options: { hotspot: true },
      fieldset: "finalCta",
      description:
        "Reserved for future use — not currently rendered (section uses a solid charcoal background). Preferred ratio: 16:9 landscape. Min width 1920px.",
    }),

    // ── Seasonal Spotlight ─────────────────────────
    // Per-season heading fields below are only rendered when no
    // SeasonalHighlight is active (see src/lib/utils/seasonUtils.ts).
    // When a highlight is firing — e.g. "Late-Blooming Sakura" from Apr 21
    // through May 12 — the catalog label wins so the homepage stays
    // date-honest. Treat these fields as the off-window fallback / kill
    // switch, not the always-on copy.
    defineField({
      name: "seasonalSpotlightEyebrow",
      title: "Eyebrow",
      type: "string",
      fieldset: "seasonalSpotlight",
      initialValue: "What's in season",
    }),
    defineField({
      name: "seasonalSpotlightSpringHeading",
      title: "Spring Heading",
      type: "string",
      fieldset: "seasonalSpotlight",
      initialValue: "Cherry blossoms and fresh starts",
    }),
    defineField({
      name: "seasonalSpotlightSummerHeading",
      title: "Summer Heading",
      type: "string",
      fieldset: "seasonalSpotlight",
      initialValue: "Festivals, fireworks, and cool escapes",
    }),
    defineField({
      name: "seasonalSpotlightAutumnHeading",
      title: "Autumn Heading",
      type: "string",
      fieldset: "seasonalSpotlight",
      initialValue: "Koyo colors at their peak",
    }),
    defineField({
      name: "seasonalSpotlightWinterHeading",
      title: "Winter Heading",
      type: "string",
      fieldset: "seasonalSpotlight",
      initialValue: "Hot springs and illuminations",
    }),
    defineField({
      name: "seasonalSpotlightDescription",
      title: "Description",
      type: "text",
      rows: 2,
      fieldset: "seasonalSpotlight",
      initialValue: "Places, guides, and experiences at their best right now.",
    }),
    defineField({
      name: "seasonalSpotlightCtaText",
      title: "CTA Text",
      type: "string",
      fieldset: "seasonalSpotlight",
      initialValue: "See all seasonal picks",
    }),
  ],
  preview: {
    prepare() {
      return { title: "Landing Page" };
    },
  },
});
