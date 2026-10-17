# Artwork backend acceptance proposal — 2026-10-15

Preparation only. Application candidate: `33087043baf41fad09bccb5bc7b32e4db5179889`. No application, policy, credential or provider changes; no synthetic writes, login, browser, build, installation, CI, push or deployment were performed. This document records read-only connector metadata and source inspection.

## Environment and isolation evidence

| Resource | Confirmed metadata |
| --- | --- |
| Production Netlify | `bda24aaa-656f-4722-a508-8239b27bdea9`, teeandco.jdsstudio.ca, current deploy `6acbc00fe89cc000083fd234` |
| Staging Netlify | `326b9b65-cc33-42f9-835a-19a666130541`, teeandco-staging.netlify.app, current ready deploy `6ac81461964e350008327c99`, branch staging, commit `3e73bfcf5841e1f5bd45e209b52893675dbfff8f` |
| Production-named Supabase | Tee-and-co, `iwbajhxrgyjferbkibkl`; project-list metadata only, no SQL executed against it |
| Staging Supabase | Tee & Co - Staging, `bqecxfkciwjtixiazurx`, ACTIVE_HEALTHY; all SQL inspection targeted this exact project |

Separate site/project identities are confirmed. The deployed staging frontend/function database targets, provider modes and scheduled-job suppression are **not verified**. Netlify's site/deploy tools do not expose a safe environment-metadata-only view. Environment-variable listing was not called because it may return credential values. No .env files or secret stores were read.

The current staging deploy includes customer/staff notification functions, Square functions, and `notification-sms-dispatcher-scheduled` scheduled every minute. Their presence does not prove delivery is enabled, but means separation alone is insufficient to authorize writes. No password/SSO site gate is reported. The candidate is not deployed on staging. PR preview isolation remains unverified/previously unsafe and is not a substitute.

## Actual deployed staging policy findings

Read-only catalog queries inspected pg_policies, pg_class RLS flags, information_schema grants/columns, effective privilege helpers, function definitions and trigger names. One initial multi-statement read returned only its final grants result; a subsequent single JSON SELECT obtained the policy/RLS evidence. No SET ROLE, JWT impersonation, DDL or mutation was used.

- RLS is enabled on customers, orders, customer_artwork, notification_activity and storage.objects.
- **Confirmed compatibility blocker: ordinary-customer order INSERT.** Authenticated has table INSERT privilege, but orders has only `staging_customer_order_read` (SELECT for linked customer) and `staging_operational_access` (ALL for owner/manager/staff). No customer INSERT policy exists. The operational helper reads app_metadata roles. The candidate's direct ordinary-customer insert has no allowing policy. This is a catalog-confirmed access mismatch; no failing write was attempted.
- **Confirmed compatibility blocker: artwork metadata UPDATE.** Authenticated effective UPDATE and any-column UPDATE on customer_artwork are both false. Its four policies provide only customer/staff SELECT and INSERT, with no UPDATE/ALL policy. The candidate's relationship PATCH cannot succeed through the ordinary authenticated client (also no authenticated staff UPDATE grant). No permission change is proposed without separate review.
- **Customer-profile ownership exists.** `staging_customer_profile_read`, `_insert`, `_update` require auth_user_id = auth.uid(); UPDATE has both USING and WITH CHECK. Authenticated has SELECT/INSERT/UPDATE, permitting the intended own-profile upsert in principle. `staging_operational_access` separately allows operational roles. The commented sample in `supabase/customer-auth-linking.sql:49` is not deployed-policy evidence. Runtime profile creation/update remains untested.
- Artwork SELECT/INSERT and storage SELECT/INSERT are scoped by `is_customer_artwork_owner`; deployed helper is security-invoker, checks customers.auth_user_id = auth.uid(), and uses empty search_path. Customer storage DELETE/UPDATE is absent; failed-upload cleanup must not be assumed to work for customers. Operational object DELETE exists.
- notification_activity has staff-only SELECT/INSERT policies, despite authenticated table grants. The fixture permits a synthetic customer metadata POST, so it does not establish that real customer notification-activity persistence succeeds. This is an additional source/policy mismatch to classify, not permission to broaden notification access.
- Required orders columns exist: customer_id UUID, qty integer, line_items JSONB, operational_visible, production_ready, artwork_approval_required booleans, artwork_approval_status text. Artwork linked_quote_ids/linked_order_ids arrays and timestamps exist. Existence does not verify JSON round-trip, all constraints, or fallback behavior.
- Relevant public-table triggers reported: customers/orders timestamp updates and orders `tee_co_private.guard_owner_discount`. Trigger names alone do not establish all outbound effects; provider and scheduled execution isolation remains a separate prerequisite.

## Request / permission map

References are relative to the candidate checkout. No production schema conclusions are inferred from staging.

