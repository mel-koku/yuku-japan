import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Location } from "@/types/location";

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Captured query inputs for assertions.
type NearbyQueryCall = {
  filters: Array<[string, ...unknown[]]>;
};

let nearbyQueryCall: NearbyQueryCall | null = null;

let mockLocationsForChildren: unknown[] = [];
let mockSubExperiences: unknown[] = [];
let mockRelationshipRows: { source: unknown[]; target: unknown[] } = {
  source: [],
  target: [],
};
let mockNearbyRows: unknown[] = [];
let mockRelatedLocationRows: unknown[] = [];

function makeLocationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "row-id",
    name: "Row",
    region: "Kansai",
    city: "Kyoto",
    prefecture: "Kyoto",
    category: "temple",
    image: "/i.jpg",
    short_description: "test",
    rating: 4.5,
    review_count: 100,
    estimated_duration: "1-2 hours",
    min_budget: 0,
    place_id: null,
    primary_photo_url: null,
    hero_attribution: null,
    coordinates: { lat: 35.0, lng: 135.78 },
    google_primary_type: null,
    google_types: null,
    business_status: null,
    price_level: null,
    accessibility_options: null,
    dietary_options: null,
    service_options: null,
    tags: null,
    name_japanese: null,
    nearest_station: null,
    payment_types: null,
    dietary_flags: null,
    insider_tip: null,
    is_featured: false,
    jta_approved: false,
    is_unesco_site: false,
    parent_id: null,
    parent_mode: null,
    ...overrides,
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    from: (table: string) => {
      if (table === "sub_experiences") {
        const thenable = Promise.resolve({ data: mockSubExperiences, error: null });
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          then: thenable.then.bind(thenable),
        };
        return chain;
      }

      if (table === "location_relationships") {
        let side: "location_id" | "related_id" = "location_id";
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: (col: string, _val: string) => {
            if (col === "location_id" || col === "related_id") side = col;
            return chain;
          },
          in: () => chain,
          then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
            const data =
              side === "location_id"
                ? mockRelationshipRows.source
                : mockRelationshipRows.target;
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          },
        };
        return chain;
      }

      if (table === "locations") {
        const filters: Array<[string, ...unknown[]]> = [];
        let isNearbyQuery = false;
        let isChildQuery = false;
        let isRelatedFetch = false;

        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: (col: string, val: unknown) => {
            filters.push(["eq", col, val]);
            if (col === "parent_id") isChildQuery = true;
            return chain;
          },
          is: (col: string, val: unknown) => {
            filters.push(["is", col, val]);
            return chain;
          },
          gte: (col: string, val: unknown) => {
            filters.push(["gte", col, val]);
            isNearbyQuery = true;
            return chain;
          },
          lte: (col: string, val: unknown) => {
            filters.push(["lte", col, val]);
            isNearbyQuery = true;
            return chain;
          },
          not: (col: string, op: string, val: unknown) => {
            filters.push(["not", col, op, val]);
            return chain;
          },
          or: (cond: string) => {
            filters.push(["or", cond]);
            return chain;
          },
          in: (col: string, ids: string[]) => {
            filters.push(["in", col, ids]);
            isRelatedFetch = true;
            return chain;
          },
          order: () => chain,
          limit: (n: number) => {
            filters.push(["limit", n]);
            const thenable = Promise.resolve(
              isNearbyQuery
                ? { data: mockNearbyRows, error: null }
                : isChildQuery
                  ? { data: mockLocationsForChildren, error: null }
                  : { data: [], error: null },
            );
            if (isNearbyQuery) nearbyQueryCall = { filters };
            return Object.assign(chain, {
              then: thenable.then.bind(thenable),
            });
          },
          then: (
            resolve: (v: unknown) => unknown,
            reject?: (e: unknown) => unknown,
          ) => {
            // related-location batch fetch (no .limit chain)
            const data = isRelatedFetch
              ? mockRelatedLocationRows
              : isChildQuery
                ? mockLocationsForChildren
                : [];
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          },
        };
        return chain;
      }

      throw new Error(`unexpected table: ${table}`);
    },
  })),
}));

import { fetchHierarchyContext, transformDbRowToSubExperience } from "../hierarchyService";
import type { SubExperienceDbRow } from "@/lib/supabase/projections";

const baseLocation: Location = {
  id: "kinkakuji-kansai-abc",
  name: "Kinkaku-ji",
  region: "Kansai",
  city: "Kyoto",
  prefecture: "Kyoto",
  category: "temple",
  image: "/i.jpg",
  coordinates: { lat: 35.0394, lng: 135.7292 },
  rating: 4.6,
  reviewCount: 50000,
  estimatedDuration: "1 hour",
};

