import { describe, expect, it } from "vitest";
import imageLoader from "@/lib/imageLoader";

describe("imageLoader", () => {
  describe("editorial-photos bucket", () => {
    const base =
      "https://mbjcxrfuuczlauavashs.supabase.co/storage/v1/object/public/editorial-photos/kinkaku-ji-kyoto-abc123/1280.jpg";

    it("rewrites width to nearest pre-generated size — narrow viewport", () => {
      expect(imageLoader({ src: base, width: 200 })).toBe(
        "https://mbjcxrfuuczlauavashs.supabase.co/storage/v1/object/public/editorial-photos/kinkaku-ji-kyoto-abc123/250.jpg",
      );
    });

    it("rewrites width to nearest pre-generated size — mid viewport", () => {
      expect(imageLoader({ src: base, width: 640 })).toBe(
        "https://mbjcxrfuuczlauavashs.supabase.co/storage/v1/object/public/editorial-photos/kinkaku-ji-kyoto-abc123/960.jpg",
      );
    });

    it("matches exactly on a bucketed width without churning", () => {
      expect(imageLoader({ src: base, width: 1280 })).toBe(base);
    });

    it("caps at 1920 for oversize requests", () => {
      expect(imageLoader({ src: base, width: 3200 })).toBe(
        "https://mbjcxrfuuczlauavashs.supabase.co/storage/v1/object/public/editorial-photos/kinkaku-ji-kyoto-abc123/1920.jpg",
      );
    });

    it("preserves .png extension", () => {
      const png =
        "https://mbjcxrfuuczlauavashs.supabase.co/storage/v1/object/public/editorial-photos/loc-id/1280.png";
      expect(imageLoader({ src: png, width: 500 })).toBe(
        "https://mbjcxrfuuczlauavashs.supabase.co/storage/v1/object/public/editorial-photos/loc-id/500.png",
      );
    });

    it("preserves .webp extension", () => {
      const webp =
        "https://mbjcxrfuuczlauavashs.supabase.co/storage/v1/object/public/editorial-photos/loc-id/1280.webp";
      expect(imageLoader({ src: webp, width: 960 })).toBe(
        "https://mbjcxrfuuczlauavashs.supabase.co/storage/v1/object/public/editorial-photos/loc-id/960.webp",
      );
    });
  });

  describe("upload.wikimedia.org fallback", () => {
    it("routes raw commons URLs through /thumb/ at allowed widths", () => {
      const src =
        "https://upload.wikimedia.org/wikipedia/commons/a/b1/Kinkaku-ji_in_winter.jpg";
      expect(imageLoader({ src, width: 800 })).toBe(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/a/b1/Kinkaku-ji_in_winter.jpg/960px-Kinkaku-ji_in_winter.jpg",
      );
    });

    it("re-buckets existing /thumb/ URLs to allowed widths", () => {
      const src =
        "https://upload.wikimedia.org/wikipedia/commons/thumb/a/b1/Kinkaku-ji_in_winter.jpg/640px-Kinkaku-ji_in_winter.jpg";
      expect(imageLoader({ src, width: 800 })).toBe(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/a/b1/Kinkaku-ji_in_winter.jpg/960px-Kinkaku-ji_in_winter.jpg",
      );
    });
  });

  describe("other branches stay intact", () => {
    it("routes Sanity CDN through its own pipeline", () => {
      const src = "https://cdn.sanity.io/images/abc/def/foo.jpg";
      const out = imageLoader({ src, width: 800, quality: 80 });
      expect(out).toContain("w=800");
      expect(out).toContain("q=80");
      expect(out).toContain("auto=format");
    });

    it("falls through to /_next/image for unknown remote hosts", () => {
      const src = "https://example.com/foo.jpg";
      expect(imageLoader({ src, width: 800 })).toBe(
        "/_next/image?url=https%3A%2F%2Fexample.com%2Ffoo.jpg&w=800&q=75",
      );
    });

    it("returns /images/ static assets unchanged", () => {
      const src = "/images/hero.jpg";
      expect(imageLoader({ src, width: 800 })).toBe(src);
    });
  });
});
