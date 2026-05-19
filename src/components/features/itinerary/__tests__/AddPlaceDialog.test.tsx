import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AddPlaceDialog } from "@/components/features/itinerary/chapter/AddPlaceDialog";

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

const mockDays = [
  { index: 0, label: "Day 1 · Tokyo", activities: [] },
  { index: 1, label: "Day 2 · Kyoto", activities: [] },
];

describe("AddPlaceDialog", () => {
  it("renders when open is true", () => {
    render(
      <AddPlaceDialog
        open={true}
        onClose={() => {}}
        days={mockDays}
        defaultDayIndex={0}
        onAdd={() => {}}
      />,
      { wrapper: makeWrapper() },
    );
    expect(screen.getByRole("dialog", { name: "Add a place" })).toBeInTheDocument();
  });

  it("does not render when open is false", () => {
    render(
      <AddPlaceDialog
        open={false}
        onClose={() => {}}
        days={mockDays}
        defaultDayIndex={0}
        onAdd={() => {}}
      />,
      { wrapper: makeWrapper() },
    );
    expect(screen.queryByRole("dialog", { name: "Add a place" })).not.toBeInTheDocument();
  });

  it("calls onClose when the Close button is clicked", async () => {
    const onClose = vi.fn();
    render(
      <AddPlaceDialog
        open={true}
        onClose={onClose}
        days={mockDays}
        defaultDayIndex={0}
        onAdd={() => {}}
      />,
      { wrapper: makeWrapper() },
    );
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders day selector with all days", () => {
    render(
      <AddPlaceDialog
        open={true}
        onClose={() => {}}
        days={mockDays}
        defaultDayIndex={0}
        onAdd={() => {}}
      />,
      { wrapper: makeWrapper() },
    );
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    expect(screen.getByText("Day 1 · Tokyo")).toBeInTheDocument();
    expect(screen.getByText("Day 2 · Kyoto")).toBeInTheDocument();
  });

  // Locked days are filtered out by ItineraryShell before they reach this
  // dialog, so `days` can be non-contiguous (e.g. Day 1 + Day 3, Day 2 locked).
  // `selectedDayIdx` holds a true day index, not an array position — the dialog
  // must resolve the selected day by its `index` field. Adding to the resolved
  // day must report that true index back through onAdd so the caller writes to
  // the right day.
  it("resolves the selected day by index field for a non-contiguous days list", async () => {
    const onAdd = vi.fn();
    render(
      <AddPlaceDialog
        open={true}
        onClose={() => {}}
        days={[
          { index: 0, label: "Day 1 · Tokyo", activities: [] },
          // Day 2 (index 1) omitted — locked, filtered by the caller.
          { index: 2, label: "Day 3 · Osaka", activities: [] },
        ]}
        defaultDayIndex={2}
        onAdd={onAdd}
      />,
      { wrapper: makeWrapper() },
    );
    // The selector shows the gap-free filtered list, defaulted to Day 3.
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("2");
    expect(screen.getByText("Day 3 · Osaka")).toBeInTheDocument();
    expect(screen.queryByText("Day 2 · Kyoto")).not.toBeInTheDocument();

    // Adding a custom place reports the true day index (2), not array pos (1).
    await userEvent.click(screen.getByRole("button", { name: /add your own/i }));
    await userEvent.type(screen.getByLabelText(/title/i), "Dotonbori");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0]).toBe(2);
  });
});
