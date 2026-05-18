"use client";

import Image from "next/image";
import { cn } from "@/lib/cn";
import { typography } from "@/lib/typography-system";
import { SplitText } from "@/components/ui/SplitText";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { staggerWord } from "@/lib/motion";
import type { LandingPageContent } from "@/types/sanitySiteContent";

// ── Feature showcase (default when no Sanity testimonials) ──────────

const FEATURES = [
  { title: "Routed Days", description: "Activities ordered by geography so your days flow, not zigzag. No backtracking." },
  { title: "Realistic Timing", description: "Every stop placed with travel time between it and the next — so your day is a plan, not a wishlist." },
  { title: "Seasonal Fit", description: "Cherry blossom timing, rainy season, festival crowds. Your dates shape what we suggest." },
  { title: "Practical Tips", description: "IC card reminders on Day 1. Luggage forwarding before long rides." },
  { title: "Day Trip Ideas", description: "Locations outside your route, scored and ready to swap in." },
  { title: "Shareable Link", description: "One link. Full itinerary. No account needed." },
];

function FeatureShowcase({ content }: { content?: LandingPageContent }) {
  const imageSrc = content?.testimonialBackgroundImage?.url ?? "/images/fallback.jpg";

  return (
    <section aria-label="What your itinerary delivers" className="bg-canvas py-12 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-[5fr_7fr] lg:gap-16 xl:gap-24">

          {/* Left: sticky image */}
          <div className="lg:sticky lg:top-8 lg:self-start">
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg lg:aspect-[3/4]">
              <Image
                src={imageSrc}
                alt="Narrow Kyoto backstreet at night with warm lantern light"
                fill
                className="object-cover"
                sizes="(min-width: 1024px) 40vw, 100vw"
              />
            </div>
          </div>

          {/* Right: heading + feature list */}
          <div>
            <p className="eyebrow-editorial text-brand-primary">What&apos;s in every Trip Pass</p>
            <h2 className={cn(typography({ intent: "editorial-h2" }), "mt-4")}>
              Every day, routed and timed.
            </h2>

            <div className="mt-10 sm:mt-12">
              {FEATURES.map((feature, idx) => (
                <ScrollReveal key={feature.title} delay={idx * 0.05}>
                  <div className={cn(
                    "flex items-baseline gap-5 py-5",
                    idx < FEATURES.length - 1 ? "border-b border-border" : "",
                  )}>
                    <span className="w-5 shrink-0 font-mono text-xs text-foreground-secondary">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3 className={cn(typography({ intent: "utility-body" }), "font-semibold text-foreground")}>
                        {feature.title}
                      </h3>
                      <p className={cn(typography({ intent: "utility-body-muted" }), "mt-1 text-sm leading-relaxed")}>
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

// ── Real testimonials (when Sanity has content) ─────────────────────

type TestimonialData = {
  quote: string;
  author: string;
  location: string;
  image: string;
  alt: string;
};

function TestimonialSection({ testimonials }: { testimonials: TestimonialData[] }) {
  const [featured, ...rest] = testimonials;

  if (!featured) return null;

  return (
    <section aria-label="Testimonials" className="bg-background">
      {/* Featured testimonial */}
      <div className="relative flex min-h-[50vh] sm:min-h-[80vh] items-center justify-center overflow-hidden">
        {featured.image ? (
          <Image
            src={featured.image}
            alt={featured.alt}
            fill
            className="object-cover"
            sizes="100vw"
          />
        ) : (
          <div className="absolute inset-0 bg-charcoal" />
        )}
        <div className="absolute inset-0 bg-charcoal/70" />

        <div className="relative z-10 max-w-3xl px-6 py-12 sm:px-8 sm:py-20 lg:py-28">
          <span className="mb-4 block select-none font-serif text-[4rem] leading-none text-white/15 sm:text-[6rem]">
            &ldquo;
          </span>

          <blockquote className="-mt-12 sm:-mt-16">
            <SplitText
              as="p"
              className={cn(typography({ intent: "editorial-h2" }), "text-white")}
              splitBy="word"
              animation="fadeUp"
              staggerDelay={staggerWord}
              delay={0.1}
            >
              {featured.quote}
            </SplitText>
          </blockquote>

          <div className="mt-8">
            <p className={cn(typography({ intent: "utility-body" }), "text-sm font-medium text-white")}>
              {featured.author}
            </p>
            <p className={cn(typography({ intent: "utility-meta" }), "mt-0.5 text-white/80")}>
              {featured.location}
            </p>
          </div>
        </div>
      </div>

      {/* Remaining testimonials */}
      {rest.length > 0 && (
        <ScrollReveal delay={0.1}>
          <div className="py-12 sm:py-16 lg:py-20">
            <div className="mx-auto max-w-7xl px-6">
              <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
                {rest.map((testimonial, i) => (
                  <div
                    key={i}
                    className="rounded-lg bg-surface p-7 shadow-[var(--shadow-card)]"
                  >
                    <blockquote>
                      <p className={cn(typography({ intent: "editorial-quote" }), "text-base leading-relaxed")}>
                        &ldquo;{testimonial.quote}&rdquo;
                      </p>
                    </blockquote>
                    <div className="mt-4">
                      <p className={cn(typography({ intent: "utility-meta" }), "font-medium text-foreground")}>
                        {testimonial.author}
                      </p>
                      <p className={cn(typography({ intent: "utility-meta" }), "mt-0.5")}>
                        {testimonial.location}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollReveal>
      )}
    </section>
  );
}

// ── Exported component ──────────────────────────────────────────────

type TestimonialTheaterProps = {
  content?: LandingPageContent;
};

export function TestimonialTheater({ content }: TestimonialTheaterProps) {
  // If Sanity has real testimonials, show those. Otherwise, show feature showcase.
  if (content?.testimonials?.length) {
    const testimonials: TestimonialData[] = content.testimonials.map((t) => ({
      quote: t.quote,
      author: t.authorName,
      location: t.authorLocation,
      image: t.image?.url ?? "",
      alt: t.alt,
    }));
    return <TestimonialSection testimonials={testimonials} />;
  }

  return <FeatureShowcase content={content} />;
}
