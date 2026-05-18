"use client";

import Image from "next/image";
import Link from "next/link";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { resizePhotoUrl } from "@/lib/google/transformations";
import { typography } from "@/lib/typography-system";
import { cn } from "@/lib/utils";
import type { Season, SeasonalHighlight } from "@/lib/utils/seasonUtils";
import type { Microseason } from "@/lib/utils/microseasonCalendar";
import type { GuideSummary } from "@/types/guide";
import type { ExperienceSummary } from "@/types/experience";
import type { Location } from "@/types/location";
import type { LandingPageContent } from "@/types/sanitySiteContent";
import { resolveSpotlightCopy } from "./seasonalSpotlightCopy";

type SeasonalSpotlightProps = {
  season: Season;
  highlight?: SeasonalHighlight | null;
  microseason?: Microseason | null;
  guides: GuideSummary[];
  experiences: ExperienceSummary[];
  locations: Location[];
  content?: LandingPageContent;
};

export function SeasonalSpotlight({
  season,
  highlight,
  microseason,
  guides,
  experiences,
  locations,
  content,
}: SeasonalSpotlightProps) {
  const totalItems = guides.length + experiences.length + locations.length;
  if (totalItems === 0) return null;

  // Build mixed cards — fill up to 6 slots
  const cards: CardData[] = [];
  for (const guide of guides) {
    if (cards.length >= 6) break;
    cards.push({ type: "guide", id: guide.id, title: guide.title, image: guide.thumbnailImage || guide.featuredImage, href: `/guides/${guide.id}`, subtitle: guide.city || guide.region || "Japan", summary: guide.summary });
  }
  for (const exp of experiences) {
    if (cards.length >= 6) break;
    cards.push({ type: "experience", id: exp._id ?? exp.slug, title: exp.title, image: exp.thumbnailImage?.url || exp.featuredImage?.url || "", href: `/experiences/${exp.slug}`, subtitle: exp.city || exp.region || "Japan", summary: exp.summary });
  }
  for (const loc of locations) {
    if (cards.length >= 6) break;
    cards.push({ type: "location", id: loc.id, title: loc.name, image: loc.primaryPhotoUrl || loc.image || "", href: `/places/${loc.slug}`, subtitle: loc.city, summary: loc.shortDescription || "" });
  }

  if (cards.length === 0) return null;

  const { heading, description, ctaText } = resolveSpotlightCopy(
    highlight ?? null,
    season,
    content,
  );

  return (
    <section className="bg-background py-12 sm:py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section Header */}
        <ScrollReveal direction="up">
          <div>
            <div>
              <p className="eyebrow-editorial text-brand-secondary">
                {content?.seasonalSpotlightEyebrow ?? "What's in season"}
              </p>
              <h2 className={cn(typography({ intent: "editorial-h2" }), "mt-4")}>
                {heading}
              </h2>
              <p className={cn(typography({ intent: "utility-body-muted" }), "mt-4 max-w-md")}>
                {description}
              </p>
              {microseason ? (
                <p className="mt-3 text-xs text-foreground-secondary">
                  From Japan&rsquo;s 72 microseasons:{" "}
                  <em lang="ja-Latn">{microseason.romaji}</em>
                  {" "}({microseason.english.toLowerCase()}).
                </p>
              ) : null}
            </div>
          </div>
        </ScrollReveal>

        {/* Grid */}
        <div className="mt-10 grid gap-6 sm:grid-cols-2 md:grid-cols-3">
          {cards.map((card, idx) => (
            <ScrollReveal
              key={card.id}
              delay={idx * 0.08}
            >
              <SpotlightCard card={card} idx={idx} />
            </ScrollReveal>
          ))}
        </div>

        {/* Section CTA */}
        <div className="mt-10 text-center">
          <Link
            href="/places?category=in_season"
            className="link-reveal group inline-flex min-h-11 items-center gap-2 py-2 text-sm font-medium text-foreground transition-colors hover:text-brand-primary"
          >
            {ctaText}
            <svg
              className="h-4 w-4 transition-transform group-hover:translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
              />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Internal types + sub-component ───────────────────────────

type CardData = {
  type: "guide" | "experience" | "location";
  id: string;
  title: string;
  image: string;
  href: string;
  subtitle: string;
  summary: string;
};

const TYPE_LABELS: Record<CardData["type"], string> = {
  guide: "Guide",
  experience: "Experience",
  location: "Place",
};

function SpotlightCard({ card, idx }: { card: CardData; idx: number }) {
  const imageSrc = resizePhotoUrl(card.image, 600);

  return (
    <Link
      href={card.href}
      className={`group relative block text-foreground overflow-hidden rounded-lg border border-border shadow-[var(--shadow-card)] transition-all duration-300 hover:border-foreground/30 hover:shadow-[var(--shadow-elevated)] ${idx >= 2 ? "hidden sm:block" : ""}`}
    >
      <div className="relative w-full overflow-hidden aspect-[4/3]">
        <Image
          src={imageSrc || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="}
          alt={card.title}
          fill
          className="object-cover transition-transform duration-500 ease-cinematic group-hover:scale-[1.04]"
          sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
        />
        <div className="absolute inset-0 scrim-70 transition-opacity duration-500 group-hover:opacity-50" />

        {/* Type badge */}
        <div className="absolute left-4 top-4 z-10">
          <span className="inline-flex items-center rounded-md bg-charcoal/70 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {TYPE_LABELS[card.type]}
          </span>
        </div>

        {/* Text overlay */}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-white/70 mb-0.5">
            {card.subtitle}
          </p>
          <p className="font-serif font-medium text-white text-base line-clamp-2">
            {card.title}
          </p>
        </div>
      </div>
    </Link>
  );
}
