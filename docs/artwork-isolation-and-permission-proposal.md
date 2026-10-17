# Staging isolation and minimal permission proposal — 2026-10-15

Unapplied proposal, supplementing `artwork-backend-acceptance-proposal.md`. Application candidate remains 33087043; 49d1bdb added documentation only. Grok owns the parallel remote-branch source audit. This follow-up checks deployed metadata and deployment-specific gate source only; it does not duplicate tests or claim a complete fix. Reconcile Grok's findings before final migration design.

## Isolation evidence and exact remaining access gap

Read-only GET of https://teeandco-staging.netlify.app identified entry asset `/assets/index-DWbcB1mS.js`. Extracting only Supabase hostnames returned **https://bqecxfkciwjtixiazurx.supabase.co**, the staging project, with no production hostname in that entry asset. No JavaScript was executed, function invoked, key printed or bundle saved. Sandbox DNS failed; the approved read-only network call completed successfully. This verifies the entry bundle's target, not every lazy chunk, runtime function or fallback.

| Item | Evidence | Classification |
| --- | --- | --- |
| Staging frontend | Entry asset above; staging project bqecxfkciwjtixiazurx | Confirmed staging hostname in public entry bundle |
| Resource separation | Staging Netlify 326b9b65-cc33-42f9-835a-19a666130541 versus production bda24aaa-656f-4722-a508-8239b27bdea9; staging DB bqecxfkciwjtixiazurx versus production-named DB iwbajhxrgyjferbkibkl | Separate resources confirmed; no production DB SQL performed |
| Deployed source | Staging current deploy 6ac81461964e350008327c99 reports commit 3e73bfcf5841e1f5bd45e209b52893675dbfff8f | Source snippets below fetched at this exact commit; not the artwork candidate |
| Function DB | SMS and customer email source use SUPABASE_URL, falling back to VITE_SUPABASE_URL | Effective function-scope values unknown; frontend target does not prove function target |
| Square mode | At deployed commit, `netlify/functions/square-payment-link.js:36` selects sandbox only for SQUARE_ENVIRONMENT=sandbox, otherwise production | Runtime setting unknown; production is the source default, so sandbox cannot be assumed |
| Scheduled SMS | Deploy lists notification-sms-dispatcher-scheduled every minute; source :59 checks NOTIFICATION_ENGINE_SMS_CUTOVER before credentials/client creation | Schedule presence confirmed, gate value and actual recipients unknown |
| Email | Deployed `customer-notification.js:44` requires RESEND_API_KEY, Supabase URL and service role key; missing values return 503 | Credential/gate presence not inspected; source requirements are not proof of disablement |
| Recipient isolation | No recipient records, contact values, provider credentials or env values retrieved | No proof that recipients are synthetic or delivery is disabled |

Exact access blocker: callable Netlify `manage_env_vars` offers getAllEnvVars returning variable values, with no names-only, presence-only, per-key read or redacted-classification option. The site/deploy tools omit effective environment context/scope and inherited team overrides. Do not call value listing and redact afterward: that would still retrieve contents beyond this task's boundary. No denial occurred on these read checks; the missing safe metadata view is an evidence/access limitation.

Required redacted evidence from an authorized owner or a metadata-only tool: effective build and function Supabase target classifications; Square sandbox/disabled classification; email/SMS delivery gate booleans and destination classification (synthetic-only versus unrestricted, never addresses); scheduled job disable/gate classification; credential presence only; effective site/team scope/context precedence. No provider call is needed to obtain that evidence. Existing recipient and function targets remain unknown, so future synthetic writes **could** reach real recipients or a production function backend and remain prohibited. Do not infer safety from absence of observed sends.

## Minimal migration design for separate review — NOT executable or approved

Confirmed staging metadata from the preceding report: authenticated orders INSERT grant exists but no ordinary-customer INSERT policy; customer_artwork lacks any authenticated UPDATE privilege and any UPDATE/ALL policy. Existing staff policies and all existing grants must be preserved. Do not change production, disable RLS, grant an operational role to customers, or add service-role browser access.

### 1. Customer order creation

Add **one INSERT-only policy for authenticated ordinary customers** on public.orders, with a WITH CHECK predicate requiring all of:

