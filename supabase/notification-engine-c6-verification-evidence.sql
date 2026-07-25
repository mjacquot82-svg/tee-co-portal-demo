-- Notification Engine production-readiness remediation C6.
-- Additive Verify Mode evidence and parity gates only; runtime behavior is unchanged.

create table if not exists public.notification_verification_expectations (
  id text primary key,
  event_type text not null,
  subject_type text not null,
  subject_id text not null,
  occurrence_id text not null,
  source_table text not null,
  source_record_id text not null,
  source_occurred_at timestamptz not null,
  expected_branches jsonb not null default '[]'::jsonb,
  evidence_metadata jsonb not null default '{}'::jsonb,
  recorded_by text not null default '',
  recorded_at timestamptz not null default timezone('utc', now()),
  constraint notification_verification_expectations_supported_event
    check (
      event_type in (
        'new_customer_request',
        'quote_ready_for_approval',
        'quote_approved',
        'artwork_revision_requested',
        'artwork_approved',
        'deposit_requested',
        'payment_request_created',
        'payment_received',
        'payment_failed',
        'order_in_production',
        'order_ready_for_pickup',
        'order_completed'
      )
    ),
  constraint notification_verification_expectations_identity_unique
    unique (event_type, subject_type, subject_id, occurrence_id),
  constraint notification_verification_expectations_branches_array
    check (jsonb_typeof(expected_branches) = 'array')
);

create index if not exists notification_verification_expectations_source_idx
  on public.notification_verification_expectations (
    source_table,
    source_record_id,
    source_occurred_at
  );

alter table public.notification_verification_expectations enable row level security;
revoke all on table public.notification_verification_expectations
  from anon, authenticated;
grant select on table public.notification_verification_expectations
  to authenticated;
grant all on table public.notification_verification_expectations
  to service_role;

drop policy if exists "Operational users read notification verification evidence"
  on public.notification_verification_expectations;
create policy "Operational users read notification verification evidence"
on public.notification_verification_expectations
for select
to authenticated
using (public.is_notification_engine_operational_user());

