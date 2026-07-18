import { beforeEach, describe, expect, it, vi } from "vitest";

const signUp = vi.fn();
const resetPasswordForEmail = vi.fn();
const updateUser = vi.fn();

vi.mock("./supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      signUp,
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
