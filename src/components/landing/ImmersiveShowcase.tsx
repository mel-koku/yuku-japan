"use client";

import Image from "next/image";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { typography } from "@/lib/typography-system";
import { cn } from "@/lib/utils";
import type { LandingPageContent } from "@/types/sanitySiteContent";

const defaultActs = [
  {
    number: "01",
    eyebrow: "DISCOVER",
    title: "Every place scored for your trip, not someone else's",
    description:
      "Seasonal fit, opening hours, transit distance, how it matches your pace. Scored for your exact dates and travel style. Not a star average.",
    image: "/images/fallback.jpg",
    alt: "Traditional Japanese street",
  },
  {
    number: "02",
    eyebrow: "PLAN",
    title: "Days that flow, not zigzag",
    description:
      "Activities ordered by where they are, with travel time built into every day — so the plan is realistic, not a wishlist of everything at once.",
    image: "/images/fallback.jpg",
    alt: "Japanese train platform",
  },
  {
    number: "03",
    eyebrow: "GO",
    title: "Your plan, in your pocket",
    description:
      "Day-by-day timeline, travel time between every stop, and weather-aware tips. Ask Yuku anything mid-trip. Download as a PDF, share it with a link.",
    image: "/images/fallback.jpg",
    alt: "Traveler exploring Japan",
  },
];

type ImmersiveShowcaseProps = {
  content?: LandingPageContent;
};

type ActData = {
  number: string;
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  alt: string;
};

function resolveActs(content?: LandingPageContent): ActData[] {
  if (content?.showcaseActs?.length === 3) {
    return content.showcaseActs.map((act, i) => ({
      number: act.number,
      eyebrow: act.eyebrow,
      title: act.title,
      description: act.description,
      image: act.image?.url ?? defaultActs[i]?.image ?? defaultActs[0]!.image,
      alt: act.alt,
    }));
  }
  return [...defaultActs];
}

export function ImmersiveShowcase({ content }: ImmersiveShowcaseProps) {
  const acts = resolveActs(content);

  return (
    <section aria-label="Immersive showcase" className="bg-background py-12 sm:py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-6 space-y-16 sm:space-y-20 lg:space-y-24">
        {acts.map((act, i) => {
          const imageLeft = i % 2 === 0;
          const isLast = i === acts.length - 1;

          return (
            <ScrollReveal key={act.number} delay={0.05}>
              {isLast ? (
                /* Last act: stacked on mobile, cinematic overlay on lg+ */
                <>
                  {/* Mobile/tablet: stacked like Acts 1-2 */}
                  <div className="grid items-center gap-10 lg:hidden">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-lg">
                      <Image
                        src={act.image}
                        alt={act.alt}
                        fill
                        className="object-cover"
                        sizes="100vw"
                        loading="lazy"
                      />
                    </div>
                    <div className="max-w-md">
                      <p className="eyebrow-editorial text-brand-primary">{act.eyebrow}</p>
                      <h2 className={cn(typography({ intent: "editorial-h2" }), "mt-4")}>
                        {act.title}
                      </h2>
                      <p className={cn(typography({ intent: "utility-body-muted" }), "mt-5 leading-relaxed")}>
                        {act.description}
                      </p>
                    </div>
                  </div>
                  {/* Desktop: cinematic overlay */}
                  <div className="relative hidden aspect-[16/7] overflow-hidden rounded-lg lg:block">
                    <Image
                      src={act.image}
                      alt={act.alt}
                      fill
                      className="object-cover"
                      sizes="100vw"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-charcoal/70" />
                    <div className="absolute inset-0 flex items-center justify-center px-16">
                      <div className="max-w-lg text-center">
                        <p className="eyebrow-editorial text-brand-primary">{act.eyebrow}</p>
                        <h2 className={cn(typography({ intent: "editorial-h2" }), "mt-4 text-white")}>
                          {act.title}
                        </h2>
                        <p className="mt-5 text-base leading-relaxed text-white/90">
                          {act.description}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* Acts 1-2: split layout, alternating image side */
                <div
                  className={`grid items-center gap-10 lg:gap-16 ${
                    imageLeft ? "lg:grid-cols-[5fr_4fr]" : "lg:grid-cols-[4fr_5fr]"
                  }`}
                >
                  <div className={`relative aspect-[4/3] overflow-hidden rounded-lg ${!imageLeft ? "lg:order-2" : ""}`}>
                    <Image
                      src={act.image}
                      alt={act.alt}
                      fill
                      className="object-cover"
                      sizes="(min-width: 1024px) 55vw, 100vw"
                      loading={i === 0 ? "eager" : "lazy"}
                    />
                  </div>
                  <div className={`max-w-md ${!imageLeft ? "lg:order-1" : ""}`}>
                    <p className="eyebrow-editorial text-brand-primary">{act.eyebrow}</p>
                    <h2 className={cn(typography({ intent: "editorial-h2" }), "mt-4")}>
                      {act.title}
                    </h2>
                    <p className={cn(typography({ intent: "utility-body-muted" }), "mt-5 leading-relaxed")}>
                      {act.description}
                    </p>
                  </div>
                </div>
              )}
            </ScrollReveal>
          );
        })}
      </div>
    </section>
  );
}
