import { groq } from "next-sanity";

/** Full guide with expanded author and resolved images */
export const guideBySlugQuery = groq`
  *[_type == "guide" && slug.current == $slug && editorialStatus == "published"][0] {
    _id,
    title,
    "slug": slug.current,
    subtitle,
    summary,
    body[] {
      ...,
      _type == "image" => {
        ...,
        "url": asset->url,
        "dimensions": asset->metadata.dimensions
      }
    },
    "featuredImage": featuredImage {
      ...,
      "url": asset->url,
      "dimensions": asset->metadata.dimensions
    },
    "thumbnailImage": thumbnailImage {
      ...,
      "url": asset->url,
      "dimensions": asset->metadata.dimensions
    },
    author-> {
      name,
      "slug": slug.current,
      "photo": photo {
        ...,
        "url": asset->url
      },
      bio,
      city,
      socialLinks
    },
    guideType,
    category,
    tags,
    city,
    region,
    "locationIds": locationIds[].locationId,
    readingTimeMinutes,
    editorialStatus,
    featured,
    sortOrder,
    publishedAt,
    _createdAt,
    _updatedAt,
    // Activity-specific fields
    experienceType,
    craftType,
    duration,
    groupSizeMin,
    groupSizeMax,
    difficulty,
    bestSeason,
    meetingPoint,
    whatsIncluded,
    whatToBring,
    nearestStation,
    estimatedCost,
    bookingUrl
  }
`;

/** Author with count of published guides */
export const authorBySlugQuery = groq`
  *[_type == "author" && slug.current == $slug][0] {
    _id,
    name,
    "slug": slug.current,
    "photo": photo {
      ...,
      "url": asset->url
    },
    bio,
    city,
    socialLinks,
    "guideCount": count(*[_type == "guide" && references(^._id) && editorialStatus == "published"]),
    "guides": *[_type == "guide" && references(^._id) && editorialStatus == "published"] | order(publishedAt desc) {
      _id,
      title,
      "slug": slug.current,
      summary,
      "featuredImage": featuredImage.asset->url,
      guideType,
      city,
      region,
      readingTimeMinutes,
      tags,
      publishedAt
    }
  }
`;

/** All authors for directory page */
export const allAuthorsQuery = groq`
  *[_type == "author"] | order(name asc) {
    _id,
    name,
    "slug": slug.current,
    "photo": photo {
      ...,
      "url": asset->url
    },
    bio,
    city,
    "guideCount": count(*[_type == "guide" && references(^._id) && editorialStatus == "published"])
  }
`;

/** Landing page singleton with resolved image URLs */
export const landingPageQuery = groq`
  *[_type == "landingPage"][0] {
    heroHeadline,
    heroTagline,
    heroDescription,
    heroPrimaryCtaText,
    heroSecondaryCtaText,
    "heroImage": heroImage {
      ...,
      "url": asset->url
    },
    philosophyEyebrow,
    philosophyHeading,
    "philosophyImage": philosophyImage {
      ...,
      "url": asset->url
    },
    philosophyStats,
    showcaseActs[] {
      number,
      eyebrow,
      title,
      description,
      "image": image {
        ...,
        "url": asset->url
      },
      alt
    },
    featuredLocationsEyebrow,
    featuredLocationsHeading,
    featuredLocationsDescription,
    featuredLocationsCtaText,
    featuredExperiencesEyebrow,
    featuredExperiencesHeading,
    featuredExperiencesDescription,
    featuredExperiencesCtaText,
    testimonials[] {
      quote,
      authorName,
      authorLocation,
      "image": image {
        ...,
        "url": asset->url
      },
      alt
    },
    "testimonialBackgroundImage": testimonialBackgroundImage {
      ...,
      "url": asset->url
    },
    featuredGuidesEyebrow,
    featuredGuidesHeading,
    featuredGuidesDescription,
    featuredGuidesCtaText,
    seasonalSpotlightEyebrow,
    seasonalSpotlightSpringHeading,
    seasonalSpotlightSummerHeading,
    seasonalSpotlightAutumnHeading,
    seasonalSpotlightWinterHeading,
    seasonalSpotlightDescription,
    seasonalSpotlightCtaText,
    finalCtaHeading,
    finalCtaDescription,
    finalCtaPrimaryText,
    finalCtaSecondaryText,
    finalCtaSubtext,
    "finalCtaImage": finalCtaImage {
      ...,
      "url": asset->url
    }
  }
`;

/** Site settings singleton */
export const siteSettingsQuery = groq`
  *[_type == "siteSettings"][0] {
    brandDescription,
    newsletterLabel,
    newsletterButtonText,
    footerNavColumns[] {
      title,
      links[] {
        label,
        href
      }
    },
    socialLinks[] {
      platform,
      url,
      label
    }
  }
`;

