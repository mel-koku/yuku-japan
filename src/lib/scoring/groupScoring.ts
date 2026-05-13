import type { Location } from "@/types/location";

/**
 * Group type preferences for different location categories
 */
const GROUP_PREFERENCES: Record<
  "solo" | "couple" | "family" | "friends" | "business",
  {
    preferred: string[];
    avoided: string[];
  }
> = {
  solo: {
    preferred: ["museum", "shrine", "temple", "viewpoint", "park"],
    avoided: ["bar", "entertainment"], // Less social activities
  },
  couple: {
    preferred: ["restaurant", "park", "garden", "viewpoint", "shrine"],
    avoided: [],
  },
  family: {
    preferred: ["park", "museum", "garden", "entertainment", "shrine"],
    avoided: ["bar"],
  },
  friends: {
    preferred: ["restaurant", "bar", "entertainment", "shopping", "market"],
    avoided: [],
  },
  business: {
    preferred: ["restaurant", "landmark", "museum"],
    avoided: ["bar", "entertainment"], // More professional activities
  },
};

/**
 * Score adjustment based on group size
 * Larger groups may prefer activities that accommodate more people
 * Uses location.goodForGroups from Google Places data when available
 */
function scoreGroupSizeFit(
  location: Location,
  groupSize: number,
): { scoreAdjustment: number; reasoning: string } {
  if (groupSize <= 1) {
    return { scoreAdjustment: 0, reasoning: "Solo traveler - no group size adjustment" };
  }

  // Use Google Places goodForGroups data if available
  if (location.goodForGroups !== undefined) {
    if (groupSize >= 4) {
      // Medium to large groups care more about this flag
      if (location.goodForGroups) {
        return {
          scoreAdjustment: 6,
          reasoning: `"${location.name}" is marked as good for groups (${groupSize} people)`,
        };
      } else {
        return {
          scoreAdjustment: -4,
          reasoning: `"${location.name}" may not accommodate groups well (${groupSize} people)`,
        };
      }
    } else if (groupSize >= 2) {
      // Smaller groups get smaller adjustments
      if (location.goodForGroups) {
        return {
          scoreAdjustment: 2,
          reasoning: `"${location.name}" is good for groups`,
        };
      }
    }
  }

  // Fall back to category heuristics if no goodForGroups data
  const category = location.category?.toLowerCase() ?? "";

  // Activities that work well for larger groups
  const largeGroupFriendly = ["restaurant", "park", "market", "shopping", "entertainment"];
  // Activities that may be challenging for large groups
  const smallGroupPreferred = ["shrine", "temple", "museum"];

  if (groupSize >= 6) {
    // Large group (6+)
    if (largeGroupFriendly.includes(category)) {
      return {
        scoreAdjustment: 5,
        reasoning: `${category} is well-suited for large groups (${groupSize} people)`,
      };
    }
    if (smallGroupPreferred.includes(category)) {
      return {
        scoreAdjustment: -3,
        reasoning: `${category} may be challenging for large groups (${groupSize} people)`,
      };
    }
  } else if (groupSize >= 4) {
    // Medium group (4-5)
    if (largeGroupFriendly.includes(category)) {
      return {
        scoreAdjustment: 2,
        reasoning: `${category} works well for medium groups (${groupSize} people)`,
      };
    }
  }

  return {
    scoreAdjustment: 0,
    reasoning: `Group size (${groupSize}) is suitable for ${category}`,
  };
}

/**
 * Score adjustment based on group type
 */
function scoreGroupTypeFit(
  location: Location,
  groupType: "solo" | "couple" | "family" | "friends" | "business",
): { scoreAdjustment: number; reasoning: string } {
  const category = location.category?.toLowerCase() ?? "";
  const preferences = GROUP_PREFERENCES[groupType];

  if (preferences.preferred.includes(category)) {
    return {
      scoreAdjustment: 6,
      reasoning: `${category} is ideal for ${groupType} travelers`,
    };
  }

  if (preferences.avoided.includes(category)) {
    return {
      scoreAdjustment: -4,
      reasoning: `${category} may not be ideal for ${groupType} travelers`,
    };
  }

  return {
    scoreAdjustment: 0,
    reasoning: `${category} is suitable for ${groupType} travelers`,
  };
}

