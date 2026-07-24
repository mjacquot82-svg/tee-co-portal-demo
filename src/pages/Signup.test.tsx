import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Signup from "./Signup";

const { signUpCustomerAccount } = vi.hoisted(() => ({
  signUpCustomerAccount: vi.fn(),
}));

vi.mock("../lib/operationalAuthStore", () => ({
  signUpCustomerAccount,
}));

vi.mock("../lib/customerProfileStore", () => ({
  ensureCustomerProfile: vi.fn(),
}));

vi.mock("../lib/customerSessionStore", () => ({
  getActiveCustomerSession: vi.fn(() => null),
  subscribeToActiveCustomerSession: vi.fn(() => () => {}),
}));

describe("customer registration", () => {
  beforeEach(() => {
    signUpCustomerAccount.mockReset();
  });

  it("replaces the registration form with sign-in after account creation", async () => {
    signUpCustomerAccount.mockResolvedValue({
      ok: true,
      customerSession: null,
      requiresEmailConfirmation: true,
    });

    render(
      <MemoryRouter initialEntries={["/signup?redirectTo=%2Fportal%2Forders"]}>
        <Routes>
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/login"
            element={<p>Sign-in destination</p>}
          />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText("First name"), { target: { value: "Test" } });
    fireEvent.change(screen.getByPlaceholderText("Last name"), { target: { value: "Customer" } });
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "customer@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Phone number"), {
      target: { value: "555-0100" },
    });
    fireEvent.change(screen.getByPlaceholderText("At least 8 characters"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByPlaceholderText("Re-enter password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => expect(screen.getByText("Sign-in destination")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Create Account" })).toBeNull();
    expect(signUpCustomerAccount).toHaveBeenCalledTimes(1);
  });
});
