import type { SanityImageAsset } from "./sanityGuide";

export type LandingPageContent = {
  // Hero
  heroHeadline?: string;
  heroTagline?: string;
  heroDescription?: string;
  heroPrimaryCtaText?: string;
  heroSecondaryCtaText?: string;
  heroImage?: SanityImageAsset & { url?: string };

  // Philosophy
  philosophyEyebrow?: string;
  philosophyHeading?: string;
  philosophyImage?: SanityImageAsset & { url?: string };
  /** Stats array. `value` may contain literal `{locationCount}` — replace at render time with actual count. */
  philosophyStats?: Array<{
    /** Numeric string like "47" or "3,950". Use `{locationCount}` for dynamic location count. */
    value: string;
    /** Appended after the number, e.g. "+" or "%". */
    suffix?: string;
    label: string;
  }>;

  // Showcase
  showcaseActs?: Array<{
    number: string;
    eyebrow: string;
    title: string;
    description: string;
    image: SanityImageAsset & { url?: string };
    alt: string;
  }>;

  // Testimonial / Feature showcase background
  testimonialBackgroundImage?: SanityImageAsset & { url?: string };

  // Featured Locations section header
  featuredLocationsEyebrow?: string;
  featuredLocationsHeading?: string;
  featuredLocationsDescription?: string;
  featuredLocationsCtaText?: string;

  // Featured Experiences section header
  featuredExperiencesEyebrow?: string;
  featuredExperiencesHeading?: string;
  featuredExperiencesDescription?: string;
  featuredExperiencesCtaText?: string;

  // Testimonials
  testimonials?: Array<{
    quote: string;
    authorName: string;
    authorLocation: string;
    image: SanityImageAsset & { url?: string };
    alt: string;
  }>;

  // Featured Guides section header
  featuredGuidesEyebrow?: string;
  featuredGuidesHeading?: string;
  featuredGuidesDescription?: string;
  featuredGuidesCtaText?: string;

  // Seasonal Spotlight
  seasonalSpotlightEyebrow?: string;
  seasonalSpotlightSpringHeading?: string;
  seasonalSpotlightSummerHeading?: string;
  seasonalSpotlightAutumnHeading?: string;
  seasonalSpotlightWinterHeading?: string;
  seasonalSpotlightDescription?: string;
  seasonalSpotlightCtaText?: string;

  // Final CTA
  finalCtaHeading?: string;
  finalCtaDescription?: string;
  finalCtaPrimaryText?: string;
  finalCtaSecondaryText?: string;
  finalCtaSubtext?: string;
  finalCtaImage?: SanityImageAsset & { url?: string };
};

export type SiteSettings = {
  brandDescription?: string;
  newsletterLabel?: string;
  newsletterButtonText?: string;
  footerNavColumns?: Array<{
    title: string;
    links: Array<{
      label: string;
      href: string;
    }>;
  }>;
  socialLinks?: Array<{
    platform: string;
    url: string;
    label: string;
  }>;
};

export type TripBuilderConfig = {
  vibes?: Array<{
    vibeId: string;
    name: string;
    description: string;
    icon?: string;
    image?: SanityImageAsset & { url?: string };
  }>;
  regions?: Array<{
    regionId: string;
    name: string;
    tagline: string;
    description: string;
    highlights?: string[];
    heroImage?: SanityImageAsset & { url?: string };
    galleryImages?: Array<SanityImageAsset & { url?: string }>;
  }>;

  // Intro Step
  introHeading?: string;
  introSubheading?: string;
  introDescription?: string;
  introCtaText?: string;
  introEyebrow?: string;
  introAccentImage?: SanityImageAsset & { url?: string };
  introImageCaption?: string;

  // Date Step
  dateStepHeading?: string;
  dateStepDescription?: string;
  dateStepBackgroundImage?: SanityImageAsset & { url?: string };
  dateStepSeasonalImages?: {
    spring?: SanityImageAsset & { url?: string };
    summer?: SanityImageAsset & { url?: string };
    autumn?: SanityImageAsset & { url?: string };
    winter?: SanityImageAsset & { url?: string };
  };
  dateStepStartLabel?: string;
  dateStepEndLabel?: string;

  // Entry Point Step
  entryPointHeading?: string;
  entryPointDescription?: string;
  entryPointChangeText?: string;
  entryPointSearchPlaceholder?: string;
  entryPointNoResults?: string;
  entryPointPopularLabel?: string;

  // Vibe Step
  vibeStepHeading?: string;
  vibeStepDescription?: string;
  vibeStepMaxWarning?: string;

  // Region Step
  regionStepHeading?: string;
  regionStepDescription?: string;

  // Review Step
  reviewHeading?: string;
  reviewDescription?: string;
  reviewSavedPlacesLabel?: string;
  reviewBudgetTitle?: string;
  reviewBudgetTooltip?: string;
  reviewPaceTitle?: string;
  reviewPaceTooltip?: string;
  reviewGroupTitle?: string;
  reviewGroupTooltip?: string;
  reviewAccessTitle?: string;
  reviewAccessTooltip?: string;
  reviewDietaryLabel?: string;
  reviewNotesTitle?: string;
  reviewNotesTooltip?: string;
  reviewNotesPlaceholder?: string;

  // Generating Overlay
  generatingHeading?: string;
  generatingMessages?: string[];

  // Navigation Labels
  navBackLabel?: string;
  navContinueLabel?: string;
  navSkipLabel?: string;
  navStartPlanningLabel?: string;
  navGenerateLabel?: string;
  navStartOverConfirmation?: string;

  // Billing / Free Access
  freeAccessWindow?: {
    startDate?: string;
    endDate?: string;
  };
};

