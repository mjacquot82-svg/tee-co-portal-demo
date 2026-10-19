# Go-live runbook: RLS hardening + server-side staff PIN login (security-only release, branch `fix/security-only`)

This release contains ONLY the security work (the customer-portal changes that were bundled in PR 68
ship separately later). Phase A is already applied on live (Oct 16, 2026).

Rehearsed on staging against a clone of live's schema (synthetic data) on 2026-10-16. Each SQL
phase runs in one transaction, under about 1 second. Run SQL in the Supabase SQL editor of the LIVE
project. Read-only status at any time: `supabase/golive-preflight.sql`.

| Step | What | Who | Staff impact |
|---|---|---|---|
| 0 | Netlify (live site) env: `SUPABASE_SERVICE_ROLE_KEY` (the live **service role / secret** key, not the anon key), `STAFF_PIN_RATE_LIMIT_SALT`, `TEE_CO_ALLOWED_UPLOAD_ORIGINS` (live site origin(s), comma-separated), `SUPABASE_URL`. Functions on Node 22+. | Marc (Netlify) | none |
| 1 | Take a fresh backup / note the time (Supabase PITR or dashboard backup). | Marc | none |
| 2 | Phase A: `supabase/staff-pin-auth-phase-a.sql` | Marc (SQL editor) | none; old app keeps working |
| 3 | Merge the security-only PR (`fix/security-only`), let Netlify deploy. | Marc | none (PIN login now server-side) |
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

## What phase B changes for the current customer portal (checked Oct 19, 2026)
Works the same after phase B: storefront browsing, customer sign-up / sign-in, a customer seeing their
own orders, quotes, payments and payment requests, submitting a new portal order with uploaded artwork,
editing their own profile, staff-created customers being linked automatically when they sign up with
the same email. Staff (PIN or email login) see everything as before. Square webhooks and the
notification functions use the service role and are not affected.

Approval page and customer order changes (added Oct 19, 2026, phase B section 9, rehearsed in memory):
- `/approval/<order number>?token=<64 hex>`: the link in the "quote ready for approval" email now
  carries a one-time token. Staff create it automatically when a quote moves to "Awaiting Approval"
  (`create_order_approval_token`, staff only). Only a SHA-256 hash is stored, in the new private
  table `tee_co_private.order_approval_tokens` (no change to `orders`). The token expires after 30
  days, works once, and a newer link cancels older ones. The page loads only order number, garment,
  placement, decoration, quantity, status and artwork file names (`get_order_approval`); no name,
  email, phone or prices. Approve / request changes goes through `submit_order_approval`. Artwork
  previews come from the Netlify function `order-approval-previews` (10-minute signed links, uses the
  existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TEE_CO_ALLOWED_UPLOAD_ORIGINS`; no new env
  vars). A link without a token, or a wrong/expired one, shows "sign in to your customer portal".
- Portal "I've sent my deposit", "upload artwork to an existing order", "upload artwork later" and
  "I need artwork help" go through `customer_order_action`. It only works for a signed-in customer on
  their own order (`auth.uid()` compared as text), changes only the fields that action needs, and
  writes the activity log and staff notification on the server. Prices, totals and statuses other
  than those cannot be changed by customers.
- Between step 3 (code deployed) and step 6 (phase B) these database functions do not exist yet: the
  portal actions fall back to the old direct update (still allowed then), and approval emails go out
  with the old link (the page then asks the customer to sign in to the portal).
- Rollback B removes the token table and all section 9 functions together with the RLS changes.
  Customers' emailed approval links stop working after a rollback.
- The old public `/quote/<order number>` page was removed (Oct 19, 2026): nothing linked to it and
  phase B would have broken it. Customers see quotes in the portal.

## Customer confirmation emails (added Oct 19, 2026)
Customers get a short plain-text email (same style as the existing customer emails, no prices or
amounts) when they: approve on the approval page (the existing "Order approved" email), request
changes on the approval page, mark their deposit as sent, upload artwork, choose "upload later", or
ask for artwork help. They go through the existing notification pipeline
(`notification-event-accept` -> `notification_business_events` -> notifications -> deliveries).
- Run `supabase/customer-confirmation-notifications.sql` once (any time; it does not depend on
  phases A/B/C). It adds 5 email-only customer policies + templates; owners can edit the wording in
  Notifications. Rollback: `supabase/customer-confirmation-notifications-rollback.sql` (switches the
  5 policies off; template versions are immutable and stay unused).
- Emails are actually sent only where the existing customer emails are sent: Functions running with
  `VITE_NOTIFICATION_ENGINE_CUTOVER_MODE=authoritative` and the scheduled dispatcher on.
- One email per real change: the server only accepts the event when the stored order shows that
  change and the event matches the order's current `updated_at`; repeats are ignored by the
  existing unique keys. The email text is rebuilt on the server from the order number.
- Email problems never block the customer: the action is saved first, the email is announced
  afterwards and failures are only logged.
- Works before phase B (portal actions use the old direct update) and after (database functions).
