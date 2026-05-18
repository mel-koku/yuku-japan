"use client";

import Image from "next/image";
import { forwardRef, memo, useMemo, useState, useEffect, useRef as useReactRef, type ChangeEvent } from "react";
import { m, useReducedMotion } from "framer-motion";
import { CSS } from "@dnd-kit/utilities";
import type { Transform } from "@dnd-kit/utilities";

import { useLocationDetailsQuery } from "@/hooks/useLocationDetailsQuery";
import type { ItineraryActivity } from "@/types/itinerary";
import type { Location } from "@/types/location";
import { useActivityLocation } from "@/hooks/useActivityLocations";
import { DragHandle } from "./DragHandle";
import { Lightbulb, PlaneLanding, PlaneTakeoff, TrainFront } from "lucide-react";
import {
  getShortOverview,
  getLocationRating,
  getLocationReviewCount,
  stripStationReferences,
} from "./activityUtils";
import { easeReveal } from "@/lib/motion";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/utils/errorUtils";
import type { ItineraryConflict } from "@/lib/validation/itineraryConflicts";
import { getActivityColorScheme } from "@/lib/itinerary/activityColors";
import { resizePhotoUrl } from "@/lib/google/transformations";
import { PlaceActivityHeader } from "./PlaceActivityHeader";
import { FALLBACK_IMAGE } from "@/lib/constants/fallbackImages";

/**
 * Recover a readable title for anchor activities whose title was corrupted
 * by the refine route's round-trip conversion (locationId leaked as title).
 * Pattern: "unknown-anchor-arrival-{code}" → "Arrive at {CODE}"
 */
function recoverAnchorTitle(title: string, activityId: string): string {
  if (!title.startsWith("unknown-")) return title;
  const isArrival = activityId.startsWith("anchor-arrival");
  const code = activityId.replace(/^anchor-(arrival|departure)-/, "").toUpperCase();
  return isArrival ? `Arrive at ${code}` : `Depart from ${code}`;
}

function buildFallbackLocation(
  activity: Extract<ItineraryActivity, { kind: "place" }>,
): Location {
  const fallbackCategory = activity.tags?.[0] ?? "culture";
  const fallbackCity = activity.neighborhood ?? "Japan";

  const fallbackId = activity.locationId ?? `__fallback__${activity.id}`;
  return {
    // Use locationId if available, otherwise mark as fallback to prevent API calls
    id: fallbackId,
    // Synthetic fallback Location — never rendered into a /places/ link.
    // `Location.slug` is required by the type; mirror `id`.
    slug: fallbackId,
    name: activity.title,
    city: fallbackCity,
    region: fallbackCity,
    category: fallbackCategory,
    image: FALLBACK_IMAGE,
  };
}

/**
 * Extract city name from a formatted address string.
 * Attempts to find the city component, falling back to the activity's neighborhood or "Japan".
 */
function extractCityFromAddress(
  formattedAddress: string | undefined,
  fallbackNeighborhood: string | undefined,
): string {
  const fallback = fallbackNeighborhood ?? "Japan";
  if (!formattedAddress) {
    return fallback;
  }
  // Typical format: "Street, City, Prefecture, Japan" or "Location, City, Japan"
  // Split by comma and try to find a meaningful city component
  const parts = formattedAddress.split(",").map((p) => p.trim());
  // Usually city is second-to-last or third-to-last before "Japan"
  if (parts.length >= 3) {
    // Return the second-to-last part (typically city or prefecture)
    return parts[parts.length - 2] ?? fallback;
  }
  if (parts.length >= 2) {
    return parts[0] ?? fallback;
  }
  return fallback;
}

/**
 * Hook to fetch location details for entry points via Google Places API.
 * Uses the Basic tier endpoint (~$0.003/call) instead of Pro tier (~$0.017/call).
 */
