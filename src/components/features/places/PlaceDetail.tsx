"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { m } from "framer-motion";
import { easeReveal, durationBase } from "@/lib/motion";
import type { Location, LocationHeroAttribution } from "@/types/location";
import { useLocationDetailsQuery } from "@/hooks/useLocationDetailsQuery";
import { useNearbyLocationsQuery } from "@/hooks/useLocationsQuery";
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
import type { GuideSummary } from "@/types/guide";
import { GuideCard } from "@/components/features/guides/GuideCard";
import { HeartIcon, LocationCard } from "./LocationCard";
import { useLocationHierarchy } from "@/hooks/useLocationHierarchy";
import {
  ChildLocationsSection,
  SubExperiencesSection,
  RelationshipsSection,
} from "./HierarchySections";
import { SimilarPlaces } from "./SimilarPlaces";
import { LocationReportDialog } from "./LocationReportDialog";
import { PhotoAttribution } from "./PhotoAttribution";
import { EditorNoteBody } from "./EditorNoteBody";
import { EditorNoteAuditSlot } from "./EditorNoteAuditSlot";
import type { EditorNotePayload } from "@/sanity/editorNote";
import { Tooltip } from "@/components/ui/Tooltip";
import { Button } from "@/components/ui/Button";
import { DataIcon } from "@/components/ui/DataIcon";
import { ArrowRight } from "lucide-react";

const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: durationBase, ease: [...easeReveal] as [number, number, number, number] },
  },
};

