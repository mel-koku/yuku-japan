/**
 * Filter option with value, label, and count
 */
export type FilterOption = {
  value: string;
  label: string;
  count: number;
};

/**
 * Tag option with additional metadata for partial loading state
 */
export type TagOption = {
  value: string;
  label: string;
  count: number;
  /**
   * Indicates if this tag count is based on partial data (still loading more locations)
   */
  isPartial?: boolean;
};

/**
 * Pre-computed filter metadata from server
 */
export type FilterMetadata = {
  cities: FilterOption[];
  categories: FilterOption[];
  regions: FilterOption[];
  prefectures: FilterOption[];
  neighborhoods?: FilterOption[];
};

/**
 * Sub-type within a category (e.g., "shrine" within "culture")
 */
export type SubType = {
  /** Unique identifier for the sub-type */
  id: string;
  /** Display label (e.g., "Shrine") */
  label: string;
  /** Regex patterns to match in location name for fallback detection */
  patterns: RegExp[];
  /** Google Places types that map to this sub-type */
  googleTypes: string[];
};

/**
 * Category hierarchy with sub-types
 */
export type CategoryHierarchy = {
  /** Category id (e.g., "culture", "food") */
  id: string;
  /** Display label (e.g., "Culture") */
  label: string;
  /** Icon name for display */
  icon: string;
  /** Sub-types within this category */
  subTypes: SubType[];
};

/**
 * Active filter for display as removable chip
 */
export type ActiveFilter = {
  /** Type of filter (e.g., "prefecture", "category", "subType") */
  type: "search" | "prefecture" | "category" | "subType" | "vibe" | "duration" | "priceLevel" | "wheelchair" | "vegetarian" | "hideClosed" | "craftType" | "experienceType" | "featured" | "city" | "jta" | "unesco" | "saved";
  /** Filter value (e.g., "Tokyo", "culture", "shrine") */
  value: string;
  /** Display label for the chip (e.g., "Tokyo", "Culture", "Shrine") */
  label: string;
};
