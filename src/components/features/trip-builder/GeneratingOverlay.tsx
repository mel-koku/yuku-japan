"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { m, AnimatePresence, useReducedMotion } from "framer-motion";
import { easeReveal, durationFast } from "@/lib/motion";
import { typography } from "@/lib/typography-system";
import { GoogleSignInButton } from "@/components/ui/GoogleSignInButton";
import { createClient } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import type { TripBuilderConfig } from "@/types/sanitySiteContent";

const DEFAULT_STATUS_MESSAGES = [
  "Reading your preferences...",
  "Routing between cities...",
  "Scheduling the days...",
  "Final checks...",
];

const MESSAGE_INTERVAL = 2500;
const SUCCESS_DISPLAY_MS = 2500;

type GeneratingOverlayProps = {
  sanityConfig?: TripBuilderConfig;
  successData?: { tripName: string; tripId: string } | null;
  onSuccessComplete?: () => void;
  isGuest?: boolean;
  onSkipSignIn?: () => void;
};

function getMagicLinkRedirectUrl(tripId?: string): string {
  const base = env.siteUrl ?? (typeof window !== "undefined" ? window.location.origin : "");
  const callbackUrl = `${base}/auth/callback`;
  if (tripId) {
    const next = `/itinerary?trip=${tripId}`;
    return `${callbackUrl}?next=${encodeURIComponent(next)}`;
  }
  return callbackUrl;
}

