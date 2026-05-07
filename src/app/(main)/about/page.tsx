import type { Metadata } from "next";
import Image from "next/image";
import Script from "next/script";
import { Github, Linkedin, Twitter, Globe } from "lucide-react";
import { typography } from "@/lib/typography-system";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { getAboutPageContent } from "@/lib/sanity/contentService";
import { serializeJsonLd } from "@/lib/seo/jsonLd";

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://yukujapan.com").replace(/\/+$/, "");

export const metadata: Metadata = {
  title: "About | Yuku Japan",
  description:
    "Yuku is a Japan travel publication and trip planner, built by a solo founder. Sourced from official tourism boards. Routed for the way you actually travel.",
  alternates: {
    canonical: "/about",
  },
};

export const revalidate = 3600;

// ── Fallback data ──────────────────────────────────

const FALLBACK = {
  heroEyebrow: "Our Story",
  heroHeading: "Built for the trips guidebooks can\u2019t plan",
  heroSubtext:
    "Going to Japan should feel as good as being there. Yuku (\u884C\u304F) means \u201Cto go.\u201D We built this for the going.",
  storyHeading: "Why Yuku exists",
  storyParagraphs: [
    "Japan rewards the traveler who goes deeper. A tonkatsu shop three blocks from the station. A mountain shrine that empties out by mid-afternoon. The quiet prefecture most itineraries skip.",
    "These moments take planning, not luck. Yuku does the planning, with the depth and care of a concierge who already knows the country.",
  ],
  storyImageUrl: "/placeholders/about-story.svg",
  photoBreakUrl: "/placeholders/about-photo-break.svg",
  valuesHeading: "What we believe",
  values: [
    {
      title: "A trip, not a research project.",
      description:
        "Planning Japan can eat weeks of evenings and fifty open tabs. Yuku handles the routing, the train timing, and the sequencing in one place, so you can spend those evenings looking forward to it instead.",
      imageUrl: "/placeholders/about-value-1.svg",
    },
    {
      title: "Beyond the algorithm.",
      description:
        "Most itineraries circle the same four cities. Yuku draws from official tourism boards across every region, so the quiet prefectures earn their place too.",
      imageUrl: "/placeholders/about-value-2.svg",
    },
    {
      title: "Travel with the grain.",
      description:
        "Most friction between visitors and locals comes from missing context, not bad intent. Yuku briefs you on the etiquette, the timing, and the unspoken rules of a place, so you arrive ready.",
      imageUrl: "/placeholders/about-value-3.svg",
    },
  ],
  teamEyebrow: "The Team",
  teamHeading: "Who\u2019s behind Yuku",
  teamMembers: [
    {
      name: "Meljun Picardal",
      role: "Founder",
      bio: "Solo founder. Started Yuku after years of planning Japan trips for friends and watching the same pain pattern repeat: scattered tabs, lost links, spreadsheets that never quite worked. Yuku is the planner those trips needed.",
      github: "https://github.com/mel-koku",
      linkedin: "https://www.linkedin.com/in/meljunpicardal/",
    },
  ],
  ctaHeading: "Plan your next trip",
  ctaDescription:
    "Tell us where you want to go and how you like to travel. Day 1 is free. See your trip before you decide.",
  ctaButtonText: "Build my trip",
} as const;

// ── Line illustration fallback ─────────────────────

function FounderIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="200" height="200" rx="12" fill="#F5F2EE" />
      <path
        d={[
          "M 42 192",
          "C 50 178, 68 164, 82 160",
          "C 84 156, 84 150, 82 144",
          "C 76 138, 68 128, 66 118",
          "C 64 108, 62 96, 64 86",
          "C 66 74, 74 62, 86 56",
          "C 92 52, 96 50, 100 48",
          "C 108 46, 118 48, 126 54",
          "C 134 60, 140 70, 140 82",
          "C 140 90, 138 100, 136 110",
          "C 134 122, 128 134, 120 142",
          "C 114 148, 108 152, 100 154",
          "C 92 152, 86 148, 82 144",
          "M 120 142",
          "C 118 150, 118 156, 120 160",
          "C 132 164, 150 178, 158 192",
          "M 78 104",
          "C 80 101, 84 100, 88 102",
          "C 86 104, 82 106, 78 104",
          "M 114 102",
          "C 118 100, 122 101, 124 104",
          "C 120 106, 116 104, 114 102",
          "M 99 108",
          "C 97 116, 96 122, 96 126",
          "C 98 128, 102 128, 104 126",
          "M 88 136",
          "C 92 140, 98 142, 100 142",
          "C 102 142, 108 140, 112 136",
          "M 74 94",
          "C 78 91, 84 90, 90 92",
          "M 112 92",
          "C 118 90, 124 91, 128 94",
          "M 64 86",
          "C 68 78, 76 68, 88 62",
          "M 72 90",
          "C 78 76, 90 66, 100 60",
          "M 82 92",
          "C 88 80, 96 70, 108 62",
        ].join(" ")}
        stroke="#2C2825"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Social link icon ───────────────────────────────

