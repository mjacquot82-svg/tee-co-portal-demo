import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotificationAuthorizationGate from "./NotificationAuthorizationGate";
import { signInToOperationalWorkspace } from "../lib/operationalAuthStore";

vi.mock("../lib/authDiagnostics", () => ({
  pushAuthDiagnostic: vi.fn(),
}));

vi.mock("../lib/operationalAuthStore", () => ({
  signInToOperationalWorkspace: vi.fn(),
}));

const pinOwner = {
  id: "teresa-pin",
  name: "Teresa",
  role: "Owner",
};

const supabaseOwner = {
  id: "teresa-supabase",
  name: "Teresa",
  role: "Owner",
  authMode: "supabase-session",
  isSupabaseAuthSession: true,
};

describe("NotificationAuthorizationGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("shows Owner verification in place and preserves the PIN session", async () => {
    sessionStorage.setItem("tee-co-active-staff", JSON.stringify(pinOwner));

    render(
      <MemoryRouter>
        <NotificationAuthorizationGate
          requirement="owner"
          pathname="/admin/settings/notifications/policy"
          operationalUser={null}
          pinUser={pinOwner}
        >
          <div>Notification Policy content</div>
        </NotificationAuthorizationGate>
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", {
        name: "Notification administration requires Owner verification.",
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/Your operational session is still active as Teresa/)).toBeInTheDocument();
    expect(screen.queryByText("Notification Policy content")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to dashboard" })).toHaveAttribute(
      "href",
      "/admin"
    );
    expect(JSON.parse(sessionStorage.getItem("tee-co-active-staff") || "{}")).toEqual(pinOwner);
  });

  it("returns to the requested protected content after successful Owner verification", async () => {
    vi.mocked(signInToOperationalWorkspace).mockResolvedValue({
      ok: true,
      actorType: "operational",
      user: supabaseOwner,
      session: { user: supabaseOwner },
    });
    sessionStorage.setItem("tee-co-active-staff", JSON.stringify(pinOwner));

    const view = render(
      <MemoryRouter>
        <NotificationAuthorizationGate
          requirement="owner"
          pathname="/admin/settings/notifications/policy"
          operationalUser={null}
          pinUser={pinOwner}
        >
          <div>Notification Policy content</div>
        </NotificationAuthorizationGate>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Verify as Owner" }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "teresa@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify as Owner" }));

    await waitFor(() => {
      expect(signInToOperationalWorkspace).toHaveBeenCalledWith({
        email: "teresa@example.com",
        password: "secret-password",
      });
    });

    view.rerender(
      <MemoryRouter>
        <NotificationAuthorizationGate
          requirement="owner"
          pathname="/admin/settings/notifications/policy"
          operationalUser={supabaseOwner}
          pinUser={pinOwner}
        >
          <div>Notification Policy content</div>
        </NotificationAuthorizationGate>
      </MemoryRouter>
    );

    expect(screen.getByText("Notification Policy content")).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem("tee-co-active-staff") || "{}")).toEqual(pinOwner);
  });

  it("rejects a non-Owner Supabase identity for Owner mutations", () => {
    const supabaseStaff = {
      id: "supabase-staff",
      role: "Staff",
      authMode: "supabase-session",
      isSupabaseAuthSession: true,
    };

    render(
      <MemoryRouter>
        <NotificationAuthorizationGate
          requirement="owner"
          pathname="/admin/settings/notifications"
          operationalUser={supabaseStaff}
          pinUser={pinOwner}
        >
          <div>Template publishing</div>
        </NotificationAuthorizationGate>
      </MemoryRouter>
    );

    expect(screen.queryByText("Template publishing")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify as Owner" })).toBeInTheDocument();
  });

  it("allows any Supabase operational identity to read Notification Activity", () => {
    const supabaseStaff = {
      id: "supabase-staff",
      role: "Staff",
      authMode: "supabase-session",
      isSupabaseAuthSession: true,
    };

    render(
      <MemoryRouter>
        <NotificationAuthorizationGate
          requirement="operational"
          pathname="/admin/settings/notifications/activity"
          operationalUser={supabaseStaff}
          pinUser={pinOwner}
        >
          <div>Notification Activity content</div>
        </NotificationAuthorizationGate>
      </MemoryRouter>
    );

    expect(screen.getByText("Notification Activity content")).toBeInTheDocument();
    expect(screen.queryByTestId("notification-authorization-gate")).not.toBeInTheDocument();
  });
});
