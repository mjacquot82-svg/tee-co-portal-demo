import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import OrderCart from "./OrderCart";

describe("OrderCart", () => {
  const lineItems = [
    { id: "hoodie", garmentName: "Hoodie", quantity: 6, estimatedStartingPrice: 120 },
    { id: "tee", garmentName: "T-Shirt", quantity: 6, estimatedStartingPrice: 60 },
  ];

  it("remains visible before the first garment is added", () => {
    render(<OrderCart lineItems={[]} onReviewRequest={() => {}} />);
    expect(screen.getByRole("complementary", { name: "Current order cart" })).toHaveTextContent("0 Garments");
    expect(screen.getByText("No garments added yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review Request" })).toBeDisabled();
    expect(screen.getByRole("complementary", { name: "Current order cart" })).toHaveTextContent("0 items");
    expect(screen.getByRole("complementary", { name: "Current order cart" })).toHaveTextContent("Estimated: Pending");
    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();
  });

  it("summarizes one request using familiar cart information", () => {
    render(<OrderCart lineItems={lineItems} onReviewRequest={() => {}} />);
    expect(screen.getByRole("complementary", { name: "Current order cart" })).toHaveTextContent("2 Garments");
    expect(screen.getByRole("complementary", { name: "Current order cart" })).toHaveTextContent("12 Total Pieces");
    expect(screen.getByRole("complementary", { name: "Current order cart" })).toHaveTextContent("$180.00 Estimated Starting Price");
    expect(screen.getByText("✓ Hoodie")).toBeInTheDocument();
    expect(screen.getByText("✓ T-Shirt")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Current order cart" })).toHaveTextContent("2 items");
    expect(screen.getByRole("complementary", { name: "Current order cart" })).toHaveTextContent("12 pcs");
    expect(screen.getByRole("complementary", { name: "Current order cart" })).toHaveTextContent("Estimated: $180.00");
  });

  it("provides a working Review Request action", () => {
    const onReviewRequest = vi.fn();
    render(<OrderCart lineItems={lineItems} onReviewRequest={onReviewRequest} />);
    fireEvent.click(screen.getByRole("button", { name: "Review Request" }));
    expect(onReviewRequest).toHaveBeenCalledOnce();
  });

  it("provides a compact Review action for phone", () => {
    const onReviewRequest = vi.fn();
    render(<OrderCart lineItems={lineItems} onReviewRequest={onReviewRequest} />);
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(onReviewRequest).toHaveBeenCalledOnce();
  });
});
