import { defineType, defineField } from "sanity";

export const conciergePage = defineType({
  name: "conciergePage",
  title: "Concierge Page",
  type: "document",
  fieldsets: [
    { name: "hero", title: "Hero", options: { collapsible: true, collapsed: false } },
    { name: "photoBreak", title: "Photo Break", options: { collapsible: true, collapsed: true } },
    { name: "includes", title: "What's Included", options: { collapsible: true, collapsed: true } },
    { name: "faq", title: "FAQ", options: { collapsible: true, collapsed: true } },
    { name: "form", title: "Inquiry Form", options: { collapsible: true, collapsed: true } },
  ],
  fields: [
    // ── Hero ──────────────────────────────────────
    defineField({
      name: "heroEyebrow",
      title: "Eyebrow",
      type: "string",
      fieldset: "hero",
      initialValue: "Yuku Concierge",
    }),
    defineField({
      name: "heroHeading",
      title: "Heading",
      type: "string",
      fieldset: "hero",
      initialValue: "Your trip to Japan, handled end to end.",
    }),
    defineField({
      name: "heroBody",
      title: "Body",
      type: "text",
      rows: 3,
      fieldset: "hero",
      initialValue:
        "The app plans the route. Our team plans the rest, down to the ryokan room, the train seat, and the phone call in Japanese when something needs sorting.",
    }),
    defineField({
      name: "heroCtaText",
      title: "Primary CTA Text",
      type: "string",
      fieldset: "hero",
      initialValue: "Start my inquiry",
    }),
    defineField({
      name: "heroMeta",
      title: "Meta (below CTA)",
      type: "string",
      fieldset: "hero",
      initialValue: "We typically reply within 2 business days.",
    }),

    // ── Photo Break ───────────────────────────────
    defineField({
      name: "photoBreakImage",
      title: "Full-width Photo",
      type: "image",
      fieldset: "photoBreak",
      options: { hotspot: true },
      description: "Cinematic full-bleed image between hero and intro. 21:9 or 16:9 recommended.",
    }),
    defineField({
      name: "photoBreakAlt",
      title: "Alt Text",
      type: "string",
      fieldset: "photoBreak",
      initialValue: "A quiet scene in Japan",
    }),
    defineField({
      name: "photoBreakCaption",
      title: "Optional Caption",
      type: "string",
      fieldset: "photoBreak",
      description: "Short line rendered below the image in small mono. Leave blank to hide.",
    }),

    // ── Includes ──────────────────────────────────
    defineField({
      name: "includesEyebrow",
      title: "Eyebrow",
      type: "string",
      fieldset: "includes",
      initialValue: "What’s Included",
    }),
    defineField({
      name: "includesHeading",
      title: "Heading",
      type: "string",
      fieldset: "includes",
      initialValue: "Built for travelers who want the trip, not the logistics.",
    }),
    defineField({
      name: "includesLead",
      title: "Lead Paragraph",
      type: "text",
      rows: 4,
      fieldset: "includes",
      description: "Short paragraph rendered between the heading and the 6-item grid.",
      initialValue:
        "We call the ryokan in Hakone when there’s a typhoon rolling in. We hold the table at a counter kaiseki that doesn’t take email. You bring the dates and the group. We handle the rest.",
    }),
    defineField({
      name: "includesItems",
      title: "Items",
      type: "array",
      fieldset: "includes",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "number", title: "Number", type: "string", validation: (r) => r.required() }),
            defineField({ name: "title", title: "Title", type: "string", validation: (r) => r.required() }),
            defineField({ name: "body", title: "Body", type: "text", rows: 3, validation: (r) => r.required() }),
          ],
          preview: { select: { title: "title", subtitle: "number" } },
        },
      ],
      initialValue: [
        {
          _type: "object",
          number: "01",
          title: "Full Yuku app access",
          body: "Trip Pass included. Use it to preview your itinerary before you leave, and for maps, timings, and transit while you travel.",
        },
        {
          _type: "object",
          number: "02",
          title: "Bespoke itinerary design",
          body: "Every day hand-built around your pace, interests, and group. Real transit times, tested alternates, and the small details that make a day land.",
        },
        {
          _type: "object",
          number: "03",
          title: "Japanese-native coordinator",
          body: "A coordinator on the ground in Japan, fluent in the language, the seasons, and the people. The difference between “we tried” and “done.”",
        },
        {
          _type: "object",
          number: "04",
          title: "Reservation bookings",
          body: "Ryokan, kaiseki, sushi counters, teamLab, reserved shinkansen seats, local experiences. We book, you arrive.",
        },
        {
          _type: "object",
          number: "05",
          title: "Priority support during your trip",
          body: "Daily check-ins and rapid responses while you travel. Weather shifts, missed trains, last-minute reservation changes. We pick up.",
        },
        {
          _type: "object",
          number: "06",
          title: "Direct line to the Yuku team",
          body: "Real humans you can email, message, or call. No ticketing queue, no help-desk scripts. The same people who designed your trip.",
        },
      ],
    }),

    // ── FAQ ───────────────────────────────────────
    defineField({
      name: "faqEyebrow",
      title: "Eyebrow",
      type: "string",
      fieldset: "faq",
      initialValue: "Questions",
    }),
    defineField({
      name: "faqHeading",
      title: "Heading",
      type: "string",
      fieldset: "faq",
      initialValue: "A few things people ask first.",
    }),
    defineField({
      name: "faqItems",
      title: "Items",
      type: "array",
      fieldset: "faq",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "question", title: "Question", type: "string", validation: (r) => r.required() }),
            defineField({ name: "answer", title: "Answer", type: "text", rows: 4, validation: (r) => r.required() }),
          ],
          preview: { select: { title: "question" } },
        },
      ],
      initialValue: [
        {
          _type: "object",
          question: "Who is this for?",
          answer:
            "Travelers who’d rather invest their time in the trip than in the planning. Couples, families, and small groups heading to Japan who want a thoughtful, coordinated experience without piecing it together themselves.",
        },
        {
          _type: "object",
          question: "How is this different from the Yuku app?",
          answer:
            "The app is self-serve: you build your own itinerary with our routing and tips. Concierge is hands-on: we build the itinerary, make the bookings, and stay on call while you travel. Both get you to a great trip. One puts the planning on you, one puts it on us.",
        },
        {
          _type: "object",
          question: "What if I’ve already started planning?",
          answer:
            "Even better. We can pick up from whatever you have (a rough list, a few anchor reservations, or a full draft) and finish the rest. Bring what you’ve got when you reach out.",
        },
        {
          _type: "object",
          question: "When should I reach out?",
          answer:
            "Ideally 3+ months before you travel, especially for peak seasons (cherry blossom, autumn foliage, Golden Week). We can work with shorter timelines, but early reach-outs unlock more of the places worth going.",
        },
        {
          _type: "object",
          question: "What does it cost?",
          answer:
            "It depends on the trip: length, party size, pace, and what you want us to arrange. We’ll share pricing once we understand what you’re looking for.",
        },
      ],
    }),

    // ── Form ──────────────────────────────────────
    defineField({
      name: "formHeading",
      title: "Heading",
      type: "string",
      fieldset: "form",
      initialValue: "Reach out. We’d love to hear from you.",
    }),
    defineField({
      name: "formBody",
      title: "Body",
      type: "string",
      fieldset: "form",
      initialValue: "Leave your name and email. We’ll be in touch within 2 business days.",
    }),
    defineField({
      name: "formMessageLabel",
      title: "Message Field Label",
      type: "string",
      fieldset: "form",
      initialValue: "Anything you'd like us to know?",
    }),
    defineField({
      name: "formMessagePlaceholder",
      title: "Message Field Placeholder",
      type: "string",
      fieldset: "form",
      initialValue:
        "Trip dates, group size, interests — whatever helps us help you.",
    }),
    defineField({
      name: "formCtaText",
      title: "Submit Button Text",
      type: "string",
      fieldset: "form",
      initialValue: "Send my info",
    }),
    defineField({
      name: "formFinePrint",
      title: "Fine Print (below button)",
      type: "string",
      fieldset: "form",
      initialValue: "Read by a human. Replied to by the same team who’ll plan your trip.",
    }),
    defineField({
      name: "formSuccessHeading",
      title: "Success State Heading",
      type: "string",
      fieldset: "form",
      initialValue: "Thanks. We’ll be in touch.",
    }),
    defineField({
      name: "formSuccessBody",
      title: "Success State Body",
      type: "string",
      fieldset: "form",
      initialValue:
        "We read every inquiry personally and typically reply within 2 business days.",
    }),
  ],
  preview: {
    prepare() {
      return { title: "Concierge Page" };
    },
  },
});
