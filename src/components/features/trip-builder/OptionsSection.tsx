"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import {
  Accessibility,
  ChevronDown,
  Gauge,
  StickyNote,
  Sun,
  Users,
  Utensils,
  Wallet,
} from "lucide-react";
import {
  Controller,
  type Control,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";

import { Input } from "@/components/ui/Input";
import { BudgetInput, type BudgetMode, type BudgetValue } from "./BudgetInput";
import { cn } from "@/lib/cn";
import type { TripStyle } from "@/types/trip";

const DIETARY_OPTIONS = [
  { id: "vegetarian", label: "Vegetarian" },
  { id: "vegan", label: "Vegan" },
  { id: "halal", label: "Halal" },
  { id: "kosher", label: "Kosher" },
  { id: "gluten-free", label: "Gluten-free" },
  { id: "dairy-free", label: "Dairy-free" },
];

const PACE_OPTIONS = [
  { label: "Relaxed", value: "relaxed", description: "Late starts, long lunches, fewer stops" },
  { label: "Balanced", value: "balanced", description: "Steady pace. Room to breathe." },
  { label: "Full", value: "fast", description: "Early to late, covering more ground" },
];

const GROUP_TYPE_SEGMENTS = [
  { label: "Solo", value: "solo" },
  { label: "Couple", value: "couple" },
  { label: "Family", value: "family" },
  { label: "Friends", value: "friends" },
];

export type OptionsFormValues = {
  groupSize?: number;
  groupType?: "solo" | "couple" | "family" | "friends" | "business" | "";
  childrenAges?: string;
  travelStyle?: TripStyle | "";
  mobilityAssistance?: boolean;
  dietary?: string[];
  dietaryOther?: string;
  additionalNotes?: string;
};

export type OptionsSectionProps = {
  control: Control<OptionsFormValues>;
  register: UseFormRegister<OptionsFormValues>;
  setValue: UseFormSetValue<OptionsFormValues>;
  formValues: Partial<OptionsFormValues>;
  // First-time flag (from TripBuilderData, not RHF)
  isFirstTimeVisitor: boolean;
  onToggleFirstTime: () => void;
  // Budget (from TripBuilderData)
  budgetValue?: BudgetValue;
  budgetMode: BudgetMode;
  onBudgetModeChange: (mode: BudgetMode) => void;
  onBudgetChange: (budget: { total?: number; perDay?: number }) => void;
  duration?: number;
  // Pre-fill hint
  showProfileHint?: boolean;
  budgetTitle?: string;
  notesTitle?: string;
  notesPlaceholder?: string;
};

/**
 * Single Options section that bundles all preferences (Pace, Group, Mobility,
 * Dietary, First-time, Budget, Notes). Inline disclosure only.
 */
export function OptionsSection(props: OptionsSectionProps) {
  const {
    control,
    register,
    setValue,
    formValues,
    isFirstTimeVisitor,
    onToggleFirstTime,
    budgetValue,
    budgetMode,
    onBudgetModeChange,
    onBudgetChange,
    duration,
    showProfileHint,
    budgetTitle = "Budget",
    notesTitle = "Notes",
    notesPlaceholder = "Birthday dinner in Kyoto, must see Fushimi Inari, need wheelchair access...",
  } = props;

  const [isInlineOpen, setIsInlineOpen] = useState(false);

  // Derive a heterogeneous "X of 7 set" count.
  const setCount = useMemo(() => {
    let count = 0;
    if (formValues.travelStyle) count += 1; // Pace
    if (formValues.groupType) count += 1; // Group
    if (formValues.mobilityAssistance) count += 1; // Mobility
    if ((formValues.dietary?.length ?? 0) > 0) count += 1; // Dietary
    if (isFirstTimeVisitor) count += 1; // First-time
    if (budgetValue) count += 1; // Budget
    if (formValues.additionalNotes?.trim()) count += 1; // Notes
    return count;
  }, [formValues, isFirstTimeVisitor, budgetValue]);

  const toggleHeader = () => setIsInlineOpen((v) => !v);

  const body = (
    <OptionsBody
      control={control}
      register={register}
      setValue={setValue}
      formValues={formValues}
      isFirstTimeVisitor={isFirstTimeVisitor}
      onToggleFirstTime={onToggleFirstTime}
      budgetValue={budgetValue}
      budgetMode={budgetMode}
      onBudgetModeChange={onBudgetModeChange}
      onBudgetChange={onBudgetChange}
      duration={duration}
      showProfileHint={showProfileHint}
      budgetTitle={budgetTitle}
      notesTitle={notesTitle}
      notesPlaceholder={notesPlaceholder}
    />
  );

  return (
    <>
      <div className="overflow-hidden rounded-lg bg-surface shadow-[var(--shadow-card)]">
        <button
          type="button"
          onClick={toggleHeader}
          aria-expanded={isInlineOpen}
          className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-primary/5"
        >
          <span className="flex-1 text-sm font-medium text-foreground">Options</span>
          <span className="text-xs text-stone">
            {setCount} of 7 set
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-stone transition-transform duration-200",
              isInlineOpen && "rotate-180"
            )}
          />
        </button>

        <AnimatePresence initial={false}>
          {isInlineOpen && (
            <m.div
              key="inline-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
              className="overflow-hidden border-t border-border"
            >
              <div className="px-4 pt-4 pb-5">{body}</div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// OptionsBody — the actual form. Mounted in EXACTLY one place at a time.
// ---------------------------------------------------------------------------

type OptionsBodyProps = OptionsSectionProps;

function OptionsBody(props: OptionsBodyProps) {
  const {
    control,
    register,
    setValue,
    formValues,
    isFirstTimeVisitor,
    onToggleFirstTime,
    budgetValue,
    onBudgetModeChange,
    onBudgetChange,
    duration,
    showProfileHint,
    budgetTitle,
    notesTitle,
    notesPlaceholder,
  } = props;

  return (
    <div className="flex flex-col gap-4">
      {showProfileHint && (
        <p className="text-xs text-stone">Some fields pre-filled from your profile.</p>
      )}

      {/* Pace — segmented control */}
      <SubCard icon={<Gauge className="h-4 w-4" />} title="Pace">
        <Controller
          control={control}
          name="travelStyle"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap gap-1.5">
                {PACE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => field.onChange(field.value === option.value ? "" : option.value)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs font-medium transition-all",
                      field.value === option.value
                        ? "border-brand-primary bg-brand-primary text-white shadow-[var(--shadow-sm)]"
                        : "border-border bg-background text-stone hover:text-foreground"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {(() => {
                const selected = PACE_OPTIONS.find((o) => o.value === field.value);
                return selected ? (
                  <p className="text-xs text-stone">{selected.description}</p>
                ) : null;
              })()}
            </div>
          )}
        />
      </SubCard>

      {/* Group — segmented type + inline size */}
      <SubCard icon={<Users className="h-4 w-4" />} title="Group">
        <Controller
          control={control}
          name="groupType"
          render={({ field }) => (
            <div className="flex flex-wrap gap-1.5">
              {GROUP_TYPE_SEGMENTS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => field.onChange(field.value === option.value ? "" : option.value)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-medium transition-all",
                    field.value === option.value
                      ? "border-brand-primary bg-brand-primary text-white shadow-[var(--shadow-sm)]"
                      : "border-border bg-background text-stone hover:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        />
        {(formValues.groupType === "family" || formValues.groupType === "friends") && (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <label htmlFor="group-size-options" className="text-xs text-stone whitespace-nowrap">
                Adults
              </label>
              <Input
                id="group-size-options"
                type="number"
                min={1}
                max={20}
                placeholder="2"
                className="h-9 w-20 min-h-0 text-center text-sm"
                {...register("groupSize", { valueAsNumber: true })}
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="children-ages-options" className="text-xs text-stone whitespace-nowrap">
                Kids ages
              </label>
              <Input
                id="children-ages-options"
                placeholder="5, 8"
                className="h-9 min-h-0 text-sm"
                {...register("childrenAges")}
              />
            </div>
          </div>
        )}
      </SubCard>

      {/* Mobility — its own sub-card. KOK-22: NOT combined with Dietary. */}
      <SubCard icon={<Accessibility className="h-4 w-4" />} title="Mobility">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-stone">
            Suggest step-free routes, elevators, and accessible accommodation.
          </p>
          <button
            type="button"
            onClick={() => setValue("mobilityAssistance", !formValues.mobilityAssistance, { shouldDirty: true })}
            aria-pressed={Boolean(formValues.mobilityAssistance)}
            aria-label="Mobility assistance"
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full transition-colors",
              formValues.mobilityAssistance ? "bg-brand-primary" : "bg-border"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform shadow-[var(--shadow-sm)]",
                formValues.mobilityAssistance && "translate-x-5"
              )}
            />
          </button>
        </div>
      </SubCard>

      {/* Dietary — its own sub-card. KOK-22: NOT combined with Mobility. */}
      <SubCard icon={<Utensils className="h-4 w-4" />} title="Dietary">
        <div className="flex flex-wrap gap-1.5">
          {DIETARY_OPTIONS.map((option) => {
            const isSelected = formValues.dietary?.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  const current = formValues.dietary ?? [];
                  const next = isSelected
                    ? current.filter((id) => id !== option.id)
                    : [...current, option.id];
                  setValue("dietary", next, { shouldDirty: true });
                }}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  isSelected
                    ? "border-brand-primary/30 bg-brand-primary/10 text-brand-primary"
                    : "border-border bg-background text-stone hover:text-foreground-secondary"
                )}
              >
                {option.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              const current = formValues.dietary ?? [];
              const has = current.includes("other");
              setValue(
                "dietary",
                has ? current.filter((id) => id !== "other") : [...current, "other"],
                { shouldDirty: true }
              );
            }}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              formValues.dietary?.includes("other")
                ? "border-brand-primary/30 bg-brand-primary/10 text-brand-primary"
                : "border-border bg-background text-stone hover:text-foreground-secondary"
            )}
          >
            Other
          </button>
        </div>
        {formValues.dietary?.includes("other") && (
          <Input
            id="dietary-other-options"
            placeholder="Please specify..."
            className="mt-2 h-9 min-h-0 text-sm"
            {...register("dietaryOther")}
          />
        )}
      </SubCard>

      {/* First-time visitor */}
      <SubCard icon={<Sun className="h-4 w-4" />} title="First time in Japan">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-stone">Day 1 paced gently with orientation tips.</p>
          <button
            type="button"
            onClick={onToggleFirstTime}
            aria-pressed={isFirstTimeVisitor}
            aria-label="First time in Japan"
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full transition-colors",
              isFirstTimeVisitor ? "bg-brand-primary" : "bg-border"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform shadow-[var(--shadow-sm)]",
                isFirstTimeVisitor && "translate-x-5"
              )}
            />
          </button>
        </div>
      </SubCard>

      {/* Budget */}
      <SubCard icon={<Wallet className="h-4 w-4" />} title={budgetTitle ?? "Budget"}>
        <BudgetInput
          id="budget-input-options"
          duration={duration}
          value={budgetValue}
          onChange={onBudgetChange}
          onModeChange={onBudgetModeChange}
        />
      </SubCard>

      {/* Notes */}
      <SubCard icon={<StickyNote className="h-4 w-4" />} title={notesTitle ?? "Notes"}>
        <textarea
          id="additional-notes-options"
          placeholder={notesPlaceholder}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base placeholder:text-stone focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          rows={3}
          {...register("additionalNotes")}
        />
      </SubCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubCard — visual sub-section inside Options. Distinct icon + title each.
// Keeps Mobility and Dietary visually separate (KOK-22 absorption).
// ---------------------------------------------------------------------------

function SubCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border/60 bg-background px-4 py-3">
      <header className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface text-foreground-secondary">
          {icon}
        </span>
        <h5 className="text-sm font-medium text-foreground">{title}</h5>
      </header>
      <div>{children}</div>
    </section>
  );
}