export type PagesContent = {
  // Places
  placesHeading?: string;
  placesSubtitle?: string;
  placesErrorMessage?: string;
  placesRetryText?: string;
  placesEndMessage?: string;

  // Experiences Listing
  experiencesHeading?: string;
  experiencesDescription?: string;
  experiencesEmptyHeading?: string;
  experiencesEmptyDescription?: string;
  experiencesFilteredEmptyHeading?: string;
  experiencesFilteredEmptyDescription?: string;

  // Guides Listing
  guidesHeading?: string;
  guidesDescription?: string;
  guidesEmptyHeading?: string;
  guidesEmptyDescription?: string;
  guidesFilteredEmptyHeading?: string;
  guidesFilteredEmptyDescription?: string;

  // Authors
  authorsEyebrow?: string;
  authorsHeading?: string;
  authorsSubtitle?: string;
  authorsEmptyState?: string;

  // Saved
  savedEyebrow?: string;
  savedTitle?: string;
  savedSubtitleWithCount?: string;
  savedSubtitleEmpty?: string;
  savedBackgroundImage?: SanityImageAsset & { url?: string };

  // Dashboard
  dashboardEyebrow?: string;
  dashboardSubtitle?: string;
  dashboardActivityEyebrow?: string;
  dashboardActivityHeading?: string;
  dashboardTripsEyebrow?: string;
  dashboardTripsHeading?: string;
  dashboardEmptyHeading?: string;
  dashboardEmptyDescription?: string;
  dashboardPlanButton?: string;
  dashboardAccountEyebrow?: string;
  dashboardAccountHeading?: string;
  dashboardDeleteToastTitle?: string;
  dashboardUndoButton?: string;
  dashboardHeroImage?: SanityImageAsset & { url?: string };
  dashboardLockImage?: SanityImageAsset & { url?: string };

  // Account
  accountEyebrow?: string;
  accountTitle?: string;
  accountSubtitle?: string;
  accountProfileHeading?: string;
  accountSignOutText?: string;
  accountDisplayNameLabel?: string;
  accountClearDataText?: string;
  accountEmailLabel?: string;
  accountEmailPlaceholder?: string;
  accountSendLinkText?: string;

  // Sign In
  signInHeading?: string;
  signInDescription?: string;
  signInBackgroundImage?: SanityImageAsset & { url?: string };
  signInFormHeading?: string;
  signInFormDescription?: string;
  signInSubmitText?: string;
  signInNoAccountText?: string;
  signInGuestText?: string;

  // 404 Page
  notFoundEyebrow?: string;
  notFoundHeading?: string;
  notFoundDescription?: string;
  notFoundPrimaryCtaText?: string;
  notFoundSecondaryCtaText?: string;
  notFoundBackgroundImage?: SanityImageAsset & { url?: string };

  // Coming Soon (shared)
  comingSoonExpertsImage?: SanityImageAsset & { url?: string };

  // Itinerary
  itineraryLoadingText?: string;
  itineraryEmptyState?: string;
  itineraryBuilderLink?: string;
};

export type AboutPageContent = {
  heroEyebrow?: string;
  heroHeading?: string;
  heroSubtext?: string;
  storyHeading?: string;
  storyParagraphs?: string[];
  storyImage?: SanityImageAsset & { url?: string };
  photoBreakImage?: SanityImageAsset & { url?: string };
  photoBreakAlt?: string;
  valuesHeading?: string;
  values?: Array<{
    title?: string;
    description?: string;
    image?: SanityImageAsset & { url?: string };
  }>;
  teamEyebrow?: string;
  teamHeading?: string;
  teamMembers?: Array<{
    name?: string;
    role?: string;
    bio?: string;
    photo?: SanityImageAsset & { url?: string };
    github?: string;
    linkedin?: string;
    twitter?: string;
    website?: string;
  }>;
  ctaHeading?: string;
  ctaDescription?: string;
  ctaButtonText?: string;
};

export type ConciergePageContent = {
  heroEyebrow?: string;
  heroHeading?: string;
  heroBody?: string;
  heroCtaText?: string;
  heroMeta?: string;
  photoBreakImage?: SanityImageAsset & { url?: string };
  photoBreakAlt?: string;
  photoBreakCaption?: string;
  includesEyebrow?: string;
  includesHeading?: string;
  includesLead?: string;
  includesItems?: Array<{
    number?: string;
    title?: string;
    body?: string;
  }>;
  faqEyebrow?: string;
  faqHeading?: string;
  faqItems?: Array<{
    question?: string;
    answer?: string;
  }>;
  formHeading?: string;
  formBody?: string;
  formMessageLabel?: string;
  formMessagePlaceholder?: string;
  formCtaText?: string;
  formFinePrint?: string;
  formSuccessHeading?: string;
  formSuccessBody?: string;
};

export type CommerceDisclosureContent = {
  businessName?: string;
  representative?: string;
  address?: string;
  email?: string;
  phone?: string;
  businessType?: string;
  serviceDescription?: string;
  pricingDescription?: string;
  paymentMethods?: string;
  paymentTiming?: string;
  deliveryDescription?: string;
  cancellationPolicy?: string;
  cancellationContact?: string;
};
