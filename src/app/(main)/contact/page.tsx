import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { typography } from "@/lib/typography-system";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { DEFAULT_OG_IMAGES, DEFAULT_TWITTER_IMAGES } from "@/lib/seo/defaults";
import { serializeJsonLd } from "@/lib/seo/jsonLd";
import { ConciergeInquiryForm } from "@/components/concierge/ConciergeInquiryForm";

const EMAIL = "hello@yukujapan.com";

export const metadata: Metadata = {
  title: "Contact | Yuku Japan",
  description:
    "Get in touch with Yuku Japan. Email hello@yukujapan.com for support, press, and partnerships. Registered in Kyoto.",
  alternates: { canonical: "/contact" },
  openGraph: {
    images: DEFAULT_OG_IMAGES,
    title: "Contact | Yuku Japan",
    description:
      "Get in touch with Yuku Japan. Email hello@yukujapan.com for support, press, and partnerships. Registered in Kyoto.",
    url: "/contact",
    siteName: "Yuku Japan",
    type: "website",
  },
  twitter: {
    images: DEFAULT_TWITTER_IMAGES,
    card: "summary",
    title: "Contact | Yuku Japan",
    description:
      "Get in touch with Yuku Japan. Email hello@yukujapan.com for support, press, and partnerships.",
  },
};

const linkClass =
  "text-foreground underline decoration-brand-primary/40 underline-offset-4 transition-colors hover:text-brand-primary";

const FAQS: { q: string; a: React.ReactNode; aText: string }[] = [
  {
    q: "How does Trip Pass work?",
    a: (
      <>
        Trip Pass is a one-time unlock per trip. Day 1 is free on every trip you build. Full unlocks start at $19, and we&apos;re currently running a free launch promo for early travelers. See{" "}
        <Link href="/pricing" className={linkClass}>
          pricing
        </Link>{" "}
        for tier details and current availability.
      </>
    ),
    aText:
      "Trip Pass is a one-time unlock per trip. Day 1 is free on every trip you build. Full unlocks start at $19, and we're currently running a free launch promo for early travelers. See yukujapan.com/pricing for tier details and current availability.",
  },
  {
    q: "Can I get a refund?",
    a: (
      <>
        Because Trip Pass is digital content delivered immediately, we&apos;re unable to offer refunds once access has been granted, except where required by law. If you hit a technical issue that blocked access, email us and we&apos;ll make it right.
      </>
    ),
    aText:
      "Because Trip Pass is digital content delivered immediately, we're unable to offer refunds once access has been granted, except where required by law. If you hit a technical issue that blocked access, email us and we'll make it right.",
  },
  {
    q: "My plans changed. Can I edit the itinerary after unlocking?",
    a: (
      <>
        Yes. Trip Pass holders get unlimited refinements on an unlocked trip. Change dates, cities, vibes, or individual activities whenever the plan shifts.
      </>
    ),
    aText:
      "Yes. Trip Pass holders get unlimited refinements on an unlocked trip. Change dates, cities, vibes, or individual activities whenever the plan shifts.",
  },
  {
    q: "I want help planning, not software.",
    a: (
      <>
        Our concierge service is built for that. Tell us about your trip and we&apos;ll reply with a tailored plan.{" "}
        <Link href="/concierge" className={linkClass}>
          Start a concierge request
        </Link>
        .
      </>
    ),
    aText:
      "Our concierge service is built for that. Tell us about your trip and we'll reply with a tailored plan. Start at yukujapan.com/concierge.",
  },
  {
    q: "Can you book restaurants or hotels for me?",
    a: (
      <>
        No. Yuku routes trips and curates stops; each venue on your itinerary links out to its reservation surface where one exists. If you want hands-on bookings and an in-Japan coordinator, our{" "}
        <Link href="/concierge" className={linkClass}>
          concierge service
        </Link>{" "}
        handles that end-to-end.
      </>
    ),
    aText:
      "No. Yuku routes trips and curates stops; each venue on your itinerary links out to its reservation surface where one exists. If you want hands-on bookings and an in-Japan coordinator, our concierge service handles that end-to-end. See yukujapan.com/concierge.",
  },
  {
    q: "How do I delete my account or data?",
    a: (
      <>
        Open{" "}
        <Link href="/account" className={linkClass}>
          your account
        </Link>{" "}
        and use the delete option, or email us and we&apos;ll handle it for you.
      </>
    ),
    aText:
      "Open your account at yukujapan.com/account and use the delete option, or email hello@yukujapan.com and we'll handle it for you.",
  },
  {
    q: "Press, partnerships, or affiliate inquiries?",
    a: (
      <>
        Email{" "}
        <a href={`mailto:${EMAIL}`} className={linkClass}>
          {EMAIL}
        </a>{" "}
        with &quot;Press,&quot; &quot;Partnership,&quot; or &quot;Affiliate&quot; in the subject line and we&apos;ll route it to the right person.
      </>
    ),
    aText:
      "Email hello@yukujapan.com with 'Press,' 'Partnership,' or 'Affiliate' in the subject line and we'll route it to the right person.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(({ q, aText }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: {
      "@type": "Answer",
      text: aText,
    },
  })),
};