const sectionReveal = {
  initial: { opacity: 0, y: 12 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-40px" as const },
  transition: { duration: durationBase, ease: [...easeReveal] as [number, number, number, number] },
};


const DESC_CLAMP_THRESHOLD = 120; // words — only clamp if over this

function OverviewSection({
  editorNote,
  summary,
  description,
  sectionReveal,
}: {
  editorNote?: EditorNotePayload | null;
  summary?: string;
  description?: string;
  sectionReveal: Record<string, unknown>;
}) {
  const [expanded, setExpanded] = useState(false);
  const needsClamp =
    !!description && description.trim().split(/\s+/).length > DESC_CLAMP_THRESHOLD;

  // Smart Guidebook: when an editor note exists, it replaces the description
  // section entirely (Option B unlabeled — see 2026-05-05 frontend-wiring
  // handoff). Curated takes are the better surface for covered locations;
  // the description still shows for the ~5,060 uncovered locations.
  if (editorNote?.note && editorNote.note.length > 0) {
    return (
      <m.section {...sectionReveal}>
        <EditorNoteBody blocks={editorNote.note} />
        <EditorNoteAuditSlot payload={editorNote} />
      </m.section>
    );
  }

  return (
    <m.section {...sectionReveal} className="space-y-2">
      <h2 className="eyebrow-editorial">Overview</h2>
      {summary && (
        <p className="text-sm font-medium leading-relaxed text-foreground">
          {summary}
        </p>
      )}
      {description && (
        <div>
          <p
            className={cn(
              "text-base leading-relaxed text-foreground-secondary",
              needsClamp && !expanded && "line-clamp-5"
            )}
          >
            {description}
          </p>
          {needsClamp && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-brand-primary hover:underline"
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      )}
    </m.section>
  );
}

type PlaceDetailProps = {
  initialLocation: Location;
  initialEditorNote?: EditorNotePayload | null;
  featuredGuides?: GuideSummary[];
};

export function PlaceDetail({ initialLocation, initialEditorNote, featuredGuides }: PlaceDetailProps) {
  const router = useRouter();
  const { status, details, fetchedLocation } = useLocationDetailsQuery(initialLocation.id);
  const location = fetchedLocation ?? initialLocation;
  const { isInSaved, toggleSave } = useSaved();
  const showFirstSaveToast = useFirstSaveToast();

  const isSaved = isInSaved(location.id);
  const [heartAnimating, setHeartAnimating] = useState(false);
  const wasSaved = useRef(isSaved);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);

  // Nearby locations
  const lat = location.coordinates?.lat ?? null;
  const lng = location.coordinates?.lng ?? null;
  const { data: nearbyData } = useNearbyLocationsQuery(lat, lng, {
    radius: 3,
    limit: 6,
    openNow: false,
  });
  const nearbyLocations = useMemo(
    () => (nearbyData?.data ?? []).filter((n) => n.id !== location.id).slice(0, 6),
    [nearbyData, location.id],
  );

  // Hierarchy context (children, sub-experiences, relationships)
  const { data: hierarchy } = useLocationHierarchy(location.id);

  // Photos — each entry carries its attribution. Google heroes carry a plain
  // displayName credit (Google TOS satisfied via the linked Commons-style
  // text). Wikimedia heroes additionally carry structured license metadata
  // for the PhotoAttribution component (Phase 3).
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

  const displayName = useMemo(
    () => getLocationDisplayName(details?.displayName, location),
    [location, details],
  );
  const { summary, description } = useMemo(() => {
    const short = location.shortDescription?.trim() || undefined;
    const full =
      location.description?.trim() ||
      details?.editorialSummary?.trim() ||
      undefined;

    if (!full && !short) return { summary: undefined, description: undefined };
    if (!full) return { summary: undefined, description: short };
    if (!short) return { summary: undefined, description: full };

    const isDifferent = !full.toLowerCase().startsWith(short.toLowerCase().slice(0, 60));
    return isDifferent
      ? { summary: short, description: full }
      : { summary: undefined, description: full };
  }, [location, details]);

  // Meal / service labels
  const mealLabels = useMemo(() => {
    const m = location.mealOptions;
    if (!m) return null;
    const parts: string[] = [];
    if (m.servesBreakfast) parts.push("Breakfast");
    if (m.servesBrunch) parts.push("Brunch");
    if (m.servesLunch) parts.push("Lunch");
    if (m.servesDinner) parts.push("Dinner");
    return parts.length > 0 ? parts.join(", ") : null;
  }, [location.mealOptions]);

  const serviceLabels = useMemo(() => {
    const s = location.serviceOptions;
    if (!s) return null;
    const parts: string[] = [];
    if (s.dineIn) parts.push("Dine-in");
    if (s.takeout) parts.push("Takeout");
    if (s.delivery) parts.push("Delivery");
    return parts.length > 0 ? parts.join(", ") : null;
  }, [location.serviceOptions]);

  const accessibilityBadges = useMemo(() => {
    const a = location.accessibilityOptions;
    if (!a) return [];
    const badges: { key: string; label: string }[] = [];
    if (a.wheelchairAccessibleEntrance) badges.push({ key: "entrance", label: "Wheelchair entrance" });
    if (a.wheelchairAccessibleParking) badges.push({ key: "parking", label: "Wheelchair parking" });
    if (a.wheelchairAccessibleRestroom) badges.push({ key: "restroom", label: "Wheelchair restroom" });
    if (a.wheelchairAccessibleSeating) badges.push({ key: "seating", label: "Wheelchair seating" });
    return badges;
  }, [location.accessibilityOptions]);

  const goodForPills = useMemo(() => {
    const pills: { key: string; label: string }[] = [];
    if (location.goodForChildren) pills.push({ key: "children", label: "Families" });
    if (location.goodForGroups) pills.push({ key: "groups", label: "Groups" });
    return pills;
  }, [location.goodForChildren, location.goodForGroups]);

  // Location-specific guidance tips (only tips explicitly targeting this location)
  const [tips, setTips] = useState<TravelGuidance[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchLocationSpecificGuidance(location)
      .then((result) => { if (!cancelled) setTips(result.slice(0, 3)); })
      // eslint-disable-next-line no-console
      .catch((err) => console.warn("Failed to fetch location guidance:", err));
    return () => { cancelled = true; };
  }, [location]);

  // Heart animation
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

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/places");
    }
  }, [router]);

  const hasOpeningHours =
    (details?.currentOpeningHours?.length ?? 0) >= 3 ||
    (details?.regularOpeningHours?.length ?? 0) >= 3;
  const hasLinks =
    (details?.websiteUri && isSafeUrl(details.websiteUri)) ||
    details?.internationalPhoneNumber ||
    (details?.googleMapsUri && isSafeUrl(details.googleMapsUri));

  const activePhoto = allPhotos[activePhotoIndex];

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Hero image */}
      <div className="relative">
        <div className="relative aspect-[4/3] w-full overflow-hidden sm:aspect-[16/9] lg:aspect-[21/9]">
          <Image
            src={activePhoto?.url || "/placeholder.jpg"}
            alt={displayName}
            fill
            className="object-cover"
            sizes="100vw"
            priority
          />
          <div className="absolute inset-0 scrim-70" />
        </div>
        {/* Photo attribution. On mobile it sits as a normal-flow caption below the hero so
            long license notices (MLIT, personality rights) don't cover the image. On sm+ it
            promotes to an absolute overlay anchored bottom-right of the hero. */}
        {activePhoto?.heroAttribution ? (
          <div className="bg-foreground/85 px-3 py-1.5 text-white/90 sm:absolute sm:bottom-2 sm:right-3 sm:max-w-[calc(100%-1.5rem)] sm:bg-transparent sm:px-0 sm:py-0 sm:text-right sm:text-white/80 [&_a]:underline [&_a]:decoration-white/40 [&_a:hover]:decoration-white">
            <PhotoAttribution
              attribution={activePhoto.heroAttribution}
              variant="inline"
              showNotice
            />
          </div>
        ) : activePhoto?.attribution ? (
          <p className="absolute bottom-2 right-3 text-[11px] text-white/80">
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

      {/* Photo gallery — sits directly under the hero so the thumbnails are visually
          paired with the active photo they control. py-1.5 gives the active ring
          breathing room inside the overflow-x clip region. */}
      {allPhotos.length > 1 && (
        <div className="mx-auto max-w-4xl px-6 pt-2 pb-3">
          <div className="flex gap-1.5 overflow-x-auto overscroll-contain snap-x snap-mandatory scrollbar-hide py-1.5">
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
        </div>
      )}

      {/* Sticky back bar */}
      <div className="sticky z-30 border-b border-border bg-background/95 backdrop-blur-sm" style={{ top: 0 }}>
        <div className="mx-auto max-w-4xl px-4 sm:px-6 flex items-center gap-3 h-12">
          <button
            type="button"
            onClick={handleBack}
            className="flex min-h-11 items-center gap-1.5 py-2 text-sm font-medium text-brand-primary hover:text-foreground transition shrink-0"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Places
          </button>
          <span className="text-border">|</span>
          <p className="text-sm text-stone truncate">{displayName}</p>
        </div>
      </div>

      {/* Title section */}
      <m.div
        className="mx-auto max-w-4xl px-6 py-8 sm:py-12"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <m.p variants={fadeUp} className="eyebrow-editorial capitalize">
          {location.category}
        </m.p>

        <m.h1
          variants={fadeUp}
          className={cn(typography({ intent: "editorial-h1" }), "mt-3")}
        >
          {displayName}
        </m.h1>

        {location.nameJapanese && (
          <m.p variants={fadeUp} className="mt-1 text-base text-foreground-secondary">
            {location.nameJapanese}
          </m.p>
        )}

        {/* Metadata row */}
        <m.div variants={fadeUp} className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
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
          {location.priceLevel !== undefined && location.priceLevel !== null && (
            <span className="text-stone font-mono text-xs">
              {location.priceLevel === 0 ? "Free" : "¥".repeat(location.priceLevel)}
            </span>
          )}
          <span className="text-stone">{location.city}, {location.region}</span>
        </m.div>

        {/* JTA + Hidden Gem badges */}
        <m.div variants={fadeUp} className="mt-3 flex flex-wrap gap-2">
          {location.jtaApproved && (
            <Tooltip content="Japan Tourism Agency (JTA) certified destination">
              <span
                tabIndex={0}
                className="inline-flex items-center gap-1.5 rounded-md border border-brand-secondary/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-brand-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary/40"
              >
                JTA Approved
              </span>
            </Tooltip>
          )}
          {location.isHiddenGem && (
            <Tooltip content="A place chosen for distinctive character">
              <span
                tabIndex={0}
                className="inline-flex items-center gap-1.5 rounded-md border border-sage/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
              >
                Local Pick
              </span>
            </Tooltip>
          )}
          {location.isUnescoSite && (
            <Tooltip content="Designated by UNESCO for global cultural or natural value">
              <span
                tabIndex={0}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-accent border border-accent/30 px-3 py-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              >
                UNESCO World Heritage Site
              </span>
            </Tooltip>
          )}
        </m.div>

        {/* Save button (disabled with explanation for container parents like districts) */}
        <m.div variants={fadeUp} className="mt-5">
          {location.parentMode === "container" ? (
            <button
              type="button"
              disabled
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-surface px-5 text-sm font-medium text-foreground-secondary opacity-50 cursor-not-allowed"
              title="This is a district. Save individual places instead."
              aria-label="Save unavailable for districts"
            >
              <HeartIcon active={false} animating={false} variant="inline" />
              Save for trip
            </button>
          ) : (
            <button
              type="button"
              onClick={handleToggleSave}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]",
                isSaved
                  ? "bg-brand-primary text-white"
                  : "bg-surface text-foreground hover:bg-border/50"
              )}
            >
              <HeartIcon active={isSaved} animating={heartAnimating} variant="inline" />
              {isSaved ? "Saved" : "Save for trip"}
            </button>
          )}
        </m.div>
      </m.div>


      {/* Content sections */}
      <div className="mx-auto max-w-3xl px-6 space-y-8 pb-8">
        {/* Description (replaced by editor note when one exists for this location) */}
        {(initialEditorNote?.note?.length || summary || description) && (
          <OverviewSection
            editorNote={initialEditorNote}
            summary={summary}
            description={description}
            sectionReveal={sectionReveal}
          />
        )}


        {/* Local tips: insider tip + location-specific guidance */}
        {(location.insiderTip || tips.length > 0) && (
          <m.section {...sectionReveal} className="space-y-3">
            <h2 className="eyebrow-editorial">Local tips</h2>
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
          </m.section>
        )}

        {/* Practical info */}
        {(location.nameJapanese || location.nearestStation || location.cashOnly !== undefined || location.reservationInfo || location.dietaryOptions?.servesVegetarianFood || mealLabels || serviceLabels) && (
          <m.section {...sectionReveal} className="space-y-3">
            <h2 className="eyebrow-editorial">Practical info</h2>
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
              {location.dietaryOptions?.servesVegetarianFood && (
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
          </m.section>
        )}

        {/* Accessibility */}
        {accessibilityBadges.length > 0 && (
          <m.section {...sectionReveal} className="space-y-2">
            <h2 className="eyebrow-editorial">Accessibility</h2>
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
          </m.section>
        )}

        {/* Good for */}
        {goodForPills.length > 0 && (
          <m.section {...sectionReveal} className="space-y-2">
            <h2 className="eyebrow-editorial">Good for</h2>
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
          </m.section>
        )}

        {/* Reviews */}
        {details?.reviews && details.reviews.length > 0 && (
          <m.section {...sectionReveal} className="space-y-3">
            <h2 className="eyebrow-editorial">Reviews</h2>
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
          </m.section>
        )}

        {/* Loading indicator */}
        {status === "loading" && (
          <div className="flex items-center gap-2 text-sm text-stone">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone/30 border-t-stone" />
            Loading details...
          </div>
        )}

        {/* Address */}
        {details?.formattedAddress && (
          <m.section {...sectionReveal} className="space-y-1">
            <h2 className="eyebrow-editorial">Address</h2>
            <p className="text-sm text-foreground-secondary">{details.formattedAddress}</p>
          </m.section>
        )}

        {/* Opening hours */}
        {status === "success" && (
          <m.section {...sectionReveal} className="space-y-2">
            <h2 className="eyebrow-editorial">Opening hours</h2>
            {hasOpeningHours ? (
              <ul className="space-y-1 text-sm text-foreground-secondary">
                {(details!.currentOpeningHours ?? details!.regularOpeningHours ?? []).map(
                  (entry) => <li key={entry}>{entry}</li>,
                )}
              </ul>
            ) : (
              <p className="text-sm text-foreground-secondary">Open 24 hours or hours not listed</p>
            )}
          </m.section>
        )}

        {/* Links */}
        {hasLinks && (
          <m.section {...sectionReveal} className="space-y-2">
            <h2 className="eyebrow-editorial">Links</h2>
            <ul className="space-y-1 text-sm text-brand-primary">
              {details?.websiteUri && isSafeUrl(details.websiteUri) && (
                <li>
                  <a href={details.websiteUri} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center py-1 transition hover:underline">
                    Official website
                  </a>
                </li>
              )}
              {details?.internationalPhoneNumber && (
                <li className="text-foreground-secondary">{details.internationalPhoneNumber}</li>
              )}
              {details?.googleMapsUri && isSafeUrl(details.googleMapsUri) && (
                <li>
                  <a href={details.googleMapsUri} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center py-1 transition hover:underline">
                    View on Google Maps
                  </a>
                </li>
              )}
            </ul>
          </m.section>
        )}
      </div>

      {/* Trip Builder CTA */}
      <section className="py-12 sm:py-16 lg:py-20 text-center">
        <div className="mx-auto max-w-xl px-4 sm:px-6">
          <p className="text-foreground-secondary text-sm mb-4">
            Want to visit {location.name}?
          </p>
          <Button
            asChild
            href={`/trip-builder?city=${encodeURIComponent(location.city)}`}
            variant="primary"
            size="lg"
            rightIcon={<ArrowRight aria-hidden="true" />}
          >
            Build a trip to {location.city}
          </Button>
        </div>
      </section>

      {/* Hierarchy: Sub-experiences */}
      {hierarchy && hierarchy.subExperiences.length > 0 && (
        <section className="py-12 sm:py-16 lg:py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <SubExperiencesSection subExperiences={hierarchy.subExperiences} />
          </div>
        </section>
      )}

      {/* Hierarchy: Child locations */}
      {hierarchy && hierarchy.children.length > 0 && (
        <section className="bg-canvas py-12 sm:py-16 lg:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <ChildLocationsSection
              childLocations={hierarchy.children}
              parentName={location.name}
              onSelect={(loc) => router.push(`/places/${loc.slug}`)}
            />
          </div>
        </section>
      )}

      {/* Hierarchy: Relationships (In this area / Consider instead).
          "In this area" falls back to coord-proximity (≤1km, ~6 places)
          when no curated clusters exist, so any place with coordinates
          gets a populated area section. */}
      {hierarchy &&
        (hierarchy.relationships.length > 0 || hierarchy.nearby.length > 0) && (
          <section className="py-12 sm:py-16 lg:py-20">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <RelationshipsSection
                relationships={hierarchy.relationships}
                nearby={hierarchy.nearby}
                onSelect={(loc) => router.push(`/places/${loc.slug}`)}
              />
            </div>
          </section>
        )}

      {/* Featured in guides — strengthens internal-linking cluster
          (place ↔ guide ↔ city) and gives readers context for the place. */}
      {featuredGuides && featuredGuides.length > 0 && (
        <section className="py-12 sm:py-16 lg:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <m.h2
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: durationBase, ease: [...easeReveal] as [number, number, number, number] }}
              className={cn(typography({ intent: "editorial-h2" }), "text-center mb-10")}
            >
              Featured in guides
            </m.h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredGuides.map((guide, i) => (
                <GuideCard key={guide.id} guide={guide} index={i} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Explore Nearby */}
      {nearbyLocations.length > 0 && (
        <section className="bg-canvas py-12 sm:py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <m.h2
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: durationBase, ease: [...easeReveal] as [number, number, number, number] }}
              className={cn(typography({ intent: "editorial-h2" }), "text-center mb-10")}
            >
              Explore Nearby
            </m.h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {nearbyLocations.map((nearby) => (
                <LocationCard
                  key={nearby.id}
                  location={nearby}
                  onSelect={(loc) => router.push(`/places/${loc.slug}`)}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Similar Places */}
      <SimilarPlaces locationId={location.id} />

      {/* Report wrong info — quiet utility action, not a primary CTA */}
      <div className="pt-6 pb-4 text-center">
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="inline-flex min-h-11 items-center px-3 text-sm text-foreground-secondary hover:text-foreground transition link-reveal"
        >
          Spot something wrong? Let us know.
        </button>
      </div>

      {/* Back to all places */}
      <div className="pb-12 sm:pb-16 text-center">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex min-h-11 items-center gap-2 px-3 text-sm font-medium text-brand-primary hover:underline transition"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to all places
        </button>
      </div>

      <LocationReportDialog
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        locationId={location.id}
        locationName={displayName}
      />
    </div>
  );
}