export function GeneratingOverlay({ sanityConfig, successData, onSuccessComplete, isGuest, onSkipSignIn }: GeneratingOverlayProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<{ message: string; isError: boolean } | null>(null);
  const supabase = createClient();
  const prefersReducedMotion = useReducedMotion();

  async function sendMagicLink(e: FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setEmailStatus({ message: "Sign-in is temporarily unavailable.", isError: true });
      return;
    }
    setEmailStatus({ message: "Sending your sign-in link…", isError: false });
    const redirectUrl = getMagicLinkRedirectUrl(successData?.tripId);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl },
    });
    setEmailStatus(
      error
        ? { message: `Error: ${error.message}`, isError: true }
        : { message: "Sign-in link sent. Check your inbox.", isError: false },
    );
  }

  const messages = sanityConfig?.generatingMessages?.length
    ? sanityConfig.generatingMessages
    : DEFAULT_STATUS_MESSAGES;

  const isSuccess = Boolean(successData);

  useEffect(() => {
    if (isSuccess) return;
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, MESSAGE_INTERVAL);
    return () => clearInterval(interval);
  }, [messages.length, isSuccess]);

  // Auto-navigate after success display
  useEffect(() => {
    if (!isSuccess || !onSuccessComplete) return;
    if (isGuest) return; // guests see sign-in prompt instead
    const timer = setTimeout(onSuccessComplete, SUCCESS_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [isSuccess, onSuccessComplete, isGuest]);

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-lg"
    >
      {/* Film grain */}
      <div className="texture-grain pointer-events-none absolute inset-0" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-8 px-6 text-center">
        <AnimatePresence mode="wait">
          {isSuccess ? (
            <m.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: easeReveal }}
              className="flex flex-col items-center gap-6"
            >
              {/* Checkmark */}
              <m.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.4, delay: 0.1, ease: easeReveal }}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-primary/15"
              >
                <svg className="h-8 w-8 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <m.path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.4, delay: 0.3 }}
                  />
                </svg>
              </m.div>

              <m.h2
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2, ease: easeReveal }}
                className={typography({ intent: "editorial-h2" })}
              >
                Your trip is ready
              </m.h2>

              <m.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.4 }}
                className="max-w-xs text-sm text-foreground-secondary"
              >
                {successData?.tripName}
              </m.p>

              {isGuest && (
                <m.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.6, ease: easeReveal }}
                  className="mt-2 w-full max-w-xs space-y-3 rounded-lg bg-surface p-5 shadow-[var(--shadow-card)]"
                >
                  {process.env.NEXT_PUBLIC_FREE_FULL_ACCESS === "true" ? (
                    <>
                      <p className="eyebrow-editorial text-center text-brand-primary">Launch Offer</p>
                      <p className="text-center text-xs text-foreground-secondary">
                        Trip Pass is free during our launch. Sign in to unlock all days.
                      </p>
                    </>
                  ) : (
                    <p className="text-center text-xs text-foreground-secondary">
                      This trip is only on this device.
                    </p>
                  )}
                  <GoogleSignInButton
                    label={process.env.NEXT_PUBLIC_FREE_FULL_ACCESS === "true" ? "Sign in to unlock all days free" : "Sign in to save it everywhere"}
                    redirectTo={successData?.tripId ? `/itinerary?trip=${successData.tripId}` : undefined}
                  />

                  {/* Magic link toggle */}
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-xs text-stone">or</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowEmailForm((v) => !v)}
                    aria-expanded={showEmailForm}
                    className="flex w-full items-center justify-center h-12 rounded-lg border border-border bg-background px-4 text-sm font-semibold text-foreground transition-all hover:bg-surface hover:shadow-[var(--shadow-card)]"
                  >
                    Sign in with email
                  </button>

                  <AnimatePresence>
                    {showEmailForm && (
                      <m.form
                        key="email-form"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: easeReveal }}
                        className="overflow-hidden"
                        onSubmit={sendMagicLink}
                      >
                        <div className="space-y-2 pt-1">
                          <input
                            type="email"
                            required
                            disabled={!supabase}
                            placeholder="name@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="block w-full h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-brand-primary"
                          />
                          <button
                            type="submit"
                            disabled={!supabase}
                            className="w-full h-10 rounded-lg border border-border bg-background px-4 text-xs font-semibold text-foreground transition-all hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Send sign-in link
                          </button>
                          {emailStatus && (
                            <p className={`text-xs ${emailStatus.isError ? "text-error" : "text-success"}`} role="alert">
                              {emailStatus.message}
                            </p>
                          )}
                        </div>
                      </m.form>
                    )}
                  </AnimatePresence>

                  <button
                    type="button"
                    onClick={onSkipSignIn}
                    className="block w-full text-center text-xs text-foreground-secondary underline underline-offset-4 transition-colors hover:text-foreground"
                  >
                    {process.env.NEXT_PUBLIC_FREE_FULL_ACCESS === "true" ? "Continue with Day 1. Sign in later to unlock the rest." : "Continue without saving"}
                  </button>
                </m.div>
              )}
            </m.div>
          ) : (
            <m.div
              key="generating"
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center gap-8"
            >
              <m.h2
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: easeReveal, delay: 0.1 }}
                className={typography({ intent: "editorial-h2" })}
              >
                {sanityConfig?.generatingHeading ?? "Building your itinerary"}
              </m.h2>

              {/* Indeterminate progress bar — the plan API is a single
                  non-streaming request, so there is no real percentage to
                  show. A looping segment conveys activity without a false
                  ETA. Reduced motion gets a static partial fill. */}
              <div
                className="h-0.5 w-64 overflow-hidden rounded-full bg-border"
                role="progressbar"
                aria-label="Building your itinerary"
              >
                {prefersReducedMotion ? (
                  <div className="h-full w-1/3 rounded-full bg-brand-primary" />
                ) : (
                  <m.div
                    className="h-full w-1/3 rounded-full bg-brand-primary"
                    initial={{ x: "-100%" }}
                    animate={{ x: "300%" }}
                    transition={{
                      duration: 1.4,
                      ease: "easeInOut",
                      repeat: Infinity,
                    }}
                  />
                )}
              </div>

              {/* Rotating status messages */}
              <div className="h-6">
                <AnimatePresence mode="wait">
                  <m.p
                    key={messageIndex}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: durationFast, ease: easeReveal }}
                    className="text-sm text-foreground-secondary"
                  >
                    {messages[messageIndex]}
                  </m.p>
                </AnimatePresence>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </m.div>
  );
}
