"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { EditorNotePayload } from "@/sanity/editorNote";
import { EditorNoteAuditPanel } from "./EditorNoteAuditPanel";

/**
 * Reads the `?audit=1` URL flag and renders the audit panel when set.
 *
 * Isolated into its own component + Suspense boundary so the `useSearchParams`
 * call doesn't force the parent route (e.g. `/places/[id]` with
 * `revalidate = 3600` ISR) into dynamic rendering. Without the Suspense wrap,
 * Next 16 opts the whole page out of static generation and cache.
 *
 * Renders nothing on the server (Suspense fallback is null) — audit-mode is
 * a client-side concern by design.
 */
function GateInner({ payload }: { payload: EditorNotePayload }) {
  const searchParams = useSearchParams();
  const auditMode = searchParams?.get("audit") === "1";
  if (!auditMode) return null;
  return <EditorNoteAuditPanel payload={payload} />;
}

export function EditorNoteAuditSlot({ payload }: { payload: EditorNotePayload }) {
  return (
    <Suspense fallback={null}>
      <GateInner payload={payload} />
    </Suspense>
  );
}