| Candidate code | Request / necessary access | Staging finding / acceptance implication |
| --- | --- | --- |
| `src/lib/customerProfileStore.js:42`; `src/lib/customersStore.js:327`, `:384` | Resolve profile, SELECT customers; upsert with INSERT/UPDATE and returned SELECT | Own-auth-user policies exist; use a real ordinary customer to prove matching, creation and update without reassignment |
| `src/customer-portal/CustomerPortalRequestOrder.jsx:623`; `src/lib/ordersStore.js:1685`; `src/lib/ordersRepository.js:493` | Direct orders INSERT plus returned SELECT | Customer INSERT policy missing; both design-only and upload submissions blocked for ordinary customers |
| `src/services/customerArtworkService.js:720`; `supabase/customer-artwork-customer-access.sql:61`, `:71`, `:85`, `:96` | Upload object INSERT; metadata INSERT/SELECT; signed object read | Ownership policies exist; verify own folder and reject other customer's folder; cleanup path at service :737 needs DELETE, not currently allowed to customer |
| `src/lib/ordersStore.js:1706`; `src/services/customerArtworkService.js:517`, `:160`, `:806` | SELECT artwork, PATCH linked_quote_ids/last_used_at/updated_at, returned SELECT | UPDATE grant and policy missing. `ordersStore.js:178` catches/logs relationship failure asynchronously: order confirmation alone cannot prove linkage |
| `src/customer-portal/CustomerPortalRequestOrder.jsx:682`; `src/lib/customersStore.js:690` | Post-order profile summary upsert of order_numbers | Ownership policies exist; caller catches failure, so independently read back the summary |
| `src/lib/ordersStore.js:1704`; fixture `tests/customer-mock/mobile-order.spec.js:33` | Notification side effects/activity metadata | Provider delivery must stay disabled; staff-only activity policy differs from mock success; do not fix by granting general customer notification writes |

## Existing identity availability (aggregate only)

Staging has **2 Auth users**, both confirmed and both carrying an operational role under the deployed role helper's app_metadata rules. There are **0 linked customer profiles** and **0 reserved .invalid-domain Auth users**. No email addresses, user IDs, passwords, tokens or keys were retrieved. These counts do not prove access to either operational login. There are **no verified existing ordinary-customer identities A/B** for ownership testing. Running customer acceptance as an owner/staff account would mask the missing customer INSERT policy.

## Acceptance matrix — execute only after separate authorization and prerequisites

All future cases use the exact approved candidate in an independently verified isolated environment, ordinary customers A/B and operational reviewer S. Never use service-role access for behavioral assertions. Capture only synthetic record IDs, redacted request outcomes and fresh readback; never session tokens.

| Case | Action | Required evidence |
| --- | --- | --- |
| Authentication/profile | Real sign-in as A, reload, create/update own profile | Real session and canonical auth_user_id association; own reads/upsert succeed; expiry/sign-out denies access; no seeded session |
| Ownership negatives | B/anonymous read or modify A profile/order/artwork; A attempts auth_user_id/customer_id reassignment | No unauthorized data returned or mutation, verified by trusted fresh readback; no operational role on A/B |
| Design-only | Two garments, required descriptions, no files; reload/edit/save; submit once | Exactly one persisted order, two correct lines/descriptions/sizes/quantities; no artwork object/metadata created; real customer ownership; profile order_numbers updated |
| Mixed upload/existing | One create line, one uploaded line; reuse existing artwork and edit saved quantities | Exactly two lines, unchanged garment/artwork IDs, expected totals, object under A folder, metadata and linked_quote_ids durably updated; not merely a successful UI confirmation |
| Fresh readback/staff | New authenticated session for A, then S reads order | Values survive backend round-trip; S sees clear design request; Pending Review, approval required, production_ready=false, operational_visible=false; B cannot view |
| Failure paths | Blank description; denied/expired access; interrupted metadata/link step | No silent success for required persistence, no duplicate order on retry, no unauthorized cleanup; partial persistence identified explicitly |
| Side effects | Observe only synthetic activity within verified isolated delivery-disabled setup | No email/SMS/payment request or provider dispatch; no production DB/storage writes. Do not enable real delivery to satisfy a test |

## Minimal next step and approval boundaries

1. **Read-only access/evidence first:** obtain a redacted owner attestation or metadata-only inspection showing staging build/functions use the staging project, no production storage/backend fallback, notification/payment delivery disabled, scheduled dispatchers cannot send, and no database-trigger outbound delivery. No new keys or provider changes are authorized. Existing tools cannot establish this without potentially exposing env values, so it remains an exact access/evidence blocker.
2. **Separate narrow review:** present the two confirmed staging permission mismatches to the staging owner. Decide the intended customer order-creation and artwork-link authorization boundary before writing any migration. Restrict ownership and review/production fields; do not grant unrestricted UPDATE, operational roles, or bypass RLS. This proposal does not authorize applying changes.
3. **Identity prerequisite:** owner must identify already-existing suitable ordinary customer A/B test identities, or separately authorize their creation/profile setup if none exist. Current instructions prohibit new credentials, so no accounts were created and no login was attempted.
4. **Execution approval later:** after isolation and permissions are resolved, approve a bounded synthetic-write plan, exact runtime/source and cleanup ownership. No heavy local run is appropriate on the MSI; execution location/budget needs confirmation. No staging deploy is authorized by this document.
5. **Release gate unchanged:** remote artwork branch remains last verified 58778f8; latest hosted run 38617861642 failed. Local fixes at 33087043 have targeted evidence but no new hosted result. Prior push is explicitly denied by automatic approval review over delegated authorization; do not retry or use another write route. Supported approval resolution plus hosted validation and separate release authorization remain required. No merge/deploy claim.

The recovery/payment checkout and staging branch were not modified. This preparation adds documentation only; the two deployed staging mismatches are not evidence of a regression introduced by the artwork feature, and no claim is made about production policy state.
