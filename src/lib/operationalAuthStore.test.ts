import { beforeEach, describe, expect, it, vi } from "vitest";

const signUp = vi.fn();
const signInWithPassword = vi.fn();
const resetPasswordForEmail = vi.fn();
const updateUser = vi.fn();

vi.mock("./supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      signUp,
      signInWithPassword,
      resetPasswordForEmail,
      updateUser,
      onAuthStateChange: vi.fn(() => ({ data: { subscription: {} } })),
    },
  },
}));

vi.mock("./authDiagnostics", () => ({
  pushAuthDiagnostic: vi.fn(),
}));

describe("signUpCustomerAccount", () => {
  beforeEach(() => {
    signUp.mockReset();
    signInWithPassword.mockReset();
    resetPasswordForEmail.mockReset();
    updateUser.mockReset();
  });

  it("sends verification emails back to the deployed origin's sign-in page", async () => {
    signUp.mockResolvedValue({
      data: {
        user: { id: "customer-1", email: "customer@example.com", user_metadata: {} },
        session: null,
      },
      error: null,
    });

    const { signUpCustomerAccount } = await import("./operationalAuthStore");
    const result = await signUpCustomerAccount({
      firstName: "Test",
      lastName: "Customer",
      email: "customer@example.com",
      phone: "",
      password: "password123",
    });

    expect(result.requiresEmailConfirmation).toBe(true);
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: "https://teeandco.jdsstudio.ca/login?emailConfirmed=1",
        }),
      })
    );
  });

  it("uses the canonical login allowlist for password recovery", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });
    const { requestCustomerPasswordReset } = await import("./operationalAuthStore");

    await expect(requestCustomerPasswordReset("customer@example.com")).resolves.toEqual({ ok: true });
    expect(resetPasswordForEmail).toHaveBeenCalledWith("customer@example.com", {
      redirectTo: "https://teeandco.jdsstudio.ca/login?passwordRecovery=1",
    });
  });

  it("updates the recovered customer's password", async () => {
    updateUser.mockResolvedValue({ error: null });
    const { updateCustomerPassword } = await import("./operationalAuthStore");

    await expect(updateCustomerPassword("new-password")).resolves.toEqual({ ok: true });
    expect(updateUser).toHaveBeenCalledWith({ password: "new-password" });
  });
});

describe("shared Supabase login session replacement", () => {
  const ownerAuthUser = {
    id: "owner-auth-user",
    email: "owner@example.com",
    app_metadata: { operational_role: "owner" },
    user_metadata: {},
  };
  const customerAuthUser = {
    id: "customer-auth-user",
    email: "customer@example.com",
    app_metadata: {},
    user_metadata: { full_name: "Acceptance Customer" },
  };

  beforeEach(() => {
    signInWithPassword.mockReset();
  });

  it("replaces the previous operational snapshot after successful customer login", async () => {
    const { getOperationalAuthSnapshot, signInToOperationalWorkspace } =
      await import("./operationalAuthStore");

    signInWithPassword.mockResolvedValueOnce({
      data: { user: ownerAuthUser, session: { user: ownerAuthUser } },
      error: null,
    });
    await signInToOperationalWorkspace({
      email: ownerAuthUser.email,
      password: "owner-password",
    });
    expect(getOperationalAuthSnapshot().operationalUser?.role).toBe("Owner");

    signInWithPassword.mockResolvedValueOnce({
      data: { user: customerAuthUser, session: { user: customerAuthUser } },
      error: null,
    });
    const customerResult = await signInToOperationalWorkspace({
      email: customerAuthUser.email,
      password: "customer-password",
    });

    expect(customerResult.actorType).toBe("customer");
    expect(getOperationalAuthSnapshot()).toMatchObject({
      user: customerAuthUser,
      operationalUser: null,
      actorType: "customer",
    });
    expect(getOperationalAuthSnapshot().customerSession?.id).toBe(customerAuthUser.id);
  });

  it("preserves the previous operational snapshot when customer login fails", async () => {
    const { getOperationalAuthSnapshot, signInToOperationalWorkspace } =
      await import("./operationalAuthStore");

    signInWithPassword.mockResolvedValueOnce({
      data: { user: ownerAuthUser, session: { user: ownerAuthUser } },
      error: null,
    });
    await signInToOperationalWorkspace({
      email: ownerAuthUser.email,
      password: "owner-password",
    });

    signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });
    const failedResult = await signInToOperationalWorkspace({
      email: customerAuthUser.email,
      password: "wrong-password",
    });

    expect(failedResult).toMatchObject({
      ok: false,
      message: "Invalid login credentials",
    });
    expect(getOperationalAuthSnapshot()).toMatchObject({
      user: ownerAuthUser,
      actorType: "operational",
    });
    expect(getOperationalAuthSnapshot().operationalUser?.role).toBe("Owner");
  });
});
