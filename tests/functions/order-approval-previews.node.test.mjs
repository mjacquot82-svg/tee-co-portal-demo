import test from "node:test";
import assert from "node:assert/strict";
import { handler, __setClientFactory } from "../../netlify/functions/order-approval-previews.js";

const TOKEN = "a".repeat(64);
function setEnv(env) {
  for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "TEE_CO_ALLOWED_UPLOAD_ORIGINS"]) delete process.env[k];
  Object.assign(process.env, env);
}
function fake({ rpcError = null, paths = [] } = {}) {
  const calls = { rpc: [], signed: [] };
  return {
    calls,
    rpc: async (name, args) => { calls.rpc.push({ name, args }); return rpcError ? { data: null, error: rpcError } : { data: paths, error: null }; },
    storage: { from: (bucket) => ({ createSignedUrl: async (path, seconds) => { calls.signed.push({ bucket, path, seconds }); return { data: { signedUrl: `https://signed.invalid/${path}?s=${seconds}` }, error: null }; } }) },
  };
}
const post = (body, headers = {}) => handler({ httpMethod: "POST", headers, body: JSON.stringify(body) });

test("signs short-lived preview links only after the database accepts the token", async () => {
  setEnv({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sr-secret" });
  const client = fake({ paths: [{ id: "f1", storage_path: "CUST-1/logo.png" }, { id: "f2", storage_path: "https://old.invalid/x.png" }, { id: "f3", storage_path: "../etc" }] });
  __setClientFactory(() => client);
  const res = await post({ orderNumber: "TC-1", token: TOKEN });
  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(body.files, [{ id: "f1", url: "https://signed.invalid/CUST-1/logo.png?s=600" }]);
  assert.deepEqual(client.calls.rpc, [{ name: "get_order_approval_file_paths", args: { p_order_number: "TC-1", p_token: TOKEN } }]);
  assert.equal(client.calls.signed[0].bucket, "customer-artwork");
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.ok(!res.body.includes("sr-secret"));
});

test("a wrong or expired token signs nothing", async () => {
  setEnv({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sr" });
  const client = fake({ rpcError: { code: "28000", message: "not valid" } });
  __setClientFactory(() => client);
  const res = await post({ orderNumber: "TC-1", token: TOKEN });
  assert.equal(res.statusCode, 404);
  assert.equal(client.calls.signed.length, 0);
});

test("malformed tokens never reach the database", async () => {
  setEnv({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sr" });
  const client = fake();
  __setClientFactory(() => client);
  for (const token of ["", "short", "z".repeat(64), TOKEN + "0"]) {
    assert.equal((await post({ orderNumber: "TC-1", token })).statusCode, 404);
  }
  assert.equal((await post({ orderNumber: "", token: TOKEN })).statusCode, 404);
  assert.equal(client.calls.rpc.length, 0);
});

test("method, origin and configuration checks", async () => {
  setEnv({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sr", TEE_CO_ALLOWED_UPLOAD_ORIGINS: "https://teeandco.jdsstudio.ca" });
  __setClientFactory(() => fake());
  assert.equal((await handler({ httpMethod: "GET", headers: {} })).statusCode, 405);
  assert.equal((await post({ orderNumber: "TC-1", token: TOKEN }, { origin: "https://evil.invalid" })).statusCode, 403);
  setEnv({ SUPABASE_URL: "https://x.supabase.co" });
  assert.equal((await post({ orderNumber: "TC-1", token: TOKEN })).statusCode, 500);
});
