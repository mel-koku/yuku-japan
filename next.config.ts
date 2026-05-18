import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const localPatterns = [
  {
    pathname: "/api/places/photo",
  },
  {
    pathname: "/images/**",
  },
];

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

const remotePatterns: Array<{
  protocol: "http" | "https";
  hostname: string;
  pathname?: string;
  port?: string;
}> = [
  {
    protocol: "https",
    hostname: "images.pexels.com",
  },
  {
    protocol: "https",
    hostname: "cdn.pixabay.com",
  },
  {
    protocol: "https",
    hostname: "cdn.sanity.io",
  },
  {
    protocol: "https",
    hostname: "mbjcxrfuuczlauavashs.supabase.co",
    pathname: "/storage/v1/object/public/**",
  },
  {
    protocol: "https",
    hostname: "api.dicebear.com",
  },
  {
    protocol: "https",
    hostname: "upload.wikimedia.org",
    pathname: "/wikipedia/commons/**",
  },
];

if (siteUrl) {
  try {
    const { protocol, hostname, port } = new URL(siteUrl);
    const protocolValue = protocol.replace(":", "") as "http" | "https";
    const pattern: {
      protocol: "http" | "https";
      hostname: string;
      pathname?: string;
      port?: string;
    } = {
      protocol: protocolValue,
      hostname,
      pathname: "/api/places/photo",
    };
    if (port) {
      pattern.port = port;
    }
    remotePatterns.push(pattern);
  } catch {
    // ignore invalid NEXT_PUBLIC_SITE_URL
  }
}

// Security headers configuration
const isProduction = process.env.NODE_ENV === "production";

// Canonical production host — only this host (and its www variant) are
// allowed to be indexed. All other hosts (Vercel previews, staging,
// localhost) get X-Robots-Tag: noindex.
const productionHost = (() => {
  try {
    return siteUrl ? new URL(siteUrl).host : "yukujapan.com";
  } catch {
    return "yukujapan.com";
  }
})();

// Strip a leading "www." so the regex below can pair the apex with its
// www variant. Without this, apex and www point at the same content but
// only one of them indexes.
const productionApex = productionHost.replace(/^www\./, "");

