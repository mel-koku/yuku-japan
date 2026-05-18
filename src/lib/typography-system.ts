import { cva } from "class-variance-authority";

/**
 * Centralized typography system for Variant A (Warm Editorial).
 *
 * Three font families:
 *   - Editorial (Serif / Cormorant): narrative text, large headings, quotes
 *   - Utility (Sans / Plus Jakarta Sans): UI labels, buttons, data, metadata
 *   - Mono (Geist Mono): stats, prices, IATA codes, nav numbers
 *
 * Usage:
 *   import { typography } from "@/lib/typography-system";
 *   <h1 className={typography({ intent: "editorial-hero" })}>Title</h1>
 */
export const typography = cva("", {
  variants: {
    intent: {
      // ── Editorial (Serif - Cormorant) ──────────────────────
      /** Oversized display headline — landing/intro hero punch line.
       *  Larger than `editorial-hero` and set tight; callers typically
       *  override the color (e.g. `text-brand-primary`). */
      "editorial-display":
        "font-serif text-6xl sm:text-7xl md:text-8xl lg:text-[9rem] font-semibold leading-[0.9] tracking-normal text-foreground text-balance",
      /** Massive hero headlines */
      "editorial-hero":
        "font-serif text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-semibold leading-[1.05] tracking-normal text-foreground text-balance",
      /** Page-level headings */
      "editorial-h1":
        "font-serif text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold leading-[1.1] tracking-normal text-foreground text-balance",
      /** Section headings */
      "editorial-h2":
        "font-serif text-2xl md:text-3xl font-semibold leading-[1.2] text-foreground text-balance",
      /** Sub-section headings */
      "editorial-h3":
        "font-serif text-xl md:text-2xl font-semibold leading-[1.25] text-foreground text-balance",
      /** Long-form reading text */
      "editorial-prose":
        "font-serif text-lg leading-relaxed text-foreground",
      /** Pull quotes, testimonials */
      "editorial-quote":
        "font-serif text-xl italic leading-relaxed text-foreground-secondary text-balance",

      // ── Utility (Sans - Plus Jakarta Sans) ─────────────────
      /** Functional page headings */
      "utility-h1":
        "font-sans text-2xl font-bold tracking-tight text-foreground",
      /** Card / component headings */
      "utility-h2":
        "font-sans text-xl font-semibold text-foreground",
      /** Standard body text */
      "utility-body":
        "font-sans text-base leading-relaxed text-foreground",
      /** Muted body text */
      "utility-body-muted":
        "font-sans text-base leading-relaxed text-foreground-secondary",
      /** Small uppercase labels, nav items, buttons */
      "utility-label":
        "font-sans text-sm font-medium tracking-wide text-foreground-secondary uppercase",
      /** Tabular numbers for stats, prices, dates */
      "utility-tabular":
        "font-mono tabular-nums text-sm text-foreground",
      /** Tiny metadata captions */
      "utility-meta":
        "font-sans text-xs text-foreground-secondary",
    },
  },
});
