"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, m } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { typography } from "@/lib/typography-system";
import { easeEditorialMut, durationBase } from "@/lib/motion";
import type { ItineraryActivity } from "@/types/itinerary";
import { InlineAddActivity } from "@/components/features/itinerary/chapter/InlineAddActivity";
import {
  MealNearbySuggestions,
  type MealNearbyAnchor,
} from "@/components/features/itinerary/chapter/MealNearbySuggestions";

export type AddPlaceDialogDay = {
  index: number;
  label: string;
  activities: ItineraryActivity[];
  /**
   * Display city name for the day (e.g. "Tokyo"). Used to rank catalog search
   * results so day-relevant locations surface first. Optional — days without
   * an assigned city skip context ranking.
   */
  city?: string;
};

export type AddPlaceDialogProps = {
  open: boolean;
  onClose: () => void;
  days: AddPlaceDialogDay[];
  defaultDayIndex: number;
  onAdd: (
    dayIndex: number,
    activity: Extract<ItineraryActivity, { kind: "place" }>,
    meta: { addressSource: "mapbox" | "google" | "as-is" | "none" },
  ) => void;
  /** When set, the dialog frames itself as adding a meal — drives the title
   * and shows nearby food suggestions above the search/custom tabs. */
  presetMealType?: "breakfast" | "lunch" | "dinner";
  /** Anchor to search around for nearby suggestions (only used when
   * presetMealType is also set). Computed by the caller based on the meal:
   * breakfast → day start point; lunch → last morning stop; dinner → last stop. */
  nearbyAnchor?: MealNearbyAnchor;
};

const MEAL_TITLE: Record<"breakfast" | "lunch" | "dinner", string> = {
  breakfast: "Add breakfast",
  lunch: "Add lunch",
  dinner: "Add dinner",
};

export function AddPlaceDialog({
  open,
  onClose,
  days,
  defaultDayIndex,
  onAdd,
  presetMealType,
  nearbyAnchor,
}: AddPlaceDialogProps) {
  const [selectedDayIdx, setSelectedDayIdx] = useState(defaultDayIndex);

  // Reset the selected day whenever the dialog reopens to honor the latest
  // defaultDayIndex (reflects current scroll position in ChapterList).
  useEffect(() => {
    if (open) setSelectedDayIdx(defaultDayIndex);
  }, [open, defaultDayIndex]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // `selectedDayIdx` holds a true day index (from `defaultDayIndex` and the
  // `<option value>`s), not an array position — resolve by the `index` field
  // so a filtered/non-contiguous `days` list (locked days removed) still maps
  // correctly.
  const selectedDay =
    days.find((d) => d.index === selectedDayIdx) ?? days[0];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <m.div
            className="fixed inset-0 z-[60] bg-charcoal/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: durationBase * 0.75,
              ease: easeEditorialMut,
            }}
            onClick={onClose}
            role="presentation"
          />
          {/* Dialog centering wrapper — pointer-events-none so clicks pass through to backdrop */}
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
            <m.div
              role="dialog"
              aria-label="Add a place"
              className={cn(
                "w-full max-w-lg bg-background rounded-md shadow-[var(--shadow-elevated)]",
                "flex flex-col max-h-[85dvh] pointer-events-auto",
              )}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: durationBase, ease: easeEditorialMut }}
              onClick={(e) => e.stopPropagation()}
            >
              <header className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-border">
                <div className="flex-1 min-w-0">
                  <h2 className={cn(typography({ intent: "editorial-h3" }), "mb-3")}>
                    {presetMealType ? MEAL_TITLE[presetMealType] : "Add a place"}
                  </h2>
                  <div className="text-sm text-foreground-secondary mt-1">
                    <label className="inline-flex items-center gap-2 flex-wrap">
                      <span>Adding to</span>
                      <select
                        value={selectedDayIdx}
                        onChange={(e) => setSelectedDayIdx(Number(e.target.value))}
                        className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground"
                      >
                        {days.map((d) => (
                          <option key={d.index} value={d.index}>{d.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="shrink-0 -mr-2 flex h-11 w-11 items-center justify-center rounded-md text-foreground-secondary hover:bg-canvas/50 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </header>
              <div className="flex-1 min-h-0 overflow-y-auto p-6 pt-4">
                {selectedDay && presetMealType && nearbyAnchor && (
                  <MealNearbySuggestions
                    mealType={presetMealType}
                    anchor={nearbyAnchor}
                    dayActivities={selectedDay.activities}
                    onPick={(activity) => {
                      onAdd(selectedDay.index, activity, { addressSource: "none" });
                      onClose();
                    }}
                  />
                )}
                {selectedDay && (
                  <InlineAddActivity
                    dayActivities={selectedDay.activities}
                    currentDayCity={selectedDay.city}
                    tripCities={Array.from(
                      new Set(days.map((d) => d.city).filter((c): c is string => Boolean(c))),
                    )}
                    onAdd={(activity, meta) => {
                      onAdd(selectedDay.index, activity, meta);
                      onClose();
                    }}
                  />
                )}
              </div>
            </m.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
