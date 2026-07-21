import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import SizeBreakdownEditor from "./SizeBreakdownEditor";

function Harness() {
  const [sizes, setSizes] = useState({ S: 2 });
  return <SizeBreakdownEditor availableSizes={["S", "M", "L"]} value={sizes} onChange={setSizes} />;
}

describe("SizeBreakdownEditor", () => {
  it("adds a visible second size row immediately without saving a garment", () => {
    render(<Harness />);

    expect(screen.getAllByTestId("size-breakdown-row")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /add size/i }));

    const rows = screen.getAllByTestId("size-breakdown-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByRole("combobox", { name: "Size row 2" })).toHaveValue("M");
    expect(within(rows[1]).getByRole("spinbutton", { name: "M quantity" })).toHaveValue(1);
    expect(within(rows[1]).getByRole("button", { name: "Remove Size" })).toBeVisible();
  });

  it("disables sizes already selected in another row and can remove one row", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /add size/i }));

    const secondSelect = screen.getByRole("combobox", { name: "Size row 2" });
    expect(within(secondSelect).getByRole("option", { name: "S" })).toBeDisabled();

    fireEvent.click(within(screen.getAllByTestId("size-breakdown-row")[1]).getByRole("button", { name: "Remove Size" }));
    expect(screen.getAllByTestId("size-breakdown-row")).toHaveLength(1);
  });
});
