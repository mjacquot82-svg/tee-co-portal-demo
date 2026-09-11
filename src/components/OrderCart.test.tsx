import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import OrderCart from "./OrderCart";

describe("OrderCart", () => {
  const lineItems = [
    { id: "hoodie", garmentName: "Hoodie", quantity: 6, estimatedStartingPrice: 120 },
    { id: "tee", garmentName: "T-Shirt", quantity: 6, estimatedStartingPrice: 60 },
  ];

  it("keeps desktop empty cart visible and marks empty for phone hide", () => {
    render(<OrderCart lineItems={[]} onReviewRequest={() => {}} />);
    const cart = screen.getByRole("complementary", { name: "Current order cart" });
    expect(cart).toHaveClass("is-empty");
    expect(cart).toHaveAttribute("data-empty", "true");
    expect(cart).toHaveTextContent("0 Garments");
    expect(screen.getByText("No garments added yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review Request" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Review" })).not.toBeInTheDocument();
    expect(document.querySelector(".order-cart-phone")).toBeNull();
  });

  it("summarizes one request using familiar cart information", () => {
    render(<OrderCart lineItems={lineItems} onReviewRequest={() => {}} />);
    const cart = screen.getByRole("complementary", { name: "Current order cart" });
    expect(cart).not.toHaveClass("is-empty");
    expect(cart).toHaveAttribute("data-empty", "false");
    expect(cart).toHaveTextContent("2 Garments");
    expect(cart).toHaveTextContent("12 Total Pieces");
    expect(cart).toHaveTextContent("$180.00 Estimated Starting Price");
    expect(screen.getByText("✓ Hoodie")).toBeInTheDocument();
    expect(screen.getByText("✓ T-Shirt")).toBeInTheDocument();
    expect(cart).toHaveTextContent("2 items");
    expect(cart).toHaveTextContent("12 pcs");
    expect(cart).toHaveTextContent("Estimated: $180.00");
  });

  it("provides a working Review Request action", () => {
    const onReviewRequest = vi.fn();
    render(<OrderCart lineItems={lineItems} onReviewRequest={onReviewRequest} />);
    fireEvent.click(screen.getByRole("button", { name: "Review Request" }));
    expect(onReviewRequest).toHaveBeenCalledOnce();
  });

  it("provides a compact Review action for phone when items exist", () => {
    const onReviewRequest = vi.fn();
    render(<OrderCart lineItems={lineItems} onReviewRequest={onReviewRequest} />);
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(onReviewRequest).toHaveBeenCalledOnce();
  });
});
