import test from "node:test";
import assert from "node:assert/strict";
import { handler, __setClientFactory } from "./security-preflight.js";

function setEnv(env) {
  for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_ANON_KEY", "STAFF_PIN_RATE_LIMIT_SALT", "TEE_CO_ALLOWED_UPLOAD_ORIGINS"]) delete process.env[k];
  Object.assign(process.env, env);
}
const fake = (works) => ({
  auth: { admin: { listUsers: async () => ({ error: works ? null : { message: "not allowed" } }) } },
  rpc: async () => ({ data: { ok: false, code: "INVALID" }, error: null }),
});

test("reports a missing service role key without leaking anything", async () => {
  setEnv({ SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_ANON_KEY: "anon-secret" });
  const res = await handler({ httpMethod: "GET" });
  const body = JSON.parse(res.body);
  assert.equal(body.serviceRoleKeyConfigured, false);
  assert.equal(body.ok, false);
  assert.ok(!res.body.includes("anon-secret"));
});

test("detects a service role key that is really the anon key", async () => {
  setEnv({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "same", VITE_SUPABASE_ANON_KEY: "same" });
  __setClientFactory(() => fake(false));
  const body = JSON.parse((await handler({ httpMethod: "GET" })).body);
  assert.equal(body.serviceRoleKeyDiffersFromAnonKey, false);
  assert.equal(body.serviceRoleKeyWorks, false);
});

test("working key + phase A installed", async () => {
  setEnv({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sr-secret", VITE_SUPABASE_ANON_KEY: "anon",
    STAFF_PIN_RATE_LIMIT_SALT: "s", TEE_CO_ALLOWED_UPLOAD_ORIGINS: "https://a" });
  __setClientFactory(() => fake(true));
  const res = await handler({ httpMethod: "GET" });
  const body = JSON.parse(res.body);
  assert.equal(body.serviceRoleKeyWorks, true);
  assert.equal(body.phaseA, true);
  assert.ok(!res.body.includes("sr-secret"));
});