function useEntryPointLocation(
  activity: Extract<ItineraryActivity, { kind: "place" }>,
): Location | null {
  const [location, setLocation] = useState<Location | null>(null);

  // Extract stable identifiers to prevent excessive re-fetching
  const locationId = activity.locationId;
  const activityId = activity.id;
  const neighborhood = activity.neighborhood;
  const fallbackCategory = activity.tags?.[0] ?? "transport";

  useEffect(() => {
    // Extract placeId from entry point locationId
    const placeIdMatch = locationId?.match(/^__entry_point_(?:start|end)__(.+?)__$/);
    const placeId = placeIdMatch ? placeIdMatch[1] : null;

    if (!placeId) {
      return;
    }

    const abortController = new AbortController();

    // Use Basic tier endpoint (4 fields) instead of Pro tier (35 fields)
    fetch(`/api/places/autocomplete?placeId=${encodeURIComponent(placeId)}`, {
      signal: abortController.signal,
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch place coordinates: ${res.status}`);
        }
        return res.json();
      })
      .then((data: { place?: { placeId: string; displayName: string; formattedAddress?: string; location: { latitude: number; longitude: number } } }) => {
        if (data.place) {
          const { place } = data;
          const city = extractCityFromAddress(place.formattedAddress, neighborhood);

          // Build Location object from Basic tier response
          const loc: Location = {
            id: place.placeId,
            // Google-place entry point, not a `locations` row — never linked
            // via /places/. `Location.slug` is required; mirror the place id.
            slug: place.placeId,
            name: place.displayName,
            city,
            region: city,
            category: fallbackCategory,
            image: FALLBACK_IMAGE,
            placeId: place.placeId,
            coordinates: {
              lat: place.location.latitude,
              lng: place.location.longitude,
            },
          };
          setLocation(loc);
        }
      })
      .catch((error) => {
        // Ignore abort errors
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        logger.error(
          "Error fetching entry point location details",
          error instanceof Error ? error : new Error(String(error)),
          { activityId },
        );
        // Fall back to basic location
        setLocation(buildFallbackLocation(activity));
      });

    return () => {
      abortController.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Use stable IDs to prevent excessive re-fetching
  }, [locationId, activityId, neighborhood, fallbackCategory]);

  return location;
}

type PlaceActivityRowProps = {
  activity: Extract<ItineraryActivity, { kind: "place" }>;
  allActivities?: ItineraryActivity[];
  dayTimezone?: string;
  onDelete: () => void;
  onUpdate: (patch: Partial<ItineraryActivity>) => void;
  attributes?: Record<string, unknown>;
  listeners?: Record<string, unknown>;
  isDragging?: boolean;
  transform?: Transform | null;
  transition?: string | null;
  isSelected?: boolean;
  onSelect?: (activityId: string) => void;
  onHover?: (activityId: string) => void;
  placeNumber?: number;
  tripId?: string;
  dayId?: string;
  onReplace?: () => void;
  /** Conflicts detected for this activity */
  conflicts?: ItineraryConflict[];
  /** Hide the drag handle (for entry points) */
  hideDragHandle?: boolean;
  isReadOnly?: boolean;
  /** ID of the currently dragged activity (if any) — used to collapse non-dragged cards */
  activeDragId?: string | null;
  /** Open the LocationExpanded slide-in panel for this location */
  onViewDetails?: (location: Location) => void;
  /** Trip month (1-12) for seasonal food badges */
  tripMonth?: number;
  /** City ID for this day */
  dayCityId?: string;
  /** Trip start date (ISO) for computing activity date */
  tripStartDate?: string;
  /** Day index for computing activity date */
  dayIndex?: number;
};

export const PlaceActivityRow = memo(forwardRef<HTMLDivElement, PlaceActivityRowProps>(
  (
    {
      activity,
      allActivities: _allActivities = [],
      dayTimezone: _dayTimezone,
      onDelete,
      onUpdate,
      attributes,
      listeners,
      isDragging,
      transform,
      transition,
      isSelected,
      onSelect,
      onHover,
      placeNumber,
      tripId,
      dayId,
      onReplace,
      conflicts,
      hideDragHandle,
      isReadOnly,
      activeDragId,
      onViewDetails,
      tripStartDate: _tripStartDate,
      dayIndex: _dayIndex,
    },
    ref,
  ) => {
    const [notesOpen, setNotesOpen] = useState(() => Boolean(activity.notes));
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [tempManualTime, setTempManualTime] = useState(activity.manualStartTime ?? "");
    const [availabilityStatus, setAvailabilityStatus] = useState<{
      status: string;
      message?: string;
      reservationRequired?: boolean;
    } | null>(null);
    const [insiderTipOpen, setInsiderTipOpen] = useState(false);
    const prefersReducedMotion = useReducedMotion();
    const timePickerRef = useReactRef<HTMLDivElement>(null);

    // Close time picker on click-outside or Escape
    useEffect(() => {
      if (!showTimePicker) return;
      function onMouseDown(e: MouseEvent) {
        if (timePickerRef.current && !timePickerRef.current.contains(e.target as Node)) {
          setShowTimePicker(false);
        }
      }
      function onKeyDown(e: KeyboardEvent) {
        if (e.key === "Escape") setShowTimePicker(false);
      }
      document.addEventListener("mousedown", onMouseDown);
      document.addEventListener("keydown", onKeyDown);
      return () => {
        document.removeEventListener("mousedown", onMouseDown);
        document.removeEventListener("keydown", onKeyDown);
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- timePickerRef is a stable ref
    }, [showTimePicker]);


    const durationLabel = useMemo(() => {
      if (!activity.durationMin) return null;
      const durationMin = activity.durationMin;
      const hours = durationMin / 60;
      if (hours >= 1) {
        const rounded = Number.isInteger(hours)
          ? hours
          : Math.round(hours * 10) / 10;
        return `~${rounded}h`;
      }
      return `~${durationMin}m`;
    }, [activity.durationMin]);

    const handleToggleNotes = () => {
      if (notesOpen) {
        const trimmed = activity.notes?.trim();
        onUpdate({ notes: trimmed ? activity.notes : undefined });
      }
      setNotesOpen((prev) => !prev);
    };

    const handleDelete = () => {
      if (window.confirm(`Remove "${activity.title}" from this day?`)) {
        onDelete();
      }
    };

    const handleNotesChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
      const nextNotes = event.target.value;
      onUpdate({ notes: nextNotes.trim() ? nextNotes : undefined });
    };

    const dragStyles =
      transform || transition
        ? {
            transform: transform ? CSS.Transform.toString(transform) : undefined,
            transition: transition ?? undefined,
          }
        : undefined;

    // Check if this is an entry point that needs API fetch
    const isEntryPoint = activity.locationId?.startsWith("__entry_point_");
    const entryPointLocation = useEntryPointLocation(activity);

    // Fetch location data from database via API
    const { location: fetchedLocation } = useActivityLocation(
      isEntryPoint ? null : activity,
    );

    const placeLocation = useMemo(() => {
      if (isEntryPoint && entryPointLocation) {
        return entryPointLocation;
      }
      return fetchedLocation ?? buildFallbackLocation(activity);
    }, [activity, isEntryPoint, entryPointLocation, fetchedLocation]);
    const { details: locationDetails } = useLocationDetailsQuery(placeLocation?.id ?? null);

    // Check availability when location is available
    // Use stable identifiers to prevent excessive re-fetching
    const activityId = activity.id;
    const activityStartTime = activity.manualStartTime;
    const placeId = placeLocation?.placeId;

    useEffect(() => {
      // Use availability status from activity if available, otherwise check
      if (activity.availabilityStatus && activity.availabilityMessage) {
        setAvailabilityStatus({
          status: activity.availabilityStatus,
          message: activity.availabilityMessage,
        });
        return;
      }

      // Only check if we have a placeId
      if (!placeId || isEntryPoint) {
        return;
      }

      const abortController = new AbortController();

      // Check availability via API
      fetch("/api/itinerary/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activities: [activity] }),
        signal: abortController.signal,
      })
        .then((res) => {
          if (!res.ok) return null;
          return res.json();
        })
        .then((data) => {
          if (data?.results?.[0]) {
            const result = data.results[0];
            setAvailabilityStatus({
              status: result.status,
              message: result.message,
              reservationRequired: result.reservationRequired,
            });
          }
        })
        .catch((error) => {
          // Ignore abort errors
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }
          logger.warn("Failed to check availability", {
            activityId,
            error: getErrorMessage(error),
          });
        });

      return () => {
        abortController.abort();
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Use stable IDs to prevent excessive re-fetching
    }, [activityId, activityStartTime, placeId, isEntryPoint, activity.availabilityStatus, activity.availabilityMessage]);

    const summary = placeLocation
      ? stripStationReferences(
          getShortOverview(placeLocation, locationDetails?.editorialSummary ?? null),
          placeLocation.nearestStation,
        )
      : null;
    const rating = placeLocation ? getLocationRating(placeLocation) : null;
    const reviewCount = placeLocation
      ? getLocationReviewCount(placeLocation)
      : null;

    const dragHandleLabel = `Drag to reorder ${activity.title}`;

    const schedule = activity?.schedule;
    const travelStatus = schedule?.status ?? "scheduled";
    const isOutOfHours = travelStatus === "out-of-hours";
    const waitLabel =
      schedule?.arrivalBufferMinutes && schedule.arrivalBufferMinutes > 0
        ? `Wait ${schedule.arrivalBufferMinutes} min`
        : null;

    const handleSelect = () => {
      onSelect?.(activity.id);
      onViewDetails?.(placeLocation);
    };

    const handleHover = () => {
      onHover?.(activity.id);
    };

    const notesId = `notes-${activity.id}`;
    const noteLabel = `Notes for ${activity.title}`;
    const notesValue = activity.notes ? activity.notes : "";

    // Manual time editing handlers
    const handleSetManualTime = () => {
      if (tempManualTime && /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(tempManualTime)) {
        onUpdate({ manualStartTime: tempManualTime } as Partial<ItineraryActivity>);
        setShowTimePicker(false);
      }
    };

    const handleClearManualTime = () => {
      onUpdate({ manualStartTime: undefined } as Partial<ItineraryActivity>);
      setTempManualTime("");
      setShowTimePicker(false);
    };

    const hasManualTime = Boolean(activity.manualStartTime);
    const displayArrivalTime = activity.manualStartTime ?? schedule?.arrivalTime;

    // Get color scheme based on activity type
    const colorScheme = useMemo(() => getActivityColorScheme(activity), [activity]);

    // Get the activity image
    const activityImage = useMemo(() => {
      const primaryPhoto = (placeLocation as Location & { primaryPhotoUrl?: string })?.primaryPhotoUrl;
      if (primaryPhoto) return resizePhotoUrl(primaryPhoto, 800) ?? primaryPhoto;
      if (placeLocation?.image) return resizePhotoUrl(placeLocation.image, 800) ?? placeLocation.image;
      return FALLBACK_IMAGE;
    }, [placeLocation]);

    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);

    // Check if this is an entry point for display purposes
    const isStartEntryPoint = activity.locationId?.startsWith("__entry_point_start__");
    const isEndEntryPoint = activity.locationId?.startsWith("__entry_point_end__");
    const displayLabel = isStartEntryPoint ? "S" : isEndEntryPoint ? "E" : placeNumber;

    // Compact mode: another card is being dragged — collapse to single-line row
    const isCompactDrag = Boolean(activeDragId && activeDragId !== activity.id);

    if (isCompactDrag) {
      return (
        <div
          ref={ref}
          style={dragStyles}
          className="focus-visible:outline-none"
          data-kind="place"
          data-activity-row
          data-activity-id={activity.id}
        >
          <div className="flex items-center gap-2.5 rounded-lg bg-background px-3 py-2 shadow-[var(--shadow-card)]">
            {/* Time */}
            <span className="w-12 shrink-0 text-right font-mono text-xs font-medium text-foreground-secondary">
              {displayArrivalTime ?? activity.timeOfDay ?? "-"}
            </span>

            {/* Category color dot / Plane icon for anchors */}
            {activity.isAnchor ? (
              (() => {
                const compactTitle = recoverAnchorTitle(activity.title, activity.id);
                const PlaneIcon = compactTitle.startsWith("Arrive") ? PlaneLanding : PlaneTakeoff;
                return <PlaneIcon className="h-3.5 w-3.5 shrink-0 text-brand-primary" />;
              })()
            ) : (
              <div className={`h-2 w-2 shrink-0 rounded-full ${colorScheme.badge}`} />
            )}

            {/* Number badge */}
            {displayLabel !== undefined && (
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${colorScheme.badge} ${colorScheme.badgeText}`}>
                {displayLabel}
              </span>
            )}

            {/* Title */}
            <span className="min-w-0 truncate text-sm font-medium text-foreground">
              {activity.isAnchor ? recoverAnchorTitle(activity.title, activity.id) : activity.title}
            </span>

            {/* Neighborhood */}
            {activity.neighborhood && (
              <span className="ml-auto shrink-0 text-xs text-stone">
                {activity.neighborhood}
              </span>
            )}
          </div>
        </div>
      );
    }

    // Anchor activities (airport arrival/departure) — compact inline strip
    if (activity.isAnchor) {
      const anchorTitle = recoverAnchorTitle(activity.title, activity.id);
      const isArrival = anchorTitle.startsWith("Arrive");
      const PlaneIcon = isArrival ? PlaneLanding : PlaneTakeoff;

      return (
        <div
          ref={ref}
          style={dragStyles}
          className="focus-visible:outline-none"
          data-kind="place"
          data-activity-row
          data-activity-id={activity.id}
        >
          <div className="flex items-center gap-2.5 rounded-md bg-surface px-3 py-2">
            <PlaneIcon className="h-4 w-4 shrink-0 text-brand-primary" />
            <p className="min-w-0 truncate text-xs font-medium text-foreground">
              {anchorTitle}
            </p>
            <span className="ml-auto shrink-0 font-mono text-xs text-foreground-secondary">
              {displayArrivalTime ?? "-"}
            </span>
            {durationLabel && (
              <span className="shrink-0 text-xs text-stone">{durationLabel}</span>
            )}
          </div>
        </div>
      );
    }

    return (
      <div
        ref={ref}
        style={dragStyles}
        className="focus-visible:outline-none"
        data-kind="place"
        data-activity-row
        data-selected={isSelected || undefined}
        data-activity-id={activity.id}
      >
        <m.div
          layout={!prefersReducedMotion && !isDragging}
          transition={prefersReducedMotion ? { duration: 0 } : { layout: { duration: 0.3, ease: easeReveal } }}
          className={`group relative cursor-pointer rounded-lg bg-background transition-all duration-200 ${
            isDragging
              ? "ring-2 ring-sage/30 shadow-[var(--shadow-elevated)] rotate-1 scale-[1.02]"
              : isSelected
                ? "shadow-[var(--shadow-elevated)]"
                : "shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] hover:-translate-y-0.5"
          }`}
          style={isSelected && !isDragging ? { outline: "2px solid var(--color-sage)", outlineOffset: "-2px" } : undefined}
          tabIndex={0}
          onClick={handleSelect}
          onKeyDown={(event) => {
            const target = event.target as HTMLElement;
            if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleSelect();
            }
          }}
          onMouseEnter={handleHover}
          onFocus={handleHover}
        >
          <div className="flex items-start gap-3 p-3">
            {/* Left column: stop number + time + drag handle */}
            <div className="flex w-10 shrink-0 flex-col items-center pt-0.5">
              {displayLabel !== undefined && (
                <span
                  className={`font-mono text-xl font-bold ${
                    isSelected ? "text-sage" : "text-foreground/60"
                  }`}
                >
                  {String(displayLabel).padStart(2, "0")}
                </span>
              )}
              {/* Time below number */}
              <div className="relative mt-1 flex flex-col items-center">
                {displayArrivalTime ? (
                  <>
                    {isReadOnly ? (
                      <span className={`font-mono text-[11px] font-semibold ${hasManualTime ? "text-sage" : "text-foreground-secondary"}`}>
                        {displayArrivalTime}
                      </span>
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setShowTimePicker(!showTimePicker);
                          setTempManualTime(activity.manualStartTime ?? schedule?.arrivalTime ?? "09:00");
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            setShowTimePicker(!showTimePicker);
                            setTempManualTime(activity.manualStartTime ?? schedule?.arrivalTime ?? "09:00");
                          }
                        }}
                        className={`cursor-pointer font-mono text-[11px] font-semibold transition hover:text-brand-primary ${
                          hasManualTime ? "text-sage" : "text-foreground-secondary"
                        }`}
                        title={hasManualTime ? "Manual time - click to edit" : "Click to set time"}
                      >
                        {displayArrivalTime}
                      </span>
                    )}
                    {schedule?.departureTime && (
                      <span className="font-mono text-[10px] text-stone">
                        {schedule.departureTime}
                      </span>
                    )}
                    {hasManualTime && (
                      <span className="text-[8px] font-medium uppercase text-sage">pin</span>
                    )}
                  </>
                ) : (
                  <span className="text-[10px] text-stone capitalize">{activity.timeOfDay || ""}</span>
                )}
                {/* Time picker popover */}
                {showTimePicker && (
                  <div
                    ref={timePickerRef}
                    className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-border bg-background p-3 shadow-[var(--shadow-elevated)]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="mb-2 text-xs font-medium text-foreground-secondary">Set time</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={tempManualTime}
                        onChange={(e) => setTempManualTime(e.target.value)}
                        className="h-12 rounded-md border border-border px-2 py-1 text-base focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                      />
                      <button
                        type="button"
                        onClick={handleSetManualTime}
                        className="rounded-md bg-brand-primary px-2 py-1 text-xs font-medium text-white hover:bg-brand-primary/90"
                      >
                        Set
                      </button>
                    </div>
                    {hasManualTime && (
                      <button
                        type="button"
                        onClick={handleClearManualTime}
                        className="mt-2 text-xs text-stone hover:text-error"
                      >
                        Reset to auto
                      </button>
                    )}
                  </div>
                )}
              </div>
              {!hideDragHandle && !isReadOnly && (
                <DragHandle
                  variant="place"
                  label={dragHandleLabel}
                  isDragging={isDragging}
                  attributes={attributes}
                  listeners={listeners}
                  displayLabel={displayLabel}
                  colorScheme={colorScheme}
                  isSelected={isSelected}
                />
              )}
            </div>

            {/* Thumbnail — fills card height */}
            <div data-activity-image className="relative w-28 shrink-0 self-stretch overflow-hidden rounded-md sm:w-32">
              {!imageLoaded && !imageError && (
                <div className="absolute inset-0 animate-pulse bg-surface" />
              )}
              <Image
                src={imageError ? FALLBACK_IMAGE : activityImage}
                alt={activity.title}
                fill
                sizes="128px"
                className={`object-cover transition-opacity duration-200 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
                onLoad={() => setImageLoaded(true)}
                onError={() => {
                  setImageError(true);
                  setImageLoaded(true);
                }}
              />
            </div>

            {/* Main content */}
            <div className="min-w-0 flex-1">
              <PlaceActivityHeader
                activity={activity}
                placeLocation={placeLocation}
                rating={rating}
                reviewCount={reviewCount}
                durationLabel={durationLabel}
                summary={summary}
                availabilityStatus={availabilityStatus}
                schedule={schedule}
                isOutOfHours={isOutOfHours}
                waitLabel={waitLabel}
                conflicts={conflicts}
              />

              {/* Getting there */}
              {(placeLocation?.nearestStation || placeLocation?.nameJapanese) && (
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-stone">
                  {placeLocation?.nearestStation && (
                    <span className="flex items-center gap-1">
                      <TrainFront className="h-3 w-3" aria-hidden="true" />
                      {placeLocation.nearestStation}
                    </span>
                  )}
                  {placeLocation?.nameJapanese && (
                    <span lang="ja">{placeLocation.nameJapanese}</span>
                  )}
                </div>
              )}

              {/* Insider Tip — collapsed by default, expand on click */}
              {placeLocation?.insiderTip && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setInsiderTipOpen(!insiderTipOpen); }}
                  className="mt-2 w-full text-left"
                >
                  {insiderTipOpen ? (
                    <div className="rounded-md bg-surface p-2">
                      <p className="text-xs leading-relaxed text-foreground-secondary">
                        {placeLocation.insiderTip}
                      </p>
                    </div>
                  ) : (
                    <p className="inline-flex items-center gap-1 text-[11px] text-stone hover:text-foreground-secondary transition-colors">
                      <Lightbulb className="h-3 w-3" aria-hidden="true" />
                      Insider tip available
                    </p>
                  )}
                </button>
              )}
            </div>

            {/* Action icons — vertical stack on right */}
            {!isReadOnly && (
              <div className="flex shrink-0 flex-col items-center gap-0.5 self-center">
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleToggleNotes(); }}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-stone/40 transition hover:bg-sage/10 hover:text-sage"
                  aria-label={notesOpen ? `Hide note on ${activity.title}` : `Add note to ${activity.title}`}
                  title={notesOpen ? "Hide note" : "Add note"}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                {tripId && dayId && onReplace && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReplace(); }}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-stone/40 transition hover:bg-sage/10 hover:text-sage"
                    aria-label={`Find alternatives to ${activity.title}`}
                    title="Find alternatives"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(); }}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-stone/40 transition hover:bg-error/10 hover:text-error"
                  aria-label={`Delete ${activity.title}`}
                  title="Remove this activity"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Notes Section (collapsible) */}
          {notesOpen && !isReadOnly && (
            <div className="border-t border-border/30 px-3 py-2.5">
              <label htmlFor={notesId} className="sr-only">
                {noteLabel}
              </label>
              <textarea
                id={notesId}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-base text-foreground-secondary placeholder:text-stone focus:border-border focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
                rows={2}
                value={notesValue}
                onChange={handleNotesChange}
                placeholder="Add helpful details, reminders, or context..."
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          {activity.notes && isReadOnly && (
            <div className="border-t border-border/30 px-3 py-2">
              <p className="text-sm text-foreground-secondary">{activity.notes}</p>
            </div>
          )}
        </m.div>
      </div>
    );
  },
));

PlaceActivityRow.displayName = "PlaceActivityRow";

