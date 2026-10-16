// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const setSession = vi.fn();
const getSession = vi.fn();
const rpc = vi.fn();
const select = vi.fn();

vi.mock("./supabase", () => ({
  supabase: {
    from: vi.fn(() => ({ select: (cols: string) => { select(cols); return { order: () => Promise.resolve({ data: [], error: null }) }; } })),
    rpc: (...args: unknown[]) => rpc(...args),
    auth: {
      setSession: (...a: unknown[]) => setSession(...a),
      getSession: () => getSession(),
      signOut: vi.fn(() => Promise.resolve({})),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
    },
  },
}));
vi.mock("./supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { onAuthStateChange: vi.fn(() => ({ data: { subscription: {} } })) } },
}));
vi.mock("./authDiagnostics", () => ({ pushAuthDiagnostic: vi.fn() }));

const ID = "11111111-2222-4333-8444-555555555555";

describe("server-side staff PIN login", () => {
  beforeEach(() => {
    setSession.mockReset().mockResolvedValue({ error: null });
    getSession.mockReset().mockResolvedValue({ data: { session: null } });
    rpc.mockReset().mockResolvedValue({ data: [{ id: ID, name: "Sam", role: "Staff" }], error: null });
    select.mockReset();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("posts the PIN to the server and stores the returned Supabase session", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, staff: { id: ID, name: "Sam", role: "Staff" }, session: { access_token: "at", refresh_token: "rt" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { attemptStaffLogin } = await import("./staffUsersStore");
    const result = await attemptStaffLogin({ staffUserId: ID, pin: "1234" });
    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("/.netlify/functions/staff-pin-login");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ staffUserId: ID, pin: "1234" });
    expect(setSession).toHaveBeenCalledWith({ access_token: "at", refresh_token: "rt" });
    expect(result.user.id).toBe(ID);
  });

  it("refuses a wrong PIN and shows the lockout message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 423, json: async () => ({ ok: false, code: "LOCKED", message: "locked" }),
    }));
    const { attemptStaffLogin } = await import("./staffUsersStore");
    const result = await attemptStaffLogin({ staffUserId: ID, pin: "0000" });
    expect(result).toMatchObject({ ok: false, code: "LOCKED" });
    expect(setSession).not.toHaveBeenCalled();
  });

  it("signed-out roster uses the names-only RPC and never selects PIN columns", async () => {
    const { ensureStaffUsersHydrated, STAFF_USER_PUBLIC_COLUMNS } = await import("./staffUsersStore");
    await ensureStaffUsersHydrated({ force: true });
    expect(rpc).toHaveBeenCalledWith("list_pin_login_staff");
    const cols = STAFF_USER_PUBLIC_COLUMNS.split(",").map((c: string) => c.trim());
    expect(cols).not.toContain("pin");
    expect(cols).not.toContain("pin_hash");
    expect(cols).not.toContain("failed_pin_attempts");
  });
});
