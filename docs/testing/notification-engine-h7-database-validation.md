# Notification Engine H7 Database Validation Rehearsal

## 1. Purpose and authority

This runbook validates the complete Notification Engine migration chain against
a real, disposable, production-equivalent Supabase project. It is the required
operational evidence for H7.

Canonical references:

- `docs/architecture/notification-engine-phase2.md`
- `docs/architecture/notification-engine-implementation-roadmap.md`
- `docs/testing/notification-engine-production-verification.md`
- the validated production-readiness engineering review

This rehearsal does not authorize SQL changes, application changes, provider
calls, production dispatch, or migration repair. If any step fails, stop,
preserve the evidence, and open a separate remediation task.

## 2. Safety rules

- Run this procedure only in a disposable Supabase project.
- Never paste service-role credentials into screenshots, tickets, or evidence.
- Never run destructive fixture cleanup in production.
- Keep SMS, Twilio, Resend, scheduled dispatch, and all provider webhooks
  disabled.
- Keep `VITE_NOTIFICATION_ENGINE_CUTOVER_MODE=legacy`.
- Keep `VITE_NOTIFICATION_ENGINE_PHASE2B_SHADOW=false`.
- Keep `NOTIFICATION_ENGINE_ORDER_APPROVED_CUTOVER=false`.
- Use repository SQL files without editing their contents.
- Apply one migration at a time and capture its result before continuing.
- Use UTC for every recorded timestamp.
- Prefix rehearsal-only identities with `h7:` so they are unambiguous.
- Do not approve H7 from SQL-text tests alone.

## 3. Roles

Assign these people before beginning:

| Responsibility | Operator | Evidence |
|---|---|---|
| Rehearsal lead | | Name and UTC start time |
| Supabase project owner | | Dashboard access confirmed |
| Database operator | | SQL Editor access confirmed |
| Security verifier | | Test users and role claims confirmed |
| Evidence recorder | | Evidence repository/location |
| Stop authority | | Available for the full rehearsal |

The database operator and evidence recorder should be different people when
practical.

## 4. Required Supabase project setup

Create a new disposable project in the same Supabase organization and region
class as production where possible.

Record:

| Property | Production | Disposable rehearsal |
|---|---|---|
| Supabase project reference | | |
| Region | | |
| PostgreSQL version | | |
| Supabase platform release | | |
| Enabled extensions | | |
| Auth configuration relevant to JWT claims | | |
| PostgREST schema exposure | | |
| Project creation time UTC | | |

Required setup:

1. Match the production PostgreSQL major version.
2. Match relevant extensions and the exposed `public` schema.
3. Create representative authenticated test users:
   - one ordinary Staff user;
   - one Owner user; and
   - optionally one Manager user for read-only operational verification.
4. Set immutable `app_metadata.operational_role` claims:
   - Staff: `staff`
   - Owner: `owner`
5. Do not place these roles in caller-editable `user_metadata`.
6. Confirm the users receive JWTs containing the expected `sub`, `role`, and
   `app_metadata.operational_role` claims.
7. Do not configure Resend, Twilio, scheduled functions, or production
   webhooks in this project.
8. Copy no production secrets into the disposable project.

### 4.1 Baseline schema and data

The migration chain depends on existing Tee & Co tables, particularly:

- `notification_templates`
- `notification_activity`
- `staff_notifications`

Restore a sanitized production-equivalent schema and representative rows before
applying Notification Engine migrations. Include at least:

- one row for every supported notification template type;
- one Legacy Notification Activity record;
- one Staff Inbox record with both read and unread examples if possible;
- the auth/staff data needed to recognize the Staff and Owner test users.

Do not restore customer secrets or unnecessary personal data.

### 4.2 Baseline inventory

Run in SQL Editor and save the result as `H7-E00-baseline-objects`:

```sql
select
  table_name,
  (select count(*) from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = t.table_name) as column_count
from information_schema.tables t
where table_schema = 'public'
  and table_name in (
    'notification_templates',
    'notification_activity',
    'staff_notifications'
  )
order by table_name;
```

Record baseline row counts and checksums:

```sql
select 'notification_templates' as object_name, count(*) as row_count,
       md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by type), '')) as row_hash
from public.notification_templates t
union all
select 'notification_activity', count(*),
       md5(coalesce(string_agg(to_jsonb(a)::text, '|' order by id), ''))
from public.notification_activity a
union all
select 'staff_notifications', count(*),
       md5(coalesce(string_agg(to_jsonb(s)::text, '|' order by id), ''))
from public.staff_notifications s;
```

