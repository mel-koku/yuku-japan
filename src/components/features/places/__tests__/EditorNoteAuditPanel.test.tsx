import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PortableTextBlock } from "@portabletext/react";
import { EditorNoteAuditPanel } from "../EditorNoteAuditPanel";
import type { EditorNotePayload } from "@/sanity/editorNote";

const noteBlocks: PortableTextBlock[] = [
  {
    _type: "block",
    _key: "a",
    style: "normal",
    children: [{ _type: "span", _key: "s", text: "Test note.", marks: [] }],
    markDefs: [],
  } as unknown as PortableTextBlock,
];

const basePayload: EditorNotePayload = { note: noteBlocks };

describe("EditorNoteAuditPanel", () => {
  it("renders source label for each enum value", () => {
    const { rerender } = render(
      <EditorNoteAuditPanel payload={{ ...basePayload, source: "pipeline-a" }} />,
    );
    expect(screen.getByText("Pipeline A")).toBeInTheDocument();

    rerender(<EditorNoteAuditPanel payload={{ ...basePayload, source: "pipeline-b" }} />);
    expect(screen.getByText("Pipeline B")).toBeInTheDocument();

    rerender(<EditorNoteAuditPanel payload={{ ...basePayload, source: "human" }} />);
    expect(screen.getByText("Human")).toBeInTheDocument();
  });

  it("renders 'Unset' when source is absent", () => {
    render(<EditorNoteAuditPanel payload={basePayload} />);
    expect(screen.getByText("Unset")).toBeInTheDocument();
  });

  it("omits the Authored row when authoredAt is absent", () => {
    render(<EditorNoteAuditPanel payload={{ ...basePayload, source: "pipeline-a" }} />);
    expect(screen.queryByText("Authored")).not.toBeInTheDocument();
  });

  it("renders the Authored row when authoredAt is present", () => {
    render(
      <EditorNoteAuditPanel
        payload={{
          ...basePayload,
          source: "pipeline-a",
          sourceMetadata: { authoredAt: "2026-05-08T14:23:00Z" },
        }}
      />,
    );
    expect(screen.getByText("Authored")).toBeInTheDocument();
    expect(screen.getByText("2026-05-08 14:23 UTC")).toBeInTheDocument();
  });

  it("omits the Claims block when claimsAudit is absent or empty", () => {
    const { rerender } = render(
      <EditorNoteAuditPanel
        payload={{
          ...basePayload,
          source: "pipeline-a",
          sourceMetadata: { authoredAt: "2026-05-08T14:23:00Z" },
        }}
      />,
    );
    expect(screen.queryByText(/^Claims/)).not.toBeInTheDocument();

    rerender(
      <EditorNoteAuditPanel
        payload={{
          ...basePayload,
          source: "pipeline-a",
          sourceMetadata: { claimsAudit: [] },
        }}
      />,
    );
    expect(screen.queryByText(/^Claims/)).not.toBeInTheDocument();
  });

  it("renders all claims inline when count <= threshold", () => {
    const claims = [
      "claim one :: INPUT-verbatim",
      "claim two :: INPUT-implied",
      "claim three :: unsourced",
    ];
    render(
      <EditorNoteAuditPanel
        payload={{
          ...basePayload,
          source: "pipeline-a",
          sourceMetadata: { claimsAudit: claims },
        }}
      />,
    );
    expect(screen.getByText("Claims (3)")).toBeInTheDocument();
    for (const c of claims) {
      expect(screen.getByText(`• ${c}`)).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /Show \d+ more/ })).not.toBeInTheDocument();
  });

  it("collapses claims past threshold and expands on click", async () => {
    const user = userEvent.setup();
    const claims = Array.from({ length: 8 }, (_, i) => `claim ${i + 1} :: INPUT-verbatim`);
    render(
      <EditorNoteAuditPanel
        payload={{
          ...basePayload,
          source: "pipeline-a",
          sourceMetadata: { claimsAudit: claims },
        }}
      />,
    );
    expect(screen.getByText("Claims (8)")).toBeInTheDocument();
    expect(screen.getByText("• claim 5 :: INPUT-verbatim")).toBeInTheDocument();
    expect(screen.queryByText("• claim 6 :: INPUT-verbatim")).not.toBeInTheDocument();

    const expandBtn = screen.getByRole("button", { name: "Show 3 more" });
    await user.click(expandBtn);

    expect(screen.getByText("• claim 6 :: INPUT-verbatim")).toBeInTheDocument();
    expect(screen.getByText("• claim 8 :: INPUT-verbatim")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Show \d+ more/ })).not.toBeInTheDocument();
  });

  it("renders the data-testid hook for gating verification", () => {
    render(<EditorNoteAuditPanel payload={{ ...basePayload, source: "pipeline-a" }} />);
    expect(screen.getByTestId("editor-note-audit")).toBeInTheDocument();
  });
});
