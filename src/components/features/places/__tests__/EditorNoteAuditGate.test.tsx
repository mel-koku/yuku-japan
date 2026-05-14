import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PortableTextBlock } from "@portabletext/react";
import { EditorNoteAuditSlot } from "../EditorNoteAuditSlot";
import type { EditorNotePayload } from "@/sanity/editorNote";

let auditParam: string | null = null;
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === "audit" ? auditParam : null),
  }),
}));

const noteBlocks: PortableTextBlock[] = [
  {
    _type: "block",
    _key: "a",
    style: "normal",
    children: [{ _type: "span", _key: "s", text: "Test.", marks: [] }],
    markDefs: [],
  } as unknown as PortableTextBlock,
];

const payload: EditorNotePayload = {
  note: noteBlocks,
  source: "pipeline-a",
  sourceMetadata: { claimsAudit: ["claim :: INPUT-verbatim"] },
};

describe("EditorNoteAuditSlot — URL flag gating", () => {
  it("renders nothing when ?audit is absent", () => {
    auditParam = null;
    render(<EditorNoteAuditSlot payload={payload} />);
    expect(screen.queryByTestId("editor-note-audit")).not.toBeInTheDocument();
  });

  it("renders nothing when ?audit has a non-'1' value", () => {
    auditParam = "true";
    render(<EditorNoteAuditSlot payload={payload} />);
    expect(screen.queryByTestId("editor-note-audit")).not.toBeInTheDocument();
  });

  it("renders the panel when ?audit=1", () => {
    auditParam = "1";
    render(<EditorNoteAuditSlot payload={payload} />);
    expect(screen.getByTestId("editor-note-audit")).toBeInTheDocument();
  });
});
