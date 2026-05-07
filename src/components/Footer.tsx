"use client";

import Link from "next/link";
import type { SiteSettings } from "@/types/sanitySiteContent";
import { isSafeUrl } from "@/lib/utils/urlSafety";

const defaultNavColumns = [
  {
    title: "Explore",
    links: [
      { label: "Places", href: "/places" },
      { label: "Cities", href: "/cities" },
      { label: "Guides", href: "/guides" },
      { label: "Pricing", href: "/pricing" },
      { label: "Concierge", href: "/concierge" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Saved Places", href: "/saved" },
      { label: "Settings", href: "/account" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Privacy", href: "/privacy" },
      { label: "Commerce Disclosure", href: "/commerce-disclosure" },
    ],
  },
];

// Social links hidden until real URLs are available
const defaultSocialLinks: { label: string; href: string }[] = [
  // { label: "IG", href: "#" },
  // { label: "X", href: "#" },
  // { label: "YT", href: "#" },
];

type FooterProps = {
  settings?: SiteSettings;
};

export default function Footer({ settings }: FooterProps) {
  const currentYear = new Date().getFullYear();
  const brandDescription = settings?.brandDescription ?? "Places sourced from Japan\u2019s official tourism boards. Trips planned the way you travel.";
  const navColumns = defaultNavColumns;
  const socialLinks = settings?.socialLinks?.length
    ? settings.socialLinks.map((s) => ({ label: s.label, href: s.url }))
    : defaultSocialLinks;

  return (
    <footer className="bg-charcoal text-white border-t border-white/10">
      <div className="mx-auto max-w-7xl px-6 py-12 sm:py-20 lg:py-28">
        {/* Top: Brand + Navigation */}
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-12">
          {/* Brand Column */}
          <div className="lg:col-span-5">
            <p className="font-serif text-3xl sm:text-4xl"><span className="tracking-[-0.03em]">Yuku</span> Japan</p>
            <p className="mt-4 max-w-md text-base text-white/60">
              {brandDescription}
            </p>

          </div>

          {/* Navigation Columns */}
          <div className="grid grid-cols-2 gap-6 lg:col-span-7 lg:gap-8 lg:grid-cols-3">
            {navColumns.map((col) => (
              <NavColumn key={col.title} title={col.title} links={col.links} />
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-16 flex flex-col items-center justify-between gap-6 border-t border-white/10 pt-8 sm:flex-row">
          <p className="text-xs text-white/60">
            &copy; {currentYear} Yuku Japan. All rights reserved.
          </p>
          <div className="flex items-center gap-3">
            {socialLinks.filter((icon) => isSafeUrl(icon.href)).map((icon) => (
              <a
                key={icon.label}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-white/20 text-xs font-semibold uppercase tracking-[0.3em] text-white/60 transition-colors hover:border-white/40 hover:text-white"
                href={icon.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={icon.label}
              >
                {icon.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

function NavColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.3em] text-white/60">{title}</p>
      <ul className="mt-4 space-y-1">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="inline-flex min-h-11 items-center text-sm text-white/70 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
