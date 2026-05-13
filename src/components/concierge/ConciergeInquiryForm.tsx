"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { typography } from "@/lib/typography-system";
import { Button } from "@/components/ui/Button";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import type { ConciergePageContent } from "@/types/sanitySiteContent";

type Props = {
  content?: ConciergePageContent;
  source?: string;
};

type SubmitStatus = "idle" | "submitting" | "success" | "error";

export function ConciergeInquiryForm({ content, source = "concierge-landing" }: Props) {
  const heading = content?.formHeading ?? "Reach out. We’d love to hear from you.";
  const body =
    content?.formBody ??
    "Leave your name and email. We’ll be in touch within 2 business days.";
  const messageLabel = content?.formMessageLabel ?? "Anything you'd like us to know?";
  const messagePlaceholder =
    content?.formMessagePlaceholder ??
    "Trip dates, group size, interests — whatever helps us help you.";
  const ctaText = content?.formCtaText ?? "Send my info";
  const finePrint =
    content?.formFinePrint ??
    "Read by a human. Replied to by the same team who’ll plan your trip.";
  const successHeading = content?.formSuccessHeading ?? "Thanks. We’ll be in touch.";
  const successBody =
    content?.formSuccessBody ??
    "We read every inquiry personally and typically reply within 2 business days.";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    setStatus("submitting");
    setErrorMessage("");

    try {
      const res = await fetch("/api/concierge/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message: message.trim() || undefined,
          source,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Something went wrong. Please try again.");
      }

      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      );
    }
  };

  return (
    <section
      id="inquire"
      aria-label="Contact"
      className="bg-background px-6 py-12 sm:py-16 lg:py-20"
    >
      <div className="mx-auto w-full max-w-xl">
        {status === "success" ? (
          <SuccessState heading={successHeading} body={successBody} />
        ) : (
          <>
            <div className="text-center">
              <ScrollReveal>
                <h2 className={cn(typography({ intent: "editorial-h2" }), "mb-4")}>
                  {heading}
                </h2>
              </ScrollReveal>
              <ScrollReveal delay={0.08}>
                <p
                  className={cn(
                    typography({ intent: "utility-body-muted" }),
                    "mx-auto mb-8 max-w-[44ch]",
                  )}
                >
                  {body}
                </p>
              </ScrollReveal>
            </div>

            <ScrollReveal delay={0.16}>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="concierge-name"
                      className={cn(typography({ intent: "utility-label" }), "mb-1.5 block")}
                    >
                      Your name
                    </label>
                    <input
                      id="concierge-name"
                      type="text"
                      required
                      autoComplete="name"
                      maxLength={100}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="First and last"
                      disabled={status === "submitting"}
                      className="h-12 w-full rounded-md border border-border bg-surface px-4 text-base text-foreground placeholder:text-stone focus:border-brand-primary focus:outline-none focus:ring-[3px] focus:ring-brand-primary/20 disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="concierge-email"
                      className={cn(typography({ intent: "utility-label" }), "mb-1.5 block")}
                    >
                      Email
                    </label>
                    <input
                      id="concierge-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      disabled={status === "submitting"}
                      className="h-12 w-full rounded-md border border-border bg-surface px-4 text-base text-foreground placeholder:text-stone focus:border-brand-primary focus:outline-none focus:ring-[3px] focus:ring-brand-primary/20 disabled:opacity-50"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="concierge-message"
                    className={cn(typography({ intent: "utility-label" }), "mb-1.5 block")}
                  >
                    {messageLabel}{" "}
                    <span className="font-normal normal-case opacity-50">(optional)</span>
                  </label>
                  <textarea
                    id="concierge-message"
                    rows={4}
                    maxLength={1500}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={messagePlaceholder}
                    disabled={status === "submitting"}
                    className="w-full resize-none rounded-md border border-border bg-surface px-4 py-3 text-base text-foreground placeholder:text-stone focus:border-brand-primary focus:outline-none focus:ring-[3px] focus:ring-brand-primary/20 disabled:opacity-50"
                  />
                </div>

                {status === "error" && errorMessage && (
                  <p role="alert" className={cn(typography({ intent: "utility-meta" }), "text-error")}>
                    {errorMessage}
                  </p>
                )}

                <div className="mt-4 text-center">
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    isLoading={status === "submitting"}
                  >
                    {status === "submitting" ? "Sending…" : ctaText}
                  </Button>
                </div>

                <p className={cn(typography({ intent: "utility-meta" }), "mt-2 text-center")}>
                  {finePrint}
                </p>
              </form>
            </ScrollReveal>
          </>
        )}
      </div>
    </section>
  );
}

function SuccessState({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="py-8 text-center">
      <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
        <svg
          aria-hidden="true"
          className="h-7 w-7 text-success"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <p className="eyebrow-editorial mb-3 inline-block">Received</p>
      <h3 className={cn(typography({ intent: "editorial-h3" }), "mb-3")}>{heading}</h3>
      <p
        className={cn(
          typography({ intent: "utility-body-muted" }),
          "mx-auto max-w-[40ch]",
        )}
      >
        {body}
      </p>
    </div>
  );
}
