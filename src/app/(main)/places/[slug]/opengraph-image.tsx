import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { loadGoogleFontTtf } from "@/lib/seo/ogFont";
import { logger } from "@/lib/logger";

export const alt = "Yuku Japan place";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = { params: Promise<{ slug: string }> };

const WORDMARK = "Yuku Japan";
const FALLBACK_TITLE = "Discover Japan with Local Experts";

const BRAND_VERMILION = "#E23828";
const WASHI_BG = "#FAF8F5";

type PlaceShape = {
  name: string;
  city: string | null;
  category: string | null;
  photoUrl: string | null;
  nameJapanese: string | null;
};

const PLACE_OG_COLUMNS = "name, name_japanese, city, category, primary_photo_url, image";

// The `location-photos` Supabase Storage bucket was made private 2026-04-14 for
// Google TOS remediation — its old public URLs now 403/404. Stale values still
// sit in many rows' `image` column. The visible card routes them through
// `resizePhotoUrl` (google/transformations.ts), which strips this same prefix;
// this OG path reads the columns raw, so it must drop them itself or the
// share-card `<img>` fetches a dead URL. Falling through to null yields the
// branded fallback card instead.
const DEAD_BUCKET_PREFIX = "/storage/v1/object/public/location-photos/";

/** Returns the first usable photo URL, skipping dead-bucket values. */
export function pickOgPhotoUrl(
  primaryPhotoUrl: unknown,
  image: unknown,
): string | null {
  for (const value of [primaryPhotoUrl, image]) {
    if (typeof value === "string" && !value.includes(DEAD_BUCKET_PREFIX)) {
      return value;
    }
  }
  return null;
}

function placeShapeFromRow(row: Record<string, unknown>): PlaceShape {
  const photo = pickOgPhotoUrl(row.primary_photo_url, row.image);
  return {
    name: typeof row.name === "string" ? row.name : FALLBACK_TITLE,
    city: typeof row.city === "string" ? row.city : null,
    category: typeof row.category === "string" ? row.category : null,
    photoUrl: photo,
    nameJapanese: typeof row.name_japanese === "string" ? row.name_japanese : null,
  };
}

async function loadPlace(param: string): Promise<PlaceShape | null> {
  try {
    const supabase = await createClient();

    // Slug-first lookup, mirroring the page route. `.eq()` escapes its value
    // (PostgREST treats it as a literal) — unlike `.or()`, whose raw filter
    // string would let a crafted path segment inject predicates.
    const bySlug = await supabase
      .from("locations")
      .select(PLACE_OG_COLUMNS)
      .eq("slug", param)
      .eq("is_active", true)
      .maybeSingle();
    if (!bySlug.error && bySlug.data) {
      return placeShapeFromRow(bySlug.data as Record<string, unknown>);
    }

    // Slug miss → fall back to the old `id` PK so stale-id URLs still render a
    // real image (the page route, not this OG image, owns the canonical
    // redirect). Separate `.eq()` query — value-escaped, same as above.
    const byId = await supabase
      .from("locations")
      .select(PLACE_OG_COLUMNS)
      .eq("id", param)
      .eq("is_active", true)
      .maybeSingle();
    if (!byId.error && byId.data) {
      return placeShapeFromRow(byId.data as Record<string, unknown>);
    }

    return null;
  } catch (error) {
    logger.warn("og-image: place fetch failed", {
      param,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function formatCategory(raw: string | null): string | null {
  if (!raw) return null;
  return raw
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function titleFontSize(title: string): number {
  if (title.length <= 28) return 96;
  if (title.length <= 48) return 76;
  if (title.length <= 72) return 60;
  return 48;
}

export default async function PlaceOpengraphImage({ params }: Props) {
  const { slug } = await params;
  const place = await loadPlace(slug);

  const title = place?.name ?? FALLBACK_TITLE;
  const city = place?.city ?? null;
  const eyebrow = formatCategory(place?.category ?? null) ?? WORDMARK;
  const photoUrl = place?.photoUrl ?? null;

  const glyphs = `${title}${city ?? ""}${place?.nameJapanese ?? ""}${WORDMARK}${eyebrow}`;
  const fontData = await loadGoogleFontTtf({
    family: "Cormorant",
    weight: 600,
    text: glyphs,
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: BRAND_VERMILION,
          fontFamily: fontData ? "Cormorant" : "serif",
        }}
      >
        {photoUrl ? (
           
          <img
            src={photoUrl}
            alt=""
            width={1200}
            height={630}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : null}

        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "linear-gradient(180deg, rgba(44,40,37,0.25) 0%, rgba(44,40,37,0.55) 55%, rgba(44,40,37,0.90) 100%)",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            padding: "72px 80px",
            color: WASHI_BG,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                fontFamily: fontData ? "Cormorant" : "serif",
                fontSize: 28,
                letterSpacing: "0.24em",
                textTransform: "uppercase",
                opacity: 0.92,
              }}
            >
              {WORDMARK}
            </div>
            {eyebrow !== WORDMARK ? (
              <div
                style={{
                  display: "flex",
                  padding: "10px 22px",
                  borderRadius: 999,
                  border: `1px solid ${WASHI_BG}`,
                  fontSize: 22,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  fontFamily: "sans-serif",
                  opacity: 0.95,
                }}
              >
                {eyebrow}
              </div>
            ) : null}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 18,
              maxWidth: 1040,
            }}
          >
            <div
              style={{
                display: "flex",
                width: 72,
                height: 3,
                backgroundColor: BRAND_VERMILION,
              }}
            />
            <div
              style={{
                fontFamily: fontData ? "Cormorant" : "serif",
                fontSize: titleFontSize(title),
                fontWeight: 600,
                lineHeight: 1.04,
                letterSpacing: "-0.01em",
                color: WASHI_BG,
                display: "flex",
              }}
            >
              {title}
            </div>
            {city ? (
              <div
                style={{
                  fontFamily: "sans-serif",
                  fontSize: 28,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  opacity: 0.88,
                  display: "flex",
                }}
              >
                {city}
              </div>
            ) : null}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 16,
            height: "100%",
            backgroundColor: BRAND_VERMILION,
            display: "flex",
          }}
        />
      </div>
    ),
    {
      ...size,
      fonts: fontData
        ? [
            {
              name: "Cormorant",
              data: fontData,
              style: "normal",
              weight: 600,
            },
          ]
        : undefined,
    },
  );
}