If a baseline table has no stable `id` or `type` column in the
production-equivalent schema, use its real primary key and record that
substitution. Do not alter the table for this rehearsal.

### 4.3 Canonical template defaults

After `supabase/notifications-migration.sql` creates the baseline persistence
tables, apply `supabase/notification-templates-defaults-seed.sql`. This
repository-owned seed inserts any missing canonical template types and leaves
all existing rows unchanged. Browser localStorage migration remains a
compatibility path for legacy customizations, not a deployment prerequisite.

Before Phase 2A, confirm `notification_templates` contains one row for every
supported notification type. Phase 2A snapshots these rows into immutable
template version 1 records and uses their channel flags to seed policy version
1 records.

## 5. Backup and rollback preparation

Before the first migration:

1. Create a Supabase dashboard database backup if the project plan supports
   manual backups.
2. Otherwise create a fresh disposable-project restore point using the
   organization's approved database export/restore process.
3. Export the baseline schema and representative data through the dashboard or
   approved organization tooling.
4. Record backup identifier, UTC time, size, and operator.
5. Confirm the backup can be selected for restore.
6. Define rollback as destroying and recreating the disposable project or
   restoring the baseline snapshot. Do not write reverse migrations.

Perform a restore rehearsal before continuing if the organization has not
previously verified this backup mechanism.

Required evidence:

| Evidence ID | Requirement |
|---|---|
| H7-E01 | Backup/snapshot identifier and UTC time |
| H7-E02 | Export location and integrity/hash |
| H7-E03 | Restore procedure and named operator |
| H7-E04 | Confirmation that no production project is selected |

## 6. Exact migration order

Apply these files exactly in this order:

1. `supabase/notifications-migration.sql`
2. `supabase/notification-templates-defaults-seed.sql`
3. `supabase/notification-engine-phase2a-foundation.sql`
4. `supabase/notification-engine-phase2e-dispatcher.sql`
5. `supabase/notification-engine-phase2e-staff-adapter.sql`
6. `supabase/notification-engine-phase2f-resend-adapter.sql`
7. `supabase/notification-engine-phase2g-delivery-lifecycle.sql`
8. `supabase/notification-engine-phase2h-owner-administration.sql`
9. `supabase/notification-engine-phase2i-cutover.sql`
10. `supabase/notification-engine-c4-authorization.sql`
11. `supabase/notification-engine-c5-template-version-publishing.sql`
12. `supabase/notification-engine-c6-verification-evidence.sql`
13. `supabase/notification-engine-h1-scheduled-dispatcher.sql`
14. `supabase/notification-engine-h2-authoritative-staff-adapter.sql`

There are no separate Phase 2B, 2C, or 2D SQL files in the repository. Their
runtime implementation uses the Phase 2A durable schema.

## 7. Applying each migration safely

For every file:

1. Confirm the Supabase dashboard project reference matches the disposable
   project.
2. Open a new SQL Editor query named with the sequence and exact filename.
3. Copy the complete file from the reviewed repository commit.
4. Compare the first and last lines with the repository file.
5. Do not concatenate files.
6. Do not add `continue on error`, exception swallowing, or manual fixes.
7. Run the complete file once.
8. Capture:
   - filename;
   - repository commit SHA;
   - file SHA-256;
   - operator;
   - UTC start/end;
   - SQL Editor query/history identifier;
   - full success/error output.
9. Run the phase-specific evidence query below.
10. Stop on any error or unexpected result.

Do not wrap files in an additional transaction unless the file is first proven
compatible with that wrapper. Supabase SQL Editor already reports statement
errors; preserve its exact output.

## 8. Expected evidence after each migration

### 8.1 Phase 2A foundation

Expected:

- six core engine tables exist;
- template version 1 rows are seeded from Legacy templates;
- policy version 1 rows are seeded;
- Business Event, Notification, Delivery, and Attempt uniqueness exists;
- update triggers exist; and
- Legacy tables and rows remain present.

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'notification_business_events',
    'notification_template_versions',
    'notification_policies',
    'notifications',
    'notification_deliveries',
    'notification_delivery_attempts'
  )
order by table_name;

select
  (select count(*) from public.notification_templates) as legacy_templates,
  (select count(*) from public.notification_template_versions
    where version = 1) as seeded_versions,
  (select count(*) from public.notification_policies
    where version = 1) as seeded_policies;
