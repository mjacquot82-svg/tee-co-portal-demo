import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
  supabase: null,
}));

import StaffNotifications from "./StaffNotifications";
import {
  STAFF_NOTIFICATION_TYPES,
  clearStaffNotificationsForTests,
  createStaffNotification,
} from "../lib/staffNotificationsStore";

describe("StaffNotifications", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearStaffNotificationsForTests();

    createStaffNotification({
      type: STAFF_NOTIFICATION_TYPES.orderBlocked,
      orderNumber: "TC-BLOCKED",
      assignedToStaffId: "staff-owner-default",
      assignedToStaffName: "Owner / Admin",
      description: "Blocked order needs attention.",
      linkTo: "/admin/orders/TC-BLOCKED",
    });
    createStaffNotification({
      type: STAFF_NOTIFICATION_TYPES.readyForPickup,
      orderNumber: "TC-PICKUP",
      description: "Order is ready for pickup.",
      linkTo: "/admin/orders/TC-PICKUP",
    });
  });

  afterEach(() => {
    clearStaffNotificationsForTests();
    vi.restoreAllMocks();
  });

  it("renders stably and preserves unread counts and filters", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <MemoryRouter>
        <StaffNotifications />
      </MemoryRouter>
    );

    const heading = screen.getByRole("heading", { name: /Notifications/ });
    expect(within(heading).getByText("2")).toBeInTheDocument();
    expect(screen.getByText("TC-BLOCKED")).toBeInTheDocument();
    expect(screen.getByText("TC-PICKUP")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Unread/ }));
    expect(screen.getByText("TC-BLOCKED")).toBeInTheDocument();
    expect(screen.getByText("TC-PICKUP")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Mark as read" })[0]);
    expect(within(heading).getByText("1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Blocked/ }));
    expect(screen.getByText("TC-BLOCKED")).toBeInTheDocument();
    expect(screen.queryByText("TC-PICKUP")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Pickup Ready/ }));
    expect(screen.getByText("TC-PICKUP")).toBeInTheDocument();
    expect(screen.queryByText("TC-BLOCKED")).not.toBeInTheDocument();

    expect(
      consoleError.mock.calls.some((call) =>
        call.some((value) => String(value).includes("Maximum update depth exceeded"))
      )
    ).toBe(false);
  });
});
