/**
 * Unit test for `pickOgPhotoUrl` — the photo-selection guard in the
 * `/places/[slug]` OpenGraph image route.
 *
 * Why this exists: the `location-photos` Supabase bucket went private
 * 2026-04-14 (Google TOS remediation), so its old public URLs 403/404.
 * Stale values still sit in `locations.image`. The OG route reads the
 * `primary_photo_url`/`image` columns raw, so it must drop dead-bucket
 * URLs itself — otherwise the share-card `<img>` fetches a dead URL.
 *
 * Bypass verification: remove the `!value.includes(DEAD_BUCKET_PREFIX)`
 * clause in `opengraph-image.tsx` and confirm the dead-bucket cases go red.
 */

import { describe, it, expect, vi } from "vitest";

// The module imports `next/og` + the Supabase server client at top level.
// Stub both so importing the pure `pickOgPhotoUrl` export resolves without
// pulling in server-only runtime.
vi.mock("next/og", () => ({ ImageResponse: class {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/seo/ogFont", () => ({ loadGoogleFontTtf: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

import { pickOgPhotoUrl } from "../opengraph-image";

const LIVE_PROXY = "/api/places/photo?photoName=abc&maxWidthPx=1600";
const DEAD_BUCKET =
  "https://x.supabase.co/storage/v1/object/public/location-photos/foo/primary.jpg";

describe("pickOgPhotoUrl", () => {
  it("returns primary_photo_url when present", () => {
    expect(pickOgPhotoUrl(LIVE_PROXY, "ignored")).toBe(LIVE_PROXY);
  });

  it("falls back to a live image column when primary is null", () => {
    expect(pickOgPhotoUrl(null, LIVE_PROXY)).toBe(LIVE_PROXY);
  });

  it("drops a dead location-photos bucket URL in the image column", () => {
    expect(pickOgPhotoUrl(null, DEAD_BUCKET)).toBeNull();
  });

  it("skips a dead-bucket primary and falls through to a live image", () => {
    expect(pickOgPhotoUrl(DEAD_BUCKET, LIVE_PROXY)).toBe(LIVE_PROXY);
  });

  it("returns null when both values are absent", () => {
    expect(pickOgPhotoUrl(null, undefined)).toBeNull();
  });
});