/** Trip builder config singleton with resolved image URLs */
export const tripBuilderConfigQuery = groq`
  *[_type == "tripBuilderConfig"][0] {
    vibes[] {
      vibeId,
      name,
      description,
      icon,
      "image": image {
        ...,
        "url": asset->url
      }
    },
    regions[] {
      regionId,
      name,
      tagline,
      description,
      highlights,
      "heroImage": heroImage {
        ...,
        "url": asset->url
      },
      "galleryImages": galleryImages[] {
        ...,
        "url": asset->url
      }
    },
    introHeading,
    introSubheading,
    introDescription,
    introCtaText,
    introEyebrow,
    "introAccentImage": introAccentImage {
      ...,
      "url": asset->url
    },
    introImageCaption,
    dateStepHeading,
    dateStepDescription,
    "dateStepBackgroundImage": dateStepBackgroundImage {
      ...,
      "url": asset->url
    },
    "dateStepSeasonalImages": dateStepSeasonalImages {
      "spring": spring {
        ...,
        "url": asset->url
      },
      "summer": summer {
        ...,
        "url": asset->url
      },
      "autumn": autumn {
        ...,
        "url": asset->url
      },
      "winter": winter {
        ...,
        "url": asset->url
      }
    },
    dateStepStartLabel,
    dateStepEndLabel,
    entryPointHeading,
    entryPointDescription,
    entryPointChangeText,
    entryPointSearchPlaceholder,
    entryPointNoResults,
    entryPointPopularLabel,
    vibeStepHeading,
    vibeStepDescription,
    vibeStepMaxWarning,
    regionStepHeading,
    regionStepDescription,
    reviewHeading,
    reviewDescription,
    reviewSavedPlacesLabel,
    reviewBudgetTitle,
    reviewBudgetTooltip,
    reviewPaceTitle,
    reviewPaceTooltip,
    reviewGroupTitle,
    reviewGroupTooltip,
    reviewAccessTitle,
    reviewAccessTooltip,
    reviewDietaryLabel,
    reviewNotesTitle,
    reviewNotesTooltip,
    reviewNotesPlaceholder,
    generatingHeading,
    generatingMessages,
    navBackLabel,
    navContinueLabel,
    navSkipLabel,
    navStartPlanningLabel,
    navGenerateLabel,
    navStartOverConfirmation
  }
`;

/** Full experience with expanded author and resolved images */
export const experienceBySlugQuery = groq`
  *[_type == "experience" && slug.current == $slug && editorialStatus == "published"][0] {
    _id,
    title,
    "slug": slug.current,
    subtitle,
    summary,
    body[] {
      ...,
      _type == "image" => {
        ...,
        "url": asset->url,
        "dimensions": asset->metadata.dimensions
      }
    },
    "featuredImage": featuredImage {
      ...,
      "url": asset->url,
      "dimensions": asset->metadata.dimensions
    },
    "thumbnailImage": thumbnailImage {
      ...,
      "url": asset->url,
      "dimensions": asset->metadata.dimensions
    },
    author-> {
      name,
      "slug": slug.current,
      "photo": photo {
        ...,
        "url": asset->url
      },
      bio,
      city,
      socialLinks
    },
    experienceType,
    craftType,
    duration,
    groupSizeMin,
    groupSizeMax,
    difficulty,
    bestSeason,
    meetingPoint,
    whatsIncluded,
    whatToBring,
    nearestStation,
    estimatedCost,
    bookingUrl,
    tags,
    city,
    region,
    "locationIds": locationIds[].locationId,
    readingTimeMinutes,
    editorialStatus,
    featured,
    sortOrder,
    publishedAt,
    _createdAt,
    _updatedAt
  }
`;

/** Featured experiences for landing page */
export const featuredExperiencesQuery = groq`
  *[_type == "experience" && editorialStatus == "published" && featured == true] | order(sortOrder asc) [0...$limit] {
    _id,
    title,
    "slug": slug.current,
    summary,
    "featuredImage": featuredImage {
      ...,
      "url": asset->url
    },
    "thumbnailImage": thumbnailImage {
      ...,
      "url": asset->url
    },
    experienceType,
    craftType,
    duration,
    difficulty,
    estimatedCost,
    city,
    region,
    readingTimeMinutes,
    tags,
    publishedAt
  }
`;

/** All published experiences for listing page */
export const allPublishedExperiencesQuery = groq`
  *[_type == "experience" && editorialStatus == "published"] | order(sortOrder asc, publishedAt desc) {
    _id,
    title,
    "slug": slug.current,
    subtitle,
    summary,
    "featuredImage": featuredImage {
      ...,
      "url": asset->url
    },
    "thumbnailImage": thumbnailImage {
      ...,
      "url": asset->url
    },
    experienceType,
    craftType,
    duration,
    difficulty,
    estimatedCost,
    city,
    region,
    "locationIds": locationIds[].locationId,
    readingTimeMinutes,
    tags,
    publishedAt
  }
`;

