import { useQuery } from "@tanstack/react-query";
import type { Location } from "@/types/location";

export function useSimilarLocationsQuery(locationId: string | undefined) {
  return useQuery<Location[]>({
    queryKey: ["similar-locations", locationId],
    queryFn: async () => {
      if (!locationId) return [];
      const res = await fetch(`/api/locations/similar?id=${locationId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!locationId,
    staleTime: 1000 * 60 * 60, // 1 hour (embeddings don't change often)
  });
}
