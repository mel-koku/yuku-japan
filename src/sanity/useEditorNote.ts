"use client";

import { useEffect, useState } from "react";
import { sanityClient } from "./client";
import { EDITOR_NOTE_QUERY, type EditorNotePayload } from "./editorNote";

/**
 * Client-side React hook for fetching a Smart Guidebook editor note.
 * Refetches when `slug` changes; returns:
 *   - undefined while loading
 *   - null when no note exists
 *   - the full `EditorNotePayload` (note + source + sourceMetadata) when found
 *
 * Used by the LocationExpanded drawer. The detail page uses the server-side
 * `fetchEditorNoteByLocationSlug` helper instead and passes the result down
 * as a prop.
 */
export function useEditorNoteByLocationSlug(
  slug: string | undefined,
): EditorNotePayload | null | undefined {
  const [state, setState] = useState<EditorNotePayload | null | undefined>(undefined);

  useEffect(() => {
    if (!slug) {
      setState(null);
      return;
    }
    let cancelled = false;
    setState(undefined);
    sanityClient
      .fetch<EditorNotePayload | null>(EDITOR_NOTE_QUERY, { slug })
      .then((result) => {
        if (cancelled) return;
        setState(result?.note ? result : null);
      })
      .catch(() => {
        if (cancelled) return;
        setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return state;
}
