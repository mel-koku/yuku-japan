"use client";

import { Info } from "lucide-react";

import { Tooltip } from "@/components/ui/Tooltip";
import { isSafeUrl } from "@/lib/utils/urlSafety";
import { cn } from "@/lib/cn";
import type { LocationHeroAttribution } from "@/types/location";

type Variant = "inline" | "tooltip";

type PhotoAttributionProps = {
  attribution: LocationHeroAttribution;
  variant: Variant;
  /**
   * Whether to render the full license_notice paragraph. Only set true on the
   * inline variant where there's room — drawer + detail page. The tooltip
   * variant always omits the notice (too long for the surface).
   */
  showNotice?: boolean;
  /** Override the base text-color class (e.g. for over-image vs. over-card placement). */
  className?: string;
};

/**
 * Renders attribution for the hero photo of a wikimedia-source location.
 *
 * `inline`  — small caption rendered directly below or over the image.
 *             Used on PlaceDetail and LocationExpanded.
 * `tooltip` — disclosure anchored to an Info icon. Used on LocationCard
 *             so dense card surfaces stay clean while still satisfying
 *             CC-BY attribution requirements.
 *
 * Output shape (compact format, agreed 2026-05-14):
 *   `Photo: {Author}, {License}.`
 * Author links to the Commons File: page (`attribution_uri`); license short
 * name links to the license URI (creativecommons.org/...).
 */
export function PhotoAttribution({
  attribution,
  variant,
  showNotice = false,
  className,
}: PhotoAttributionProps) {
  if (variant === "inline") {
    return (
      <InlineCaption
        attribution={attribution}
        showNotice={showNotice}
        className={className}
      />
    );
  }
  return <TooltipCaption attribution={attribution} className={className} />;
}

function InlineCaption({
  attribution,
  showNotice,
  className,
}: {
  attribution: LocationHeroAttribution;
  showNotice: boolean;
  className?: string;
}) {
  return (
    <div className={cn("text-[11px] leading-snug", className)}>
      <p>
        Photo:{" "}
        <AuthorLabel attribution={attribution} />
        {", "}
        <LicenseLabel attribution={attribution} />
        {"."}
      </p>
      {showNotice && attribution.licenseNotice ? (
        <p className="mt-1 italic opacity-80">{attribution.licenseNotice}</p>
      ) : null}
    </div>
  );
}

function TooltipCaption({
  attribution,
  className,
}: {
  attribution: LocationHeroAttribution;
  className?: string;
}) {
  const tooltipBody = (
    <p>
      Photo:{" "}
      <AuthorLabel
        attribution={attribution}
        linkClassName="underline decoration-background/40 hover:decoration-background"
      />
      {", "}
      <LicenseLabel
        attribution={attribution}
        linkClassName="underline decoration-background/40 hover:decoration-background"
      />
      {"."}
    </p>
  );
  return (
    <Tooltip content={tooltipBody} side="top">
      <button
        type="button"
        aria-label={`Photo attribution: ${attribution.author}, ${attribution.licenseShort}`}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface/85 text-foreground/70 backdrop-blur-md shadow-[var(--shadow-sm)] transition hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary",
          className,
        )}
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

function AuthorLabel({
  attribution,
  linkClassName,
}: {
  attribution: LocationHeroAttribution;
  linkClassName?: string;
}) {
  const href = attribution.authorUri ?? attribution.sourceUri;
  if (href && isSafeUrl(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={linkClassName ?? "underline decoration-current/30 hover:decoration-current"}
      >
        {attribution.author}
      </a>
    );
  }
  return <>{attribution.author}</>;
}

function LicenseLabel({
  attribution,
  linkClassName,
}: {
  attribution: LocationHeroAttribution;
  linkClassName?: string;
}) {
  if (isSafeUrl(attribution.licenseUri)) {
    return (
      <a
        href={attribution.licenseUri}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={linkClassName ?? "underline decoration-current/30 hover:decoration-current"}
      >
        {attribution.licenseShort}
      </a>
    );
  }
  return <>{attribution.licenseShort}</>;
}