export default function ContactPage() {
  return (
    <main className="min-h-[100dvh]">
      <Script
        id="ld-faq-contact"
        type="application/ld+json"
        strategy="afterInteractive"
      >
        {serializeJsonLd(faqJsonLd)}
      </Script>
      {/* ── Contact form ─────────────────────────── */}
      <ConciergeInquiryForm
        source="contact-page"
        content={{
          formHeading: "We read every message.",
          formBody: "Feedback, support, press, or partnerships. We'll route it to the right person and reply within two business days.",
          formMessageLabel: "What can we help with?",
          formMessagePlaceholder: "Feedback, support question, press inquiry — whatever's on your mind.",
          formCtaText: "Send message",
          formFinePrint: `Or email us directly at ${EMAIL}`,
          formSuccessHeading: "Thanks. We'll be in touch.",
          formSuccessBody: "We read every message personally and typically reply within two business days.",
        }}
      />

      {/* ── FAQs ─────────────────────────────────── */}
      <section
        aria-label="Frequently asked questions"
        className="bg-canvas px-6 py-12 sm:py-16 lg:py-20"
      >
        <div className="mx-auto max-w-2xl">
          <ScrollReveal>
            <p className="eyebrow-editorial mb-4">Questions</p>
          </ScrollReveal>
          <ScrollReveal delay={0.08}>
            <h2 className={cn(typography({ intent: "editorial-h2" }), "mb-12")}>
              A few things people ask first.
            </h2>
          </ScrollReveal>
        </div>

        <div className="mx-auto max-w-2xl">
          <ScrollReveal delay={0.12}>
            <ul className="border-b border-border">
              {FAQS.map((faq, i) => (
                <li key={faq.q ?? i} className="border-t border-border">
                  <details className="group py-6">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-serif text-lg font-normal text-foreground transition-colors hover:text-brand-primary [&::-webkit-details-marker]:hidden">
                      <span>{faq.q}</span>
                      <span
                        aria-hidden="true"
                        className="font-serif text-2xl font-normal leading-none text-brand-primary transition-transform duration-200 group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>
                    <div className={cn(typography({ intent: "utility-body-muted" }), "mt-3")}>
                      {faq.a}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Registered office ────────────────────── */}
      <section className="bg-background px-6 py-12 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-2xl">
          <ScrollReveal>
            <p className="eyebrow-editorial mb-6">Registered office</p>
          </ScrollReveal>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            <ScrollReveal delay={0.08}>
              <address className="not-italic" lang="ja">
                <p
                  className={cn(
                    typography({ intent: "utility-body" }),
                    "mb-1 font-medium text-foreground"
                  )}
                >
                  Yuku Japan
                </p>
                <p
                  className={cn(
                    typography({ intent: "utility-body" }),
                    "text-foreground-secondary"
                  )}
                >
                  〒600-8223
                  <br />
                  京都府京都市下京区七条通油小路東入
                  <br />
                  大黒町227番地 第２キョートビル402
                </p>
              </address>
            </ScrollReveal>
            <ScrollReveal delay={0.16}>
              <address className="not-italic">
                <p
                  className={cn(
                    typography({ intent: "utility-body" }),
                    "mb-1 font-medium text-foreground"
                  )}
                >
                  Yuku Japan
                </p>
                <p
                  className={cn(
                    typography({ intent: "utility-body" }),
                    "text-foreground-secondary"
                  )}
                >
                  Dai-2 Kyoto Building, Suite 402
                  <br />
                  227 Daikoku-cho, Shichijo-dori Aburanokoji Higashi-iru
                  <br />
                  Shimogyo-ku, Kyoto 600-8223
                  <br />
                  Japan
                </p>
              </address>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ── Concierge CTA ────────────────────────── */}
      <section className="bg-canvas px-6 py-12 sm:py-20 lg:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <ScrollReveal>
            <p className="eyebrow-editorial mb-4">Planning a trip?</p>
          </ScrollReveal>
          <ScrollReveal delay={0.08}>
            <h2 className={cn(typography({ intent: "editorial-h2" }), "mb-6")}>
              Our concierge can help.
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={0.16}>
            <p
              className={cn(
                typography({ intent: "utility-body" }),
                "mb-8 text-foreground-secondary"
              )}
            >
              Share your dates, cities, and the kind of trip you want. We&apos;ll reply with a tailored plan.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.24}>
            <Button asChild href="/concierge" variant="primary" size="hero">
              Start a concierge request
            </Button>
          </ScrollReveal>
        </div>
      </section>
    </main>
  );
}