- customer_id identifies an existing customers row whose auth_user_id equals auth.uid(); caller-supplied email/name alone never authorizes ownership.
- source = Customer Portal, status = New, approval_status = Pending Review, quote_status = Draft, operational_visible = false and production_ready = false.
- Requested artwork remains unapproved: for this decorated artwork flow artwork_approval_required = true and artwork_approval_status = Pending Review. Do not force that value onto unrelated undecorated flows without separate design review.
- No paid-state assertions, assigned production owner, approved timestamp/actor, invoice issuance or payment/provider reference may be supplied. Validate the exact safe initial payment/deposit fields and null/zero values against the current schema and actual payload; preserve existing undecided deposit behavior and do not add fees.
- line_items is a nonempty array with valid positive integral quantities and consistent totals. Create-mode lines require a nonblank description and no uploaded artwork ID; upload/existing IDs must belong to the same customer. Preserve mixed orders.

Existing customer SELECT and staff ALL policies stay unchanged; do not add customer order UPDATE/DELETE. No new INSERT grant is needed. The candidate serializes nested quote/snapshot JSON, so an INSERT policy checking only top-level booleans is insufficient until review identifies which nested financial/approval fields consumers trust. Final migration must reject or canonicalize unsafe nested values using a narrowly scoped validation function/trigger. This review prerequisite is intentional: no superficially permissive runnable policy is supplied.

### 2. Artwork relationship update

Prefer the existing direct PATCH contract with **column-only UPDATE** for linked_quote_ids, linked_order_ids, last_used_at and updated_at, plus one customer-owned UPDATE policy with both USING and WITH CHECK. Keep existing SELECT, INSERT and staff policies unchanged. Never grant UPDATE on customer_id, storage_path, file identity, approval status or arbitrary metadata.

Ownership predicate must match deployed is_customer_artwork_owner(customer_id::text). Relationship arrays must contain only orders belonging to that same customer; current code stores order_number strings rather than order UUIDs. Quote linkage must point to the customer's request; ordinary customers must not turn a quote into a production order. Permit timestamp refresh and idempotent retries. A scoped BEFORE UPDATE guard must prevent customers removing/replacing pre-existing links or changing immutable identity and must validate newly appended references; RLS cannot compare OLD and NEW by itself. Preserve staff behavior by explicitly retaining existing operational-role handling, not silently imposing customer append-only rules on staff. Validate whether linked_order_ids needs a customer grant at all: artwork customer intake calls linked_quote_ids, so omit linked_order_ids from the grant unless Grok's audit demonstrates an authorized customer path needs it.

Avoid a broad table UPDATE grant or an ownership-only check that permits attaching another customer's order. If final review chooses a narrow RPC instead, that requires a separately reviewed client change and must not bypass auth ownership. No RPC is created by this proposal.

### 3. Scope, rollback and acceptance

- Limit the future migration to staging project bqecxfkciwjtixiazurx with an explicit environment check performed by its authorized operator. Use new uniquely named policies/guards; do not replace staff policies. Record pre-change catalog/grants first. Generate the actual migration only once its reviewed schema/JSON validation is concrete.
- Rollback removes only newly introduced policies/guard and newly granted UPDATE columns, restoring captured pre-change grants. No data deletion or broad REVOKE is part of rollback. Preserve already submitted synthetic records for agreed cleanup ownership.
- Keep profile permissions unchanged: deployed own-profile INSERT/SELECT/UPDATE already exists. Investigate notification_activity staff-only mismatch and failed-upload cleanup separately; do not expand scope to unrestricted notification or storage DELETE permissions.
- Run the acceptance matrix from the preceding report only after isolation, identities, narrow mutation permission and budget/execution location are approved. Include real non-operational customer A/B negative ownership tests, forged approval/payment/nested snapshot payloads, foreign artwork/order links, append-only/idempotent relationship tests and staff-path regression checks. No test was run in this preparation.

## Next actionable decision

The immediate next step is obtaining the redacted runtime-isolation classifications above and Grok's audit. Then review the exact order payload allowlist and relationship-only authorization design. Staging currently has two confirmed operational users and zero linked customer profiles; no ordinary customer A/B identity is available, and account/credential creation remains unauthorized. Do not test customer permissions using operational users.

Prior push remains explicitly denied; no retry or alternate write route. No hosted run, deployment, migration, account, permission or provider change occurred. This document is preparation, not release or database approval.
