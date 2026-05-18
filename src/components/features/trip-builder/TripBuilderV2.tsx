"use client";

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, m, useReducedMotion, type Variants } from "framer-motion";

import { IntroStep } from "./IntroStep";
import { EntryPointStep } from "./EntryPointStep";
import { VibeStep } from "./VibeStep";
import { RegionStep } from "./RegionStep";
import { STEP_LABELS } from "./StepProgressTrack";
import { ArrowLineCTA } from "./ArrowLineCTA";
import { useTripBuilderNavigation } from "@/hooks/useTripBuilderNavigation";
import { useTripBuilder } from "@/context/TripBuilderContext";
import { validateCityDayRatio } from "@/lib/tripBuilder/cityDayValidation";
import { easePageTransition, durationSlow } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { ChevronLeft } from "lucide-react";
import { WizardChrome } from "./WizardChrome";
import type { TripBuilderConfig } from "@/types/sanitySiteContent";

// Heavy steps are dynamically loaded so they don't bloat the initial wizard chunk:
//   - DateStep pulls in `react-day-picker` via DatePicker (Step 1 only).
//   - ReviewStep pulls in `@dnd-kit/*` via TripSummaryEditorial → SortableCityList,
//     plus the ~509-line OptionsSection with framer-motion disclosures (Step 5 only).
// We pre-warm the next step's chunk from inside an effect (see below) so transitions
// stay snappy. `loading: () => null` is intentional — the AnimatePresence wipe covers
// the gap, and the project doesn't have a shared StepSkeleton component.
const DateStep = dynamic(
  () => import("./DateStep").then((m) => ({ default: m.DateStep })),
  { ssr: false, loading: () => null },
);
const ReviewStep = dynamic(
  () => import("./ReviewStep").then((m) => ({ default: m.ReviewStep })),
  { ssr: false, loading: () => null },
);

// `next/dynamic`'s LoadableComponent exposes `.preload()` at runtime but not
// in its public type. Cast through `unknown` to reach it without `any`.
type Preloadable = { preload?: () => void };
const preload = (component: unknown) => {
  (component as Preloadable).preload?.();
};

export type TripBuilderV2Props = {
  onComplete?: () => void;
  sanityConfig?: TripBuilderConfig;
};

const stepVariants: Variants = {
  enter: (dir: number) => ({
    clipPath: dir > 0 ? "inset(100% 0 0 0)" : "inset(0 0 100% 0)",
  }),
  center: {
    clipPath: "inset(0 0 0 0)",
    transition: { duration: durationSlow, ease: [...easePageTransition] },
  },
  exit: (dir: number) => ({
    clipPath: dir > 0 ? "inset(0 0 100% 0)" : "inset(100% 0 0 0)",
    transition: { duration: 0.5, ease: [...easePageTransition] },
  }),
};

const reducedMotionVariants: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

