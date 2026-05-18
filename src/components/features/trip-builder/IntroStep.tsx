"use client";

import { useState, useCallback, useRef } from "react";
import { m, useReducedMotion, AnimatePresence } from "framer-motion";
import { SplitText } from "@/components/ui/SplitText";
import { IntroImagePanel } from "@/components/features/trip-builder/IntroImagePanel";
import { easeReveal, staggerWord, durationBase } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { deriveRegionsFromCities } from "@/data/regions";

import type { TripBuilderData, CityId, EntryPoint } from "@/types/trip";
import type { TripBuilderConfig } from "@/types/sanitySiteContent";
import type { VibeId } from "@/data/vibes";

const QUICK_ENTRY_POINTS: Record<string, EntryPoint> = {
  NRT: { type: "airport", id: "nrt", name: "Narita International Airport", iataCode: "NRT", cityId: "tokyo", coordinates: { lat: 35.7647, lng: 140.3864 }, region: "kanto" },
  KIX: { type: "airport", id: "kix", name: "Kansai International Airport", iataCode: "KIX", cityId: "osaka", coordinates: { lat: 34.4347, lng: 135.2441 }, region: "kansai" },
  CTS: { type: "airport", id: "cts", name: "New Chitose Airport", iataCode: "CTS", cityId: "sapporo", coordinates: { lat: 42.7752, lng: 141.6925 }, region: "hokkaido" },
  FUK: { type: "airport", id: "fuk", name: "Fukuoka Airport", iataCode: "FUK", cityId: "fukuoka", coordinates: { lat: 33.5859, lng: 130.4510 }, region: "kyushu" },
};

const QUICK_PRESETS = [
  { id: "tokyo", label: "Tokyo", cities: ["tokyo"], airport: "NRT", vibes: ["modern_japan", "foodie_paradise"] },
  { id: "kyoto-osaka", label: "Kyoto & Osaka", cities: ["kyoto", "osaka"], airport: "KIX", vibes: ["temples_tradition", "foodie_paradise"] },
  { id: "tokyo-kyoto", label: "Tokyo, Kyoto & Osaka", cities: ["tokyo", "kyoto", "osaka"], airport: "NRT", exit: "KIX", vibes: ["temples_tradition", "foodie_paradise"] },
  { id: "hokkaido", label: "Hokkaido", cities: ["sapporo", "hakodate"], airport: "CTS", vibes: ["nature_adventure", "foodie_paradise"] },
  { id: "kyushu", label: "Kyushu", cities: ["fukuoka", "nagasaki"], airport: "FUK", vibes: ["nature_adventure", "history_buff"] },
] as const satisfies readonly {
  id: string;
  label: string;
  cities: readonly string[];
  airport: string;
  exit?: string;
  vibes: readonly VibeId[];
}[];

const DURATION_OPTIONS = [3, 5, 7, 10] as const;

type IntroStepProps = {
  onStart: () => void;
  onQuickStart?: (data: Partial<TripBuilderData>) => void;
  sanityConfig?: TripBuilderConfig;
};

