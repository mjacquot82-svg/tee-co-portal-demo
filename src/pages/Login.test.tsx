import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Login from "./Login";

const mocks = vi.hoisted(() => ({
  clearAllAuthSessions: vi.fn(),
  ensureOperationalAuthInitialized: vi.fn(),
  getOperationalAuthUser: vi.fn(),
  isOperationalAuthLoading: vi.fn(),
  requestCustomerPasswordReset: vi.fn(),
  signInToOperationalWorkspace: vi.fn(),
  subscribeToOperationalAuth: vi.fn(),
  updateCustomerPassword: vi.fn(),
  attemptStaffLogin: vi.fn(),
  getPinAccessibleStaffUsers: vi.fn(),
  getActiveStaffUser: vi.fn(),
  subscribeToActiveStaffUser: vi.fn(),
  subscribeToStaffUsers: vi.fn(),
  getActiveCustomerSession: vi.fn(),
  subscribeToActiveCustomerSession: vi.fn(),
}));

vi.mock("../lib/authDiagnostics", () => ({
  pushAuthDiagnostic: vi.fn(),
}));

vi.mock("../lib/authSessionStore", () => ({
  clearAllAuthSessions: mocks.clearAllAuthSessions,
}));

vi.mock("../lib/operationalAuthStore", () => ({
  ensureOperationalAuthInitialized: mocks.ensureOperationalAuthInitialized,
  getOperationalAuthUser: mocks.getOperationalAuthUser,
  isOperationalAuthLoading: mocks.isOperationalAuthLoading,
  requestCustomerPasswordReset: mocks.requestCustomerPasswordReset,
  signInToOperationalWorkspace: mocks.signInToOperationalWorkspace,
  subscribeToOperationalAuth: mocks.subscribeToOperationalAuth,
  updateCustomerPassword: mocks.updateCustomerPassword,
}));

vi.mock("../lib/staffUsersStore", () => ({
  attemptStaffLogin: mocks.attemptStaffLogin,
  getPinAccessibleStaffUsers: mocks.getPinAccessibleStaffUsers,
  getActiveStaffUser: mocks.getActiveStaffUser,
  subscribeToActiveStaffUser: mocks.subscribeToActiveStaffUser,
  subscribeToStaffUsers: mocks.subscribeToStaffUsers,
}));

vi.mock("../lib/customerSessionStore", () => ({
  getActiveCustomerSession: mocks.getActiveCustomerSession,
  subscribeToActiveCustomerSession: mocks.subscribeToActiveCustomerSession,
}));

const restoredOwner = {
  id: "owner-auth-user",
  name: "Owner",
  role: "Owner",
  authMode: "supabase-session",
  isSupabaseAuthSession: true,
};

const restoredCustomer = {
  id: "customer-auth-user",
  email: "customer@example.com",
  displayName: "Customer",
  authMode: "supabase-session",
  isSupabaseAuthSession: true,
};

function renderLogin(initialEntry = "/login") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/portal/orders" element={<p>Customer orders destination</p>} />
        <Route path="/admin" element={<p>Operational destination</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("login identity intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPinAccessibleStaffUsers.mockReturnValue([]);
    mocks.getActiveStaffUser.mockReturnValue(null);
    mocks.getOperationalAuthUser.mockReturnValue(null);
    mocks.getActiveCustomerSession.mockReturnValue(null);
    mocks.isOperationalAuthLoading.mockReturnValue(false);
    mocks.subscribeToOperationalAuth.mockReturnValue(() => {});
    mocks.subscribeToActiveStaffUser.mockReturnValue(() => {});
    mocks.subscribeToStaffUsers.mockReturnValue(() => {});
    mocks.subscribeToActiveCustomerSession.mockReturnValue(() => {});
    mocks.ensureOperationalAuthInitialized.mockResolvedValue({
      isLoading: false,
      operationalUser: null,
    });
  });

  it("does not let a restored Owner prevent Customer Sign In", async () => {
    mocks.getOperationalAuthUser.mockReturnValue(restoredOwner);
    mocks.getActiveStaffUser.mockReturnValue(restoredOwner);
    mocks.ensureOperationalAuthInitialized.mockResolvedValue({
      isLoading: false,
      operationalUser: restoredOwner,
    });

    renderLogin();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Customer Sign In" })).toBeInTheDocument();
    });
    expect(screen.queryByText("Operational destination")).not.toBeInTheDocument();
  });

  it("does not let a restored customer prevent explicit Owner Sign In", async () => {
    mocks.getActiveCustomerSession.mockReturnValue(restoredCustomer);

    renderLogin("/login?redirectTo=/admin/settings/notifications");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Owner Sign In" })).toBeInTheDocument();
    });
    expect(screen.queryByText("Customer orders destination")).not.toBeInTheDocument();
  });

  it("retains restored Owner redirect behavior for an operational login target", async () => {
    mocks.getOperationalAuthUser.mockReturnValue(restoredOwner);
    mocks.getActiveStaffUser.mockReturnValue(restoredOwner);
    mocks.ensureOperationalAuthInitialized.mockResolvedValue({
      isLoading: false,
      operationalUser: restoredOwner,
    });

    renderLogin("/login?redirectTo=/admin");

    expect(await screen.findByText("Operational destination")).toBeInTheDocument();
  });

  it("completes customer login, clears restored app sessions, and opens customer orders", async () => {
    mocks.getOperationalAuthUser.mockReturnValue(restoredOwner);
    mocks.getActiveStaffUser.mockReturnValue(restoredOwner);
    mocks.ensureOperationalAuthInitialized.mockResolvedValue({
      isLoading: false,
      operationalUser: restoredOwner,
    });
    mocks.signInToOperationalWorkspace.mockResolvedValue({
      ok: true,
      actorType: "customer",
      user: null,
      customerSession: restoredCustomer,
      session: { user: restoredCustomer },
    });

    renderLogin();

    await screen.findByRole("heading", { name: "Customer Sign In" });
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "customer@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter password"), {
      target: { value: "customer-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open Portal" }));

    await waitFor(() => {
      expect(screen.getByText("Customer orders destination")).toBeInTheDocument();
    });
    expect(mocks.signInToOperationalWorkspace).toHaveBeenCalledWith({
      email: "customer@example.com",
      password: "customer-password",
    });
    expect(mocks.clearAllAuthSessions).toHaveBeenCalledWith("workspace-login-session-reset");
  });

  it("preserves restored sessions when customer login fails", async () => {
    mocks.getOperationalAuthUser.mockReturnValue(restoredOwner);
    mocks.getActiveStaffUser.mockReturnValue(restoredOwner);
    mocks.ensureOperationalAuthInitialized.mockResolvedValue({
      isLoading: false,
      operationalUser: restoredOwner,
    });
    mocks.signInToOperationalWorkspace.mockResolvedValue({
      ok: false,
      message: "Invalid login credentials",
    });

    renderLogin();

    await screen.findByRole("heading", { name: "Customer Sign In" });
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "customer@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter password"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open Portal" }));

    expect(await screen.findByText("Invalid login credentials")).toBeInTheDocument();
    expect(mocks.clearAllAuthSessions).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Customer Sign In" })).toBeInTheDocument();
  });
});
