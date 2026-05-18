"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

type WizardChromeProps = {
  /** Current wizard step. Past the intro (> 0), exiting is confirmed first. */
  currentStep: number;
};

// Trip-builder state persists to localStorage, so leaving never loses work —
// the copy reflects that. The confirm exists to prevent a stray Esc from
// yanking the user out mid-flow; on the intro step there's nothing entered
// yet, so exit is immediate.
const EXIT_CONFIRMATION =
  "Leave the trip builder? Your progress is saved — you can pick up where you left off.";

export function WizardChrome({ currentStep }: WizardChromeProps) {
  const router = useRouter();

  const exitWizard = useCallback(() => {
    if (currentStep > 0 && !window.confirm(EXIT_CONFIRMATION)) {
      return;
    }
    router.push("/");
  }, [currentStep, router]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitWizard();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exitWizard]);

  return (
    <div className="fixed inset-x-0 top-0 z-50 border-b border-border/10 bg-background pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center justify-end px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={exitWizard}
          aria-label="Close trip builder"
          className="eyebrow-editorial inline-flex items-center gap-1.5 py-2 transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Close
        </button>
      </div>
    </div>
  );
}
