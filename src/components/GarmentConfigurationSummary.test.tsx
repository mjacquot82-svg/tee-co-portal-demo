import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import GarmentConfigurationSummary from "./GarmentConfigurationSummary";

describe("GarmentConfigurationSummary", () => {
  it("summarizes a single-size garment", () => {
    render(<GarmentConfigurationSummary color="Carolina Blue" decorationType="Screen Print" sizeBreakdown={{ S: 4 }} />);
    expect(screen.getByText("Carolina Blue")).toBeVisible();
    expect(screen.getByText("Screen Print")).toBeVisible();
    expect(screen.getByText("4")).toBeVisible();
    expect(screen.getByText("S ×4")).toBeVisible();
  });

  it("shows every size and derives the total from current quantities", () => {
    const { rerender } = render(<GarmentConfigurationSummary color="Carolina Blue" decorationType="Screen Print" sizeBreakdown={{ S: 3, M: 1 }} />);
    expect(screen.getByText("S ×3")).toBeVisible();
    expect(screen.getByText("M ×1")).toBeVisible();
    expect(screen.getByText("4")).toBeVisible();

    rerender(<GarmentConfigurationSummary color="Carolina Blue" decorationType="Screen Print" sizeBreakdown={{ S: 2, L: 5 }} />);
    expect(screen.queryByText("M ×1")).not.toBeInTheDocument();
    expect(screen.getByText("S ×2")).toBeVisible();
    expect(screen.getByText("L ×5")).toBeVisible();
    expect(screen.getByText("7")).toBeVisible();
  });
});
