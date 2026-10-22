// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OrderDiscountEditor from "./OrderDiscountEditor";
import { validateDiscountInput } from "../orders/discountValidation";
import { normalizeOrderFinancials } from "../orders/orderFinancials";

describe("validateDiscountInput", () => {
  it("accepts valid percent and fixed discounts and rejects bad ones", () => {
    expect(validateDiscountInput({ type: "percent", value: "10" }, 100)).toBe("");
    expect(validateDiscountInput({ type: "fixed", value: "25" }, 100)).toBe("");
    expect(validateDiscountInput({ type: "percent", value: "150" }, 100)).toMatch(/100%/);
    expect(validateDiscountInput({ type: "fixed", value: "120" }, 100)).toMatch(/subtotal/);
    expect(validateDiscountInput({ type: "fixed", value: "0" }, 100)).toMatch(/greater than 0/);
  });
});

describe("OrderDiscountEditor", () => {
  const order = { subtotal: 200, tax_rate: 0.13 };
  const financials = normalizeOrderFinancials(order);

  it("applies a percent discount", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<OrderDiscountEditor order={order} financials={financials} onSave={onSave} />);
    fireEvent.click(screen.getByTestId("order-discount-open"));
    fireEvent.change(screen.getByLabelText("Discount value"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Discount reason"), { target: { value: "Repeat customer" } });
    expect(screen.getByTestId("order-discount-preview").textContent).toMatch(/20\.00 off/);
    fireEvent.click(screen.getByTestId("order-discount-apply"));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ discount_type: "percent", discount_value: 10, discount_reason: "Repeat customer" }));
  });

  it("blocks an invalid fixed discount", () => {
    const onSave = vi.fn();
    render(<OrderDiscountEditor order={order} financials={financials} onSave={onSave} />);
    fireEvent.click(screen.getByTestId("order-discount-open"));
    fireEvent.change(screen.getByLabelText("Discount type"), { target: { value: "fixed" } });
    fireEvent.change(screen.getByLabelText("Discount value"), { target: { value: "500" } });
    fireEvent.click(screen.getByTestId("order-discount-apply"));
    expect(screen.getByRole("alert").textContent).toMatch(/subtotal/);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("removes an existing discount and the totals reflect it", async () => {
    const discounted = { ...order, discount_type: "fixed", discount_value: 50 };
    const f = normalizeOrderFinancials(discounted);
    expect(f.discount_amount).toBe(50);
    expect(f.total_amount).toBeCloseTo(150 * 1.13, 2);
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<OrderDiscountEditor order={discounted} financials={f} onSave={onSave} />);
    expect(screen.getByTestId("order-discount-summary").textContent).toMatch(/50\.00/);
    fireEvent.click(screen.getByTestId("order-discount-remove"));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ discount_type: "", discount_value: 0, discount_reason: "" }));
  });

  it("is locked once a payment is recorded", () => {
    render(<OrderDiscountEditor order={order} financials={financials} onSave={vi.fn()} disabled lockedReason="locked" />);
    expect(screen.queryByTestId("order-discount-open")).toBeNull();
  });
});
