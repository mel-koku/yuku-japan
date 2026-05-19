"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type RefObject,
} from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, m } from "framer-motion";
import { durationFast, durationSlow, easeReveal, easePageTransitionMut } from "@/lib/motion";
import { typography } from "@/lib/typography-system";
import { cn } from "@/lib/cn";
import { useAppState } from "@/state/AppState";
import type { Itinerary, ItineraryActivity, ItineraryDay } from "@/types/itinerary";
import type { Location } from "@/types/location";
import type { EntryPoint, KnownRegionId, TripBuilderData } from "@/types/trip";
import type { GeneratedGuide, GeneratedBriefings } from "@/types/llmConstraints";
import type { CulturalBriefing } from "@/types/culturalBriefing";
import { DaySelector } from "./DaySelector";

import { DayRefinementButtons } from "./DayRefinementButtons";
import { ChapterList } from "@/components/features/itinerary/chapter/ChapterList";
import { toChapterDays } from "@/lib/itinerary/toChapterDays";
import { resolveEffectiveDayEntryPoints } from "@/lib/itinerary/accommodationDefaults";
import { formatCityName } from "@/lib/itinerary/dayLabel";
import { useActivityLocations } from "@/hooks/useActivityLocations";

import { ItineraryMapPanel } from "./ItineraryMapPanel";
import { parseLocalDate } from "@/lib/utils/dateUtils";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ActivityReplacementPicker } from "./ActivityReplacementPicker";
import type { DetectedGap } from "@/lib/smartPrompts/gapDetection";
import { detectItineraryConflicts } from "@/lib/validation/itineraryConflicts";
import type { AcceptGapResult, PreviewState, RefinementFilters } from "@/hooks/useSmartPromptActions";
import { calculateTripHealth, getHealthLevel } from "@/lib/itinerary/tripHealth";
import { useItineraryPlanning } from "./hooks/useItineraryPlanning";
import { useItineraryScrollSync } from "./hooks/useItineraryScrollSync";
import { shouldShowGoshuin } from "./GoshuinBanner";
import { hasApplicablePrepItems } from "./PrepBanner";
import { DisasterBanner } from "./DisasterBanner";
import { EarthquakeAlertSlot } from "./EarthquakeAlertSlot";
import { useActivityRatings } from "@/hooks/useActivityRatings";
import { ActivityRatingsProvider } from "./ActivityRatingsContext";
import { PrintHeader } from "./PrintHeader";
import { PrintFooter } from "./PrintFooter";
import { REGIONS, getWeatherRegion, getRegionForCity } from "@/data/regions";
import { shouldShowDisasterBanner } from "@/lib/trip/disasterOverlay";
import { shouldShowAccessibilityBanner } from "@/lib/trip/accessibilityOverlay";
import { useItineraryDiscover } from "./hooks/useItineraryDiscover";
import { useReplacementState } from "@/hooks/useReplacementState";
import { useDayTripActions } from "@/hooks/useDayTripActions";
import { useHeaderCollapse } from "@/hooks/useHeaderCollapse";
import { ContextualUnlockPrompt, type UnlockPromptContext } from "./ContextualUnlockPrompt";
import { type ItineraryViewMode } from "./itineraryTabs";
import { isDayAccessible, getTripTier, getTierPriceDollars } from "@/lib/billing/access";
import type { AdvisoryEntry } from "@/components/features/itinerary/chapter/TripAdvisoriesTray";
import { TripAdvisoriesDrawer } from "@/components/features/itinerary/chapter/TripAdvisoriesDrawer";
import { UnlockBeat } from "@/components/features/itinerary/chapter/UnlockBeat";
import { TripBar } from "@/components/features/itinerary/chapter/TripBar";
import { NearMeDrawer } from "@/components/features/itinerary/chapter/NearMeDrawer";
import { PrepDrawer } from "@/components/features/itinerary/chapter/PrepDrawer";
import { TripOverviewDrawer } from "@/components/features/itinerary/chapter/TripOverviewDrawer";
import { BeforeYouLandDrawer } from "@/components/features/itinerary/chapter/BeforeYouLandDrawer";
import { AddPlaceDialog } from "@/components/features/itinerary/chapter/AddPlaceDialog";
import { trackCustomLocationAdded } from "@/lib/analytics/customLocations";
import {
  getDismissedAdvisoriesLocal,
  dismissAdvisoryLocal,
} from "@/services/tripAdvisoriesService";
import { useFocusDay } from "@/lib/itinerary/useFocusDay";
import type { AdvisoryKey } from "@/types/tripAdvisories";
import { getTripStatus } from "@/lib/trip/tripStatus";

const DiscoverMap = dynamic(
  () => import("@/components/features/discover/DiscoverMap").then((m) => ({ default: m.DiscoverMap })),
  { ssr: false },
);

const LocationExpanded = dynamic(
  () => import("@/components/features/places/LocationExpanded").then((m) => ({ default: m.LocationExpanded })),
  { ssr: false },
);

type ItineraryShellProps = {
  tripId: string;
  itinerary: Itinerary;
  onItineraryChange?: (next: Itinerary) => void;
  headingRef?: RefObject<HTMLHeadingElement>;
  createdLabel: string | null;
  updatedLabel: string | null;
  isUsingMock: boolean;
  isReadOnly?: boolean;
  tripStartDate?: string; // ISO date string (yyyy-mm-dd)
  tripBuilderData?: TripBuilderData;
  dayIntros?: Record<string, string>;
  guideProse?: GeneratedGuide;
  dailyBriefings?: GeneratedBriefings;
  culturalBriefing?: CulturalBriefing;
  // Smart suggestions (all days)
  suggestions?: DetectedGap[];
  onAcceptSuggestion?: (gap: DetectedGap) => Promise<AcceptGapResult>;
  onSkipSuggestion?: (gap: DetectedGap) => void;
  loadingSuggestionId?: string | null;
  // Preview props
  previewState?: PreviewState | null;
  onConfirmPreview?: () => void;
  onShowAnother?: () => Promise<void>;
  onCancelPreview?: () => void;
  onFilterChange?: (filter: Partial<RefinementFilters>) => void;
  isPreviewLoading?: boolean;
  dayTripSuggestions?: import("@/types/dayTrips").DayTripSuggestion[];
  onUnlockClick?: () => void;
  tripUnlocked?: boolean;
  isGuest?: boolean;
  launchPricing?: boolean;
};