const SOCIAL_ICONS = { github: Github, linkedin: Linkedin, twitter: Twitter, website: Globe } as const;
type SocialKey = keyof typeof SOCIAL_ICONS;

function SocialLink({ href, platform, name }: { href: string; platform: SocialKey; name: string }) {
  const Icon = SOCIAL_ICONS[platform];
  const label = platform === "website" ? `${name}\u2019s website` : `${name} on ${platform.charAt(0).toUpperCase() + platform.slice(1)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-md text-foreground-secondary transition-colors hover:text-brand-primary"
    >
      <Icon className="h-5 w-5" />
    </a>
  );
}

// ── Japanese-text screen reader helper ─────────────

const JAPANESE_RANGE = /([぀-ゟ゠-ヿ一-鿿]+)/g;

function wrapJapanese(text: string) {
  return text.split(JAPANESE_RANGE).map((part, i) =>
    /[぀-ゟ゠-ヿ一-鿿]/.test(part)
      ? <span key={i} lang="ja">{part}</span>
      : part
  );
}

// ── Page ────────────────────────────────────────────

export default async function AboutPage() {
  const content = await getAboutPageContent();

  // AboutPage + Organization with founder Person — strengthens entity
  // recognition for Knowledge Graph and powers E-E-A-T signals.
  const aboutJsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    url: `${BASE_URL}/about`,
    mainEntity: {
      "@type": "Organization",
      name: "Yuku Japan",
      url: BASE_URL,
      logo: `${BASE_URL}/icon`,
      description:
        "A Japan travel publication and trip planner — routed itineraries with real transit times, sourced from official Japan tourism boards.",
      founder: {
        "@type": "Person",
        name: "Meljun Picardal",
        jobTitle: "Founder",
        sameAs: [
          "https://github.com/mel-koku",
          "https://www.linkedin.com/in/meljunpicardal/",
        ],
      },
    },
  };

  const heroEyebrow = content?.heroEyebrow ?? FALLBACK.heroEyebrow;
  const heroHeading = content?.heroHeading ?? FALLBACK.heroHeading;
  const heroSubtext = content?.heroSubtext ?? FALLBACK.heroSubtext;
  const storyHeading = content?.storyHeading ?? FALLBACK.storyHeading;
  const storyParagraphs = content?.storyParagraphs ?? FALLBACK.storyParagraphs;
  const storyImageUrl = content?.storyImage?.url ?? FALLBACK.storyImageUrl;
  const photoBreakUrl = content?.photoBreakImage?.url ?? FALLBACK.photoBreakUrl;
  const photoBreakAlt = content?.photoBreakAlt ?? "A quiet scene in Japan";
  const valuesHeading = content?.valuesHeading ?? FALLBACK.valuesHeading;
  const values = content?.values ?? FALLBACK.values;
  const teamEyebrow = content?.teamEyebrow ?? FALLBACK.teamEyebrow;
  const teamHeading = content?.teamHeading ?? FALLBACK.teamHeading;
  const teamMembers = content?.teamMembers ?? FALLBACK.teamMembers;
  const ctaHeading = content?.ctaHeading ?? FALLBACK.ctaHeading;
  const ctaDescription = content?.ctaDescription ?? FALLBACK.ctaDescription;
  const ctaButtonText = content?.ctaButtonText ?? FALLBACK.ctaButtonText;

  return (
    <main className="min-h-[100dvh]">
      <Script
        id="ld-about-yuku"
        type="application/ld+json"
        strategy="afterInteractive"
      >
        {serializeJsonLd(aboutJsonLd)}
      </Script>
      {/* ── Hero ─────────────────────────────────── */}
      <section className="bg-background px-6 py-12 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <ScrollReveal>
            <p className="eyebrow-editorial mb-4">{heroEyebrow}</p>
          </ScrollReveal>
          <ScrollReveal delay={0.08}>
            <h1 className={cn(typography({ intent: "editorial-h1" }), "mb-6")}>
              {heroHeading}
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={0.16}>
            <p className={cn(typography({ intent: "utility-body" }), "mx-auto max-w-2xl text-foreground-secondary")}>
              {wrapJapanese(heroSubtext)}
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Story ────────────────────────────────── */}
      <section className="bg-canvas px-6 py-12 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <ScrollReveal>
            <h2 className={cn(typography({ intent: "editorial-h2" }), "mb-10")}>
              {storyHeading}
            </h2>
          </ScrollReveal>

          <div className={cn(
            "mx-auto",
            storyImageUrl ? "grid gap-10 text-left md:grid-cols-2 md:items-center" : "max-w-2xl"
          )}>
            <div className="space-y-5">
              {storyParagraphs.map((p, i) => (
                <ScrollReveal key={i} delay={0.08 * (i + 1)}>
                  <p className={cn(
                    typography({ intent: "utility-body" }),
                    "text-foreground-secondary",
                    !storyImageUrl && "text-center"
                  )}>
                    {p}
                  </p>
                </ScrollReveal>
              ))}
            </div>

            {storyImageUrl && (
              <ScrollReveal direction="right" delay={0.16}>
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg shadow-[var(--shadow-card)]">
                  <Image
                    src={storyImageUrl}
                    alt=""
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover"
                  />
                </div>
              </ScrollReveal>
            )}
          </div>
        </div>
      </section>

      {/* ── Photo Break ──────────────────────────── */}
      {photoBreakUrl && (
        <ScrollReveal>
          <section className="relative h-64 sm:h-80 lg:h-96 overflow-hidden">
            <Image
              src={photoBreakUrl}
              alt={photoBreakAlt}
              fill
              sizes="100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 scrim-20" />
          </section>
        </ScrollReveal>
      )}

      {/* ── Values ───────────────────────────────── */}
      <section className="bg-background px-6 py-12 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-3xl">
          <ScrollReveal>
            <h2 className={cn(typography({ intent: "editorial-h2" }), "mb-12 text-center")}>
              {valuesHeading}
            </h2>
          </ScrollReveal>

          <div className="space-y-12 sm:space-y-16">
            {values.map((value, i) => {
              const v = value as Record<string, unknown>;
              const imageUrl = (v.image as { url?: string } | undefined)?.url
                ?? (v.imageUrl as string | undefined);
              const hasImage = !!imageUrl;
              const isEven = i % 2 === 0;

              return (
                <ScrollReveal key={i} delay={0.08 * (i + 1)}>
                  <div className={cn(
                    hasImage
                      ? "grid gap-8 md:grid-cols-2 md:items-center"
                      : "mx-auto max-w-2xl text-center"
                  )}>
                    {hasImage && (
                      <div className={cn(
                        "relative aspect-[4/3] overflow-hidden rounded-lg shadow-[var(--shadow-card)]",
                        !isEven && "md:order-2",
                      )}>
                        <Image
                          src={imageUrl}
                          alt=""
                          fill
                          sizes="(max-width: 768px) 100vw, 50vw"
                          className="object-cover"
                        />
                      </div>
                    )}

                    <div className={cn(hasImage && !isEven && "md:order-1")}>
                      <div className={cn(typography({ intent: "utility-body" }), "text-foreground-secondary")}>
                        <h3 className="inline font-bold text-foreground [font-size:inherit] [line-height:inherit] [margin:0]">
                          {value.title}
                        </h3>{" "}
                        {value.description}
                      </div>
                    </div>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Team ─────────────────────────────────── */}
      <section className="bg-canvas px-6 py-12 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <ScrollReveal>
            <p className="eyebrow-editorial mb-4">{teamEyebrow}</p>
          </ScrollReveal>
          <ScrollReveal delay={0.08}>
            <h2 className={cn(typography({ intent: "editorial-h2" }), "mb-12")}>
              {teamHeading}
            </h2>
          </ScrollReveal>

          <ScrollReveal delay={0.16}>
            <div className={cn(
              teamMembers.length === 1
                ? "mx-auto max-w-sm"
                : "grid grid-cols-1 gap-12 sm:grid-cols-2 md:grid-cols-3"
            )}>
              {teamMembers.map((member) => {
                const name = member.name ?? "Team Member";
                const m = member as Record<string, unknown>;
                const photoUrl = (m.photo as { url?: string } | undefined)?.url;
                const socials = (["github", "linkedin", "twitter", "website"] as SocialKey[])
                  .filter((key) => m[key]);

                return (
                  <div key={name} className="flex flex-col items-center text-center">
                    {photoUrl ? (
                      <Image
                        src={photoUrl}
                        alt={name}
                        width={160}
                        height={160}
                        className="mb-6 h-40 w-40 rounded-lg object-cover shadow-[var(--shadow-card)]"
                      />
                    ) : (
                      <FounderIllustration className="mb-6 h-40 w-40 rounded-lg shadow-[var(--shadow-card)]" />
                    )}
                    <h3 className={typography({ intent: "utility-h2" })}>{name}</h3>
                    <p className="mt-1 text-foreground-secondary">{member.role}</p>
                    <p className={cn(typography({ intent: "utility-body" }), "mt-4 text-foreground-secondary")}>
                      {member.bio}
                    </p>

                    {socials.length > 0 && (
                      <div className="mt-4 flex gap-3">
                        {socials.map((key) => (
                          <SocialLink key={key} href={m[key] as string} platform={key} name={name} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────── */}
      <section className="bg-background px-6 py-12 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <ScrollReveal>
            <h2 className={cn(typography({ intent: "editorial-h2" }), "mb-4")}>
              {ctaHeading}
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={0.08}>
            <p className={cn(typography({ intent: "utility-body" }), "mx-auto mb-8 max-w-lg text-foreground-secondary")}>
              {ctaDescription}
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.16}>
            <Button asChild href="/trip-builder" variant="primary" size="hero">
              {ctaButtonText}
            </Button>
          </ScrollReveal>
        </div>
      </section>
    </main>
  );
}
