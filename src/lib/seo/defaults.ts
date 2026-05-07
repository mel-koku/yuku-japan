/**
 * Default social-share image for pages that don't specify their own.
 *
 * Next.js doesn't deeply-merge page-level `openGraph` with the root
 * metadata — a page's openGraph object fully replaces the parent. So
 * any page that defines its own openGraph to customize title or
 * description must also explicitly include images, or it'll ship
 * without a social preview.
 *
 * The image itself is generated at request time by
 * `src/app/opengraph-image.tsx` (a 1200×630 branded card). Resolved as
 * an absolute URL by Next via `metadataBase` (set in `app/layout.tsx`).
 *
 * Import this constant in each page's generateMetadata / metadata
 * openGraph + twitter blocks.
 */
export const DEFAULT_OG_IMAGES = [
  {
    url: "/opengraph-image",
    width: 1200,
    height: 630,
    alt: "Yuku Japan — Routed Japan itineraries, day by day",
  },
];

export const DEFAULT_TWITTER_IMAGES = ["/opengraph-image"];
