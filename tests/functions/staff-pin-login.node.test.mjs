import test from "node:test";
import assert from "node:assert/strict";
import { handler, __setClientFactory } from "../../netlify/functions/staff-pin-login.js";

const ID = "11111111-2222-4333-8444-555555555555";
function fakeAdmin({ verify, ipFailures = 0, authUserId = null } = {}) {
  const calls = { rpc: [], inserts: [], created: [], updated: [], linked: [] };
  const admin = {
    calls,
    rpc: async (name, args) => { calls.rpc.push([name, args]); return { data: verify(args), error: null }; },
    from(table) {
      const q = {
        select() { return q; }, eq() { return q; },
        gte() { return Promise.resolve({ count: ipFailures, error: null }); },
        insert(row) { calls.inserts.push([table, row]); return Promise.resolve({ error: null }); },
        update(row) { calls.linked.push(row); return { eq: () => Promise.resolve({ error: null }) }; },
      };
      return q;
    },
    auth: {
      admin: {
        createUser: async (u) => { calls.created.push(u); return { data: { user: { id: "auth-new" } }, error: null }; },
        updateUserById: async (id, u) => { calls.updated.push([id, u]); return { data: {}, error: null }; },
        getUserById: async () => ({ data: { user: { email: "staff@x.invalid" } } }),
        generateLink: async () => ({ data: { properties: { hashed_token: "th" } }, error: null }),
      },
      verifyOtp: async () => ({ data: { session: { access_token: "at", refresh_token: "rt", expires_at: 1 } }, error: null }),
    },
  };
  void authUserId;
  return admin;
}
const ev = (body) => ({ httpMethod: "POST", headers: { "x-nf-client-connection-ip": "1.2.3.4" }, body: JSON.stringify(body) });
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";

test("correct PIN returns a session and creates a linked staff auth user with app_metadata role", async () => {
  const admin = fakeAdmin({ verify: () => ({ ok: true, id: ID, name: "Sam", role: "Staff", auth_user_id: null }) });
  __setClientFactory(() => admin);
  const res = await handler(ev({ staffUserId: ID, pin: "1234" }));
  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(body.session.access_token, "at");
  assert.equal(body.staff.role, "Staff");
  assert.equal(body.staff.pin, undefined);
  assert.equal(admin.calls.created[0].app_metadata.operational_role, "staff");
  assert.equal(admin.calls.created[0].app_metadata.staff_user_id, ID);
  assert.deepEqual(admin.calls.linked[0], { auth_user_id: "auth-new" });
  assert.equal(admin.calls.rpc[0][0], "verify_staff_pin");
  assert.ok(!res.body.includes("1234"));
});

test("existing linked user gets role metadata refreshed, not a new user", async () => {
  const admin = fakeAdmin({ verify: () => ({ ok: true, id: ID, name: "Mo", role: "Manager", auth_user_id: "auth-old" }) });
  __setClientFactory(() => admin);
  const res = await handler(ev({ staffUserId: ID, pin: "1234" }));
  assert.equal(res.statusCode, 200);
  assert.equal(admin.calls.created.length, 0);
  assert.equal(admin.calls.updated[0][1].app_metadata.operational_role, "manager");
});

test("wrong PIN is refused with 401 and recorded", async () => {
  const admin = fakeAdmin({ verify: () => ({ ok: false, code: "INVALID" }) });
  __setClientFactory(() => admin);
  const res = await handler(ev({ staffUserId: ID, pin: "9999" }));
  assert.equal(res.statusCode, 401);
  assert.equal(JSON.parse(res.body).session, undefined);
  assert.equal(admin.calls.inserts[0][1].success, false);
});

test("locked staff gets 423", async () => {
  __setClientFactory(() => fakeAdmin({ verify: () => ({ ok: false, code: "LOCKED" }) }));
  const res = await handler(ev({ staffUserId: ID, pin: "1234" }));
  assert.equal(res.statusCode, 423);
});

test("too many failures from one IP gets 429 before any PIN check", async () => {
  const admin = fakeAdmin({ ipFailures: 20, verify: () => ({ ok: true }) });
  __setClientFactory(() => admin);
  const res = await handler(ev({ staffUserId: ID, pin: "1234" }));
  assert.equal(res.statusCode, 429);
  assert.equal(admin.calls.rpc.length, 0);
});

test("malformed input never reaches the database", async () => {
  const admin = fakeAdmin({ verify: () => ({ ok: true }) });
  __setClientFactory(() => admin);
  assert.equal((await handler(ev({ staffUserId: "x", pin: "1234" }))).statusCode, 401);
  assert.equal((await handler(ev({ staffUserId: ID, pin: "12" }))).statusCode, 401);
  assert.equal(admin.calls.rpc.length, 0);
  assert.equal((await handler({ httpMethod: "GET", headers: {} })).statusCode, 405);
});

test("unknown role is not granted a session", async () => {
  __setClientFactory(() => fakeAdmin({ verify: () => ({ ok: true, id: ID, name: "X", role: "Customer" }) }));
  const res = await handler(ev({ staffUserId: ID, pin: "1234" }));
  assert.equal(res.statusCode, 500);
  assert.equal(JSON.parse(res.body).session, undefined);
});

test("auth user that already exists but lost its link (e.g. after a DB rollback) is re-linked", async () => {
  const admin = fakeAdmin({ verify: () => ({ ok: true, id: ID, name: "Sam", role: "Staff", auth_user_id: null }) });
  admin.auth.admin.createUser = async () => ({ data: { user: null }, error: { message: "A user with this email address has already been registered" } });
  admin.auth.admin.generateLink = async () => ({ data: { user: { id: "auth-existing" }, properties: { hashed_token: "th" } }, error: null });
  __setClientFactory(() => admin);
  const res = await handler(ev({ staffUserId: ID, pin: "1234" }));
  assert.equal(res.statusCode, 200);
  assert.equal(admin.calls.updated[0][0], "auth-existing");
  assert.equal(admin.calls.updated[0][1].app_metadata.operational_role, "staff");
  assert.deepEqual(admin.calls.linked[0], { auth_user_id: "auth-existing" });
});