describe("fetchHierarchyContext", () => {
  beforeEach(() => {
    nearbyQueryCall = null;
    mockLocationsForChildren = [];
    mockSubExperiences = [];
    mockRelationshipRows = { source: [], target: [] };
    mockNearbyRows = [];
    mockRelatedLocationRows = [];
  });

  it("returns empty arrays (including nearby) when location has no id", async () => {
    const ctx = await fetchHierarchyContext({ ...baseLocation, id: "" });
    expect(ctx).toEqual({
      children: [],
      subExperiences: [],
      relationships: [],
      nearby: [],
    });
    expect(nearbyQueryCall).toBeNull();
  });

  it("falls back to coord-proximity nearby when no curated cluster relationships exist", async () => {
    mockNearbyRows = [
      makeLocationRow({
        id: "ryoanji-kansai-xyz",
        name: "Ryoan-ji",
        coordinates: { lat: 35.0394, lng: 135.7350 }, // ~530m from Kinkaku-ji
      }),
      makeLocationRow({
        id: "outside-radius",
        name: "Outside Radius",
        coordinates: { lat: 35.0307, lng: 135.7137 }, // ~1.7km — outside 1km radius
      }),
    ];

    const ctx = await fetchHierarchyContext(baseLocation);

    expect(ctx.relationships).toHaveLength(0);
    // Only the row inside the haversine 1km radius should remain.
    expect(ctx.nearby.map((n) => n.id)).toEqual(["ryoanji-kansai-xyz"]);
    expect(ctx.nearby[0]?.walkMinutes).toBeGreaterThan(0);
    expect(nearbyQueryCall).not.toBeNull();
    // Bounding box pre-filter fires on the SQL.
    const filters = nearbyQueryCall!.filters.map((f) => f.join(":"));
    expect(filters.some((f) => f.startsWith("gte:coordinates->lat"))).toBe(true);
    expect(filters.some((f) => f.startsWith("lte:coordinates->lng"))).toBe(true);
  });

  it("excludes self, container parents, and own children from nearby fallback in JS", async () => {
    mockNearbyRows = [
      makeLocationRow({
        id: baseLocation.id, // self
        coordinates: { lat: 35.0394, lng: 135.7292 },
      }),
      makeLocationRow({
        id: "container-row",
        parent_mode: "container",
        coordinates: { lat: 35.0395, lng: 135.7293 },
      }),
      makeLocationRow({
        id: "child-of-self",
        parent_id: baseLocation.id,
        coordinates: { lat: 35.0396, lng: 135.7294 },
      }),
      makeLocationRow({
        id: "valid-neighbor",
        coordinates: { lat: 35.0397, lng: 135.7295 },
      }),
    ];

    const ctx = await fetchHierarchyContext(baseLocation);
    expect(ctx.nearby.map((n) => n.id)).toEqual(["valid-neighbor"]);
  });

  it("skips nearby fetch entirely when curated cluster relationships exist", async () => {
    mockRelationshipRows = {
      source: [
        {
          id: "rel-1",
          location_id: baseLocation.id,
          related_id: "ryoanji-kansai-xyz",
          relationship_type: "cluster",
          source: "curated",
          editorial_note: null,
          transit_line: null,
          walk_minutes: 8,
          sort_order: 0,
        },
      ],
      target: [],
    };
    mockRelatedLocationRows = [
      makeLocationRow({ id: "ryoanji-kansai-xyz", name: "Ryoan-ji" }),
    ];

    const ctx = await fetchHierarchyContext(baseLocation);

    expect(ctx.relationships).toHaveLength(1);
    expect(ctx.nearby).toHaveLength(0);
    // Curated path should not have hit the bbox nearby query.
    expect(nearbyQueryCall).toBeNull();
  });

  it("returns empty nearby when location lacks coordinates", async () => {
    const noCoords = { ...baseLocation, coordinates: undefined };
    const ctx = await fetchHierarchyContext(noCoords);
    expect(ctx.nearby).toEqual([]);
  });

  it("excludes the parent location from nearby results", async () => {
    const child: Location = {
      ...baseLocation,
      id: "kinkakuji-pavilion-abc",
      parentId: "kinkakuji-kansai-abc",
    };
    mockNearbyRows = [
      makeLocationRow({
        id: "kinkakuji-kansai-abc", // child's parent — must be excluded
        coordinates: { lat: 35.0394, lng: 135.7292 },
      }),
      makeLocationRow({
        id: "ryoanji-kansai-xyz",
        coordinates: { lat: 35.0394, lng: 135.7350 },
      }),
    ];

    const ctx = await fetchHierarchyContext(child);
    expect(ctx.nearby.map((n) => n.id)).toEqual(["ryoanji-kansai-xyz"]);
  });
});

describe("transformDbRowToSubExperience", () => {
  it("maps every snake_case column to its camelCase UI field", () => {
    const row: SubExperienceDbRow = {
      id: "kinkakuji-pavilion-stop",
      location_id: "kinkakuji-kansai-abc",
      name: "Golden Pavilion view",
      description: "Stand at the south edge of the pond.",
      time_estimate: 15,
      tip: "Arrive before 9 AM to skip tour groups.",
      image: "/sub/golden.jpg",
      sort_order: 2,
      sub_type: "highlight",
      time_context: "morning",
    };

    expect(transformDbRowToSubExperience(row)).toEqual({
      id: "kinkakuji-pavilion-stop",
      locationId: "kinkakuji-kansai-abc",
      name: "Golden Pavilion view",
      description: "Stand at the south edge of the pond.",
      timeEstimate: 15,
      tip: "Arrive before 9 AM to skip tour groups.",
      image: "/sub/golden.jpg",
      sortOrder: 2,
      subType: "highlight",
      timeContext: "morning",
    });
  });

  it("converts NULL nullable columns to undefined on the UI shape", () => {
    const row: SubExperienceDbRow = {
      id: "ryoanji-stone-1",
      location_id: "ryoanji-kansai-xyz",
      name: "Rock garden",
      description: "Fifteen stones; you can never see all of them at once.",
      time_estimate: null,
      tip: null,
      image: null,
      sort_order: 0,
      sub_type: "route_stop",
      time_context: null,
    };

    const ui = transformDbRowToSubExperience(row);
    expect(ui.timeEstimate).toBeUndefined();
    expect(ui.tip).toBeUndefined();
    expect(ui.image).toBeUndefined();
    expect(ui.timeContext).toBeUndefined();
    expect(ui.sortOrder).toBe(0);
    expect(ui.subType).toBe("route_stop");
  });
});