```

Expected: all six table names; seeded versions and policies reconcile to
applicable Legacy templates.

### 8.2 Phase 2E dispatcher

Expected RPCs:

- `claim_notification_deliveries_observation`
- `recover_abandoned_notification_delivery_claims`
- `complete_notification_delivery_observation`

```sql
select p.oid::regprocedure::text
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'claim_notification_deliveries_observation',
    'recover_abandoned_notification_delivery_claims',
    'complete_notification_delivery_observation'
  )
order by 1;
```

### 8.3 Phase 2E Staff adapter

Expected:

- Staff identity columns exist;
- unique Delivery and Attempt indexes exist; and
- Staff observation claim/completion RPCs exist.

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'staff_notifications'
  and column_name in (
    'business_event_id',
    'notification_id',
    'delivery_id',
    'delivery_attempt_id'
  )
order by column_name;

select indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'staff_notifications_delivery_unique',
    'staff_notifications_attempt_unique'
  )
order by indexname;
```

### 8.4 Phase 2F Resend adapter

Expected RPCs:

- `claim_resend_email_deliveries_observation`
- `complete_resend_email_delivery_observation`

No provider request is made by applying or testing this migration.

### 8.5 Phase 2G lifecycle

Expected:

- `notification_delivery_status_history`;
- status-history trigger;
- aggregate refresh;
- real-time retry/recovery functions;
- delivered and cancellation functions; and
- the provider-idempotency index.

```sql
select
  to_regclass('public.notification_delivery_status_history') as history_table,
  to_regclass('public.notification_delivery_attempts_provider_key_idx') as provider_key_index;

select trigger_name, event_manipulation
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'notification_deliveries'
  and trigger_name = 'notification_delivery_status_history_trigger';
```

### 8.6 Phase 2H Owner administration

Expected:

- `save_notification_policy_version` exists; and
- `notification_engine_activity` exists.

```sql
select
  to_regprocedure(
    'public.save_notification_policy_version(text,boolean,text,boolean,boolean,boolean,boolean,boolean,boolean,jsonb,text)'
  ) as policy_rpc,
  to_regclass('public.notification_engine_activity') as activity_view;
```

### 8.7 Phase 2I cutover

Expected:

- Resend cutover claim/completion functions; and
- `notification_engine_cutover_verification`.

### 8.8 C4 authorization

Expected:

- RLS enabled on engine tables;
- operational and Owner helper functions;
- privileged RPCs restricted to `service_role`;
- Owner save RPC callable by `authenticated` but internally Owner-gated; and
- both existing views use invoker security.

### 8.9 C5 immutable template publishing

Expected:

- immutable-version trigger;
- Owner-only save RPC; and
- no changes to existing version rows during migration application.

### 8.10 C6 verification evidence

Expected:

- `notification_verification_expectations`;
- service-only expectation writer; and
- `notification_engine_parity_verification`.

### 8.11 H1 scheduled dispatcher database support

Expected:

- `notification_dispatch_runs`;
- start/complete run RPCs;
- authoritative expired-claim recovery; and
- authoritative Resend batch claiming.

This migration does not schedule or invoke a provider.

### 8.12 H2 authoritative Staff adapter

Expected:

- `claim_staff_notification_delivery_authoritative`; and
- `complete_staff_internal_delivery_authoritative`.

No Staff Inbox entry is created merely by applying the migration.

## 9. Complete schema inventory

Run after all migrations and save as `H7-E20-schema-inventory`.

### 9.1 Tables and views

```sql
with expected(kind, name) as (
  values
    ('table', 'notification_business_events'),
    ('table', 'notification_template_versions'),
    ('table', 'notification_policies'),
    ('table', 'notifications'),
    ('table', 'notification_deliveries'),
    ('table', 'notification_delivery_attempts'),
    ('table', 'notification_delivery_status_history'),
    ('table', 'notification_verification_expectations'),
    ('table', 'notification_dispatch_runs'),
    ('view', 'notification_engine_activity'),
    ('view', 'notification_engine_cutover_verification'),
    ('view', 'notification_engine_parity_verification')
)
select expected.*,
       case
         when kind = 'table' then to_regclass('public.' || name) is not null
         else exists (
           select 1 from information_schema.views
           where table_schema = 'public' and table_name = expected.name
         )
       end as exists
from expected
order by kind, name;
```

Expected: every `exists` value is true.

### 9.2 Required columns