export function TripBuilderV2({ onComplete, sanityConfig }: TripBuilderV2Props) {
  const prefersReducedMotion = useReducedMotion();
  const { data } = useTripBuilder();

  const {
    currentStep,
    direction,
    completedSteps,
    stepCount,
    setDatesValid,
    setVibesValid,
    setRegionsValid,
    setReviewValid,
    goToStep,
    quickStart,
    handleNext,
    handleBack,
    handleStepClick,
    handleGoToStep,
    isNextDisabled,
    getNextLabel,
  } = useTripBuilderNavigation({ onComplete, sanityConfig });

  const variants = prefersReducedMotion ? reducedMotionVariants : stepVariants;

  // Pre-warm dynamic step chunks so wizard transitions stay snappy.
  // Strategy: while the user is on the *previous* step, fetch the next step's
  // chunk. `next/dynamic` no-ops on repeat calls, so these are idempotent.
  useEffect(() => {
    if (currentStep === 0) preload(DateStep);
    if (currentStep >= 4) preload(ReviewStep);
  }, [currentStep]);

  // Dynamic disabled hint for the region step
  // Use unique city count (Set) to match what the user sees in chips
  const regionDisabledHint = (() => {
    const cityCount = new Set(data.cities ?? []).size;
    if (cityCount === 0) return "Pick at least one city.";
    const v = validateCityDayRatio(cityCount, data.duration ?? 0);
    return v.hint ?? "Pick at least one city.";
  })();

  return (
    <div className="relative bg-background">
      <WizardChrome />

      {/* Step Content */}
      <AnimatePresence mode="wait" custom={direction}>
        <m.div
          key={`step-${currentStep}`}
          custom={direction}
          variants={variants}
          initial={currentStep === 0 ? false : "enter"}
          animate="center"
          exit="exit"
          className="min-h-[100dvh]"
        >
          {currentStep === 0 && <IntroStep onStart={() => goToStep(1)} onQuickStart={quickStart} sanityConfig={sanityConfig} />}

          {currentStep === 1 && (
            <StepShell
              eyebrow="STEP 01"
              onBack={handleBack}
              onNext={handleNext}
              nextLabel={getNextLabel()}
              backLabel={sanityConfig?.navBackLabel}
              nextDisabled={isNextDisabled}
              disabledHint="Set your travel dates."
              currentStep={currentStep}
              totalSteps={stepCount}
              completedSteps={completedSteps}
              onStepClick={handleStepClick}
            >
              <DateStep onValidityChange={setDatesValid} sanityConfig={sanityConfig} />
            </StepShell>
          )}

          {currentStep === 2 && (
            <StepShell
              eyebrow="STEP 02"
              onBack={handleBack}
              onNext={handleNext}
              nextLabel={getNextLabel()}
              backLabel={sanityConfig?.navBackLabel}
              nextDisabled={false}
              currentStep={currentStep}
              totalSteps={stepCount}
              completedSteps={completedSteps}
              onStepClick={handleStepClick}
              fullBleed
            >
              <EntryPointStep sanityConfig={sanityConfig} />
            </StepShell>
          )}

          {currentStep === 3 && (
            <StepShell
              eyebrow="STEP 03"
              onBack={handleBack}
              onNext={handleNext}
              nextLabel={getNextLabel()}
              backLabel={sanityConfig?.navBackLabel}
              nextDisabled={isNextDisabled}
              disabledHint="Pick at least one vibe."
              fullBleed
              currentStep={currentStep}
              totalSteps={stepCount}
              completedSteps={completedSteps}
              onStepClick={handleStepClick}
            >
              <VibeStep onValidityChange={setVibesValid} sanityConfig={sanityConfig} />
            </StepShell>
          )}

          {currentStep === 4 && (
            <StepShell
              eyebrow="STEP 04"
              onBack={handleBack}
              onNext={handleNext}
              nextLabel={getNextLabel()}
              backLabel={sanityConfig?.navBackLabel}
              nextDisabled={isNextDisabled}
              disabledHint={regionDisabledHint}
              fullBleed
              currentStep={currentStep}
              totalSteps={stepCount}
              completedSteps={completedSteps}
              onStepClick={handleStepClick}
            >
              <RegionStep onValidityChange={setRegionsValid} sanityConfig={sanityConfig} />
            </StepShell>
          )}

          {currentStep === 5 && (
            <StepShell
              eyebrow="STEP 05"
              onBack={handleBack}
              onNext={handleNext}
              nextLabel={getNextLabel()}
              backLabel={sanityConfig?.navBackLabel}
              nextDisabled={isNextDisabled}
              currentStep={currentStep}
              totalSteps={stepCount}
              completedSteps={completedSteps}
              onStepClick={handleStepClick}
            >
              <ReviewStep
                onValidityChange={setReviewValid}
                onGoToStep={handleGoToStep}
                sanityConfig={sanityConfig}
              />
            </StepShell>
          )}
        </m.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * StepShell wraps each step with consistent desktop/mobile navigation.
 * Desktop: ArrowLineCTA at bottom-right, back link at bottom-left.
 * Mobile: Fixed bottom bar with back + forward buttons.
 */
type StepShellProps = {
  eyebrow: string;
  children: React.ReactNode;
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  backLabel?: string;
  nextDisabled?: boolean;
  /** Hint shown when user taps a disabled Continue button */
  disabledHint?: string;
  fullBleed?: boolean;
  currentStep: number;
  totalSteps: number;
  completedSteps: Set<number>;
  onStepClick: (step: number) => void;
};

function StepDots({
  currentStep,
  totalSteps,
  completedSteps,
  onStepClick,
}: {
  currentStep: number;
  totalSteps: number;
  completedSteps: Set<number>;
  onStepClick: (step: number) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-6">
        {/* Skip step 0 (Intro) — only show steps 1-5 */}
        {Array.from({ length: totalSteps - 1 }).map((_, idx) => {
          const step = idx + 1;
          const isActive = step === currentStep;
          const isCompleted = completedSteps.has(step);
          const canClick = isCompleted || step <= currentStep;

          return (
            <div key={step} className="group relative">
              <button
                type="button"
                onClick={() => canClick && onStepClick(step)}
                disabled={!canClick}
                className={cn(
                  "relative rounded-full transition-all duration-300 before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-6 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
                  isActive &&
                    "h-2.5 w-2.5 bg-brand-primary shadow-[0_0_12px_rgba(196,80,79,0.4)]",
                  isCompleted &&
                    !isActive &&
                    "h-1.5 w-1.5 bg-sage cursor-pointer hover:bg-sage/80",
                  !isActive &&
                    !isCompleted &&
                    "h-1 w-1 bg-border",
                  canClick && !isActive && "cursor-pointer"
                )}
                aria-label={`Go to ${STEP_LABELS[step]}`}
                aria-describedby={canClick ? `step-tooltip-${step}` : undefined}
              />

              {/* Tooltip — shows on hover */}
              {canClick && (
                <div id={`step-tooltip-${step}`} role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="rounded-md bg-surface px-2 py-1 text-xs text-foreground-secondary shadow-[var(--shadow-card)]">
                    {STEP_LABELS[step]}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Active step label — visible on touch devices only */}
      <p className="touch-only-visible mt-1.5 text-center text-[11px] font-medium text-foreground-secondary">
        {STEP_LABELS[currentStep]}
      </p>
    </>
  );
}

function StepShell({
  children,
  onBack,
  onNext,
  nextLabel,
  backLabel,
  nextDisabled = false,
  disabledHint,
  fullBleed = false,
  currentStep,
  totalSteps,
  completedSteps,
  onStepClick,
}: StepShellProps) {
  const resolvedBackLabel = backLabel ?? "Back";
  const [showHint, setShowHint] = useState(false);

  // The hint stays visible until the blocking condition resolves — it explains
  // why Continue is disabled, so it should persist until the user acts, not
  // race a timer. The effect below hides it the moment `nextDisabled` flips.
  const showDisabledHint = useCallback(() => {
    if (nextDisabled && disabledHint) {
      setShowHint(true);
    }
  }, [nextDisabled, disabledHint]);

  const handleDisabledClick = showDisabledHint;

  // Reset hint when the button becomes enabled.
  useEffect(() => {
    if (!nextDisabled) {
      setShowHint(false);
    }
  }, [nextDisabled]);

  return (
    <div className="flex min-h-[100dvh] flex-col pt-14 pb-20">
      {/* Content area — grows to fill, page scrolls naturally */}
      <div
        className={cn(
          "flex flex-1 flex-col",
          !fullBleed && "mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 lg:px-8"
        )}
      >
        {children}
      </div>

      {/* Desktop Navigation — fixed to viewport bottom */}
      <div className="fixed inset-x-0 bottom-0 z-50 hidden border-t border-border/10 bg-background lg:block">
        <div className="relative mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={onBack}
            className="flex cursor-pointer items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-secondary transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {resolvedBackLabel}
          </button>

          {/* Dots — absolutely centered to viewport */}
          <div className="absolute inset-x-0 flex flex-col items-center gap-1 pointer-events-none">
            <div className="pointer-events-auto">
              <StepDots
                currentStep={currentStep}
                totalSteps={totalSteps}
                completedSteps={completedSteps}
                onStepClick={onStepClick}
              />
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 min-h-[2.5rem]" onClick={handleDisabledClick} onMouseEnter={showDisabledHint}>
            {showHint && disabledHint && (
              <p id="step-disabled-hint" className="rounded-md bg-nasu-tint px-3 py-1.5 text-xs font-medium text-error animate-in fade-in slide-in-from-bottom-1 duration-200" role="alert">
                {disabledHint}
              </p>
            )}
            <ArrowLineCTA
              label={nextLabel}
              onClick={onNext}
              disabled={nextDisabled}
              aria-describedby={disabledHint ? "step-disabled-hint" : undefined}
            />
          </div>
        </div>
      </div>

      {/* Mobile Bottom Bar — fixed to viewport bottom */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border/20 bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden">
        <div className="mb-2 flex justify-center">
          <StepDots
            currentStep={currentStep}
            totalSteps={totalSteps}
            completedSteps={completedSteps}
            onStepClick={onStepClick}
          />
        </div>
        <div className="min-h-[1.25rem]">
          {showHint && disabledHint && (
            <p id="step-disabled-hint-mobile" className="mb-1.5 text-center text-xs font-medium text-error animate-in fade-in duration-200" role="alert">
              {disabledHint}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-foreground-secondary transition-colors hover:bg-surface"
            aria-label="Go back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={nextDisabled ? handleDisabledClick : onNext}
            aria-describedby={disabledHint ? "step-disabled-hint-mobile" : undefined}
            className={cn(
              "h-12 flex-1 rounded-lg text-sm font-medium transition",
              nextDisabled
                ? "bg-surface text-stone"
                : "cursor-pointer bg-brand-primary text-white hover:bg-brand-primary/90 active:scale-[0.98]"
            )}
          >
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