create or replace function public.record_notification_verification_expectation(
  p_id text,
  p_event_type text,
  p_subject_type text,
  p_subject_id text,
  p_occurrence_id text,
  p_source_table text,
  p_source_record_id text,
  p_source_occurred_at timestamptz,
  p_expected_branches jsonb,
  p_evidence_metadata jsonb default '{}'::jsonb
)
returns public.notification_verification_expectations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.notification_verification_expectations;
begin
  if coalesce(trim(p_id), '') = ''
    or coalesce(trim(p_event_type), '') = ''
    or coalesce(trim(p_subject_type), '') = ''
    or coalesce(trim(p_subject_id), '') = ''
    or coalesce(trim(p_occurrence_id), '') = ''
    or coalesce(trim(p_source_table), '') = ''
    or coalesce(trim(p_source_record_id), '') = ''
    or p_source_occurred_at is null then
    raise exception 'Complete workflow occurrence evidence is required.';
  end if;
  if jsonb_typeof(coalesce(p_expected_branches, '[]'::jsonb)) <> 'array' then
    raise exception 'Expected Delivery branches must be an array.';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(coalesce(p_expected_branches, '[]'::jsonb)) branch
     group by
       lower(trim(coalesce(branch ->> 'channel', ''))),
       trim(coalesce(branch ->> 'recipient_type', '')),
       trim(coalesce(branch ->> 'recipient_key', '')),
       trim(coalesce(branch ->> 'destination_key', ''))
    having count(*) > 1
  ) then
    raise exception 'Expected Delivery branches must be unique.';
  end if;

  insert into public.notification_verification_expectations (
    id,
    event_type,
    subject_type,
    subject_id,
    occurrence_id,
    source_table,
    source_record_id,
    source_occurred_at,
    expected_branches,
    evidence_metadata,
    recorded_by
  )
  values (
    trim(p_id),
    trim(p_event_type),
    trim(p_subject_type),
    trim(p_subject_id),
    trim(p_occurrence_id),
    trim(p_source_table),
    trim(p_source_record_id),
    p_source_occurred_at,
    coalesce(p_expected_branches, '[]'::jsonb),
    coalesce(p_evidence_metadata, '{}'::jsonb),
    'service_role'
  )
  on conflict (event_type, subject_type, subject_id, occurrence_id)
  do update set
    source_table = excluded.source_table,
    source_record_id = excluded.source_record_id,
    source_occurred_at = excluded.source_occurred_at,
    expected_branches = excluded.expected_branches,
    evidence_metadata = excluded.evidence_metadata,
    recorded_by = excluded.recorded_by,
    recorded_at = timezone('utc', now())
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.record_notification_verification_expectation(
  text, text, text, text, text, text, text, timestamptz, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.record_notification_verification_expectation(
  text, text, text, text, text, text, text, timestamptz, jsonb, jsonb
) to service_role;

create or replace view public.notification_engine_parity_verification
with (security_invoker = true)
as
with event_matches as (
  select
    expectation.id as expectation_id,
    event.id as business_event_id
  from public.notification_verification_expectations expectation
  left join public.notification_business_events event
    on event.event_type = expectation.event_type
   and event.subject_type = expectation.subject_type
   and event.subject_id = expectation.subject_id
   and event.occurrence_id = expectation.occurrence_id
),
event_rollup as (
  select expectation_id, count(business_event_id) as business_event_count
  from event_matches
  group by expectation_id
),
notification_matches as (
  select
    event.expectation_id,
    notification.id as notification_id,
    notification.status as notification_status,
    notification.policy_snapshot
  from event_matches event
  left join public.notifications notification
    on notification.business_event_id = event.business_event_id
),
delivery_rollup as (
  select
    notification.id as notification_id,
    count(delivery.id) as delivery_count,
    count(delivery.id) filter (
      where delivery.status in ('sent', 'delivered')
    ) as successful_count,
    count(delivery.id) filter (
      where delivery.status = 'failed'
    ) as failed_count,
    count(delivery.id) filter (
      where delivery.status in ('queued', 'processing', 'retry_scheduled')
    ) as pending_count,
    count(delivery.id) filter (
      where delivery.status in ('not_deliverable', 'suppressed', 'cancelled')
    ) as non_delivery_count
  from public.notifications notification
  left join public.notification_deliveries delivery
    on delivery.notification_id = notification.id
  group by notification.id
),
notification_rollup as (
  select
    match.expectation_id,
    count(match.notification_id) as notification_count,
    coalesce(
      bool_and(
        match.notification_status = case
          when delivery.delivery_count = 0
            or delivery.non_delivery_count = delivery.delivery_count
            then 'no_delivery'
          when delivery.successful_count > 0
            and (delivery.failed_count > 0 or delivery.pending_count > 0)
            then 'partially_successful'
          when delivery.pending_count > 0 then 'queued'
          when delivery.failed_count > 0
            and delivery.successful_count = 0 then 'failed'
          when delivery.failed_count > 0
            and delivery.successful_count > 0 then 'partially_successful'
          when delivery.successful_count > 0 then 'completed'
          else 'no_delivery'
        end
      ) filter (where match.notification_id is not null),
      false
    ) as aggregate_matches
  from notification_matches match
  left join delivery_rollup delivery
    on delivery.notification_id = match.notification_id
  group by match.expectation_id
),
expected_branch_counts as (
  select
    expectation.id as expectation_id,
    lower(trim(coalesce(branch ->> 'channel', ''))) as channel,
    trim(coalesce(branch ->> 'recipient_type', '')) as recipient_type,
    trim(coalesce(branch ->> 'recipient_key', '')) as recipient_key,
    trim(coalesce(branch ->> 'destination_key', '')) as destination_key,
    count(*) as expected_count
  from public.notification_verification_expectations expectation
  cross join lateral jsonb_array_elements(expectation.expected_branches) branch
  group by
    expectation.id,
    lower(trim(coalesce(branch ->> 'channel', ''))),
    trim(coalesce(branch ->> 'recipient_type', '')),
    trim(coalesce(branch ->> 'recipient_key', '')),
    trim(coalesce(branch ->> 'destination_key', ''))
),
actual_branch_counts as (
  select
    match.expectation_id,
    delivery.channel,
    delivery.recipient_type,
    delivery.recipient_key,
    delivery.destination_key,
    count(*) as actual_count
  from notification_matches match
  join public.notification_deliveries delivery
    on delivery.notification_id = match.notification_id
  group by
    match.expectation_id,
    delivery.channel,
    delivery.recipient_type,
    delivery.recipient_key,
    delivery.destination_key
),
branch_differences as (
  select
    coalesce(expected.expectation_id, actual.expectation_id) as expectation_id,
    coalesce(expected.expected_count, 0) as expected_count,
    coalesce(actual.actual_count, 0) as actual_count
  from expected_branch_counts expected
  full join actual_branch_counts actual
    on actual.expectation_id = expected.expectation_id
   and actual.channel = expected.channel
   and actual.recipient_type = expected.recipient_type
   and actual.recipient_key = expected.recipient_key
   and actual.destination_key = expected.destination_key
),
branch_rollup as (
  select
    expectation_id,
    sum(expected_count) as expected_delivery_count,
    sum(actual_count) as actual_delivery_count,
    sum(greatest(expected_count - actual_count, 0)) as missing_delivery_count,
    sum(greatest(actual_count - expected_count, 0)) as unexpected_delivery_count,
    sum(greatest(actual_count - 1, 0)) as duplicate_delivery_count
  from branch_differences
  group by expectation_id
),
disabled_channel_rollup as (
  select
    match.expectation_id,
    count(delivery.id) filter (
      where (delivery.channel = 'email'
          and not coalesce((match.policy_snapshot ->> 'email_enabled')::boolean, false))
         or (delivery.channel = 'sms'
          and not coalesce((match.policy_snapshot ->> 'sms_enabled')::boolean, false))
         or (delivery.channel = 'staff'
          and not coalesce((match.policy_snapshot ->> 'staff_notification_enabled')::boolean, false))
    ) as disabled_channel_delivery_count
  from notification_matches match
  left join public.notification_deliveries delivery
    on delivery.notification_id = match.notification_id
  group by match.expectation_id
)
select
  expectation.id as expectation_id,
  expectation.event_type,
  expectation.subject_type,
  expectation.subject_id,
  expectation.occurrence_id,
  expectation.source_table,
  expectation.source_record_id,
  expectation.source_occurred_at,
  coalesce(event.business_event_count, 0) as business_event_count,
  coalesce(notification.notification_count, 0) as notification_count,
  coalesce(branch.expected_delivery_count, 0) as expected_delivery_count,
  coalesce(branch.actual_delivery_count, 0) as actual_delivery_count,
  coalesce(branch.missing_delivery_count, 0) as missing_delivery_count,
  coalesce(branch.unexpected_delivery_count, 0) as unexpected_delivery_count,
  coalesce(branch.duplicate_delivery_count, 0) as duplicate_delivery_count,
  coalesce(disabled.disabled_channel_delivery_count, 0)
    as disabled_channel_delivery_count,
  coalesce(event.business_event_count, 0) = 1
    as exactly_one_business_event,
  coalesce(notification.notification_count, 0) = 1
    as exactly_one_notification,
  coalesce(branch.missing_delivery_count, 0) = 0
    and coalesce(branch.unexpected_delivery_count, 0) = 0
    and coalesce(branch.duplicate_delivery_count, 0) = 0
    as delivery_branches_match,
  coalesce(disabled.disabled_channel_delivery_count, 0) = 0
    as disabled_channels_empty,
  coalesce(notification.aggregate_matches, false) as aggregate_matches,
  coalesce(event.business_event_count, 0) = 1
    and coalesce(notification.notification_count, 0) = 1
    and coalesce(branch.missing_delivery_count, 0) = 0
    and coalesce(branch.unexpected_delivery_count, 0) = 0
    and coalesce(branch.duplicate_delivery_count, 0) = 0
    and coalesce(disabled.disabled_channel_delivery_count, 0) = 0
    and coalesce(notification.aggregate_matches, false)
    as parity_passed
from public.notification_verification_expectations expectation
left join event_rollup event on event.expectation_id = expectation.id
left join notification_rollup notification
  on notification.expectation_id = expectation.id
left join branch_rollup branch on branch.expectation_id = expectation.id
left join disabled_channel_rollup disabled
  on disabled.expectation_id = expectation.id;

revoke all on table public.notification_engine_parity_verification
  from anon, authenticated;
grant select on table public.notification_engine_parity_verification
  to authenticated, service_role;