```sql
with expected(table_name, column_name) as (
  values
    ('notification_business_events', 'occurrence_id'),
    ('notification_business_events', 'accepted_at'),
    ('notification_template_versions', 'required_merge_fields'),
    ('notification_template_versions', 'status'),
    ('notification_policies', 'delivery_mode'),
    ('notification_policies', 'channel_template_assignments'),
    ('notifications', 'policy_snapshot'),
    ('notifications', 'engine_metadata'),
    ('notification_deliveries', 'recipient_snapshot'),
    ('notification_deliveries', 'destination_snapshot'),
    ('notification_deliveries', 'rendered_content'),
    ('notification_deliveries', 'idempotency_key'),
    ('notification_deliveries', 'next_retry_at'),
    ('notification_deliveries', 'claim_token'),
    ('notification_deliveries', 'claim_expires_at'),
    ('notification_delivery_attempts', 'provider_idempotency_key'),
    ('notification_delivery_attempts', 'retryability'),
    ('notification_delivery_status_history', 'occurred_at'),
    ('notification_verification_expectations', 'expected_branches'),
    ('notification_dispatch_runs', 'error_summary'),
    ('staff_notifications', 'business_event_id'),
    ('staff_notifications', 'notification_id'),
    ('staff_notifications', 'delivery_id'),
    ('staff_notifications', 'delivery_attempt_id')
)
select expected.*,
       columns.column_name is not null as exists,
       columns.data_type,
       columns.is_nullable
from expected
left join information_schema.columns columns
  on columns.table_schema = 'public'
 and columns.table_name = expected.table_name
 and columns.column_name = expected.column_name
order by expected.table_name, expected.column_name;
```

Expected: every `exists` value is true.

### 9.3 Constraints

```sql
select
  conrelid::regclass::text as table_name,
  conname,
  contype,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
  and conrelid in (
    'public.notification_business_events'::regclass,
    'public.notification_template_versions'::regclass,
    'public.notification_policies'::regclass,
    'public.notifications'::regclass,
    'public.notification_deliveries'::regclass,
    'public.notification_delivery_attempts'::regclass,
    'public.notification_verification_expectations'::regclass
  )
order by table_name, conname;
```

Confirm at minimum:

- unique Business Event occurrence identity;
- unique template type/version;
- one current policy per event;
- unique Notification evaluation;
- unique Delivery branch and idempotency key;
- unique Delivery attempt number; and
- unique verification expectation identity.

### 9.4 Indexes

```sql
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and (
    tablename like 'notification_%'
    or indexname like 'staff_notifications_%'
  )
order by tablename, indexname;
```

Confirm dispatch, claim-expiry, provider-message, lifecycle-history,
verification-source, dispatch-run, and Staff identity indexes.

### 9.5 Triggers

```sql
select
  event_object_table,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in (
    'notification_policies',
    'notifications',
    'notification_deliveries',
    'notification_template_versions'
  )
order by event_object_table, trigger_name, event_manipulation;
```

Confirm updated-at triggers, Delivery status-history trigger, and immutable
template-version trigger.

### 9.6 RPC signatures

```sql
select
  p.proname,
  p.oid::regprocedure::text as signature,
  p.prosecdef as security_definer,
  pg_get_function_result(p.oid) as result_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_notification_engine_operational_user',
    'is_notification_engine_owner',
    'save_notification_policy_version',
    'save_notification_template_version',
    'record_notification_verification_expectation',
    'claim_notification_deliveries_observation',
    'recover_abandoned_notification_delivery_claims',
    'complete_notification_delivery_observation',
    'claim_staff_notification_deliveries_observation',
    'complete_staff_internal_delivery_observation',
    'claim_resend_email_deliveries_observation',
    'complete_resend_email_delivery_observation',
    'refresh_notification_aggregate_status',
    'mark_notification_delivery_delivered',
    'cancel_notification_delivery',
    'claim_resend_email_delivery_cutover',
    'complete_resend_email_delivery_cutover',
    'start_notification_dispatch_run',
    'complete_notification_dispatch_run',
    'recover_abandoned_notification_delivery_claims_authoritative',
    'claim_resend_email_deliveries_authoritative',
    'claim_staff_notification_delivery_authoritative',
    'complete_staff_internal_delivery_authoritative'
  )
order by p.proname, signature;
```

Compare every signature to its migration declaration. Missing or overloaded
unexpected signatures are a stop condition.

## 10. RLS and grant validation

### 10.1 Metadata inventory

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'notification_business_events',
    'notification_template_versions',
    'notification_policies',
    'notifications',
    'notification_deliveries',
    'notification_delivery_attempts',
    'notification_delivery_status_history',
    'notification_verification_expectations',
    'notification_dispatch_runs'
  )
