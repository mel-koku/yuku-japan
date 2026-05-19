import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock IntersectionObserver for jsdom (used by Framer Motion's useInView)
class MockIntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = "0px";
  readonly thresholds: ReadonlyArray<number> = [0];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn().mockReturnValue([]);
}
globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

// Mock ResizeObserver for jsdom (used by Radix UI components)
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Mock window.matchMedia for jsdom (used by Framer Motion and responsive components)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock Element.hasPointerCapture for jsdom (used by Radix UI Select)
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = vi.fn();
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = vi.fn();
}

// Mock scrollIntoView for jsdom (used by Radix UI)
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// Set default environment variables for tests
process.env.GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "test-api-key";
process.env.GOOGLE_VERTEX_PROJECT = process.env.GOOGLE_VERTEX_PROJECT || "test-project";

// Mock Next.js headers
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
  draftMode: vi.fn().mockResolvedValue({
    enable: vi.fn(),
    disable: vi.fn(),
    isEnabled: false,
  }),
}));

// Mock Next.js cache functions
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  // unstable_cache: identity wrapper so cached fns run directly in tests
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

// Mock Next.js server (NextRequest, NextResponse)
vi.mock("next/server", async () => {
  const actual = await vi.importActual("next/server");
  return {
    ...actual,
    NextRequest: class NextRequest extends Request {
      nextUrl: URL;
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        let url: URL;
        if (typeof input === "string") {
          url = new URL(input);
        } else if (input instanceof URL) {
          url = input;
        } else {
          url = new URL(input.url);
        }
        super(input, init);
        this.nextUrl = url;
        // Make nextUrl.searchParams accessible
        Object.defineProperty(this.nextUrl, "searchParams", {
          value: url.searchParams,
          writable: false,
          enumerable: true,
          configurable: false,
        });
      }
    },
  };
});

// Stub server-only so modules guarded with `import "server-only"` are testable.
vi.mock("server-only", () => ({}));

// Mock logger to prevent stderr output in tests
vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock the at-the-door cost gate so route tests don't fail closed against
// the missing Upstash Redis (the gate's correct production behavior on
// Redis errors is to refuse the request, which would surface as 429 in
// every plan/refine/nearby-food test). Tests that want to
// exercise the gate itself can vi.mock it locally.
vi.mock("@/lib/api/costGate", () => ({
  gateOnDailyCost: vi.fn().mockResolvedValue(null),
  COST_ESTIMATES: {},
}));

