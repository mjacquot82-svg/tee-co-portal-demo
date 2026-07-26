# Notification Engine SMS Authoritative Cutover

## Status and scope

This is the production operating procedure for promoting `quote_approved`
customer SMS from Verify to Authoritative delivery through Twilio. It extends,
but does not replace, the
[Notification Engine production verification plan](../testing/notification-engine-production-verification.md)
and the Phase 2I controlled-cutover design in the
[Notification Engine implementation roadmap](../architecture/notification-engine-implementation-roadmap.md#phase-2i--controlled-cutover-and-legacy-retirement).

This procedure does not authorize SMS for another event. Business Event,
Notification, content, recipient, and Delivery creation must already pass the
Verify gates in the production verification plan.

The mandatory progression is:

`Verify → SMS server gate → Verify validation → Authoritative → single canary → soak period → general availability`

## Safety model

Three independent conditions are required before Twilio can be invoked:

1. `NOTIFICATION_ENGINE_SMS_CUTOVER=true` in the server Functions environment;
2. a new authoritative Notification whose
   `engine_metadata.phase2D.dispatcherEligible` is `true`; and
3. an eligible SMS Delivery and policy snapshot accepted by the service-role
   database claim function.

The scheduled function checks the server gate before configuration validation,
recovery, dispatch-run creation, claiming, adapter construction, or provider
invocation. The dispatcher library also fails closed when called without the
enabled gate. Database recovery, claim, and completion functions independently
require `phase2D.dispatcherEligible=true`.

Verify records remain ineligible because they are observation-only and record
dispatcher eligibility as false.

## Prerequisites

### Authorization and operations

- Owner approval exists for one controlled production SMS.
- Deployment operator, database operator, verification lead, and stop authority
  are named.
- A low-risk window and approved E.164 canary recipient are recorded.
- The recipient has consented to the production SMS.
- Operators can inspect Netlify runs, Notification Engine tables, and Twilio
  message records.
- Controlled `quote_approved` actions can be paused for activation or rollback.

### Application and database

- Production runs the reviewed release containing the SMS server gate.
- `supabase/notification-engine-twilio-sms-adapter.sql` has been applied after
  the `dispatcherEligible` predicates were added.
- The following service-role-only RPCs exist:
  - `start_twilio_sms_dispatch_run`
  - `recover_abandoned_twilio_sms_claims_authoritative`
  - `claim_twilio_sms_deliveries_authoritative`
  - `complete_twilio_sms_delivery_authoritative`
  - `complete_notification_dispatch_run`
- Delivery identity, Delivery idempotency, Attempt identity, Attempt-number,
  claim-lease, retry-lifecycle, and aggregate-refresh constraints are present.
- No unexplained authoritative SMS Delivery is queued, processing, or due for
  retry.

### Verify evidence

For a real `quote_approved` occurrence, retain evidence of:

- one Business Event and one Notification;
- exactly the policy-enabled Delivery branches;
- correct customer phone and normalized destination;
- assigned published immutable SMS template version;
- fully rendered SMS content;
- observation-only and non-dispatcher-eligible state;
- stable Delivery idempotency key;
- zero Attempts and zero provider messages.

Do not proceed with any unresolved parity failure.

## Environment configuration

The following variables are implemented:

| Variable | Scope | Verify value | Authoritative canary value |
|---|---|---:|---:|
| `VITE_NOTIFICATION_ENGINE_CUTOVER_MODE` | Builds and Functions | `verify` | `authoritative` |
| `NOTIFICATION_ENGINE_SMS_CUTOVER` | Functions only | `false`, then `true` for gate validation | `true` |
| `TWILIO_ACCOUNT_SID` | Functions only, secret | configured behind disabled gate | configured |
| `TWILIO_AUTH_TOKEN` | Functions only, secret | configured behind disabled gate | configured |
| `TWILIO_FROM_NUMBER` | Functions only | approved E.164 sender | approved E.164 sender |
| `SUPABASE_URL` or `VITE_SUPABASE_URL` | Functions | configured | configured |
| `SUPABASE_SERVICE_ROLE_KEY` | Functions only, secret | configured | configured |

Never expose Twilio credentials with a `VITE_` prefix.

`NOTIFICATION_ENGINE_ORDER_APPROVED_CUTOVER` remains governed by the existing
email/staff procedure. Because client cutover mode is global for
`quote_approved`, every policy-enabled authoritative channel must have its
server capability healthy before changing the client mode.

## Provider readiness

- Use the approved production Twilio account and SMS-capable sender.
- Confirm account balance, geographic permissions, rate limits, sender
  registration, and applicable toll-free or A2P registration.
- Confirm the canary destination and sender are valid E.164 values.
- Confirm message content, consent, quiet-hours, opt-out, and regional
  compliance requirements.
- Do not log the auth token or persist it in Notification Engine data.

## Controlled activation

### 1. Deploy with the gate disabled

Deploy the reviewed release with:

```text
VITE_NOTIFICATION_ENGINE_CUTOVER_MODE=verify
NOTIFICATION_ENGINE_SMS_CUTOVER=false
```

Confirm the production commit. A scheduled invocation must return:

```json
{
  "executed": false,
  "gateEnabled": false,
  "reason": "sms_cutover_disabled"
}
```

It must create no dispatch run, perform no recovery or claim, create no
Attempt, and invoke no provider.

### 2. Configure Twilio behind the disabled gate

Configure the account SID, auth token, and sender number. Redeploy or refresh
the Functions environment. Reconfirm the disabled-gate response and zero
database/provider activity.

### 3. Enable the SMS server gate while remaining in Verify

Set:

```text
NOTIFICATION_ENGINE_SMS_CUTOVER=true
VITE_NOTIFICATION_ENGINE_CUTOVER_MODE=verify
```

Deploy or refresh the server environment. Keep workflow actions paused.
Observe at least two scheduled cycles and require:

- healthy completed dispatch runs;
- zero recovered, claimed, completed, and failed Deliveries;
- no Attempt;
- no Twilio request or Message SID;
- all Verify SMS Deliveries remain observation-only and
  dispatcher-ineligible.

Use this read-only production query to confirm no eligible backlog:

```sql
select
  d.id,
  d.status,
  d.next_retry_at,
  n.event_type,
  n.engine_metadata ->> 'observationOnly' as observation_only,
  n.engine_metadata #>> '{phase2D,dispatcherEligible}'
    as dispatcher_eligible
from public.notification_deliveries d
join public.notifications n on n.id = d.notification_id
where d.channel = 'sms'
  and d.status in ('queued', 'processing', 'retry_scheduled')
  and not coalesce(
    (n.engine_metadata ->> 'observationOnly')::boolean,
    true
  )
  and coalesce(
    (n.engine_metadata #>> '{phase2D,dispatcherEligible}')::boolean,
    false
  );
```

The result must be empty.

### 4. Switch the client to Authoritative

Only after server-gate validation passes, set:

```text
VITE_NOTIFICATION_ENGINE_CUTOVER_MODE=authoritative
```

Deploy and confirm the exact production commit and compiled client mode.
Non-`quote_approved` events must continue falling back to Legacy.

Do not alter existing Verify records. Only a newly created authoritative
Notification may become dispatcher eligible.

### 5. Single canary

Resume exactly one approved `quote_approved` DTF workflow. Do not approve a
second order until the canary is reconciled.

Confirm:

1. one Business Event;
2. one Notification;
3. exactly the policy-enabled Deliveries;
4. one authoritative SMS Delivery with correct destination, immutable template,
   rendered body, and idempotency key;
5. Notification `observationOnly=false`;
6. Notification `phase2D.dispatcherEligible=true`;
7. exactly one scheduled run claims the SMS Delivery;
8. exactly one immutable Delivery Attempt;
9. Attempt and Delivery `provider_key='twilio'`;
10. the same Twilio Message SID on Attempt, Delivery, and provider evidence;
11. database Delivery status `sent`;
12. Twilio reports the SID as `delivered`;
13. the intended handset receives exactly one correct message.

Use this read-only query, replacing `TC-CANARY`:

```sql
with target_event as (
  select e.*
  from public.notification_business_events e
  where e.event_type = 'quote_approved'
    and (
      e.correlation_id = 'order:TC-CANARY'
      or e.payload #>> '{legacyNotificationContext,orderNumber}' = 'TC-CANARY'
    )
),
target_notification as (
  select n.*
  from public.notifications n
  join target_event e on e.id = n.business_event_id
),
target_sms as (
  select d.*
  from public.notification_deliveries d
  join target_notification n on n.id = d.notification_id
  where d.channel = 'sms'
),
target_attempts as (
  select a.*
  from public.notification_delivery_attempts a
  join target_sms d on d.id = a.delivery_id
)
select
  (select count(*) from target_event) as business_event_count,
  (select count(*) from target_notification) as notification_count,
  (select count(*) from target_sms) as sms_delivery_count,
  (select count(*) from target_attempts) as attempt_count,
  (select count(distinct provider_message_id)
   from target_attempts
   where provider_message_id <> '') as attempt_provider_message_count,
  (select bool_and(
     coalesce(
       (engine_metadata ->> 'observationOnly')::boolean,
       true
     ) is false
     and coalesce(
       (engine_metadata #>> '{phase2D,dispatcherEligible}')::boolean,
       false
     ) is true
   ) from target_notification) as authoritative_and_dispatcher_eligible,
  (select jsonb_agg(jsonb_build_object(
    'delivery_id', d.id,
    'status', d.status,
    'destination', d.destination_snapshot,
    'template_version_id', d.template_version_id,
    'template_version', d.template_version,
    'rendered_content', d.rendered_content,
    'idempotency_key', d.idempotency_key,
    'attempt_count', d.attempt_count,
    'provider_key', d.provider_key,
    'provider_message_id', d.provider_message_id
  )) from target_sms d) as sms_delivery_evidence,
  (select jsonb_agg(jsonb_build_object(
    'attempt_id', a.id,
    'attempt_number', a.attempt_number,
    'provider_key', a.provider_key,
    'provider_idempotency_key', a.provider_idempotency_key,
    'outcome', a.outcome,
    'retryability', a.retryability,
    'provider_message_id', a.provider_message_id,
    'provider_metadata', a.provider_metadata
  )) from target_attempts a) as attempt_evidence;
```

The database proves durable provider acceptance and the Twilio SID. The current
implementation does not ingest Twilio status callbacks, so final carrier
`delivered` status must be captured from Twilio and the receiving handset.

### 6. Soak period

Keep the canary as the only authorized SMS through the agreed soak period.
Observe at least two later scheduler cycles and confirm:

- no reclaim of the sent Delivery;
- Attempt count remains one;
- no second SID or handset message;
- no unexplained queue, retry, expired claim, or aggregate mismatch;
- Twilio billing reflects one message.

Any retry or indeterminate result extends the soak until reconciled.

### 7. General availability

General availability requires written Owner and stop-authority approval after
the canary and soak pass. Increase volume gradually, retain the server gate as
the kill switch, and continue monitoring. Another event requires its own Verify
evidence and explicit authorization.

## Idempotency and uncertainty

The engine guarantees deterministic Business Event, Notification, Delivery,
and Attempt identities; unique Delivery idempotency keys; transactional claims;
`FOR UPDATE SKIP LOCKED`; expiring leases; deterministic Attempt numbering; and
retry reuse of the Delivery idempotency key.

Twilio's Messages request in this implementation does not supply a
provider-supported idempotency header. A transport-indeterminate result after
provider acceptance is therefore not safe to replay automatically without
reconciling Twilio logs. Never manually resend an indeterminate Delivery.

## Monitoring and stop conditions

Monitor dispatch-run status and counts, queue age, processing lease expiry,
retry schedules, Attempt count, Twilio errors and SIDs, aggregate status,
account balance, rate limits, billing, opt-outs, and complaints.

Stop and roll back for any unexpected claim, duplicate Attempt or SID, wrong
recipient/content, missing evidence, stuck claim, indeterminate result,
unexplained retry, aggregate mismatch, or unrelated SMS.

## Rollback

The order is mandatory:

1. Pause controlled `quote_approved` actions.
2. Set `NOTIFICATION_ENGINE_SMS_CUTOVER=false`.
3. Deploy or refresh the Functions environment first.
4. Confirm scheduled invocations return `sms_cutover_disabled` and create no
   runs, recoveries, claims, Attempts, or provider calls.
5. Set `VITE_NOTIFICATION_ENGINE_CUTOVER_MODE=verify`.
6. Deploy and confirm new records are observation-only and
   dispatcher-ineligible.
7. Preserve all events, Notifications, Deliveries, Attempts, runs, history, and
   SIDs.
8. Reconcile processing, retry-scheduled, and indeterminate records against
   Twilio before any retry or manual send.
9. Observe two scheduler cycles with zero authoritative activity.
10. Record UTC rollback time, release, affected identities, customer impact,
    and follow-up owner.

Client mode is global for `quote_approved`; SMS cannot independently return to
Verify while other Notification Engine channels remain Authoritative. The
server SMS gate is therefore the immediate channel-specific stop, followed by
the full client rollback to Verify.

## Post-cutover verification

- Retain canary, scheduler, database, provider, and handset evidence.
- Review every scheduled run during soak.
- Confirm no duplicate identities, Attempts, SIDs, or messages.
- Confirm all retries and indeterminate outcomes are reconciled.
- Confirm provider billing matches the authorized message count.
- Keep the SMS server gate documented and immediately operable.
- Revalidate consent and compliance controls before volume expansion.
- Do not authorize another event through this procedure.
