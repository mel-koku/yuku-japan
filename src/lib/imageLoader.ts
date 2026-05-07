/**
 * Custom Next.js image loader.
 *
 * Routes images around Vercel's /_next/image optimizer when the upstream
 * already handles resizing or the asset is small enough to serve as-is
 * (saves against the plan's monthly transformation quota):
 *   - cdn.sanity.io: served via Sanity's own ?w/?q/?auto=format pipeline
 *   - /api/places/photo: served via Google Places maxWidthPx (proxy already
 *     forwards the resize request to Google server-side)
 *   - upload.wikimedia.org: served via Wikimedia's /thumb/ CDN
 *   - /images/**: pre-sized static assets in /public, served direct
 *
 * All other sources (other remote hosts) still flow through /_next/image
 * so Vercel can optimize them.
 */
// Wikimedia's current published thumbnail widths. Requests for any other
// width return HTTP 400. Source: https://www.mediawiki.org/wiki/Common_thumbnail_sizes
const WIKIMEDIA_ALLOWED_WIDTHS = [120, 250, 330, 500, 960, 1280, 1920, 3840] as const;

function bucketWikimediaWidth(width: number): number {
  for (const w of WIKIMEDIA_ALLOWED_WIDTHS) {
    if (w >= width) return w;
  }
  return 3840;
}

export default function imageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  if (!src) return "";

  if (src.includes("cdn.sanity.io/images")) {
    const url = new URL(src);
    url.searchParams.set("w", String(width));
    url.searchParams.set("q", String(quality ?? 75));
    url.searchParams.set("auto", "format");
    return url.toString();
  }

  if (src.includes("/api/places/photo")) {
    const queryStart = src.indexOf("?");
    const path = queryStart >= 0 ? src.slice(0, queryStart) : src;
    const params = new URLSearchParams(queryStart >= 0 ? src.slice(queryStart + 1) : "");
    // Bucket responsive widths into 3 fixed sizes so srcset doesn't fragment
    // the CDN cache 6+ ways per photo. Each unique (photoName, maxWidthPx)
    // pair is a separate billable Google call on first miss.
    const bucketed = width <= 640 ? 640 : width <= 1200 ? 1200 : 1920;
    params.set("maxWidthPx", String(bucketed));
    return `${path}?${params.toString()}`;
  }

  // Wikimedia Commons: rewrite originals to /thumb/ URLs so resizing runs on
  // Wikimedia's CDN, not Vercel's. Wikimedia restricts thumbnails to a fixed
  // set of widths (anything else 400s); see Common_thumbnail_sizes on
  // mediawiki.org. We round up the requested width to the next allowed bucket.
  if (src.includes("upload.wikimedia.org/wikipedia/commons/")) {
    const bucketed = bucketWikimediaWidth(width);
    if (src.includes("/commons/thumb/")) {
      // Re-bucket existing thumb URLs so DB rows pre-built at non-allowed
      // widths still resolve.
      return src.replace(/\/(\d+)px-([^/]+)$/, `/${bucketed}px-$2`);
    }
    const match = src.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/([0-9a-f])\/([0-9a-f]{2})\/(.+)$/);
    if (!match) return src;
    const [, base, x, xx, file] = match;
    return `${base}/thumb/${x}/${xx}/${file}/${bucketed}px-${file}`;
  }

  if (src.startsWith("/images/")) {
    return src;
  }

  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality ?? 75}`;
}