order by tablename;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename like 'notification_%'
order by tablename, policyname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and (
    table_name like 'notification_%'
    or table_name like 'notification_engine_%'
  )
order by table_name, grantee, privilege_type;
```

Expected:

- RLS true on every listed table;
- no anonymous engine-data access;
- authenticated operational reads only through RLS;
- Owner writes only through approved RPCs; and
- dispatch, completion, recovery, expectation-writing, and run-recording
  operations remain service-role-only.

### 10.2 Test method

Preferred: use four SQL Editor tabs or dashboard/API requests authenticated as
the actual anonymous, Staff, Owner, and service-role principals. This proves
PostgREST JWT behavior.

SQL Editor role simulation may be used as secondary evidence:

```sql
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"<STAFF_AUTH_UUID>","role":"authenticated","app_metadata":{"operational_role":"staff"}}',
  true
);
select auth.uid(), auth.role(), public.is_notification_engine_operational_user(),
       public.is_notification_engine_owner();
rollback;
```

Replace the UUID and role for Owner. Never use a production user.

### 10.3 Anonymous expectations

As `anon`, each must fail with permission denied or return no rows:

- select from every engine table and view;
- execute policy or template save;
- execute every claim, completion, retry, recovery, dispatcher-run, and
  verification-expectation function.

Record the actual SQLSTATE/HTTP status.

### 10.4 Authenticated Staff expectations

Staff must:

- read operational engine tables/views allowed by RLS;
- read policies and published versions;
- not save a policy version;
- not publish a template version;
- not write Business Events directly;
- not write Attempts or lifecycle history;
- not claim, complete, retry, recover, or record dispatch runs; and
- not record verification expectations.

### 10.5 Authenticated Owner expectations

Owner must:

- perform the same operational reads;
- save policy versions through `save_notification_policy_version`;
- save template versions through `save_notification_template_version`;
- not directly mutate immutable template versions;
- not execute service-only dispatcher/adaptor functions; and
- not impersonate another audit identity.

### 10.6 Service-role expectations

Service role must:

- read/write engine persistence required by server processing;
- register verification expectations;
- claim and complete eligible Deliveries;
- recover expired claims;
- start and complete dispatch-run records; and
- remain subject to function eligibility and identity checks.

Service role does not mean eligibility checks may be bypassed.

## 11. Policy-version and audit-identity tests

Use an existing published template ID from the disposable project:

```sql
select id, template_type, version, status
from public.notification_template_versions
where status = 'published'
order by template_type, version desc;
```

As Staff, call `save_notification_policy_version`; expected: SQLSTATE `42501`
with `Owner authorization is required.`

As Owner, save an `h7`-documented version of an existing event policy. Supply
another user's UUID as `p_updated_by`.

Then verify:

```sql
select id, event_type, version, effective_from, effective_to, updated_by
from public.notification_policies
where event_type = '<TEST_EVENT>'
order by version;
```

Expected:

- previous current version has `effective_to`;
- new version is the only row with `effective_to is null`;
- version increments by one;
- `updated_by` equals the authenticated Owner `auth.uid()`;
- caller-supplied `p_updated_by` is not stored; and
- template assignments still reference published versions.

Run two Owner calls concurrently in separate authenticated sessions for the
same event. Expected: advisory locking produces distinct consecutive versions
and exactly one current row.

## 12. Immutable template publishing tests

Choose one disposable template and record its current mutable row and all
versions.

As Staff, saving must fail with Owner authorization.

As Owner:

1. Save a draft.
2. Confirm a new immutable version exists with `status='draft'`.
3. Confirm the mutable `notification_templates` row did not change.
4. Save a published version.
5. Confirm another version exists with `status='published'`.
6. Confirm the mutable editor row matches the published content.
7. Confirm older versions remain unchanged.
8. Confirm existing policy assignments still point to their recorded version.

Attempt direct `update` and `delete` of the new immutable version:

- as Owner, expected: table-write permission denied; and
- as service role, expected: `Notification template versions are immutable`
  with SQLSTATE `55000`.

Run two Owner publish calls concurrently. Expected: unique consecutive version
numbers and no uniqueness error.

## 13. Isolated lifecycle fixture

Create fixture rows only after authorization testing. Use a single transaction
and IDs prefixed `h7:`. Insert:

- one `notification_business_events` row;
- one automatic policy version or reuse a documented current test policy;
- one Notification with non-observation metadata;
- separate queued email and Staff Deliveries with non-observation destination
  snapshots; and
- any observation Deliveries needed by observation tests.

Use valid published template IDs and the real table constraints. Save the
fixture SQL and resulting identities as `H7-E30-fixture`.

Do not use real customer addresses. Use reserved example destinations such as
`h7@example.invalid`. Database completion RPCs do not invoke providers.

## 14. Atomic concurrent Delivery claiming

Use two SQL Editor sessions, A and B, authenticated as service role.

Prepare at least two eligible observation email Deliveries and one
authoritative Order Approved email Delivery.

For observation claims:

1. Place the same worker-independent eligible set in both sessions.
2. Execute `claim_resend_email_deliveries_observation` simultaneously with
   different worker IDs.
3. Record returned Delivery IDs and claim tokens.

For authoritative batch claims:

1. Execute `claim_resend_email_deliveries_authoritative` simultaneously.
2. Record returned Delivery IDs and claim tokens.

Expected:

- the returned ID sets do not overlap;
- each Delivery changes to `processing` once;
- each has one claim token and lease;
- a third claim returns no already-claimed Delivery;
- future retries and terminal Deliveries are absent; and
- observation Deliveries are absent from authoritative claims.

Query:

```sql
select id, status, claim_token, claimed_at, claim_expires_at, attempt_count
from public.notification_deliveries
where id like 'h7:%'
order by id;
```

If SQL Editor timing cannot reliably overlap requests, use two browser
sessions/operators and a coordinated countdown. Do not substitute a
single-session sequential test for concurrency evidence.

## 15. Staff completion tests

### 15.1 Observation Staff

1. Claim an observation Staff Delivery through
   `claim_staff_notification_deliveries_observation`.
2. Insert one linked `staff_notifications` fixture row with:
   - deterministic Staff notification ID;
   - Business Event ID;
   - Notification ID;
   - Delivery ID; and
   - deterministic Attempt ID.
3. Complete with `complete_staff_internal_delivery_observation`.

### 15.2 Authoritative Staff

1. Claim a non-observation `quote_approved` Staff Delivery through
   `claim_staff_notification_delivery_authoritative`.
2. Insert the linked Staff Inbox fixture.
3. Complete through `complete_staff_internal_delivery_authoritative`.

Expected for both:

- one Staff Inbox row;
- one immutable Attempt;
- `provider_key='staff_internal'`;
- Staff notification ID stored as provider message ID;
- Delivery becomes `sent`;
- replay cannot duplicate Staff Inbox or Attempt;
- read/unread fields and existing Legacy Staff Inbox rows remain unchanged; and
- authoritative completion refreshes Notification aggregate state.

Use the actual required `staff_notifications` columns from the restored schema
when inserting the fixture. Do not alter that schema to simplify the test.

## 16. Resend completion tests

These tests call database completion RPCs only. Do not invoke Resend.

### 16.1 Observation

1. Claim an observation Order Approved email Delivery.
2. Complete it through `complete_resend_email_delivery_observation` with:
   - a deterministic Attempt ID;
   - `p_outcome='sent'`;
   - `p_retryability='terminal'`; and
   - a synthetic provider message ID such as `h7:resend:message:1`.

### 16.2 Authoritative

1. Claim a non-observation Order Approved email Delivery through
   `claim_resend_email_delivery_cutover`.
2. Complete through `complete_resend_email_delivery_cutover` with a synthetic
   provider result.

Expected:

- one Attempt per completion;
- Delivery becomes `sent`;
- synthetic provider message ID is stored;
- provider idempotency identity remains the Delivery identity;
- replay of the same completion does not add an Attempt;
- authoritative Attempt metadata records `observationOnly=false`; and
- no HTTP provider request occurs.

## 17. Retry scheduling with real database time

Claim a controlled observation email Delivery and complete it as:

- `p_outcome='failed'`;
- `p_retryability='retryable'`;
- `p_max_attempts=3`;
- `p_base_delay_seconds=60`;
- `p_max_delay_seconds=3600`; and
- `p_completed_at=clock_timestamp()`.

Immediately query:

```sql
select
  id,
  status,
  attempt_count,
  next_retry_at,
  clock_timestamp() as database_now,
  extract(epoch from (next_retry_at - clock_timestamp())) as seconds_until_retry