export const ItineraryShell = ({
  itinerary,
  tripId,
  onItineraryChange,
  headingRef,
  createdLabel: _createdLabel,
  updatedLabel: _updatedLabel,
  isUsingMock,
  isReadOnly,
  tripStartDate,
  tripBuilderData,
  dayIntros,
  guideProse,
  dailyBriefings,
  culturalBriefing,
  suggestions,
  onAcceptSuggestion: _onAcceptSuggestion,
  onSkipSuggestion: _onSkipSuggestion,
  loadingSuggestionId: _loadingSuggestionId,
  previewState: _previewState,
  onConfirmPreview: _onConfirmPreview,
  onShowAnother: _onShowAnother,
  onCancelPreview: _onCancelPreview,
  onFilterChange: _onFilterChange,
  isPreviewLoading: _isPreviewLoading,
  dayTripSuggestions,
  onUnlockClick,
  tripUnlocked,
  isGuest: _isGuest,
  launchPricing,
}: ItineraryShellProps) => {
  const { user, reorderActivities, replaceActivity, addActivity, updateDayActivities, getTripById, dayEntryPoints, cityAccommodations, setDayEntryPoint, setCityAccommodation, undo, redo, canUndo, canRedo, deleteActivity } = useAppState();

  // Planning hook — model state, travel-time replanning, route optimization
  const {
    model,
    setModelState,
    isPlanning,
    planningError,
    setPlanningError,
    applyModelUpdate,
    scheduleUserPlanning,
    scheduleUserPlanningRef,
  } = useItineraryPlanning({
    itinerary,
    tripBuilderData,
    dayEntryPoints,
    cityAccommodations,
    tripId,
    onItineraryChange,
  });

  const [selectedDay, setSelectedDay] = useState(0);
  // When the user clicks "Add a spot" on a meal slot, this carries the slot's
  // meal type into the dialog so the new activity gets annotated as breakfast/
  // lunch/dinner (drives planner ordering + suppresses the meal-gap detector
  // from firing again on the same day).
  const [pendingMealContext, setPendingMealContext] = useState<
    "breakfast" | "lunch" | "dinner" | null
  >(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  // viewMode is kept as-is (always "timeline") to avoid refactoring downstream conditionals
  // around mobile map / header collapse. Setter is retained but unused after v1 removal.
  const [viewMode] = useState<ItineraryViewMode>("timeline");
  const [cultureTabSeen, setCultureTabSeen] = useState(() => {
    if (typeof window === "undefined") return true;
    // localStorage.getItem throws in iOS Safari Private mode.
    try {
      return localStorage.getItem("yuku-culture-tab-seen") === "true";
    } catch {
      return true;
    }
  });

  const internalHeadingRef = useRef<HTMLHeadingElement>(null);
  const finalHeadingRef = headingRef ?? internalHeadingRef;

  const headerCollapsed = useHeaderCollapse(viewMode);

  const currentTrip = useMemo(() => {
    return tripId && !isUsingMock ? getTripById(tripId) : null;
  }, [tripId, isUsingMock, getTripById]);

  // Guard: the AppState `user` is always present (seeded as a Guest profile),
  // so `!!user` was a true-no-op. Authentication is signalled by the user's
  // email being set after Supabase sign-in. Without this, guests would see
  // every day unlocked during the promo.
  const isAuthenticated = Boolean(user?.email);
  const isFreePromoActive = process.env.NEXT_PUBLIC_FREE_FULL_ACCESS === "true";
  // Read-only mode covers shared-trip viewers (`/shared/{token}`): the token
  // is the access grant, so the viewer's auth state is irrelevant. Without
  // this, post-bug-fix shared-link guests would see Days 2-N locked.
  const fullAccessEnabled = !!isReadOnly || (isAuthenticated && isFreePromoActive);
  const isTripLocked = !(tripUnlocked ?? false) && !fullAccessEnabled;
  const isFreePromoUnlock = !isReadOnly && isAuthenticated && isFreePromoActive && !(tripUnlocked ?? false);
  // When the promo is on but the visitor isn't signed in, the unlock CTAs
  // should drive them to log in (free) rather than to checkout. Shared-trip
  // viewers never see unlock CTAs (read-only path is fully unlocked above).
  const showLoginToUnlock = !isReadOnly && !isAuthenticated && isFreePromoActive;
  const [unlockPromptCtx, setUnlockPromptCtx] = useState<UnlockPromptContext | null>(null);

  const [overviewDrawerOpen, setOverviewDrawerOpen] = useState(false);
  const [beforeYouLandOpen, setBeforeYouLandOpen] = useState(false);
  const [advisoriesDrawerOpen, setAdvisoriesDrawerOpen] = useState(false);
  const [prepDrawerOpen, setPrepDrawerOpen] = useState(false);
  const [nearMeDrawerOpen, setNearMeDrawerOpen] = useState(false);
  const [addPlaceDialogOpen, setAddPlaceDialogOpen] = useState(false);

  // All place activities across all days (flattened) — batch location fetch for ChapterList
  const allPlaceActivities = useMemo(() => {
    return model.days.flatMap((day) =>
      day.activities.filter(
        (a): a is Extract<typeof a, { kind: "place" }> => a.kind === "place",
      ),
    );
  }, [model.days]);

  const { locationsMap: activityIdToLocation } = useActivityLocations(allPlaceActivities);

  // Convert activity-id-keyed map to location-id-keyed map for toChapterDays
  const locationsById = useMemo(() => {
    const out = new Map<string, Location>();
    for (const loc of activityIdToLocation.values()) {
      if (loc) out.set(loc.id, loc);
    }
    return out;
  }, [activityIdToLocation]);

  // Resolve start/end EntryPoints for every day (priority: per-day override →
  // city accommodation → airport on Day 1 / city center). Drives both the
  // per-day routing picker and the new timeline anchors. Cleared sides return
  // undefined so the X-clear is honored visually.
  const resolvedDayEntryPoints = useMemo(() => {
    if (!tripId) return {};
    return resolveEffectiveDayEntryPoints(
      model,
      tripId,
      dayEntryPoints,
      cityAccommodations,
      tripBuilderData?.entryPoint,
    );
  }, [model, tripId, dayEntryPoints, cityAccommodations, tripBuilderData?.entryPoint]);

  const chapterDays = useMemo(() => {
    return toChapterDays(
      model,
      guideProse,
      locationsById,
      tripStartDate,
      // Server-set `day.isLocked` takes precedence over the client gate.
      // Without this, the post-signin claim window (where fullAccessEnabled
      // flips to true before the rehydrate fetch returns) would render an
      // empty Day 2-N — the activities are still `[]` from the guest-side
      // redaction. Treat the server flag as authoritative until rehydrate
      // ships fresh data.
      (dayIdx) =>
        isDayAccessible(dayIdx, tripUnlocked ?? false, fullAccessEnabled)
        && !model.days[dayIdx]?.isLocked,
      dayIntros,
      resolvedDayEntryPoints,
    );
  }, [model, guideProse, locationsById, tripStartDate, tripUnlocked, fullAccessEnabled, dayIntros, resolvedDayEntryPoints]);

  // Phase 3 day-of affordance — resolves today's focus day from chapterDays dates.
  // Returns {index: 0, isDayOfMode: false} when chapterDays is empty (flag off).
  const focusDayState = useFocusDay(chapterDays);

  const [dismissedAdvisories, setDismissedAdvisories] = useState<Set<AdvisoryKey>>(
    () => (typeof window !== "undefined"
      ? getDismissedAdvisoriesLocal(currentTrip?.id ?? "")
      : new Set()),
  );

  const handleDismissAdvisory = useCallback(
    (key: AdvisoryKey) => {
      if (!currentTrip?.id) return;
      dismissAdvisoryLocal(currentTrip.id, key);
      setDismissedAdvisories((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    },
    [currentTrip?.id],
  );

  const requireUnlock = useCallback(
    (ctx: UnlockPromptContext): boolean => {
      if (!isTripLocked) return false;
      setUnlockPromptCtx(ctx);
      return true;
    },
    [isTripLocked],
  );

  const {
    replacementActivityId,
    setReplacementActivityId,
    replacementCandidates,
    setReplacementCandidates,
    expandedLocation,
    isLoadingReplacements,
    handleReplace,
    handleReplaceSelect,
    handleViewDetails,
    handleCloseExpanded,
  } = useReplacementState({
    tripId,
    isUsingMock,
    currentTrip,
    model,
    selectedDay,
    replaceActivity,
    setModelState,
    scheduleUserPlanningRef,
  });

  const handleReorder = useCallback(
    (dayId: string, activityIds: string[]) => {
      if (isReadOnly) return;
      if (tripId && !isUsingMock) {
        reorderActivities(tripId, dayId, activityIds);
      }
    },
    [tripId, isUsingMock, isReadOnly, reorderActivities],
  );

  // beatId === activity.id per the toChapterDays adapter
  // Build a lookup from activity id -> day index so we can gate locked days.
  const beatIdToDayIndex = useMemo(() => {
    const out = new Map<string, number>();
    model.days.forEach((day, dayIdx) => {
      day.activities.forEach((a) => {
        out.set(a.id, dayIdx);
      });
    });
    return out;
  }, [model.days]);

  const handleExpandBeat = useCallback(
    (beatId: string) => {
      const dayIdx = beatIdToDayIndex.get(beatId) ?? 0;
      if (!isDayAccessible(dayIdx, tripUnlocked ?? false, fullAccessEnabled)) {
        requireUnlock("locked_day");
        return;
      }
      const loc = activityIdToLocation.get(beatId);
      if (loc) handleViewDetails(loc);
    },
    [beatIdToDayIndex, activityIdToLocation, handleViewDetails, tripUnlocked, fullAccessEnabled, requireUnlock],
  );

  useEffect(() => {
    if (finalHeadingRef.current) {
      finalHeadingRef.current.focus();
    }
  }, [finalHeadingRef]);

  // Mark culture tab as seen on first visit
  useEffect(() => {
    if (viewMode === "culture" && !cultureTabSeen) {
      setCultureTabSeen(true);
      try {
        localStorage.setItem("yuku-culture-tab-seen", "true");
      } catch {
        // iOS Safari Private mode / quota exceeded — state-only update is fine
      }
    }
  }, [viewMode, cultureTabSeen]);

  // Keyboard shortcuts for undo/redo (Cmd+Z / Cmd+Shift+Z / Cmd+Y)
  useEffect(() => {
    if (!tripId || isUsingMock || isReadOnly) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      const isCmd = e.metaKey || e.ctrlKey;
      if (!isCmd) return;

      if (e.key === "z" && !e.shiftKey) {
        if (canUndo(tripId)) { e.preventDefault(); undo(tripId); }
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        if (canRedo(tripId)) { e.preventDefault(); redo(tripId); }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tripId, isUsingMock, isReadOnly, undo, redo, canUndo, canRedo]);

  const days = model.days ?? [];
  const safeSelectedDay =
    days.length === 0 ? 0 : Math.min(selectedDay, Math.max(days.length - 1, 0));
  const currentDay = days[safeSelectedDay];
  const currentDayEntryPoints =
    tripId && currentDay?.id ? dayEntryPoints[`${tripId}-${currentDay.id}`] : undefined;

  // Resolve start/end locations for the current day
  const resolvedStartLocation = useMemo(() => {
    if (!tripId || !currentDay) return undefined;
    // Priority 1: Explicit per-day start
    const dayEP = dayEntryPoints[`${tripId}-${currentDay.id}`];
    if (dayEP?.startPoint?.type === "accommodation") return dayEP.startPoint;
    // Explicit clear on this day suppresses the city-level fallback
    if (dayEP?.clearedStart) return undefined;
    // Partial per-day override (KOK-31): if the user set the OTHER side
    // explicitly, treat the missing side as "no anchor" rather than silently
    // falling back to the city accommodation. Keeps this resolver aligned with
    // resolveEffectiveDayEntryPoints so map and route calc agree.
    if (dayEP?.endPoint) return undefined;
    // Priority 2: City-level accommodation
    const effectiveCityId = currentDay.baseCityId ?? currentDay.cityId;
    if (effectiveCityId) {
      const cityAccom = cityAccommodations[`${tripId}-${effectiveCityId}`];
      if (cityAccom) return cityAccom.entryPoint;
    }
    return undefined;
  }, [tripId, currentDay, dayEntryPoints, cityAccommodations]);

  const resolvedEndLocation = useMemo(() => {
    if (!tripId || !currentDay) return undefined;
    // Priority 1: Explicit per-day end
    const dayEP = dayEntryPoints[`${tripId}-${currentDay.id}`];
    if (dayEP?.endPoint?.type === "accommodation") return dayEP.endPoint;
    // Explicit clear on this day suppresses the city-level fallback
    if (dayEP?.clearedEnd) return undefined;
    // Partial per-day override (KOK-31): if the user set the OTHER side
    // explicitly, treat the missing side as "no anchor" rather than silently
    // falling back to the city accommodation. Keeps this resolver aligned with
    // resolveEffectiveDayEntryPoints so map and route calc agree.
    if (dayEP?.startPoint) return undefined;
    // Priority 2: City-level accommodation (same as start)
    const effectiveCityId = currentDay.baseCityId ?? currentDay.cityId;
    if (effectiveCityId) {
      const cityAccom = cityAccommodations[`${tripId}-${effectiveCityId}`];
      if (cityAccom) return cityAccom.entryPoint;
    }
    return undefined;
  }, [tripId, currentDay, dayEntryPoints, cityAccommodations]);

  // Effective map entry points — merge explicit overrides with resolved locations
  const effectiveMapStartPoint = currentDayEntryPoints?.startPoint ?? resolvedStartLocation;
  // End defaults to same as start when not explicitly set
  const effectiveMapEndPoint = currentDayEntryPoints?.endPoint ?? resolvedEndLocation ?? resolvedStartLocation;

  // Handler: set start location for this day
  const handleStartLocationChange = useCallback(
    (location: EntryPoint | undefined) => {
      if (isReadOnly) return;
      if (!tripId || !currentDay?.id) return;
      setDayEntryPoint(tripId, currentDay.id, "start", location);
      // If end isn't explicitly set, it defaults to same as start (via resolution logic)
    },
    [tripId, currentDay, setDayEntryPoint, isReadOnly],
  );

  // Handler: set end location for this day
  const handleEndLocationChange = useCallback(
    (location: EntryPoint | undefined) => {
      if (isReadOnly) return;
      if (!tripId || !currentDay?.id) return;
      setDayEntryPoint(tripId, currentDay.id, "end", location);
    },
    [tripId, currentDay, setDayEntryPoint, isReadOnly],
  );

  // Handler: set accommodation for all days in this city
  const handleCityAccommodationChange = useCallback(
    (location: EntryPoint | undefined) => {
      if (isReadOnly) return;
      if (!tripId || !currentDay) return;
      const effectiveCityId = currentDay.baseCityId ?? currentDay.cityId;
      if (!effectiveCityId) return;

      if (location) {
        setCityAccommodation(tripId, effectiveCityId, {
          cityId: effectiveCityId,
          entryPoint: location,
        });
      } else {
        setCityAccommodation(tripId, effectiveCityId, undefined);
      }
    },
    [tripId, currentDay, setCityAccommodation, isReadOnly],
  );

  // ── Beat-level actions for v2 chapter view ──
  const [removeConfirm, setRemoveConfirm] = useState<{ dayIndex: number; beatId: string; name: string } | null>(null);

  const handleChapterReplace = useCallback(
    (dayIndex: number, beatId: string) => {
      if (isReadOnly || !tripId || isUsingMock) return;
      if (dayIndex !== safeSelectedDay) setSelectedDay(dayIndex);
      handleReplace(beatId);
    },
    [isReadOnly, tripId, isUsingMock, safeSelectedDay, handleReplace],
  );

  const handleChapterNoteChange = useCallback(
    (dayIndex: number, beatId: string, note: string) => {
      if (isReadOnly) return;
      applyModelUpdate((current) => ({
        ...current,
        days: current.days.map((d, idx) => {
          if (idx !== dayIndex) return d;
          return {
            ...d,
            activities: d.activities.map((a) => {
              if (a.id !== beatId || a.kind !== "place") return a;
              return { ...a, notes: note.length > 0 ? note : undefined };
            }),
          };
        }),
      }));
    },
    [isReadOnly, applyModelUpdate],
  );

  const handleChapterRemoveRequest = useCallback(
    (dayIndex: number, beatId: string) => {
      if (isReadOnly) return;
      const day = model.days[dayIndex];
      const activity = day?.activities.find((a) => a.id === beatId);
      const name =
        activity && activity.kind === "place"
          ? activity.title
          : "this stop";
      setRemoveConfirm({ dayIndex, beatId, name });
    },
    [isReadOnly, model.days],
  );

  const handleChapterRemoveConfirm = useCallback(() => {
    if (!removeConfirm || !tripId) {
      setRemoveConfirm(null);
      return;
    }
    const day = model.days[removeConfirm.dayIndex];
    if (day) {
      deleteActivity(tripId, day.id, removeConfirm.beatId);
    }
    setRemoveConfirm(null);
  }, [removeConfirm, tripId, model.days, deleteActivity]);

  // Handler: change day start time
  const handleDayStartTimeChange = useCallback(
    (startTime: string) => {
      if (isReadOnly) return;
      applyModelUpdate((current) => {
        const nextDays = current.days.map((entry, index) => {
          if (index !== safeSelectedDay) return entry;
          return {
            ...entry,
            bounds: {
              ...(entry.bounds ?? {}),
              startTime,
            },
          };
        });
        return { ...current, days: nextDays };
      });
    },
    [safeSelectedDay, applyModelUpdate, isReadOnly],
  );

  // Detect scheduling conflicts in the itinerary
  const conflictsResult = useMemo(() => {
    return detectItineraryConflicts(model);
  }, [model]);

  // Compute trip health and per-day levels for DaySelector dots
  const tripHealth = useMemo(() => {
    return calculateTripHealth(model, conflictsResult.conflicts);
  }, [model, conflictsResult]);

  const dayHealthLevels = useMemo(() => {
    return tripHealth.days.map((d) => getHealthLevel(d.score));
  }, [tripHealth]);

  // Scroll sync hook — IntersectionObserver-based activity highlighting
  const { selectedActivityId, setSelectedActivityId, handleSelectActivity } =
    useItineraryScrollSync(safeSelectedDay);

  const [dayTransitionLabel, setDayTransitionLabel] = useState<string | null>(null);

  // Prevents the IntersectionObserver from correcting selectedDay mid-scroll
  // when the user clicks the day picker (programmatic scroll takes ~700ms).
  const handleSelectDayChange = useCallback((dayIndex: number) => {
    const targetDay = model.days[dayIndex];
    if (targetDay?.dateLabel) {
      const cityName = targetDay.dateLabel.replace(/Day \d+\s*(\(([^)]+)\))?/, "$2").trim();
      if (cityName) {
        setDayTransitionLabel(cityName);
        setTimeout(() => setDayTransitionLabel(null), 500);
      }
    }
    setSelectedDay(dayIndex);
    setSelectedActivityId(null);

  }, [model.days, setSelectedActivityId]);

  // ── Add activity to a specific day (chapter layout) ──
  const handleAddActivityToDay = useCallback(
    (
      dayIndex: number,
      newActivity: Extract<ItineraryActivity, { kind: "place" }>,
      meta: { addressSource: "mapbox" | "google" | "as-is" | "none" },
    ) => {
      if (isReadOnly) return;
      const targetDay = model.days[dayIndex];
      if (!tripId || isUsingMock || !targetDay) return;

      // Authoritative paywall guard: never append to a locked day, even if a
      // caller bypasses the day-selector filter. Route to the unlock prompt.
      const dayLocked =
        !isDayAccessible(dayIndex, tripUnlocked ?? false, fullAccessEnabled)
        || Boolean(targetDay.isLocked);
      if (dayLocked) {
        requireUnlock("locked_day");
        return;
      }

      if (newActivity.isCustom) {
        trackCustomLocationAdded({
          addressSource: meta.addressSource === "none" ? "as-is" : meta.addressSource,
          hasStartTime: Boolean(newActivity.manualStartTime),
          fieldsFilled: [
            newActivity.phone,
            newActivity.website,
            newActivity.costEstimate,
            newActivity.notes,
            newActivity.confirmationNumber,
          ].filter(Boolean).length,
        });
      }

      // If the user came in via a meal slot, annotate the activity so the
      // planner can place it correctly (mealType drives detector coverage,
      // timeOfDay drives bucket ordering). Insert at a position consistent
      // with the bucket so the planner's array-order pass schedules it
      // before/between/after the existing stops.
      const annotated: Extract<ItineraryActivity, { kind: "place" }> = pendingMealContext
        ? {
            ...newActivity,
            mealType: pendingMealContext,
            timeOfDay:
              pendingMealContext === "breakfast"
                ? "morning"
                : pendingMealContext === "lunch"
                  ? "afternoon"
                  : "evening",
          }
        : newActivity;

      addActivity(tripId, targetDay.id, annotated);

      const nextDays = model.days.map((d) => {
        if (d.id !== targetDay.id) return d;
        if (!pendingMealContext) {
          return { ...d, activities: [...d.activities, annotated] };
        }
        // Position the meal in array order so the planner's sequential
        // routing produces a sensible time:
        //   breakfast → after any arrival anchor, before all other stops
        //   lunch     → after the last morning-bucket stop
        //   dinner    → end of day (default append)
        const places = d.activities.filter(
          (a): a is Extract<ItineraryActivity, { kind: "place" }> => a.kind === "place",
        );
        let insertIdx = d.activities.length;
        if (pendingMealContext === "breakfast") {
          const firstNonAnchor = d.activities.findIndex(
            (a) => a.kind === "place" && !a.isAnchor,
          );
          insertIdx = firstNonAnchor === -1 ? d.activities.length : firstNonAnchor;
        } else if (pendingMealContext === "lunch") {
          const lastMorning = [...places]
            .reverse()
            .find((p) => {
              const arr = p.schedule?.arrivalTime;
              if (arr) {
                const hour = Number(arr.split(":")[0]);
                if (!Number.isNaN(hour)) return hour < 12;
              }
              return p.timeOfDay === "morning";
            });
          if (lastMorning) {
            const idxInDay = d.activities.findIndex((a) => a.id === lastMorning.id);
            insertIdx = idxInDay >= 0 ? idxInDay + 1 : d.activities.length;
          }
        }
        const nextActivities = [...d.activities];
        nextActivities.splice(insertIdx, 0, annotated);
        return { ...d, activities: nextActivities };
      });
      const nextItinerary = { ...model, days: nextDays };

      setModelState(nextItinerary);
      setPendingMealContext(null);

      setTimeout(() => {
        scheduleUserPlanningRef.current?.(nextItinerary);
      }, 0);
    },
    [tripId, isUsingMock, isReadOnly, model, addActivity, setModelState, scheduleUserPlanningRef, pendingMealContext, tripUnlocked, fullAccessEnabled, requireUnlock],
  );

  // ── Refine day (Adjust button) ──
  const handleRefineDay = useCallback(
    (refinedDay: ItineraryDay) => {
      if (isReadOnly) return;
      const nextItinerary = {
        ...model,
        days: model.days.map((d, i) => (i === safeSelectedDay ? refinedDay : d)),
      };
      setModelState(nextItinerary);
      setTimeout(() => {
        scheduleUserPlanningRef.current?.(nextItinerary);
      }, 0);
    },
    [model, safeSelectedDay, setModelState, scheduleUserPlanningRef, isReadOnly],
  );

  // ── Day trip accept handler ──
  const { isAcceptingDayTrip, handleAcceptDayTrip } = useDayTripActions({
    model,
    tripId,
    isUsingMock,
    onItineraryChange,
    tripBuilderData,
    tripStartDate,
    updateDayActivities,
    setModelState,
    scheduleUserPlanningRef,
  });

  // ── Discover mode ──
  const discover = useItineraryDiscover({
    model,
    currentDay,
    dayIndex: safeSelectedDay,
  });

  // Activity ratings
  const activityRatingsHook = useActivityRatings(tripId && !isUsingMock && !isReadOnly ? tripId : undefined);
  useEffect(() => {
    if (tripId && !isUsingMock && !isReadOnly) {
      activityRatingsHook.fetchRatings();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, isUsingMock, isReadOnly]);

  const ratingsContextValue = useMemo(() => ({
    ratings: activityRatingsHook.ratings,
    submitRating: activityRatingsHook.submitRating,
  }), [activityRatingsHook.ratings, activityRatingsHook.submitRating]);

  // Tray entries for v2 Chrome advisories
  const trayEntries = useMemo<AdvisoryEntry[]>(() => {
    if (!currentTrip) return [];
    const entries: AdvisoryEntry[] = [];

    // AccessibilityBanner condition
    if (shouldShowAccessibilityBanner(currentTrip)) {
      entries.push({
        key: "accessibility-prep",
        title: "Accessibility prep",
        body: "Review mobility, sensory, and dietary notes before you land.",
      });
    }

    // GoshuinBanner condition — mirrors shouldShowGoshuin exactly (upcoming,
    // shrine/temple in itinerary, not dismissed in session or trip state).
    if (shouldShowGoshuin(currentTrip)) {
      entries.push({
        key: "goshuin",
        title: "Goshuin passport for temple days",
        body: "Pick one up at your first shrine. It's the traditional way to collect stamps.",
      });
    }

    // PrepBanner condition — upcoming + at least one applicable checklist item.
    const tripStatus = getTripStatus(currentTrip);
    if (tripStatus === "upcoming" && hasApplicablePrepItems(currentTrip)) {
      entries.push({
        key: "prep-checklist",
        title: "Pre-trip checklist",
        body: "Packing, connectivity, and cash to sort before you board.",
        action: { label: "View checklist", key: "open-prep-checklist" },
      });
    }

    // SeasonalBanner condition
    if (model.seasonalHighlight) {
      entries.push({
        key: `seasonal-highlight:${model.seasonalHighlight.id ?? "default"}`,
        title: model.seasonalHighlight.label ?? "Seasonal highlight",
        body: model.seasonalHighlight.description ?? "In season during your trip.",
      });
    }

    // DayTripBanner condition
    if (dayTripSuggestions && dayTripSuggestions.length > 0) {
      const top = dayTripSuggestions[0]!;
      entries.push({
        key: "day-trip-festival",
        title: `Day trip: ${top.targetLocationName}`,
        body: top.description,
        action: { label: "Explore", key: "open-trip-overview" },
      });
    }

    return entries;
  }, [currentTrip, model.seasonalHighlight, dayTripSuggestions]);

  // Print export data
  const printCities = useMemo(() => {
    const cityMap: Record<string, string> = {};
    for (const region of REGIONS) {
      for (const city of region.cities) {
        cityMap[city.id] = city.name;
      }
    }
    const ids = [...new Set(itinerary.days.map((d) => d.cityId).filter((c): c is string => Boolean(c)))];
    return ids.map((id) => cityMap[id] ?? id);
  }, [itinerary.days]);

  const printDateRange = useMemo(() => {
    const start = tripBuilderData?.dates?.start;
    const end = tripBuilderData?.dates?.end;
    if (!start || !end) return undefined;
    const fmt = (iso: string) => parseLocalDate(iso)!.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return `${fmt(start)} – ${fmt(end)}`;
  }, [tripBuilderData?.dates]);

  const tripName = useMemo(() => {
    const stored = getTripById?.(tripId);
    return stored?.name ?? "My Japan Trip";
  }, [getTripById, tripId]);

  const dashboardProps = {
    itinerary: model,
    conflicts: conflictsResult.conflicts,
    conflictsResult: conflictsResult,
    tripStartDate,
    onClose: () => {
      setOverviewDrawerOpen(false);
    },
    onSelectDay: (dayIndex: number) => {
      handleSelectDayChange(dayIndex);
      setOverviewDrawerOpen(false);
    },
    tripBuilderData,
    dayTripSuggestions,
    onAcceptDayTrip: (suggestion: import("@/types/dayTrips").DayTripSuggestion, dayIndex: number) => {
      if (requireUnlock("day_trip")) return;
      handleAcceptDayTrip(suggestion, dayIndex);
    },
    isAcceptingDayTrip,
    suggestions,
    dailyBriefings,
  };

  return (
    <ActivityRatingsProvider value={!isReadOnly ? ratingsContextValue : null}>
    <PrintHeader tripName={tripName} dateRange={printDateRange} cities={printCities} />
    <section className="mx-auto min-h-[calc(100dvh-var(--header-h))] max-w-screen-2xl md:h-[calc(100dvh-var(--header-h))] md:overflow-hidden">
      {/* ── Mobile peek map strip (< lg) ── */}
      <div className="relative md:hidden">
        <m.div
          animate={{ height: viewMode === "discover" ? "50dvh" : mapExpanded ? "100dvh" : "30dvh" }}
          transition={{
            duration: durationSlow,
            ease: easePageTransitionMut,
          }}
          className={mapExpanded ? "relative overflow-hidden pt-[env(safe-area-inset-top)]" : "relative overflow-hidden"}
        >
          <ErrorBoundary fallback={<div className="flex h-full items-center justify-center text-sm text-stone">Map unavailable</div>}>
            {viewMode === "discover" ? (
              <DiscoverMap
                locations={discover.locations}
                userPosition={discover.userPosition}
                onLocationClick={discover.setExpandedLocation}
                highlightedLocationId={discover.highlightedLocationId}
                isLoading={discover.isLoading}
                initialCenter={discover.mapInitialCenter}
              />
            ) : (
              <ItineraryMapPanel
                day={safeSelectedDay}
                activities={currentDay?.activities ?? []}
                selectedActivityId={selectedActivityId}
                onSelectActivity={handleSelectActivity}
                isPlanning={isPlanning}
                startPoint={effectiveMapStartPoint}
                endPoint={effectiveMapEndPoint}
                tripStartDate={tripStartDate}
                dayLabel={currentDay?.dateLabel}
              />
            )}
          </ErrorBoundary>

          {/* Tap-to-expand overlay (when collapsed) */}
          {!mapExpanded && viewMode !== "discover" && (
            <button
              type="button"
              onClick={() => setMapExpanded(true)}
              className="absolute inset-0 z-10"
              aria-label="Expand map"
            >
              {/* Bottom gradient hint */}
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-center scrim-60 pb-2.5 pt-8">
                <span className="rounded-full bg-charcoal/80 px-3 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm">
                  Tap to expand map
                </span>
              </div>
            </button>
          )}

          {/* Collapse button (when expanded) */}
          <AnimatePresence>
            {mapExpanded && (
              <m.button
                type="button"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: durationFast, ease: easeReveal }}
                onClick={() => setMapExpanded(false)}
                className="absolute top-3 right-3 z-20 flex h-11 w-11 items-center justify-center rounded-lg bg-charcoal/80 text-white/90 backdrop-blur-sm transition-colors hover:bg-charcoal"
                aria-label="Collapse map"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </m.button>
            )}
          </AnimatePresence>
        </m.div>
      </div>

      <div className="flex flex-col md:h-full md:flex-row md:gap-4 md:p-4">
        {/* Left: Cards Panel (60%) */}
        <div className="flex flex-col md:w-1/2 lg:w-3/5 md:min-h-0 md:overflow-y-auto" data-lenis-prevent>
          {/* TripBar replaces tab strip */}
          {currentTrip && (
            <TripBar
              tripName={tripName}
              currentDayIndex={safeSelectedDay}
              totalDays={model.days.length}
              isToday={focusDayState.isDayOfMode && focusDayState.index === safeSelectedDay}
              unreadAdvisories={trayEntries.filter((e) => !dismissedAdvisories.has(e.key)).length}
              unlockedPill={isFreePromoUnlock ? (
                <span
                  className="inline-flex items-center rounded-full bg-canvas px-3 py-1 text-[11px] text-brand-primary"
                >
                  Unlocked. Launch promo.
                </span>
              ) : undefined}
              onOpenAdvisories={() => setAdvisoriesDrawerOpen(true)}
              onNearMe={() => setNearMeDrawerOpen(true)}
            />
          )}
          <NearMeDrawer
            open={nearMeDrawerOpen}
            onClose={() => setNearMeDrawerOpen(false)}
            currentDayIndex={safeSelectedDay}
            currentDayActivities={currentDay?.activities ?? []}
            onAdd={handleAddActivityToDay}
          />
          <TripOverviewDrawer
            open={overviewDrawerOpen}
            onClose={() => setOverviewDrawerOpen(false)}
            dashboardProps={dashboardProps}
          />
          <BeforeYouLandDrawer
            open={beforeYouLandOpen}
            onClose={() => setBeforeYouLandOpen(false)}
            briefing={culturalBriefing}
          />
          {currentTrip && (
            <TripAdvisoriesDrawer
              open={advisoriesDrawerOpen}
              onClose={() => setAdvisoriesDrawerOpen(false)}
              trayProps={{
                tripId: currentTrip.id,
                entries: trayEntries,
                dismissed: dismissedAdvisories,
                onDismiss: handleDismissAdvisory,
                onAction: (key) => {
                  setAdvisoriesDrawerOpen(false);
                  if (key === "open-prep-checklist") setPrepDrawerOpen(true);
                  if (key === "open-trip-overview") setOverviewDrawerOpen(true);
                },
              }}
            />
          )}
          {currentTrip && (
            <PrepDrawer
              open={prepDrawerOpen}
              onClose={() => setPrepDrawerOpen(false)}
              trip={currentTrip}
            />
          )}
          {/* Add place dialog — chapter layout */}
          <AddPlaceDialog
            open={addPlaceDialogOpen}
            onClose={() => {
              setAddPlaceDialogOpen(false);
              // Clear meal context if user dismissed without adding —
              // otherwise the next non-meal Add-place would inherit it.
              setPendingMealContext(null);
            }}
            // Locked days (guest on Day 2-N) are filtered out entirely — a
            // guest can only add to days they can access. `index` stays the
            // true `model.days` index so `handleAddActivityToDay` resolves the
            // right day. Same predicate as `chapterDays`: server `isLocked`
            // overrides the client gate. The unlock CTA lives on the UnlockBeat
            // and the day-selector strip — the dialog need not re-advertise it.
            days={model.days
              .map((d, idx) => ({
                index: idx,
                label: `Day ${idx + 1}${d.cityId ? ` · ${formatCityName(d.cityId)}` : ""}`,
                activities: d.activities,
                city: d.cityId ? formatCityName(d.cityId) : undefined,
                accessible:
                  isDayAccessible(idx, tripUnlocked ?? false, fullAccessEnabled)
                  && !d.isLocked,
              }))
              .filter((d) => d.accessible)
              .map(({ accessible: _accessible, ...d }) => d)}
            defaultDayIndex={safeSelectedDay}
            onAdd={handleAddActivityToDay}
            presetMealType={pendingMealContext ?? undefined}
            nearbyAnchor={(() => {
              if (!pendingMealContext) return undefined;
              const day = model.days[safeSelectedDay];
              if (!day) return undefined;
              const cityLabel = day.cityId ? formatCityName(day.cityId) : undefined;
              const places = day.activities.filter(
                (a): a is Extract<ItineraryActivity, { kind: "place" }> => a.kind === "place",
              );
              const nonAnchor = places.filter((p) => !p.isAnchor);

              // Anchor selection by meal:
              //   breakfast → day start point (hotel) if set, else first stop
              //   lunch     → last morning stop, else first stop
              //   dinner    → last stop
              if (pendingMealContext === "breakfast") {
                if (resolvedStartLocation?.coordinates) {
                  return {
                    lat: resolvedStartLocation.coordinates.lat,
                    lng: resolvedStartLocation.coordinates.lng,
                    label: resolvedStartLocation.name,
                    cityLabel,
                  };
                }
                const first = nonAnchor[0];
                return first?.coordinates
                  ? { lat: first.coordinates.lat, lng: first.coordinates.lng, label: first.title, cityLabel }
                  : undefined;
              }
              if (pendingMealContext === "lunch") {
                const lastMorning = [...nonAnchor]
                  .reverse()
                  .find((p) => {
                    const arr = p.schedule?.arrivalTime;
                    if (arr) {
                      const hour = Number(arr.split(":")[0]);
                      if (!Number.isNaN(hour)) return hour < 12;
                    }
                    return p.timeOfDay === "morning";
                  });
                const target = lastMorning ?? nonAnchor[0];
                return target?.coordinates
                  ? { lat: target.coordinates.lat, lng: target.coordinates.lng, label: target.title, cityLabel }
                  : undefined;
              }
              // dinner
              const last = nonAnchor[nonAnchor.length - 1];
              return last?.coordinates
                ? { lat: last.coordinates.lat, lng: last.coordinates.lng, label: last.title, cityLabel }
                : undefined;
            })()}
          />
          {/* Header bar */}
          <div
            className={`border-b border-border bg-background px-4 pb-2.5 md:px-6 ${viewMode === "timeline" ? "sticky top-0 z-30" : ""}`}
            style={{
              paddingTop: headerCollapsed ? "0.375rem" : "0.75rem",
              transition: "padding-top 0.25s ease",
            }}
          >
            {/* Collapsible: Trip name + tabs + share (single row) */}
            <div
              style={{
                maxHeight: headerCollapsed ? 0 : 200,
                opacity: headerCollapsed ? 0 : 1,
                overflow: "hidden",
                transition: "max-height 0.25s ease, opacity 0.2s ease",
              }}
            >
              {/* Toolbar: mock badge only */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                {isUsingMock && (
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                      Mock
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Day selector + search + adjust — timeline only */}
            {viewMode === "timeline" && (
              <div style={{ marginTop: headerCollapsed ? 0 : "0.5rem", transition: "margin-top 0.25s ease" }} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <DaySelector
                  totalDays={days.length}
                  selected={safeSelectedDay}
                  onChange={handleSelectDayChange}
                  cityIds={days.map((day) => day.cityId)}
                  tripStartDate={tripStartDate}
                  dayHealthLevels={dayHealthLevels}
                  lockedDayIndices={isTripLocked
                    ? new Set(days.map((_, i) => i).filter((i) => i > 0))
                    : undefined}
                  onLockedClick={() => requireUnlock("locked_day")}
                />
                {!isReadOnly && !isUsingMock && currentDay && tripId && (
                  <DayRefinementButtons
                    dayIndex={safeSelectedDay}
                    tripId={tripId}
                    builderData={tripBuilderData}
                    itinerary={model}
                    onRefine={handleRefineDay}
                    currentStartTime={currentDay.bounds?.startTime ?? "09:00"}
                    onStartTimeChange={handleDayStartTimeChange}
                    onRequireUnlock={() => requireUnlock("refinement")}
                  />
                )}
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => setAddPlaceDialogOpen(true)}
                    className="rounded-md bg-brand-primary text-white text-sm font-medium px-4 py-2 hover:bg-brand-secondary transition active:scale-[0.98]"
                  >
                    + Add place
                  </button>
                )}
                {currentTrip && (
                  <div className="ml-auto flex items-center gap-4 text-sm">
                    <button
                      type="button"
                      onClick={() => setOverviewDrawerOpen(true)}
                      className="text-accent"
                    >
                      Trip overview ↗
                    </button>
                    <button
                      type="button"
                      onClick={() => setBeforeYouLandOpen(true)}
                      className="text-accent"
                    >
                      Before you land ↗
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Activities List */}
          <div data-itinerary-activities className={`relative flex-1 overflow-y-auto overscroll-contain bg-background px-3 pt-3 pb-[env(safe-area-inset-bottom)] md:flex-none md:overflow-visible ${viewMode !== "timeline" ? "hidden" : ""}`}>
            {/* Live earthquake alert */}
            {currentTrip && (() => {
              const primaryCityId = currentTrip.builderData?.cities?.[0];
              if (!primaryCityId) return null;
              const tripRegion = getRegionForCity(primaryCityId);
              if (!tripRegion || !REGIONS.some((r) => r.id === tripRegion)) return null;
              return (
                <EarthquakeAlertSlot tripId={currentTrip.id} region={tripRegion as KnownRegionId} />
              );
            })()}

            {/* Disaster/typhoon awareness banner */}
            {currentTrip && shouldShowDisasterBanner(currentTrip) && (() => {
              const primaryCityId = currentTrip.builderData?.cities?.[0];
              const tripRegion = primaryCityId ? getWeatherRegion(primaryCityId) : "temperate";
              return (
                <div className="mb-3">
                  <DisasterBanner trip={currentTrip} region={tripRegion} />
                </div>
              );
            })()}

            {/* Advisories now in TripAdvisoriesDrawer (⋯ menu), not inline */}

            {/* Day transition interstitial */}
            <AnimatePresence>
              {dayTransitionLabel && (
                <m.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  transition={{ duration: durationFast, ease: easeReveal }}
                  className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm"
                >
                  <h2 className={cn(typography({ intent: "editorial-h2" }), "text-3xl sm:text-4xl")}>
                    {dayTransitionLabel}
                  </h2>
                </m.div>
              )}
            </AnimatePresence>

            {/* Timeline */}
            {currentDay ? (
              <>
              <ErrorBoundary>
                <ChapterList
                  trip={{ id: tripId, name: tripName, days: chapterDays }}
                  onExpandBeat={handleExpandBeat}
                  onReviewAdvisories={() => setAdvisoriesDrawerOpen(true)}
                  unlockProps={{
                    priceLabel: `$${launchPricing ? 19 : getTierPriceDollars(getTripTier(model.days.length))}`,
                    onUnlock: onUnlockClick ?? (() => {}),
                    cities: [...new Set(model.days.slice(1).map((d) => d.cityId).filter((c): c is string => Boolean(c)))],
                    totalDays: model.days.length,
                    loginRequired: showLoginToUnlock,
                  }}
                  selectedDayIndex={safeSelectedDay}
                  onDayChange={handleSelectDayChange}
                  onReorderBeats={(dayIndex, activityIds) => {
                    const day = model.days[dayIndex];
                    if (!day) return;
                    handleReorder(day.id, activityIds);
                  }}
                  onReplaceBeat={!isReadOnly && tripId && !isUsingMock ? handleChapterReplace : undefined}
                  onNoteChange={isReadOnly ? undefined : handleChapterNoteChange}
                  onRemoveBeat={isReadOnly ? undefined : handleChapterRemoveRequest}
                  dayStartLocation={resolvedStartLocation}
                  dayEndLocation={resolvedEndLocation}
                  onDayStartChange={isReadOnly ? undefined : handleStartLocationChange}
                  onDayEndChange={isReadOnly ? undefined : handleEndLocationChange}
                  onSetCityAccommodation={isReadOnly ? undefined : handleCityAccommodationChange}
                  accommodationStyle={tripBuilderData?.accommodationStyle}
                  onAddSpotForMeal={isReadOnly ? undefined : (dayIndex, mealType) => {
                    setSelectedDay(dayIndex);
                    setPendingMealContext(mealType);
                    setAddPlaceDialogOpen(true);
                  }}
                  isReadOnly={isReadOnly}
                />
              </ErrorBoundary>

              {/* UnlockBeat (shown after Day 1 when trip is not unlocked) */}
              {safeSelectedDay === 0 && !(tripUnlocked ?? false) && !fullAccessEnabled && model.days.length > 1 && (
                <UnlockBeat
                  cities={[...new Set(model.days.slice(1).map((d) => d.cityId).filter(Boolean))] as string[]}
                  totalDays={model.days.length}
                  priceLabel={`$${launchPricing ? 19 : getTierPriceDollars(getTripTier(model.days.length))}`}
                  loginRequired={showLoginToUnlock}
                  onUnlock={onUnlockClick ?? (() => {})}
                />
              )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <svg className="h-8 w-8 text-stone" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <p className="text-sm text-stone">
                  This day couldn&apos;t be loaded. Try selecting another day.
                </p>
              </div>
            )}

            {/* Planning status */}
            {isPlanning && (
              <div
                role="status"
                aria-live="polite"
                className="fixed bottom-4 right-4 z-30 px-3 py-1.5 rounded-full bg-surface border border-border text-xs text-foreground-secondary shadow-[var(--shadow-sm)]"
              >
                Updating travel times...
              </div>
            )}

            {/* Planning error */}
            {planningError && (
              <div className="mt-3 rounded-lg border border-error/30 bg-error/10 p-2.5 text-xs text-error">
                <p className="font-medium">Something went wrong</p>
                <p className="mt-0.5 text-error/80">{planningError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setPlanningError(null);
                    scheduleUserPlanning(model);
                  }}
                  className="mt-2 w-full rounded-lg bg-error px-3 py-1.5 text-xs font-medium text-white transition hover:bg-error/90"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Sticky Map — desktop only (40%) */}
        <div className="hidden md:flex md:flex-col md:w-1/2 lg:w-2/5 md:min-h-0">
          <div className="flex-1 min-h-0 md:rounded-lg md:overflow-hidden md:border md:border-border">
            <ErrorBoundary fallback={<div className="flex h-full items-center justify-center text-sm text-stone">Map unavailable</div>}>
              {viewMode === "discover" ? (
                <DiscoverMap
                  locations={discover.locations}
                  userPosition={discover.userPosition}
                  onLocationClick={discover.setExpandedLocation}
                  highlightedLocationId={discover.highlightedLocationId}
                  isLoading={discover.isLoading}
                  initialCenter={discover.mapInitialCenter}
                />
              ) : (
                <ItineraryMapPanel
                  day={safeSelectedDay}
                  activities={currentDay?.activities ?? []}
                  selectedActivityId={selectedActivityId}
                  onSelectActivity={handleSelectActivity}
                  isPlanning={isPlanning}
                  startPoint={effectiveMapStartPoint}
                  endPoint={effectiveMapEndPoint}
                  tripStartDate={tripStartDate}
                  dayLabel={currentDay?.dateLabel}
                />
              )}
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* Location Detail Panel */}
      <AnimatePresence>
        {(expandedLocation || discover.expandedLocation) && (
          <LocationExpanded
            location={(expandedLocation ?? discover.expandedLocation)!}
            onClose={() => {
              handleCloseExpanded();
              discover.setExpandedLocation(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Replacement Picker Modal */}
      {!isReadOnly && replacementActivityId && (() => {
        const originalActivity = model.days[selectedDay]?.activities.find(
          (a) => a.id === replacementActivityId && a.kind === "place",
        ) as Extract<ItineraryActivity, { kind: "place" }> | undefined;

        if (!originalActivity) return null;

        return (
          <ActivityReplacementPicker
            isOpen={true}
            onClose={() => {
              setReplacementActivityId(null);
              setReplacementCandidates([]);
            }}
            candidates={replacementCandidates}
            originalActivity={originalActivity}
            onSelect={handleReplaceSelect}
            isLoading={isLoadingReplacements}
          />
        );
      })()}
    </section>
    <PrintFooter />
    <ContextualUnlockPrompt
      isOpen={unlockPromptCtx !== null}
      context={unlockPromptCtx ?? "locked_day"}
      tier={getTripTier(model.days.length)}
      loginRequired={showLoginToUnlock}
      onUnlock={() => {
        setUnlockPromptCtx(null);
        onUnlockClick?.();
      }}
      onClose={() => setUnlockPromptCtx(null)}
    />
    {removeConfirm && (
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-charcoal/60 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-beat-title"
        onClick={() => setRemoveConfirm(null)}
      >
        <div
          className="max-w-sm w-full rounded-lg bg-surface p-6 shadow-[var(--shadow-elevated)]"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="remove-beat-title" className={cn(typography({ intent: "editorial-h3" }), "mb-2")}>
            Remove {removeConfirm.name}?
          </h2>
          <p className="text-sm text-foreground-body mb-5">
            This stop will be removed from the day. You can undo with Cmd+Z.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setRemoveConfirm(null)}
              className="text-sm text-foreground-secondary hover:text-foreground transition-colors px-3 py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleChapterRemoveConfirm}
              className="rounded-md bg-error text-white text-sm font-medium px-4 py-2 hover:opacity-90 active:scale-[0.98] transition"
            >
              Remove
            </button>
          </div>
        </div>
      </div>
    )}
    </ActivityRatingsProvider>
  );
};

