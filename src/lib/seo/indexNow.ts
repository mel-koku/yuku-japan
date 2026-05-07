import { logger } from "@/lib/logger";

// IndexNow lets Bing, Yandex, Seznam, Naver (and Cloudflare-fronted Google)
// recrawl a URL within minutes instead of waiting for their natural cadence.
// One ping reaches the whole IndexNow consortium — see https://www.indexnow.org/
//
// The "key" is not a secret. It's an ownership proof: the same value lives
// in `public/<key>.txt` so a search engine can verify the caller controls
// the domain by fetching `https://yukujapan.com/<key>.txt` and matching.
const INDEXNOW_KEY = "286a3c1d11ade25aff3074e60cd614e6";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://yukujapan.com").replace(/\/+$/, "");

function getHost(): string {
  try {
    return new URL(BASE_URL).host;
  } catch {
    return "yukujapan.com";
  }
}

/**
 * Notify IndexNow that the given URLs have changed.
 *
 * Fire-and-forget by design — webhook responses must not block on this.
 * Failures are logged but never thrown; the worst-case fallback is that
 * search engines recrawl on their own schedule.
 *
 * @param paths - Site-relative paths (e.g. ["/guides/foo", "/guides"]).
 *                Resolved against `NEXT_PUBLIC_SITE_URL` to form absolute URLs.
 */
export async function submitToIndexNow(paths: string[]): Promise<void> {
  if (paths.length === 0) return;

  // Skip on non-prod hosts. Vercel previews / local dev would tell IndexNow
  // about URLs that don't index in the first place (per-host noindex header).
  const host = getHost();
  if (host !== "yukujapan.com" && host !== "www.yukujapan.com") {
    return;
  }

  const urlList = paths.map((p) => `${BASE_URL}${p.startsWith("/") ? p : `/${p}`}`);

  const body = {
    host,
    key: INDEXNOW_KEY,
    keyLocation: `${BASE_URL}/${INDEXNOW_KEY}.txt`,
    urlList,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // 200/202 = accepted. 422 = key validation failed (URL not in domain).
    // Don't log success at info level — webhooks fire often.
    if (!res.ok && res.status !== 202) {
      logger.warn("IndexNow rejected submission", {
        status: res.status,
        urlCount: urlList.length,
      });
    }
  } catch (err) {
    // Includes AbortError on timeout — non-fatal.
    logger.warn("IndexNow submission failed", {
      error: err instanceof Error ? err.message : String(err),
      urlCount: urlList.length,
    });
  }
}