from public.notification_deliveries
where id = '<H7_DELIVERY_ID>';
```

Expected after attempt 1:

- `status='retry_scheduled'`;
- `attempt_count=1`;
- `next_retry_at` is approximately 60 seconds after database completion time;
- immediate claim returns no row.

After database time passes `next_retry_at`, claim again. Complete attempt 2 as
retryable and confirm approximately 120-second backoff. Complete through the
configured maximum and confirm `failed` with no future retry.

Also test:

- terminal failure schedules no retry;
- indeterminate outcome follows the approved retry classification;
- sent Delivery is never reclaimed; and
- every retry uses the same Delivery and a new Attempt number.

Do not fake database time by editing production functions. Waiting for real
database time is required evidence.

## 18. Expired-claim recovery

In the disposable fixture only:

1. Claim an eligible Delivery with the minimum permitted lease.
2. Do not complete it.
3. Wait until `clock_timestamp()` exceeds `claim_expires_at`.
4. Run the matching recovery function.
5. Query status, token, lease, attempt count, and next retry.

Expected:

- unattempted claim returns to `queued`;
- previously attempted claim returns to due `retry_scheduled`;
- claim fields clear;
- the Delivery becomes claimable once;
- a non-expired claim is not recovered;
- terminal Deliveries are not recovered; and
- authoritative recovery accepts only non-observation Order Approved email
  Deliveries.

Record database timestamps before and after the wait.

## 19. Aggregate-state refresh

Create separate Notifications with controlled Delivery combinations and call
`refresh_notification_aggregate_status`.

| Delivery outcomes | Expected Notification state |
|---|---|
| No Deliveries | `no_delivery` |
| All `not_deliverable`/`suppressed`/`cancelled` | `no_delivery` |
| Any pending, no success | `queued` |
| Success plus pending or failure | `partially_successful` |
| Failure only | `failed` |
| All successful (`sent`/`delivered`) | `completed` |

Confirm Staff authoritative completion invokes the same aggregate calculation.
Confirm one channel's failure does not change a successful Delivery in another
channel.

## 20. Verification expectation and parity-view tests

Use `record_notification_verification_expectation` as service role only.

Test each case with isolated `h7:` identities:

1. Expectation with no Business Event.
2. Business Event with no Notification.
3. Duplicate Notification condition, if constructible without violating
   current uniqueness; otherwise confirm the constraint prevents it and record
   that evidence.
4. Missing expected recipient Delivery.
5. Duplicate branch condition; confirm either parity failure or database
   uniqueness rejection as applicable.
6. Unexpected Delivery on a disabled channel.
7. Correct multi-recipient and multi-channel cardinality.
8. Fully matching expectation.

Query:

```sql
select *
from public.notification_engine_parity_verification
where expectation_id like 'h7:%'
order by expectation_id;
```

Expected gates include:

- exactly one Business Event;
- exactly one Notification;
- no missing branch;
- no unexpected branch;
- no duplicate branch;
- disabled channels empty;
- aggregate state matches; and
- `parity_passed=true` only for the fully matching fixture.

As anonymous, Staff, and Owner, attempt to record an expectation. Expected:
execution denied. Operational authenticated users may read evidence through
RLS; only service role may write it.

## 21. Legacy preservation checks

Re-run the baseline counts and hashes from Section 4.2 before deleting any
fixture.

Required results:

- every pre-existing Legacy template row remains;
- every pre-existing Legacy Activity row remains byte-equivalent;
- every pre-existing Staff Inbox row remains;
- read/unread values are unchanged;
- Phase 2A seed versions accurately snapshot Legacy templates;
- later template tests add versions without rewriting old versions; and
- `notification_engine_activity` does not hide or mutate Legacy history.

Template publishing intentionally updates the mutable template row for the
chosen rehearsal template. Exclude that explicitly documented test row from
the baseline hash comparison or restore it from the recorded baseline before
the final comparison. No other mismatch is acceptable.

## 22. Dispatch-run evidence

As service role:

1. Start an `h7:` dispatch run.
2. Confirm it is `running`.
3. Complete it with controlled counts and metadata.
4. Confirm status, counts, errors, start time, and completion time persist.
5. Confirm anonymous, Staff, and Owner cannot read or mutate the table or
   execute its RPCs.

Do not invoke the scheduled function or any adapter for this test.

## 23. Migration ledger

Maintain one row per migration:

| Seq. | Filename | Commit SHA | File SHA-256 | SQL Editor query ID | Started UTC | Completed UTC | Operator | Result | Evidence ID |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | `notification-engine-phase2a-foundation.sql` | | | | | | | | |
| 2 | `notification-engine-phase2e-dispatcher.sql` | | | | | | | | |
| 3 | `notification-engine-phase2e-staff-adapter.sql` | | | | | | | | |
| 4 | `notification-engine-phase2f-resend-adapter.sql` | | | | | | | | |
| 5 | `notification-engine-phase2g-delivery-lifecycle.sql` | | | | | | | | |
| 6 | `notification-engine-phase2h-owner-administration.sql` | | | | | | | | |
| 7 | `notification-engine-phase2i-cutover.sql` | | | | | | | | |
| 8 | `notification-engine-c4-authorization.sql` | | | | | | | | |
| 9 | `notification-engine-c5-template-version-publishing.sql` | | | | | | | | |
| 10 | `notification-engine-c6-verification-evidence.sql` | | | | | | | | |
| 11 | `notification-engine-h1-scheduled-dispatcher.sql` | | | | | | | | |
| 12 | `notification-engine-h2-authoritative-staff-adapter.sql` | | | | | | | | |

## 24. Test evidence record

Use one record per test:

| Field | Value |
|---|---|
| Evidence ID | |
| Requirement | |
| Supabase project reference | |
| PostgreSQL/Supabase version | |
| Repository commit | |
| Operator | |
| Role/JWT used | anon / Staff / Owner / service_role |
| SQL Editor query/history ID | |
| Fixture IDs | |
| Started/completed UTC | |
| Expected result | |
| Actual result | |
| SQLSTATE/HTTP status | |
| Screenshot/export location | |
| Pass / Fail / Blocked | |
| Notes | |

Redact tokens and secrets before storing evidence.

## 25. Fixture cleanup

Cleanup is optional because the project is disposable. If performed:

1. Confirm every target identity begins with `h7:`.
2. Export evidence first.
3. Delete child records before parents.
4. Do not use broad wildcards without first selecting and recording targets.
5. Re-run Legacy preservation hashes.
6. Prefer destroying the entire disposable project after approval.

Never copy cleanup SQL to production.

## 26. Explicit stop conditions

Stop immediately and mark H7 failed or blocked if:

- the selected project is not the disposable rehearsal project;
- baseline backup/export cannot be verified;
- any migration reports an error, warning requiring interpretation, or partial
  execution;
- an expected object, signature, constraint, index, trigger, policy, or view is
  missing;
- an unexpected overload or obsolete privileged RPC remains executable;
- anonymous users can read engine data or invoke privileged functions;
- Staff can save policy/template versions or invoke server-only functions;
- Owner authorization trusts caller-supplied audit identity;
- service-only functions are accessible with browser roles;
- immutable template rows can be updated or deleted;
- concurrent claims overlap;
- a future retry is claimed early;
- a terminal or sent Delivery is reclaimed;
- expired claims cannot be recovered exactly once;
- completion creates duplicate Attempts or Inbox entries;
- aggregate state differs from Delivery outcomes;
- parity evidence hides a missing Business Event, Notification, or Delivery;
- Legacy template, activity, or Staff Inbox data changes unexpectedly;
- any Resend, Twilio, SMS, or other provider request occurs; or
- complete evidence cannot be retained.

Do not patch SQL in the rehearsal project and continue. Preserve the failing
state, exact SQL, output, project version, and fixture identities.

## 27. H7 approval criteria

H7 may be approved only when all are true:

- the disposable project matches the documented production database version
  and relevant configuration;
- backup and restore preparation is evidenced;
- all twelve migrations apply in exact order without edits or errors;
- the complete schema inventory matches the repository;
- constraints, indexes, triggers, views, and RPC signatures pass;
- anonymous, Staff, Owner, and service-role authorization results match the
  approved model;
- Owner policy versioning and audit identity pass;
- immutable draft/published template behavior passes;
- real concurrent claims do not overlap;
- Staff and Resend database completion paths are idempotent;
- retry and claim recovery pass using real database time;
- aggregate refresh passes every state combination;
- verification expectations expose missing and mismatched records;
- Legacy template, activity, and Staff Inbox data are preserved;
- no provider is invoked;
- every migration and test has retained evidence; and
- the rehearsal lead, security verifier, database operator, and stop authority
  sign the result.

Approval:

| Role | Name | Decision | UTC date/time | Evidence/notes |
|---|---|---|---|---|
| Rehearsal lead | | Approve / Reject | | |
| Database operator | | Approve / Reject | | |
| Security verifier | | Approve / Reject | | |
| Stop authority | | Approve / Reject | | |

After approval, use the Production Verification Plan for production backup,
migration application, Verify Mode entry, and rollback control. Approval of H7
does not authorize Authoritative Mode.
