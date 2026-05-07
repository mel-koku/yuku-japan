import { ImageResponse } from "next/og";

// 1200×630 is the canonical OG image size — Facebook, LinkedIn, Slack, and
// X all crop sub-1200 images. The previous /images/fallback.jpg was 800×533
// and rendered with letterboxing on those surfaces.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Yuku Japan — Routed Japan itineraries, day by day";

async function loadCormorant(text: string) {
  const url = `https://fonts.googleapis.com/css2?family=Cormorant:wght@500;600&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url)).text();
  const resource = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
  const fontUrl = resource?.[1];
  if (!fontUrl) return null;
  const res = await fetch(fontUrl);
  if (!res.ok) return null;
  return await res.arrayBuffer();
}

export default async function OpenGraphImage() {
  const wordmark = "Yuku";
  const tagline = "Routed Japan itineraries, day by day.";
  const fontText = `${wordmark}${tagline} Japan—,.`;
  const fontData = await loadCormorant(fontText).catch(() => null);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#FAF8F5",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 88px",
          fontFamily: fontData ? "Cormorant" : "serif",
          color: "#2C2825",
        }}
      >
        {/* Top: brand mark in vermilion + label */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 16,
              background: "#E23828",
              color: "#FAF8F5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 80,
              fontWeight: 500,
              letterSpacing: "-0.03em",
              lineHeight: 1,
            }}
          >
            Y
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontFamily: "system-ui, sans-serif",
              color: "#6B6058",
            }}
          >
            Yuku Japan
          </div>
        </div>

        {/* Middle: wordmark + tagline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: 132,
              fontWeight: 500,
              letterSpacing: "-0.025em",
              lineHeight: 1.0,
            }}
          >
            {wordmark}
          </div>
          <div
            style={{
              fontSize: 44,
              fontWeight: 500,
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
              color: "#2C2825",
              maxWidth: 880,
            }}
          >
            {tagline}
          </div>
        </div>

        {/* Bottom: domain + accent rule */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 56, height: 4, background: "#E23828" }} />
          <div
            style={{
              display: "flex",
              fontSize: 22,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontFamily: "system-ui, sans-serif",
              color: "#6B6058",
            }}
          >
            yukujapan.com
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      ...(fontData
        ? {
            fonts: [
              { name: "Cormorant", data: fontData, weight: 500, style: "normal" },
            ],
          }
        : {}),
    },
  );
}