/**
 * Score adjustment based on children ages (if applicable)
 * Uses location.goodForChildren from Google Places data when available
 */
function scoreChildrenFit(
  location: Location,
  childrenAges: number[],
): { scoreAdjustment: number; reasoning: string } {
  if (childrenAges.length === 0) {
    return { scoreAdjustment: 0, reasoning: "No children in group" };
  }

  const category = location.category?.toLowerCase() ?? "";
  const avgAge = childrenAges.reduce((sum, age) => sum + age, 0) / childrenAges.length;
  const hasYoungChildren = avgAge < 8;
  const hasTeenagers = avgAge >= 13;

  // Use Google Places goodForChildren data if available
  if (location.goodForChildren !== undefined) {
    if (location.goodForChildren) {
      // Stronger bonus for young children
      const bonus = hasYoungChildren ? 10 : hasTeenagers ? 4 : 6;
      return {
        scoreAdjustment: bonus,
        reasoning: `"${location.name}" is marked as good for children (avg age ${avgAge.toFixed(1)})`,
      };
    } else {
      // Penalty is stronger for young children
      const penalty = hasYoungChildren ? -8 : hasTeenagers ? -2 : -4;
      return {
        scoreAdjustment: penalty,
        reasoning: `"${location.name}" may not be suitable for children (avg age ${avgAge.toFixed(1)})`,
      };
    }
  }

  // Fall back to category heuristics if no goodForChildren data
  // Activities good for children
  const childFriendly = ["park", "garden", "museum", "entertainment"];
  // Activities that may be less engaging for young children
  const adultFocused = ["shrine", "temple", "bar"];

  if (hasYoungChildren) {
    if (childFriendly.includes(category)) {
      return {
        scoreAdjustment: 8,
        reasoning: `${category} is excellent for young children (avg age ${avgAge.toFixed(1)})`,
      };
    }
    if (adultFocused.includes(category)) {
      return {
        scoreAdjustment: -5,
        reasoning: `${category} may not be engaging for young children (avg age ${avgAge.toFixed(1)})`,
      };
    }
  } else if (hasTeenagers) {
    // Teenagers can handle more variety
    if (childFriendly.includes(category)) {
      return {
        scoreAdjustment: 3,
        reasoning: `${category} is suitable for teenagers (avg age ${avgAge.toFixed(1)})`,
      };
    }
  }

  return {
    scoreAdjustment: 0,
    reasoning: `${category} is appropriate for children (avg age ${avgAge.toFixed(1)})`,
  };
}

/**
 * Score group fit for a location
 * Returns a score adjustment (-5 to +10) based on group composition
 */
export function scoreGroupFit(
  location: Location,
  group?: {
    size?: number;
    type?: "solo" | "couple" | "family" | "friends" | "business";
    childrenAges?: number[];
  },
): { scoreAdjustment: number; reasoning: string } {
  if (!group) {
    return { scoreAdjustment: 0, reasoning: "No group information provided" };
  }

  const adjustments: Array<{ scoreAdjustment: number; reasoning: string }> = [];
  const reasons: string[] = [];

  // Score by group size
  if (group.size !== undefined && group.size > 0) {
    const sizeResult = scoreGroupSizeFit(location, group.size);
    adjustments.push(sizeResult);
    reasons.push(sizeResult.reasoning);
  }

  // Score by group type
  if (group.type) {
    const typeResult = scoreGroupTypeFit(location, group.type);
    adjustments.push(typeResult);
    reasons.push(typeResult.reasoning);
  }

  // Score by children ages
  if (group.childrenAges && group.childrenAges.length > 0) {
    const childrenResult = scoreChildrenFit(location, group.childrenAges);
    adjustments.push(childrenResult);
    reasons.push(childrenResult.reasoning);
  }

  // Combine adjustments (cap at reasonable range)
  const totalAdjustment = adjustments.reduce((sum, adj) => sum + adj.scoreAdjustment, 0);
  const cappedAdjustment = Math.max(-5, Math.min(10, totalAdjustment));

  return {
    scoreAdjustment: cappedAdjustment,
    reasoning: reasons.length > 0 ? reasons.join("; ") : "No group-specific adjustments",
  };
}

