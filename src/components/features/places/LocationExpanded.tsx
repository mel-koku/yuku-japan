"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { m } from "framer-motion";
import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { easeReveal, durationFast } from "@/lib/motion";
import type { Location, LocationHeroAttribution } from "@/types/location";
import { useLenis } from "@/providers/LenisProvider";
import { useLocationDetailsQuery } from "@/hooks/useLocationDetailsQuery";
import { useSaved } from "@/context/SavedContext";
import { useFirstSaveToast } from "@/hooks/useFirstSaveToast";
import { getLocationDisplayName } from "@/lib/locationNameUtils";
import { resizePhotoUrl } from "@/lib/google/transformations";
import { resolveTimeEstimate } from "@/lib/locations/timeEstimates";
import { fetchLocationSpecificGuidance } from "@/lib/tips/guidanceService";
import { cn } from "@/lib/cn";
import { isSafeUrl } from "@/lib/utils/urlSafety";
import { typography } from "@/lib/typography-system";
import type { TravelGuidance } from "@/types/travelGuidance";
import { HeartIcon } from "./LocationCard";
import { PhotoAttribution } from "./PhotoAttribution";
import { useLocationHierarchy } from "@/hooks/useLocationHierarchy";
import {
  ChildLocationsSection,
  SubExperiencesSection,
  SubExperienceTeaser,
  RelationshipsSection,
} from "./HierarchySections";
import { Tooltip } from "@/components/ui/Tooltip";
import { DataIcon } from "@/components/ui/DataIcon";
import { LocationReportDialog } from "./LocationReportDialog";
import { EditorNoteBody } from "./EditorNoteBody";
import { EditorNoteAuditSlot } from "./EditorNoteAuditSlot";
import { useEditorNoteByLocationSlug } from "@/sanity/useEditorNote";

type LocationExpandedProps = {
  location: Location;
  onClose: () => void;
};


