"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { m } from "framer-motion";

import { PhotoAttribution } from "@/components/features/places/PhotoAttribution";
import { DatePicker } from "@/components/ui/DatePicker";
import { useTripBuilder } from "@/context/TripBuilderContext";
import { cn } from "@/lib/cn";
import { typography } from "@/lib/typography-system";
import { parseLocalDate, parseLocalDateWithOffset, formatLocalDateISO } from "@/lib/utils/dateUtils";
import { durationFast, easeReveal } from "@/lib/motion";
import type { LocationHeroAttribution } from "@/types/location";
import type { TripBuilderConfig } from "@/types/sanitySiteContent";

type DateFormValues = {
  start?: string;
  end?: string;
};

type Season = "spring" | "summer" | "autumn" | "winter";

const MIN_DURATION = 1;
const MAX_DURATION = 21;

function getCurrentSeason(now: Date = new Date()): Season {
  const month = now.getMonth();
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

type WikimediaSeasonalImage = {
  url: string;
  attribution: LocationHeroAttribution;
};

const WIKIMEDIA_SEASONAL_FALLBACKS: Record<Season, WikimediaSeasonalImage> = {
  spring: {
    url: "https://upload.wikimedia.org/wikipedia/commons/a/ae/%E6%A1%9C%E6%BA%80%E9%96%8B%E3%81%AE%E5%90%89%E9%87%8E%E5%B1%B1%E3%81%A8%E9%87%91%E5%B3%AF%E5%B1%B1%E5%AF%BA.jpg",
    attribution: {
      author: "Ibamoto",
      authorUri: "https://commons.wikimedia.org/wiki/User:Ibamoto",
      licenseShort: "CC BY-SA 4.0",
      licenseUri: "https://creativecommons.org/licenses/by-sa/4.0/",
      licenseNotice: null,
      sourceUri:
        "https://commons.wikimedia.org/wiki/File:%E6%A1%9C%E6%BA%80%E9%96%8B%E3%81%AE%E5%90%89%E9%87%8E%E5%B1%B1%E3%81%A8%E9%87%91%E5%B3%AF%E5%B1%B1%E5%AF%BA.jpg",
    },
  },
  summer: {
    url: "https://upload.wikimedia.org/wikipedia/commons/c/c7/Rice_terraces_in_Hatenashi_village_A.jpg",
    attribution: {
      author: "Sakaori",
      authorUri:
        "https://commons.wikimedia.org/wiki/User:%E3%81%95%E3%81%8B%E3%81%8A%E3%82%8A",
      licenseShort: "CC BY-SA 4.0",
      licenseUri: "https://creativecommons.org/licenses/by-sa/4.0/",
      licenseNotice: null,
      sourceUri:
        "https://commons.wikimedia.org/wiki/File:Rice_terraces_in_Hatenashi_village_A.jpg",
    },
  },
  autumn: {
    url: "https://upload.wikimedia.org/wikipedia/commons/b/bc/Tofukuji-bridge-autumn-2017-Luka-Peternel.jpg",
    attribution: {
      author: "Luka Peternel",
      authorUri: "https://commons.wikimedia.org/wiki/User:Path-x21",
      licenseShort: "CC BY-SA 4.0",
      licenseUri: "https://creativecommons.org/licenses/by-sa/4.0/",
      licenseNotice: null,
      sourceUri:
        "https://commons.wikimedia.org/wiki/File:Tofukuji-bridge-autumn-2017-Luka-Peternel.jpg",
    },
  },
  winter: {
    url: "https://upload.wikimedia.org/wikipedia/commons/c/ca/Winter_in_Shirakawa-go_%2851815451686%29.jpg",
    attribution: {
      author: "Raita Futo",
      authorUri: null,
      licenseShort: "CC BY 2.0",
      licenseUri: "https://creativecommons.org/licenses/by/2.0/",
      licenseNotice: null,
      sourceUri:
        "https://commons.wikimedia.org/wiki/File:Winter_in_Shirakawa-go_(51815451686).jpg",
    },
  },
};

type ResolvedHeroImage = {
  url: string;
  attribution: LocationHeroAttribution | null;
};

function resolveHeroImage(
  season: Season,
  sanityConfig?: TripBuilderConfig
): ResolvedHeroImage {
  const sanitySeasonalUrl = sanityConfig?.dateStepSeasonalImages?.[season]?.url;
  if (sanitySeasonalUrl) {
    return { url: sanitySeasonalUrl, attribution: null };
  }
  const wikimedia = WIKIMEDIA_SEASONAL_FALLBACKS[season];
  return { url: wikimedia.url, attribution: wikimedia.attribution };
}

export type DateStepProps = {
  onValidityChange?: (isValid: boolean) => void;
  sanityConfig?: TripBuilderConfig;
};

export function DateStep({ onValidityChange, sanityConfig }: DateStepProps) {
  const { data, setData } = useTripBuilder();

  const [season] = useState<Season>(() => getCurrentSeason());
  const heroImage = useMemo(
    () => resolveHeroImage(season, sanityConfig),
    [season, sanityConfig]
  );

  const formValues = useMemo<DateFormValues>(
    () => ({
      start: data.dates.start ?? "",
      end: data.dates.end ?? "",
    }),
    [data.dates.start, data.dates.end]
  );

  const {
    control,
    formState: { errors, isValid },
  } = useForm<DateFormValues>({
    values: formValues,
    mode: "onChange",
    reValidateMode: "onChange",
  });

  useEffect(() => {
    onValidityChange?.(isValid);
  }, [isValid, onValidityChange]);

  const startValue = useWatch({ control, name: "start" });
  const endValue = useWatch({ control, name: "end" });

  const calculatedDuration = useMemo(() => {
    if (!startValue || !endValue) return null;
    const startDate = parseLocalDate(startValue);
    const endDate = parseLocalDate(endValue);
    if (!startDate || !endDate) return null;
    const diffTime = endDate.getTime() - startDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  }, [startValue, endValue]);

  const today = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  const minEndDate = useMemo(() => {
    if (!startValue) return today;
    return startValue;
  }, [startValue, today]);

  const maxEndDate = useMemo(() => {
    if (!startValue) return undefined;
    const maxDate = parseLocalDateWithOffset(startValue, MAX_DURATION - 1);
    if (!maxDate) return undefined;
    return formatLocalDateISO(maxDate);
  }, [startValue]);

  const syncDates = useCallback(() => {
    const duration =
      calculatedDuration &&
      calculatedDuration >= MIN_DURATION &&
      calculatedDuration <= MAX_DURATION
        ? calculatedDuration
        : undefined;

    setData((prev) => ({
      ...prev,
      duration,
      dates: {
        ...prev.dates,
        start: startValue,
        end: endValue,
      },
    }));
  }, [calculatedDuration, startValue, endValue, setData]);

  useEffect(() => {
    syncDates();
  }, [syncDates]);

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      {/* Left half — Visual (hidden on mobile, shown on lg+) */}
      <div className="relative hidden w-1/2 overflow-hidden rounded-lg lg:block">
        <m.div
          className="absolute inset-0"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 12, repeat: Infinity, repeatType: "reverse", ease: "linear" }}
        >
          <Image
            src={heroImage.url}
            alt=""
            fill
            className="object-cover"
            sizes="50vw"
          />
        </m.div>
        {heroImage.attribution ? (
          <div className="absolute bottom-3 right-3 max-w-[calc(100%-1.5rem)] rounded bg-foreground/60 px-2 py-1 text-right text-white/85 backdrop-blur-sm [&_a]:underline [&_a]:decoration-white/40 [&_a:hover]:decoration-white">
            <PhotoAttribution
              attribution={heroImage.attribution}
              variant="inline"
            />
          </div>
        ) : null}
      </div>

      {/* Right half — Form */}
      <div className="flex flex-1 flex-col justify-center px-6 py-8 lg:w-1/2 lg:px-12">
        <div className="mx-auto w-full max-w-md">
          <p className="eyebrow-editorial text-brand-primary">
            STEP 01
          </p>

          <m.h2
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: easeReveal, delay: 0.15 }}
            className={cn(typography({ intent: "editorial-h2" }), "tracking-tight")}
          >
            {sanityConfig?.dateStepHeading ?? "When are you going?"}
          </m.h2>

          <p className="mt-2 text-sm text-stone">
            {sanityConfig?.dateStepDescription ?? "Season shapes the trip. Cherry blossoms, fall color, rainy season. Up to 21 days."}
          </p>

          <div className="mt-8 flex flex-col gap-6">
            <Controller
              control={control}
              name="start"
              rules={{ required: "Start date is required" }}
              render={({ field }) => (
                <DatePicker
                  id="trip-start"
                  label={sanityConfig?.dateStepStartLabel ?? "Start Date"}
                  required
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  error={errors.start?.message}
                  min={today}
                  aria-describedby={errors.start?.message ? "start-error" : undefined}
                />
              )}
            />

            <Controller
              control={control}
              name="end"
              rules={{
                required: "End date is required",
                validate: (value) => {
                  if (!value || !startValue) return true;
                  const start = parseLocalDate(startValue);
                  const end = parseLocalDate(value);
                  if (!start || !end) return true;
                  if (end < start) return "End date must be after start date";
                  const diffDays =
                    Math.round(
                      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
                    ) + 1;
                  if (diffDays > MAX_DURATION) {
                    return `Maximum trip duration is ${MAX_DURATION} days`;
                  }
                  return true;
                },
              }}
              render={({ field }) => (
                <DatePicker
                  id="trip-end"
                  label={sanityConfig?.dateStepEndLabel ?? "End Date"}
                  required
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  error={errors.end?.message}
                  min={minEndDate}
                  max={maxEndDate}
                  aria-describedby={errors.end?.message ? "end-error" : undefined}
                />
              )}
            />
          </div>

          {/* Duration stat */}
          {calculatedDuration !== null &&
            calculatedDuration >= MIN_DURATION &&
            calculatedDuration <= MAX_DURATION && (
              <m.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: durationFast, ease: easeReveal }}
                className="mt-6"
                aria-live="polite"
              >
                <p className="font-mono text-sm text-sage">
                  {calculatedDuration === 1
                    ? "Day trip"
                    : `${calculatedDuration} days \u00B7 ${calculatedDuration - 1} night${calculatedDuration - 1 !== 1 ? "s" : ""}`}
                </p>
              </m.div>
            )}
        </div>
      </div>
    </div>
  );
}