// CSP directives - Next.js requires 'unsafe-inline' for hydration scripts
// In production, Next.js uses nonce-based CSP automatically, but we still need 'unsafe-inline' as fallback
// Consider using 'strict-dynamic' with nonces in the future for better security
const scriptSrc = isProduction
  ? ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://vercel.live", "https://va.vercel-scripts.com", "https://*.googletagmanager.com"] // Production: allow inline for Next.js hydration + unpkg.com for Leaflet + Vercel + GA4
  : ["'self'", "'unsafe-eval'", "'unsafe-inline'", "https://unpkg.com", "https://vercel.live", "https://*.googletagmanager.com"]; // Development: allow for Next.js hot reload + unpkg.com + GA4

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Chrome (2019) and Edge (2018) removed their XSS auditors; Firefox
    // never shipped one. Keeping the header set to `1; mode=block` still
    // enables a known info-disclosure side channel in Safari and older
    // Edge ("Silent Block"). OWASP's current guidance is to send `0`
    // explicitly and rely on CSP instead. See:
    // https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html#x-xss-protection
    key: "X-XSS-Protection",
    value: "0",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    // feature=() blocks the feature everywhere, including the top-level
    // document. feature=(self) allows the top-level document but blocks
    // cross-origin iframes. feature=() is appropriate only for features
    // the app genuinely doesn't use.
    //
    // Yuku uses: geolocation (Near Me), clipboard (share buttons —
    // default-allowed, no need to set), fullscreen (Mapbox — default-
    // allowed). Everything else is safe to lock down explicitly as
    // defense-in-depth.
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=(self)",
      "payment=()",
      "usb=()",
      "bluetooth=()",
      "midi=()",
      "magnetometer=()",
      "gyroscope=()",
      "accelerometer=()",
      "autoplay=()",
      "picture-in-picture=()",
      "sync-xhr=()",
      "interest-cohort=()",
      "browsing-topics=()",
    ].join(", "),
  },
  {
    key: "X-Permitted-Cross-Domain-Policies",
    value: "none",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src ${scriptSrc.join(" ")}`, // Allow inline scripts for Next.js hydration
      "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com", // Allow Google Fonts stylesheets + Tailwind CSS inline styles
      "img-src 'self' data: https: blob:",
      "font-src 'self' data: https://fonts.gstatic.com", // Allow Google Fonts
      "connect-src 'self' https://*.supabase.co https://*.googleapis.com https://api.mapbox.com https://*.tiles.mapbox.com https://events.mapbox.com https://*.sanity.io https://*.apicdn.sanity.io https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://www.google.com",
      "worker-src 'self' blob:", // Allow Mapbox GL JS Web Workers
      "frame-src 'self' https://*.sanity.io",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "upgrade-insecure-requests",
      "report-uri /api/csp-report",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Strip the X-Powered-By: Next.js fingerprint from responses. Harmless
  // on its own but removes a free hint for attackers scanning for
  // framework-specific vulnerabilities.
  poweredByHeader: false,
  images: {
    localPatterns,
    remotePatterns,
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 604800, // 7 days — location/guide images are static
    // Sanity CDN images are routed through Sanity's own transformation pipeline
    // by the custom loader. Non-Sanity images continue through /_next/image.
    loaderFile: "./src/lib/imageLoader.ts",
    // Skip image optimization proxy in dev — avoids timeout cascade when
    // Turbopack compilation blocks the event loop for 10-30s
    unoptimized: !isProduction,
  },
  async redirects() {
    return [
      {
        source: "/explore",
        destination: "/places",
        permanent: true,
      },
      {
        source: "/explore/:path*",
        destination: "/places/:path*",
        permanent: true,
      },
      {
        source: "/favorites",
        destination: "/saved",
        permanent: true,
      },
      {
        source: "/blog",
        destination: "/guides?type=blog",
        permanent: true,
      },
      {
        source: "/blog/:slug",
        destination: "/guides/:slug",
        permanent: true,
      },
      {
        source: "/b/blog",
        destination: "/b/guides?type=blog",
        permanent: true,
      },
      {
        source: "/b/blog/:slug",
        destination: "/b/guides/:slug",
        permanent: true,
      },
      // Guide slug renamed to drop the inaccurate `chugoku-` region prefix —
      // the guide spans the Seto Inland Sea (Kagawa/Shikoku + Okayama/Chugoku),
      // so no single region prefix fits. Old URL kept alive for SEO/inbound links.
      {
        source: "/guides/chugoku-setouchi-art-islands",
        destination: "/guides/setouchi-art-islands-beyond-naoshima",
        permanent: true,
      },
    ];
  },
  async headers() {
    // Sanity Studio requires 'unsafe-eval' for script execution
    const studioScriptSrc = ["'self'", "'unsafe-eval'", "'unsafe-inline'", "https://unpkg.com", "https://vercel.live", "https://va.vercel-scripts.com"];
    const studioHeaders = securityHeaders.map((header) => {
      if (header.key === "Content-Security-Policy") {
        return {
          ...header,
          value: header.value
            .replace(`script-src ${scriptSrc.join(" ")}`, `script-src ${studioScriptSrc.join(" ")}`)
            .replace("frame-ancestors 'self'", "frame-ancestors 'self' https://*.sanity.io"),
        };
      }
      return header;
    });

    return [
      {
        // Block indexing on every host that isn't the canonical production host.
        // Covers Vercel preview URLs, staging subdomains, and local dev.
        source: "/:path*",
        has: [
          {
            type: "host",
            value: `(?!(?:www\\.)?${productionApex.replace(/\./g, "\\.")}$).*`,
          },
        ],
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow",
          },
        ],
      },
      {
        source: "/studio/:path*",
        headers: studioHeaders,
      },
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  // Turbopack configuration (empty - using defaults)
  turbopack: {},
  // Note: Request body size limits are enforced in API route handlers
  // Next.js 16 App Router doesn't support the old api.bodyParser.sizeLimit config
  // Use checkBodySizeLimit() or readBodyWithSizeLimit() from @/lib/api/bodySizeLimit
  // Default limit is 1MB, but individual routes can set stricter limits
};

// Compose config wrappers: bundle analyzer -> sentry
const configWithAnalyzer = withBundleAnalyzer(nextConfig);

export default withSentryConfig(configWithAnalyzer, {
  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  org: "yuku-japan",
  project: "yuku-japan",

  // Only upload source maps in production
  silent: process.env.NODE_ENV !== "production",

  // Configure source maps settings
  sourcemaps: {
    // Hides source maps from generated client bundles
    deleteSourcemapsAfterUpload: true,
  },

  // Webpack-specific options (not supported with Turbopack)
  webpack: {
    // Automatically tree-shake Sentry logger statements
    treeshake: {
      removeDebugLogging: true,
    },
    // Automatically instrument Next.js data fetching methods
    automaticVercelMonitors: true,
  },
});
