import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";
import { GET } from "@/app/api/places/photo/route";
import { fetchPhotoStream } from "@/lib/googlePlaces";
import { createMockRequest, createMockPhotoStreamResponse } from "../utils/mocks";

// Mock dependencies
vi.mock("@/lib/googlePlaces", () => ({
  fetchPhotoStream: vi.fn(),
}));

vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
}));

describe("GET /api/places/photo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // mockReset clears queued *Once returns; clearAllMocks only clears history.
    // Without this, mocks queued by tests that hit the 308 path leak into later tests.
    vi.mocked(fetchPhotoStream).mockReset();
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-api-key");
  });

  describe("Rate limiting", () => {
    it("should enforce rate limit of 200 requests per minute", async () => {
      const { checkRateLimit } = await import("@/lib/api/rateLimit");
      vi.mocked(checkRateLimit).mockResolvedValueOnce(
        NextResponse.json({ error: "Too many requests", code: "RATE_LIMIT_EXCEEDED" }, {
          status: 429,
        }),
      );

      const request = createMockRequest("https://example.com/api/places/photo?photoName=places/test/photos/ref");
      const response = await GET(request);

      expect(response.status).toBe(429);
      const data = await response.json();
      expect(data.code).toBe("RATE_LIMIT_EXCEEDED");
    });
  });

  describe("Parameter validation", () => {
    it("should return 400 if photoName is missing", async () => {
      const request = createMockRequest("https://example.com/api/places/photo");
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("Missing required query parameter 'photoName'");
      expect(data.code).toBe("BAD_REQUEST");
    });

    it("should return 400 for invalid photoName format (path traversal)", async () => {
      const request = createMockRequest(
        "https://example.com/api/places/photo?photoName=places/../../../etc/passwd/photos/ref",
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("BAD_REQUEST");
    });

    it("should return 400 for invalid photoName format (special characters)", async () => {
      const request = createMockRequest(
        "https://example.com/api/places/photo?photoName=places/test/photos/ref<script>alert(1)</script>",
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe("BAD_REQUEST");
    });

    it("should accept valid photoName format", async () => {
      const mockResponse = createMockPhotoStreamResponse();
      vi.mocked(fetchPhotoStream).mockResolvedValueOnce(mockResponse);

      const request = createMockRequest(
        "https://example.com/api/places/photo?photoName=places/ChIJN1t_tDeuEmsRUsoyG83frY4/photos/test-ref",
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(fetchPhotoStream).toHaveBeenCalledWith(
        "places/ChIJN1t_tDeuEmsRUsoyG83frY4/photos/test-ref",
        { maxWidthPx: 1200 },
      );
    });
  });

  describe("Width canonicalization", () => {
    it("redirects 308 to bucketed width when requested width is non-canonical", async () => {
      const request = createMockRequest(
        "https://example.com/api/places/photo?photoName=places/test/photos/ref&maxWidthPx=2000",
      );
      const response = await GET(request);

      expect(response.status).toBe(308);
      expect(response.headers.get("Location")).toContain("maxWidthPx=1920");
      expect(fetchPhotoStream).not.toHaveBeenCalled();
    });

    it("falls back to 1200 when maxWidthPx exceeds the 4000 cap", async () => {
      const mockResponse = createMockPhotoStreamResponse();
      vi.mocked(fetchPhotoStream).mockResolvedValueOnce(mockResponse);

      const request = createMockRequest(
        "https://example.com/api/places/photo?photoName=places/test/photos/ref&maxWidthPx=5000",
      );
      const response = await GET(request);

      // parsePositiveInt returns null for out-of-range values; route falls back
      // to default 1200, which equals its bucket → canonical, no redirect.
      expect(response.status).toBe(200);
      expect(fetchPhotoStream).toHaveBeenCalledWith("places/test/photos/ref", { maxWidthPx: 1200 });
    });

    it("falls back to 1200 when maxWidthPx is below 1", async () => {
      const mockResponse = createMockPhotoStreamResponse();
      vi.mocked(fetchPhotoStream).mockResolvedValueOnce(mockResponse);

      const request = createMockRequest(
        "https://example.com/api/places/photo?photoName=places/test/photos/ref&maxWidthPx=0",
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(fetchPhotoStream).toHaveBeenCalledWith("places/test/photos/ref", { maxWidthPx: 1200 });
    });

    it("redirects 308 and strips maxHeightPx (route only honors width)", async () => {
      const request = createMockRequest(
        "https://example.com/api/places/photo?photoName=places/test/photos/ref&maxHeightPx=1500",
      );
      const response = await GET(request);

      expect(response.status).toBe(308);
      const location = response.headers.get("Location") ?? "";
      expect(location).toContain("maxWidthPx=1200");
      expect(location).not.toContain("maxHeightPx");
      expect(fetchPhotoStream).not.toHaveBeenCalled();
    });

    it("redirects 308 to canonical width when both width and height are passed", async () => {
      const request = createMockRequest(
        "https://example.com/api/places/photo?photoName=places/test/photos/ref&maxWidthPx=1600&maxHeightPx=1200",
      );
      const response = await GET(request);

      expect(response.status).toBe(308);
      const location = response.headers.get("Location") ?? "";
      expect(location).toContain("maxWidthPx=1920");
      expect(location).not.toContain("maxHeightPx");
      expect(fetchPhotoStream).not.toHaveBeenCalled();
    });
  });

  describe("Google Places API error handling", () => {
    it("should return 503 if Google Places API key is missing", async () => {
      vi.unstubAllEnvs();
      vi.stubEnv("GOOGLE_PLACES_API_KEY", "");

      vi.mocked(fetchPhotoStream).mockRejectedValueOnce(
        new Error("Missing Google Places API key"),
      );

      const request = createMockRequest(
        "https://example.com/api/places/photo?photoName=places/test/photos/ref",
      );
      const response = await GET(request);

      expect(response.status).toBe(503);
      const data = await response.json();
      expect(data.error).toContain("Google Places API is not configured");
      expect(data.code).toBe("SERVICE_UNAVAILABLE");
    });

    it("should return 500 for network errors", async () => {
      vi.mocked(fetchPhotoStream).mockRejectedValueOnce(new Error("Network error"));

      const request = createMockRequest(
        "https://example.com/api/places/photo?photoName=places/test/photos/ref",
      );
      const response = await GET(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.code).toBe("INTERNAL_ERROR");
    });

    it("should return 500 for API errors", async () => {
      vi.mocked(fetchPhotoStream).mockRejectedValueOnce(
        new Error("Failed to fetch photo. Status 404"),
      );

      const request = createMockRequest(
        "https://example.com/api/places/photo?photoName=places/test/photos/ref",
      );
      const response = await GET(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("Response caching", () => {
    it("should set appropriate cache headers", async () => {
      const mockResponse = createMockPhotoStreamResponse();
      vi.mocked(fetchPhotoStream).mockResolvedValueOnce(mockResponse);

      const request = createMockRequest(
        "https://example.com/api/places/photo?photoName=places/test/photos/ref",
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe(
        "public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=604800",
      );
    });
  });
});