export function LocationExpanded({ location, onClose }: LocationExpandedProps) {
  const router = useRouter();
  const { pause, resume } = useLenis();
  const { status, details, fetchedLocation, errorMessage, retry } = useLocationDetailsQuery(location.id);
  const locationWithDetails = fetchedLocation ?? location;
  const { isInSaved, toggleSave } = useSaved();
  const showFirstSaveToast = useFirstSaveToast();
  const [heartAnimating, setHeartAnimating] = useState(false);
  const [isLongLoading, setIsLongLoading] = useState(false);

  const isSaved = isInSaved(location.id);
  const wasSaved = useRef(isSaved);

  // Smart Guidebook editor note (Option B unlabeled — replaces description
  // when present). Returns undefined while loading, null when no note exists.
  const editorNote = useEditorNoteByLocationSlug(location.id);
  const editorNoteBlocks = editorNote?.note;
  const hasEditorNote = !!editorNoteBlocks && editorNoteBlocks.length > 0;
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const { data: hierarchy } = useLocationHierarchy(location.id);
  const subExperiencesRef = useRef<HTMLDivElement>(null);

  // Reset active photo when location changes
  useEffect(() => {
    setActivePhotoIndex(0);
  }, [location.id]);

  // Track long-loading state (10s timeout)
  useEffect(() => {
    if (status !== "loading") {
      setIsLongLoading(false);
      return;
    }
    const timer = setTimeout(() => setIsLongLoading(true), 10000);
    return () => clearTimeout(timer);
  }, [status, location.id]);

  // Build deduplicated photo list: hero first, then details photos.
  // Each entry carries attribution. Wikimedia heroes additionally carry
  // structured license metadata for the PhotoAttribution component (Phase 3).
  const allPhotos = useMemo(() => {
    type PhotoEntry = {
      url: string;
      attribution?: string;
      attributionUri?: string;
      heroAttribution?: LocationHeroAttribution;
    };

    const heroUrl = resizePhotoUrl(location.primaryPhotoUrl ?? location.image, 800);
    const heroName = heroUrl
      ? new URL(heroUrl, "http://x").searchParams.get("photoName")
      : null;

    const detailEntries: PhotoEntry[] = (details?.photos ?? [])
      .filter((p) => p.proxyUrl)
      .map((p) => {
        const attr = p.attributions?.[0];
        return {
          url: p.proxyUrl as string,
          attribution: attr?.displayName,
          attributionUri: attr?.uri,
          heroAttribution:
            attr?.licenseShort && attr?.licenseUri && attr?.sourceUri && attr?.displayName
              ? {
                  author: attr.displayName,
                  authorUri: attr.uri ?? null,
                  licenseShort: attr.licenseShort,
                  licenseUri: attr.licenseUri,
                  licenseNotice: attr.licenseNotice ?? null,
                  sourceUri: attr.sourceUri,
                }
              : undefined,
        };
      });

    const photos: PhotoEntry[] = [];
    if (heroUrl) {
      const match = detailEntries.find((e) => {
        const n = new URL(e.url, "http://x").searchParams.get("photoName");
        return heroName && n === heroName;
      });
      photos.push({
        url: heroUrl,
        attribution: match?.attribution,
        attributionUri: match?.attributionUri,
        heroAttribution: match?.heroAttribution ?? location.heroAttribution,
      });
    }
    for (const entry of detailEntries) {
      const entryName = new URL(entry.url, "http://x").searchParams.get("photoName");
      if (heroName && entryName === heroName) continue;
      if (!photos.some((p) => p.url === entry.url)) photos.push(entry);
    }
    return photos.slice(0, 5);
  }, [location.primaryPhotoUrl, location.image, location.heroAttribution, details?.photos]);

  const activePhoto = allPhotos[activePhotoIndex];

  const displayName = useMemo(() => {
    return getLocationDisplayName(details?.displayName, location);
  }, [location, details]);

  const { summary, description } = useMemo(() => {
    const short = locationWithDetails.shortDescription?.trim() || undefined;
    const full =
      locationWithDetails.description?.trim() ||
      details?.editorialSummary?.trim() ||
      undefined;

    if (!full && !short) return { summary: undefined, description: undefined };
    if (!full) return { summary: undefined, description: short };
    if (!short) return { summary: undefined, description: full };

    // Show both only when the short text isn't just a substring of the full
    const isDifferent = !full.toLowerCase().startsWith(short.toLowerCase().slice(0, 60));
    return isDifferent
      ? { summary: short, description: full }
      : { summary: undefined, description: full };
  }, [locationWithDetails, details]);

  const mealLabels = useMemo(() => {
    const m = locationWithDetails.mealOptions;
    if (!m) return null;
    const parts: string[] = [];
    if (m.servesBreakfast) parts.push("Breakfast");
    if (m.servesBrunch) parts.push("Brunch");
    if (m.servesLunch) parts.push("Lunch");
    if (m.servesDinner) parts.push("Dinner");
    return parts.length > 0 ? parts.join(", ") : null;
  }, [locationWithDetails.mealOptions]);

  const serviceLabels = useMemo(() => {
    const s = locationWithDetails.serviceOptions;
    if (!s) return null;
    const parts: string[] = [];
    if (s.dineIn) parts.push("Dine-in");
    if (s.takeout) parts.push("Takeout");
    if (s.delivery) parts.push("Delivery");
    return parts.length > 0 ? parts.join(", ") : null;
  }, [locationWithDetails.serviceOptions]);

  const accessibilityBadges = useMemo(() => {
    const a = locationWithDetails.accessibilityOptions;
    if (!a) return [];
    const badges: { key: string; label: string }[] = [];
    if (a.wheelchairAccessibleEntrance) badges.push({ key: "entrance", label: "Wheelchair entrance" });
    if (a.wheelchairAccessibleParking) badges.push({ key: "parking", label: "Wheelchair parking" });
    if (a.wheelchairAccessibleRestroom) badges.push({ key: "restroom", label: "Wheelchair restroom" });
    if (a.wheelchairAccessibleSeating) badges.push({ key: "seating", label: "Wheelchair seating" });
    return badges;
  }, [locationWithDetails.accessibilityOptions]);

  const goodForPills = useMemo(() => {
    const pills: { key: string; label: string }[] = [];
    if (locationWithDetails.goodForChildren) pills.push({ key: "children", label: "Families" });
    if (locationWithDetails.goodForGroups) pills.push({ key: "groups", label: "Groups" });
    return pills;
  }, [locationWithDetails.goodForChildren, locationWithDetails.goodForGroups]);

  // Location-specific guidance tips (only tips explicitly targeting this location)
  const [tips, setTips] = useState<TravelGuidance[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchLocationSpecificGuidance(locationWithDetails)
      .then((result) => { if (!cancelled) setTips(result.slice(0, 3)); })
      // eslint-disable-next-line no-console
      .catch((err) => console.warn("Failed to fetch location guidance:", err));
    return () => { cancelled = true; };
  }, [locationWithDetails]);

  useEffect(() => {
    if (isSaved && !wasSaved.current) {
      setHeartAnimating(true);
      const timer = setTimeout(() => setHeartAnimating(false), 500);
      return () => clearTimeout(timer);
    }
    wasSaved.current = isSaved;
  }, [isSaved]);

  const handleToggleSave = useCallback(() => {
    if (!isSaved) showFirstSaveToast();
    toggleSave(location.id);
  }, [location.id, toggleSave, isSaved, showFirstSaveToast]);

  // Lock body scroll
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    pause();
    return () => {
      html.style.overflow = prev;
      resume();
    };
  }, [pause, resume]);

  // Close on escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const hasOpeningHours =
    (details?.currentOpeningHours?.length ?? 0) >= 3 ||
    (details?.regularOpeningHours?.length ?? 0) >= 3;

  const hasLinks =
    (details?.websiteUri && isSafeUrl(details.websiteUri)) ||
    details?.internationalPhoneNumber ||
    (details?.googleMapsUri && isSafeUrl(details.googleMapsUri));

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <m.div
        className="fixed inset-0 z-[70] bg-charcoal/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: durationFast, ease: easeReveal }}
        onClick={onClose}
      />

      {/* Right Panel — desktop: 560px from right, mobile: full-screen overlay.
          Sits at z-[70] so it stacks above the /places search modal (z-[60]). */}
      <m.div
        data-lenis-prevent
        className="fixed z-[70] bg-background shadow-[var(--shadow-elevated)] overflow-y-auto overscroll-contain
          inset-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[560px] sm:max-w-[95vw] sm:border-l sm:border-border"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: durationFast, ease: easeReveal }}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-surface/90 text-foreground shadow-[var(--shadow-card)] backdrop-blur-md transition-transform hover:scale-105 hover:bg-surface"
          aria-label="Close"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Hero image — flush edges */}
        <div className="relative aspect-[16/9] w-full overflow-hidden">
          <Image
            src={activePhoto?.url || "/placeholder.jpg"}
            alt={displayName}
            fill
            className="object-cover"
            sizes="(min-width: 640px) 560px, 100vw"
            priority
          />
          <div className="absolute inset-0 scrim-60" />

          {/* Title overlay */}
          <div className="absolute inset-x-0 bottom-0 p-4 sm:px-6 sm:pb-5">
            <p className="text-[10px] uppercase tracking-[0.25em] text-white/60 mb-1">
              {location.city}, {location.region}
            </p>
            <h2 className={cn(typography({ intent: "editorial-h3" }), "text-white line-clamp-2")}>
              {displayName}
            </h2>
          </div>

          {activePhoto?.heroAttribution ? (
            <div className="absolute top-2 left-3 max-w-[calc(100%-1.5rem)] text-white/75 filter-[drop-shadow(0_1px_2px_rgb(0_0_0/0.6))] [&_a]:underline [&_a]:decoration-white/40 [&_a:hover]:decoration-white">
              <PhotoAttribution
                attribution={activePhoto.heroAttribution}
                variant="inline"
                showNotice
              />
            </div>
          ) : activePhoto?.attribution ? (
            <p className="absolute top-2 left-3 text-[10px] text-white/75 filter-[drop-shadow(0_1px_2px_rgb(0_0_0/0.6))]">
              Photo:{" "}
              {activePhoto.attributionUri && isSafeUrl(activePhoto.attributionUri) ? (
                <a
                  href={activePhoto.attributionUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-white/40 hover:decoration-white"
                >
                  {activePhoto.attribution}
                </a>
              ) : (
                activePhoto.attribution
              )}
            </p>
          ) : null}
        </div>

        {/* Photo thumbnail strip */}
        {allPhotos.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto overscroll-contain snap-x snap-mandatory scrollbar-hide px-4 py-2">
            {allPhotos.map((photo, i) => (
              <button
                key={photo.url}
                type="button"
                onClick={() => setActivePhotoIndex(i)}
                aria-label={`View photo ${i + 1} of ${allPhotos.length}`}
                className={cn(
                  "relative h-16 w-16 shrink-0 snap-start overflow-hidden rounded-lg transition",
                  i === activePhotoIndex
                    ? "ring-2 ring-brand-primary ring-offset-1 ring-offset-background"
                    : "opacity-60 hover:opacity-100"
                )}
              >
                <Image
                  src={resizePhotoUrl(photo.url, 128) || photo.url}
                  alt={`${displayName} photo ${i + 1}`}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              </button>
            ))}
          </div>
        )}

        {/* Action bar (hidden for container parents) */}
        {locationWithDetails.parentMode !== "container" && (
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <button
              type="button"
              onClick={handleToggleSave}
              className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface shadow-[var(--shadow-sm)] transition-transform hover:scale-105 hover:bg-border/50"
              aria-label={isSaved ? "Unsave" : "Save"}
            >
              <HeartIcon active={isSaved} animating={heartAnimating} variant="inline" />
            </button>
            <span className="text-sm text-stone">
              {isSaved ? "Saved" : "Save to include in your trip"}
            </span>
          </div>
        )}

        {/* Detail content */}
        <div className="space-y-6 p-6">
          {/* Category, rating, duration */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-md bg-surface px-3 py-1 font-medium capitalize text-foreground-secondary">
              {location.category}
            </span>
            {location.jtaApproved && (
              <Tooltip content="Japan Tourism Agency (JTA) certified destination">
                <span
                  tabIndex={0}
                  className="flex items-center gap-1.5 rounded-md border border-brand-secondary/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-brand-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary/40"
                >
                  JTA Approved
                </span>
              </Tooltip>
            )}
            {location.isHiddenGem && (
              <Tooltip content="A place chosen for distinctive character">
                <span
                  tabIndex={0}
                  className="flex items-center gap-1.5 rounded-md border border-sage/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
                >
                  Local Pick
                </span>
              </Tooltip>
            )}
            {location.isUnescoSite && (
              <Tooltip content="Designated by UNESCO for global cultural or natural value">
                <span
                  tabIndex={0}
                  className="flex items-center gap-1.5 rounded-md border border-accent/30 px-3 py-1 text-xs font-medium uppercase tracking-wide text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                >
                  UNESCO
                </span>
              </Tooltip>
            )}
            {(details?.rating ?? location.rating) ? (
              <span className="flex items-center gap-1 text-foreground">
                <svg className="h-4 w-4 text-warning" viewBox="0 0 24 24" fill="currentColor">
                  <path d="m12 17.27 5.18 3.11-1.64-5.81L20.9 9.9l-6-0.52L12 4 9.1 9.38l-6 .52 5.36 4.67L6.82 20.38 12 17.27z" />
                </svg>
                {(details?.rating ?? location.rating)!.toFixed(1)}
                {details?.userRatingCount ? (
                  <span className="text-xs text-stone">
                    ({details.userRatingCount.toLocaleString()} reviews)
                  </span>
                ) : null}
              </span>
            ) : null}
            {(() => {
              const fit = resolveTimeEstimate(location.estimatedDuration, location.category);
              return fit ? (
                <span className="flex items-center gap-1 text-stone">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10" />
                    <path strokeLinecap="round" d="M12 6v6l4 2" />
                  </svg>
                  Est. {fit}
                </span>
              ) : null;
            })()}
            {locationWithDetails.priceLevel !== undefined && locationWithDetails.priceLevel !== null && (
              <span className="text-stone font-mono text-xs">
                {locationWithDetails.priceLevel === 0 ? "Free" : "¥".repeat(locationWithDetails.priceLevel)}
              </span>
            )}
          </div>

          {/* Sub-experience teaser */}
          {hierarchy && hierarchy.subExperiences.length > 0 && (
            <SubExperienceTeaser
              subExperiences={hierarchy.subExperiences}
              onScrollTo={() =>
                subExperiencesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            />
          )}

          {/* Description (replaced by editor note when one exists for this location) */}
          {hasEditorNote ? (
            <section>
              <EditorNoteBody blocks={editorNoteBlocks!} />
              {editorNote && <EditorNoteAuditSlot payload={editorNote} />}
            </section>
          ) : (
            (summary || description) && (
              <section className="space-y-2">
                <h3 className="eyebrow-editorial">
                  Overview
                </h3>
                {summary && (
                  <p className="text-sm font-medium leading-relaxed text-foreground">{summary}</p>
                )}
                {description && (
                  <p className="text-base leading-relaxed text-foreground-secondary">{description}</p>
                )}
              </section>
            )
          )}


          {/* Local tips: insider tip + location-specific guidance */}
          {(location.insiderTip || tips.length > 0) && (
            <section className="space-y-2">
              <h3 className="eyebrow-editorial">
                Local tips
              </h3>
              <div className="space-y-2">
                {location.insiderTip && (
                  <div className="rounded-lg bg-yuzu-tint p-3">
                    <p className="text-sm leading-relaxed text-foreground-body">
                      {location.insiderTip}
                    </p>
                  </div>
                )}
                {tips.map((tip) => (
                  <div
                    key={tip.id}
                    className="flex gap-2.5 rounded-lg bg-sage/5 border border-sage/10 p-3"
                  >
                    {tip.icon && (
                      <DataIcon
                        name={tip.icon}
                        className="h-4 w-4 shrink-0 text-foreground-secondary mt-0.5"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{tip.title}</p>
                      <p className="text-xs text-foreground-secondary mt-0.5">{tip.summary}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Practical info */}
          {(location.nameJapanese || location.nearestStation || location.cashOnly !== undefined || location.reservationInfo || locationWithDetails.dietaryOptions?.servesVegetarianFood || mealLabels || serviceLabels) && (
            <section className="space-y-3">
              <h3 className="eyebrow-editorial">
                Practical info
              </h3>
              <dl className="space-y-2 text-sm">
                {location.nameJapanese && (
                  <div className="flex gap-2">
                    <dt className="text-stone shrink-0 w-28">Japanese name</dt>
                    <dd className="text-foreground-secondary">{location.nameJapanese}</dd>
                  </div>
                )}
                {location.nearestStation && (
                  <div className="flex gap-2">
                    <dt className="text-stone shrink-0 w-28">Nearest station</dt>
                    <dd className="text-foreground-secondary">{location.nearestStation}</dd>
                  </div>
                )}
                {location.cashOnly !== undefined && location.cashOnly !== null && (
                  <div className="flex gap-2">
                    <dt className="text-stone shrink-0 w-28">Payment</dt>
                    <dd className="text-foreground-secondary">{location.cashOnly ? "Cash only" : "Cards accepted"}</dd>
                  </div>
                )}
                {location.reservationInfo && (
                  <div className="flex gap-2">
                    <dt className="text-stone shrink-0 w-28">Reservations</dt>
                    <dd className="text-foreground-secondary">{location.reservationInfo}</dd>
                  </div>
                )}
                {locationWithDetails.dietaryOptions?.servesVegetarianFood && (
                  <div className="flex gap-2">
                    <dt className="text-stone shrink-0 w-28">Dietary</dt>
                    <dd className="text-foreground-secondary">Vegetarian options</dd>
                  </div>
                )}
                {mealLabels && (
                  <div className="flex gap-2">
                    <dt className="text-stone shrink-0 w-28">Meals</dt>
                    <dd className="text-foreground-secondary">{mealLabels}</dd>
                  </div>
                )}
                {serviceLabels && (
                  <div className="flex gap-2">
                    <dt className="text-stone shrink-0 w-28">Service</dt>
                    <dd className="text-foreground-secondary">{serviceLabels}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {/* Accessibility */}
          {accessibilityBadges.length > 0 && (
            <section className="space-y-2">
              <h3 className="eyebrow-editorial">
                Accessibility
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {accessibilityBadges.map((badge) => (
                  <span
                    key={badge.key}
                    className="inline-flex items-center gap-1 rounded-full bg-sage/10 px-2.5 py-1 text-xs text-sage"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {badge.label}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Good for */}
          {goodForPills.length > 0 && (
            <section className="space-y-2">
              <h3 className="eyebrow-editorial">
                Good for
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {goodForPills.map((pill) => (
                  <span
                    key={pill.key}
                    className="rounded-lg bg-surface px-3 py-1 text-sm text-foreground-secondary"
                  >
                    {pill.label}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Review snippets */}
          {details?.reviews && details.reviews.length > 0 && (
            <section className="space-y-2">
              <h3 className="eyebrow-editorial">
                Reviews
              </h3>
              <div className="space-y-3">
                {details.reviews
                  .filter((r) => r.text && r.text.length > 20)
                  .slice(0, 3)
                  .map((review, i) => (
                    <div key={i} className="rounded-lg bg-surface p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        {review.rating && (
                          <span className="flex items-center gap-0.5">
                            {Array.from({ length: review.rating }, (_, j) => (
                              <svg key={j} className="h-3 w-3 text-warning" viewBox="0 0 24 24" fill="currentColor">
                                <path d="m12 17.27 5.18 3.11-1.64-5.81L20.9 9.9l-6-0.52L12 4 9.1 9.38l-6 .52 5.36 4.67L6.82 20.38 12 17.27z" />
                              </svg>
                            ))}
                          </span>
                        )}
                        <span className="text-xs text-stone">{review.authorName}</span>
                        {review.relativePublishTimeDescription && (
                          <span className="text-xs text-stone">&middot; {review.relativePublishTimeDescription}</span>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed text-foreground-secondary line-clamp-3">
                        {review.text}
                      </p>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {/* Loading indicator */}
          {status === "loading" && (
            <div className="flex items-center gap-2 text-sm text-stone">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone/30 border-t-stone" />
              {isLongLoading ? (
                <div className="flex flex-col gap-1">
                  <span>Taking longer than expected...</span>
                  <button
                    type="button"
                    onClick={retry}
                    className="text-brand-primary hover:underline underline-offset-2 text-left text-sm"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <span>Loading details...</span>
              )}
            </div>
          )}

          {/* Error state */}
          {status === "error" && (
            <div className="flex items-start gap-2.5 rounded-lg border border-error/30 bg-error/5 p-4">
              <svg className="h-5 w-5 shrink-0 text-error mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path strokeLinecap="round" d="M12 8v4m0 4h.01" />
              </svg>
              <div>
                <p className="text-sm font-medium text-error">Could not load details</p>
                {errorMessage && (
                  <p className="text-xs text-foreground-secondary mt-0.5">{errorMessage}</p>
                )}
                <button
                  type="button"
                  onClick={retry}
                  className="mt-2 text-sm font-medium text-brand-primary hover:underline underline-offset-2"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* Address */}
          {details?.formattedAddress && (
            <section className="space-y-1">
              <h3 className="eyebrow-editorial">
                Address
              </h3>
              <p className="text-sm text-foreground-secondary">{details.formattedAddress}</p>
            </section>
          )}

          {/* Opening hours */}
          {status === "success" && details && (
            <section className="space-y-2">
              <h3 className="eyebrow-editorial">
                Opening hours
              </h3>
              {hasOpeningHours ? (
                <ul className="space-y-1 text-sm text-foreground-secondary">
                  {(details?.currentOpeningHours ?? details?.regularOpeningHours ?? []).map(
                    (entry) => (
                      <li key={entry}>{entry}</li>
                    ),
                  )}
                </ul>
              ) : (
                <p className="text-sm text-foreground-secondary">Open 24 hours or hours not listed</p>
              )}
            </section>
          )}

          {/* Links */}
          {status === "success" && details && hasLinks && (
            <section className="space-y-2">
              <h3 className="eyebrow-editorial">
                Links
              </h3>
              <ul className="space-y-1 text-sm text-brand-primary">
                {details?.websiteUri && isSafeUrl(details.websiteUri) && (
                  <li>
                    <a
                      href={details.websiteUri}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center py-1 transition hover:underline"
                    >
                      Official website
                    </a>
                  </li>
                )}
                {details?.internationalPhoneNumber && (
                  <li className="text-foreground-secondary">{details?.internationalPhoneNumber}</li>
                )}
                {details?.googleMapsUri && isSafeUrl(details.googleMapsUri) && (
                  <li>
                    <a
                      href={details.googleMapsUri}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center py-1 transition hover:underline"
                    >
                      View on Google Maps
                    </a>
                  </li>
                )}
              </ul>
            </section>
          )}

          {/* Hierarchy sections */}
          {hierarchy && hierarchy.subExperiences.length > 0 && (
            <div ref={subExperiencesRef} className="border-t border-border pt-6">
              <SubExperiencesSection subExperiences={hierarchy.subExperiences} />
            </div>
          )}
          {hierarchy && hierarchy.children.length > 0 && (
            <div className="border-t border-border pt-6">
              <ChildLocationsSection
                childLocations={hierarchy.children}
                parentName={locationWithDetails.name}
                onSelect={(loc) => router.push(`/places/${loc.id}`)}
              />
            </div>
          )}
          {hierarchy && hierarchy.relationships.length > 0 && (
            <div className="border-t border-border pt-6">
              <RelationshipsSection
                relationships={hierarchy.relationships}
                onSelect={(loc) => router.push(`/places/${loc.id}`)}
              />
            </div>
          )}

          {/* Report wrong info — quiet utility action at the very bottom */}
          <div className="border-t border-border pt-6 text-center">
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="inline-flex min-h-11 items-center px-3 text-sm text-foreground-secondary hover:text-foreground transition link-reveal"
            >
              Spot something wrong? Let us know.
            </button>
          </div>
        </div>
      </m.div>

      <LocationReportDialog
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        locationId={location.id}
        locationName={displayName}
      />
    </>,
    document.body,
  );
}
