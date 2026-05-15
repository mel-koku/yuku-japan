"use client";

import { useState } from "react";
import type { EditorNotePayload, EditorNoteSource } from "@/sanity/editorNote";

/**
 * Internal-only audit panel for Smart Guidebook editor notes. Renders below
 * the editor-note prose when the URL has `?audit=1`. Surfaces `source` and
 * `sourceMetadata` so the team can compare Pipeline A / Pipeline B / human
 * output in context on prod. Not for travelers — copy is raw provenance
 * jargon by design.
 *
 * Gating happens in the parent (drawer / detail page) via useSearchParams.
 * This component assumes it should render once mounted.
 */

const SOURCE_LABEL: Record<EditorNoteSource, string> = {
  "pipeline-a": "Pipeline A",
  "pipeline-b": "Pipeline B",
  human: "Human",
  "claude-team": "Claude team",
};

const CLAIMS_COLLAPSE_THRESHOLD = 5;

function formatAuthoredAt(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function EditorNoteAuditPanel({
  payload,
}: {
  payload: EditorNotePayload;
}) {
  const [showAllClaims, setShowAllClaims] = useState(false);

  const sourceLabel = payload.source
    ? (SOURCE_LABEL[payload.source] ?? payload.source)
    : "Unset";
  const authoredAt = payload.sourceMetadata?.authoredAt;
  const claims = payload.sourceMetadata?.claimsAudit ?? [];

  const visibleClaims =
    showAllClaims || claims.length <= CLAIMS_COLLAPSE_THRESHOLD
      ? claims
      : claims.slice(0, CLAIMS_COLLAPSE_THRESHOLD);
  const hiddenCount = claims.length - visibleClaims.length;

  return (
    <aside
      data-testid="editor-note-audit"
      className="mt-4 border-t border-border-subtle pt-3 space-y-2"
    >
      <h4 className="eyebrow-editorial">Provenance</h4>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-foreground-secondary">
        <dt className="font-medium">Source</dt>
        <dd>{sourceLabel}</dd>
        {authoredAt && (
          <>
            <dt className="font-medium">Authored</dt>
            <dd className="font-mono text-xs">{formatAuthoredAt(authoredAt)}</dd>
          </>
        )}
      </dl>
      {claims.length > 0 && (
        <div className="space-y-1">
          <h5 className="eyebrow-editorial">Claims ({claims.length})</h5>
          <ul className="space-y-1 font-mono text-xs leading-relaxed text-foreground-secondary">
            {visibleClaims.map((claim, i) => (
              <li key={i}>• {claim}</li>
            ))}
          </ul>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllClaims(true)}
              className="text-sm font-medium text-brand-primary hover:underline"
            >
              Show {hiddenCount} more
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
