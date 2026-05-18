"use client";

import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { typography } from "@/lib/typography-system";
import { cn } from "@/lib/utils";
import type { LandingPageContent } from "@/types/sanitySiteContent";

type PhilosophyProps = {
  locationCount: number;
  prefectureCount: number;
  tipCount: number;
  content?: LandingPageContent;
};

export function Philosophy({ locationCount, prefectureCount, tipCount, content }: PhilosophyProps) {
  return (
    <section aria-label="Our philosophy" className="bg-canvas min-h-[50vh]">
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 py-12 sm:py-20 lg:py-28 text-center">
        {/* Heading */}
        <ScrollReveal direction="none">
          <h2 className={cn(typography({ intent: "editorial-h2" }), "mx-auto max-w-2xl")}>
            {content?.philosophyHeading ?? "Curated for how you actually travel"}
          </h2>
        </ScrollReveal>

        {/* Stats */}
        <ScrollReveal delay={0.2} direction="none">
          <div className="mt-10 flex flex-wrap items-center justify-center gap-y-6 gap-x-8 sm:gap-x-14 lg:gap-x-20">
            <div className="text-center">
              <div className="flex items-baseline justify-center gap-0.5">
                <AnimatedNumber
                  value={locationCount}
                  className="font-mono text-lg font-light leading-none text-foreground sm:text-xl"
                />
                <span className="font-mono text-base font-light text-foreground sm:text-lg">+</span>
              </div>
              <p className="mt-1.5 text-xs text-foreground-secondary">
                places
              </p>
            </div>

            <div className="hidden sm:block h-10 w-px bg-border" />

            <div className="text-center">
              <AnimatedNumber
                value={prefectureCount}
                className="font-mono text-lg font-light leading-none text-foreground sm:text-xl"
              />
              <p className="mt-1.5 text-xs text-foreground-secondary">
                prefectures
              </p>
            </div>

            <div className="hidden sm:block h-10 w-px bg-border" />

            <div className="text-center">
              <div className="flex items-baseline justify-center gap-0.5">
                <AnimatedNumber
                  value={tipCount}
                  className="font-mono text-lg font-light leading-none text-foreground sm:text-xl"
                />
                <span className="font-mono text-base font-light text-foreground sm:text-lg">+</span>
              </div>
              <p className="mt-1.5 text-xs text-foreground-secondary">
                travel tips
              </p>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