/** Pages content singleton */
export const pagesContentQuery = groq`
  *[_type == "pagesContent"][0] {
    placesHeading,
    placesSubtitle,
    placesErrorMessage,
    placesRetryText,
    placesEndMessage,
    experiencesHeading,
    experiencesDescription,
    experiencesEmptyHeading,
    experiencesEmptyDescription,
    experiencesFilteredEmptyHeading,
    experiencesFilteredEmptyDescription,
    guidesHeading,
    guidesDescription,
    guidesEmptyHeading,
    guidesEmptyDescription,
    guidesFilteredEmptyHeading,
    guidesFilteredEmptyDescription,
    authorsEyebrow,
    authorsHeading,
    authorsSubtitle,
    authorsEmptyState,
    savedEyebrow,
    savedTitle,
    savedSubtitleWithCount,
    savedSubtitleEmpty,
    "savedBackgroundImage": savedBackgroundImage {
      ...,
      "url": asset->url
    },
    dashboardEyebrow,
    dashboardSubtitle,
    dashboardActivityEyebrow,
    dashboardActivityHeading,
    dashboardTripsEyebrow,
    dashboardTripsHeading,
    dashboardEmptyHeading,
    dashboardEmptyDescription,
    dashboardPlanButton,
    dashboardAccountEyebrow,
    dashboardAccountHeading,
    dashboardDeleteToastTitle,
    dashboardUndoButton,
    "dashboardHeroImage": dashboardHeroImage {
      ...,
      "url": asset->url
    },
    "dashboardLockImage": dashboardLockImage {
      ...,
      "url": asset->url
    },
    accountEyebrow,
    accountTitle,
    accountSubtitle,
    accountProfileHeading,
    accountSignOutText,
    accountDisplayNameLabel,
    accountClearDataText,
    accountEmailLabel,
    accountEmailPlaceholder,
    accountSendLinkText,
    signInHeading,
    signInDescription,
    "signInBackgroundImage": signInBackgroundImage {
      ...,
      "url": asset->url
    },
    signInFormHeading,
    signInFormDescription,
    signInSubmitText,
    signInNoAccountText,
    signInGuestText,
    notFoundEyebrow,
    notFoundHeading,
    notFoundDescription,
    notFoundPrimaryCtaText,
    notFoundSecondaryCtaText,
    "notFoundBackgroundImage": notFoundBackgroundImage {
      ...,
      "url": asset->url
    },
    "comingSoonExpertsImage": comingSoonExpertsImage {
      ...,
      "url": asset->url
    },
    itineraryLoadingText,
    itineraryEmptyState,
    itineraryBuilderLink
  }
`;

/** About page singleton with resolved images */
export const aboutPageQuery = groq`
  *[_type == "aboutPage"][0] {
    heroEyebrow,
    heroHeading,
    heroSubtext,
    storyHeading,
    storyParagraphs,
    "storyImage": storyImage {
      ...,
      "url": asset->url
    },
    "photoBreakImage": photoBreakImage {
      ...,
      "url": asset->url
    },
    photoBreakAlt,
    valuesHeading,
    values[] {
      title,
      description,
      "image": image {
        ...,
        "url": asset->url
      }
    },
    teamEyebrow,
    teamHeading,
    teamMembers[] {
      name,
      role,
      bio,
      "photo": photo {
        ...,
        "url": asset->url
      },
      github,
      linkedin,
      twitter,
      website
    },
    ctaHeading,
    ctaDescription,
    ctaButtonText
  }
`;

/** Concierge page singleton with resolved image */
export const conciergePageQuery = groq`
  *[_type == "conciergePage"][0] {
    heroEyebrow,
    heroHeading,
    heroBody,
    heroCtaText,
    heroMeta,
    "photoBreakImage": photoBreakImage {
      ...,
      "url": asset->url
    },
    photoBreakAlt,
    photoBreakCaption,
    includesEyebrow,
    includesHeading,
    includesLead,
    includesItems[] {
      number,
      title,
      body
    },
    faqEyebrow,
    faqHeading,
    faqItems[] {
      question,
      answer
    },
    formHeading,
    formBody,
    formCtaText,
    formFinePrint,
    formSuccessHeading,
    formSuccessBody
  }
`;

/** Commerce disclosure singleton */
export const commerceDisclosureQuery = groq`
  *[_type == "commerceDisclosure"][0] {
    businessName,
    representative,
    address,
    email,
    phone,
    businessType,
    serviceDescription,
    pricingDescription,
    paymentMethods,
    paymentTiming,
    deliveryDescription,
    cancellationPolicy,
    cancellationContact
  }
`;

/** Cultural pillars for Before You Land briefing */
export const culturalPillarsQuery = groq`
  *[_type == "culturalPillar"] | order(sortOrder asc) {
    name,
    japanese,
    "slug": slug.current,
    pronunciation,
    tagline,
    concept,
    inPractice,
    forTravelers,
    briefIntro,
    icon,
    sortOrder,
    behaviors[] {
      situation,
      action,
      why,
      categories,
      severity
    }
  }
`;