export function IntroStep({ onStart, onQuickStart, sanityConfig }: IntroStepProps) {
  const prefersReducedMotion = useReducedMotion();
  const [showQuickPlan, setShowQuickPlan] = useState(false);
  const quickPlanRef = useRef<HTMLDivElement>(null);
  const [quickDuration, setQuickDuration] = useState<number>(5);
  const [quickPreset, setQuickPreset] = useState("tokyo-kyoto");

  const handleQuickStart = useCallback(() => {
    if (!onQuickStart) return;
    const preset = QUICK_PRESETS.find((p) => p.id === quickPreset) ?? QUICK_PRESETS[2];
    const cities = [...preset.cities] as CityId[];
    const regions = deriveRegionsFromCities(cities);
    const vibes: VibeId[] = [...preset.vibes];

    // Start date 2 weeks from now
    const start = new Date();
    start.setDate(start.getDate() + 14);
    const end = new Date(start);
    end.setDate(end.getDate() + quickDuration - 1);

    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const entryPoint = QUICK_ENTRY_POINTS[preset.airport];
    const exitAirport = "exit" in preset ? preset.exit : undefined;
    const exitPoint = exitAirport ? QUICK_ENTRY_POINTS[exitAirport] : undefined;

    onQuickStart({
      duration: quickDuration,
      dates: { start: fmt(start), end: fmt(end) },
      vibes,
      regions,
      cities,
      style: "balanced",
      entryPoint,
      sameAsEntry: !exitPoint,
      ...(exitPoint ? { exitPoint } : {}),
    });
  }, [onQuickStart, quickPreset, quickDuration]);

  const heading = sanityConfig?.introHeading ?? "Your Japan";
  const subheading = sanityConfig?.introSubheading ?? "starts here";
  const description =
    sanityConfig?.introDescription ??
    "Tell us how you want to spend your days. We\u2019ll handle routing, timing, and the details.";
  const ctaText = sanityConfig?.introCtaText ?? "Start planning";
  const eyebrow = sanityConfig?.introEyebrow ?? "TRIP BUILDER";
  const accentImage =
    sanityConfig?.introAccentImage?.url ?? "/images/regions/kansai-hero.jpg";
  const imageCaption = sanityConfig?.introImageCaption ?? "Kansai, Japan";

  const fade = (delay: number) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { opacity: 0.005, y: 12 } as const,
          animate: { opacity: 1, y: 0 } as const,
          transition: { duration: 0.4, ease: easeReveal, delay },
        };

  return (
    <div className="relative flex min-h-[100dvh] items-start overflow-hidden bg-background pt-14 lg:items-center">

      {/* Main grid content */}
      <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-10 px-6 py-8 sm:py-12 lg:grid-cols-[1fr_0.82fr] lg:gap-16 lg:px-10 lg:py-28">
        {/* ── LEFT COLUMN — Typography + CTA ── */}
        <div className="flex flex-col justify-center">
          {/* Eyebrow */}
          <m.p
            className="eyebrow-editorial"
            {...fade(0.15)}
          >
            {eyebrow}
          </m.p>

          {/* Heading — lead-in */}
          <SplitText
            as="p"
            className="mt-4 font-serif text-[clamp(2rem,6vw,3.5rem)] leading-[1.1] text-foreground-secondary"
            splitBy="word"
            animation="fadeUp"
            staggerDelay={staggerWord}
            delay={0.05}
          >
            {heading}
          </SplitText>

          {/* Subheading — dramatic scale, brand-primary */}
          <SplitText
            as="h1"
            className="mt-2 font-serif text-[clamp(4rem,12vw,9rem)] leading-[0.9] text-brand-primary"
            splitBy="word"
            animation="clipY"
            staggerDelay={0.08}
            delay={0.25}
          >
            {subheading}
          </SplitText>

          {/* Description */}
          <m.p
            className="mt-6 max-w-sm text-base leading-relaxed text-foreground-secondary sm:text-lg"
            {...fade(0.45)}
          >
            {description}
          </m.p>

          {/* CTAs — Primary + Secondary */}
          <m.div
            className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
            initial={
              prefersReducedMotion ? {} : { opacity: 0.005, y: 12 }
            }
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: durationBase,
              ease: easeReveal,
              delay: 0.7,
            }}
          >
            {/* Primary: Start Planning */}
            <button
              type="button"
              onClick={onStart}
              className="h-14 w-full cursor-pointer rounded-lg bg-brand-primary px-10 text-sm font-semibold text-white shadow-[var(--shadow-card)] transition-all hover:bg-brand-primary/90 hover:shadow-[var(--shadow-elevated)] active:scale-[0.98] sm:w-auto"
            >
              {ctaText}
            </button>

            {/* Secondary: Quick Plan */}
            {onQuickStart && (
              <button
                type="button"
                onClick={() => {
                  setShowQuickPlan((v) => {
                    if (!v) {
                      setTimeout(() => {
                        quickPlanRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }, 350);
                    }
                    return !v;
                  });
                }}
                className="h-14 w-full cursor-pointer rounded-lg border border-border bg-transparent px-10 text-sm font-semibold text-foreground transition-all hover:border-foreground-secondary hover:bg-surface active:scale-[0.98] sm:w-auto"
              >
                Skip the details
              </button>
            )}
          </m.div>

          {/* Quick Plan — express mode (expanded) */}
          {onQuickStart && showQuickPlan && (
            <m.div
              ref={quickPlanRef}
              className="mt-6"
              {...fade(0.1)}
            >
              <AnimatePresence>
                <m.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: easeReveal }}
                  className="overflow-hidden"
                >
                  <div className="rounded-lg bg-surface p-5 max-w-sm space-y-4 shadow-[var(--shadow-card)]">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">
                        Pick a length and go
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowQuickPlan(false)}
                        className="flex h-11 w-11 items-center justify-center rounded-md text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
                        aria-label="Close quick plan"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 1l12 12M13 1L1 13" /></svg>
                      </button>
                    </div>

                    {/* Duration buttons */}
                    <div className="space-y-1.5">
                      <p className="text-xs text-stone uppercase tracking-wide">Duration</p>
                      <div className="flex gap-2">
                        {DURATION_OPTIONS.map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setQuickDuration(d)}
                            className={cn(
                              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                              d === quickDuration
                                ? "bg-brand-primary text-white"
                                : "bg-background text-foreground-secondary hover:text-foreground"
                            )}
                          >
                            {d}d
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Destination preset chips */}
                    <div className="space-y-1.5">
                      <p className="text-xs text-stone uppercase tracking-wide">Destination</p>
                      <div className="flex flex-wrap gap-2">
                        {QUICK_PRESETS.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setQuickPreset(p.id)}
                            className={cn(
                              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                              p.id === quickPreset
                                ? "bg-brand-primary text-white"
                                : "bg-background text-foreground-secondary hover:text-foreground"
                            )}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Go button */}
                    <button
                      type="button"
                      onClick={handleQuickStart}
                      className="h-11 w-full rounded-lg bg-brand-primary text-sm font-semibold text-white transition-all hover:bg-brand-primary/90 active:scale-[0.98]"
                    >
                      Go
                    </button>
                  </div>
                </m.div>
              </AnimatePresence>
            </m.div>
          )}
        </div>

        {/* ── RIGHT COLUMN — Image Panel (renders first on mobile so the image
             anchors the screen instead of peeking awkwardly below the CTAs) ── */}
        <div className="order-first flex w-full items-start lg:order-0 lg:sticky lg:top-16 lg:self-start">
          <IntroImagePanel
            src={accentImage}
            caption={imageCaption}
            delay={0.6}
          />
        </div>
      </div>

    </div>
  );
}
