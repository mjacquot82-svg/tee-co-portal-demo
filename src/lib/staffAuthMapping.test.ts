import { describe, expect, it } from "vitest";
import { resolveStaffForAuthUser } from "./staffUsersStore";

const staff = [{ id: "1273149c-750e-4c05-9b0a-1398a8b8b221", name: "Pat", role: "Staff", status: "Active", auth_user_id: "8c315f70-dbf6-44de-b64e-d9c1994d41aa" }];

describe("resolveStaffForAuthUser", () => {
  it("uses the staff row from the PIN session claim, not the login id", () => {
    const user = resolveStaffForAuthUser({ id: "8c315f70-dbf6-44de-b64e-d9c1994d41aa", authUserId: "8c315f70-dbf6-44de-b64e-d9c1994d41aa", staffUserId: staff[0].id, role: "staff" }, staff);
    expect(user.id).toBe(staff[0].id);
    expect(user.name).toBe("Pat");
  });
  it("falls back to matching staff_users.auth_user_id", () => {
    expect(resolveStaffForAuthUser({ id: "8c315f70-dbf6-44de-b64e-d9c1994d41aa", role: "owner" }, staff).id).toBe(staff[0].id);
  });
  it("uses the claim even before staff rows have loaded", () => {
    expect(resolveStaffForAuthUser({ id: "a", staffUserId: staff[0].id }, []).id).toBe(staff[0].id);
  });
  it("flags a login with no staff row so it is not saved as a staff id", () => {
    expect(resolveStaffForAuthUser({ id: "owner-auth-id", role: "owner" }, staff).staffRecordMissing).toBe(true);
  });
});
