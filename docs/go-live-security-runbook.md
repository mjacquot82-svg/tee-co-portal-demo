# Go-live runbook: RLS hardening + server-side staff PIN login (PR 68)

Rehearsed on staging against a clone of live's schema (synthetic data) on 2026-10-16. Each SQL
phase runs in one transaction, under about 1 second. Run SQL in the Supabase SQL editor of the LIVE
project. Read-only status at any time: `supabase/golive-preflight.sql`.

| Step | What | Who | Staff impact |
|---|---|---|---|
| 0 | Netlify (live site) env: `SUPABASE_SERVICE_ROLE_KEY` (the live **service role / secret** key, not the anon key), `STAFF_PIN_RATE_LIMIT_SALT`, `TEE_CO_ALLOWED_UPLOAD_ORIGINS` (live site origin(s), comma-separated), `SUPABASE_URL`. Functions on Node 22+. | Marc (Netlify) | none |
| 1 | Take a fresh backup / note the time (Supabase PITR or dashboard backup). | Marc | none |
| 2 | Phase A: `supabase/staff-pin-auth-phase-a.sql` | Marc (SQL editor) | none; old app keeps working |
| 3 | Merge PR 68, let Netlify deploy. | Marc | none (PIN login now server-side) |
| 4 | Open `https://<live site>/.netlify/functions/security-preflight`: it must return `"ok": true` and `"phaseA": true`. If not, STOP, fix env, redeploy. | Marc | none |
| 5 | Smoke test on live: one staff PIN login, one owner email login, open Orders / Customers / Payments. Ask staff to reload open tabs / log in again. | Marc + 1 staff | ~1 min reload |
| 6 | Phase B: `supabase/rls-hardening.sql` | Marc | none if step 5 done; old tabs that weren't reloaded stop loading data until reloaded |
| 7 | Smoke test again (staff, owner, a customer portal login, storefront). Watch the next Square payment / notification run. | Marc | none |
| 8 | Phase C (same day or after a day of normal use): `supabase/staff-pin-auth-phase-c.sql` | Marc | none |
| 9 | After confirming everything works for a few days: `drop table tee_co_private.staff_pin_plain_backup;` | Marc | none |
| 10 | Phase D (later, separate): `supabase/storage-hardening.sql` (customer-artwork bucket no longer public) | Marc | none |

## Rollback (each phase, newest first)
- D: `storage-hardening-rollback.sql` (re-opens artwork bucket as it is today)
- C: `staff-pin-auth-phase-c-rollback.sql` (restores plaintext PINs from the backup table, full grants)
- B: `rls-hardening-rollback.sql` (restores RLS flags, policies, anon grants, original staff check). Roll back D first.
- Code: redeploy the previous Netlify deploy (only after rolling back B; the old app needs anon access).
- A: `staff-pin-auth-phase-a-rollback.sql` (removes all phase A objects; PINs were never removed in A)
Rolled back D→C→B→A on the rehearsal clone: the catalog came back identical to live's.
