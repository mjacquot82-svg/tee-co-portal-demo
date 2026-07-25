-- Notification Engine Phase 2I: controlled cutover and parity verification.
-- Order Approved email is the only external event eligible for authoritative cutover.

create or replace function public.claim_resend_email_delivery_cutover(
  p_delivery_id text,
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns table (
  delivery jsonb,
  notification jsonb,
  business_event jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim_token text;
begin
  if nullif(trim(p_delivery_id), '') is null
    or nullif(trim(p_worker_id), '') is null
  then
    raise exception 'Cutover Delivery and worker identities are required.';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 5 or p_lease_seconds > 900 then
    raise exception 'Dispatcher lease must be between 5 and 900 seconds.';
  end if;

  v_claim_token := concat(
    'resend-cutover:',
    p_worker_id,
    ':',
    md5(random()::text || clock_timestamp()::text)
  );

  return query
  with eligible as (
    select d.id
    from public.notification_deliveries d
    join public.notifications n on n.id = d.notification_id
    where d.id = p_delivery_id
      and d.channel = 'email'
      and n.event_type = 'quote_approved'
      and d.status in ('queued', 'retry_scheduled')
      and (d.next_retry_at is null or d.next_retry_at <= clock_timestamp())
      and not coalesce(
        (n.engine_metadata ->> 'observationOnly')::boolean,
        true
      )
      and not coalesce(
        (d.destination_snapshot ->> 'observationOnly')::boolean,
        true
      )
    for update of d skip locked
  ),
  claimed as (
    update public.notification_deliveries d
    set
      status = 'processing',
      claim_token = v_claim_token,
      claimed_at = clock_timestamp(),
      claim_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      processing_at = clock_timestamp()
    from eligible
    where d.id = eligible.id
    returning d.*
  )
  select to_jsonb(claimed), to_jsonb(n), to_jsonb(e)
  from claimed
  join public.notifications n on n.id = claimed.notification_id
  join public.notification_business_events e on e.id = n.business_event_id;
end;
$$;

create or replace function public.complete_resend_email_delivery_cutover(
  p_delivery_id text,
  p_claim_token text,
  p_attempt_id text,
  p_attempt_number integer,
  p_outcome text,
  p_retryability text,
  p_provider_message_id text,
  p_failure_code text,
  p_failure_reason text,
  p_provider_metadata jsonb,
  p_max_attempts integer,
  p_base_delay_seconds integer,
  p_max_delay_seconds integer,
  p_started_at timestamptz,
  p_completed_at timestamptz
)
returns public.notification_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.notification_deliveries;
begin
  if not exists (
    select 1
    from public.notification_deliveries d
    join public.notifications n on n.id = d.notification_id
    where d.id = p_delivery_id
      and d.channel = 'email'
      and n.event_type = 'quote_approved'
      and not coalesce((d.destination_snapshot ->> 'observationOnly')::boolean, true)
  ) then
    raise exception 'Delivery is not eligible for authoritative Resend completion.';
  end if;

  select public.complete_resend_email_delivery_observation(
    p_delivery_id,
    p_claim_token,
    p_attempt_id,
    p_attempt_number,
    p_outcome,
    p_retryability,
    p_provider_message_id,
    p_failure_code,
    p_failure_reason,
    coalesce(p_provider_metadata, '{}'::jsonb)
      || jsonb_build_object('cutoverMode', 'authoritative'),
    p_max_attempts,
    p_base_delay_seconds,
    p_max_delay_seconds,
    p_started_at,
    p_completed_at
  ) into v_delivery;

  update public.notification_delivery_attempts
  set provider_metadata =
    (provider_metadata - 'observationOnly')
      || jsonb_build_object(
        'observationOnly',
        false,
        'cutoverMode',
        'authoritative'
      )
  where id = p_attempt_id
    and delivery_id = p_delivery_id;

  return v_delivery;
end;
$$;

create or replace view public.notification_engine_cutover_verification as
with delivery_counts as (
  select
    n.id as notification_id,
    count(d.id) as delivery_count,
    count(distinct concat_ws(
      ':',
      d.channel,
      d.recipient_type,
      d.recipient_key,
      d.destination_key,
      d.template_version_id
    )) as unique_delivery_count,
    count(d.id) filter (
      where (d.channel = 'email' and not coalesce((n.policy_snapshot ->> 'email_enabled')::boolean, false))
         or (d.channel = 'sms' and not coalesce((n.policy_snapshot ->> 'sms_enabled')::boolean, false))
         or (d.channel = 'staff' and not coalesce((n.policy_snapshot ->> 'staff_notification_enabled')::boolean, false))
    ) as disabled_channel_delivery_count,
    count(d.id) filter (where d.status in ('sent', 'delivered')) as successful_count,
    count(d.id) filter (where d.status = 'failed') as failed_count,
    count(d.id) filter (where d.status in ('queued', 'processing', 'retry_scheduled')) as pending_count,
    count(d.id) filter (where d.status in ('not_deliverable', 'suppressed', 'cancelled')) as non_delivery_count
  from public.notifications n
  left join public.notification_deliveries d on d.notification_id = n.id
  group by n.id
),
notification_counts as (
  select business_event_id, count(*) as notification_count
  from public.notifications
  group by business_event_id
),
business_event_counts as (
  select
    event_type,
    subject_type,
    subject_id,
    occurrence_id,
    count(*) as business_event_identity_count
  from public.notification_business_events
  group by event_type, subject_type, subject_id, occurrence_id
)
select
  e.id as business_event_id,
  e.event_type,
  e.subject_type,
  e.subject_id,
  e.occurrence_id,
  n.id as notification_id,
  bec.business_event_identity_count,
  nc.notification_count,
  dc.delivery_count,
  dc.unique_delivery_count,
  dc.disabled_channel_delivery_count,
  n.status as notification_status,
  case
    when dc.delivery_count = 0 or dc.non_delivery_count = dc.delivery_count then 'no_delivery'
    when dc.successful_count > 0 and (dc.failed_count > 0 or dc.pending_count > 0) then 'partially_successful'
    when dc.pending_count > 0 then 'queued'
    when dc.failed_count > 0 and dc.successful_count = 0 then 'failed'
    when dc.failed_count > 0 and dc.successful_count > 0 then 'partially_successful'
    when dc.successful_count > 0 then 'completed'
    else 'no_delivery'
  end as calculated_aggregate_status,
  nc.notification_count = 1 as exactly_one_notification,
  dc.delivery_count = dc.unique_delivery_count as deliveries_unique,
  dc.disabled_channel_delivery_count = 0 as disabled_channels_empty,
  n.status = case
    when dc.delivery_count = 0 or dc.non_delivery_count = dc.delivery_count then 'no_delivery'
    when dc.successful_count > 0 and (dc.failed_count > 0 or dc.pending_count > 0) then 'partially_successful'
    when dc.pending_count > 0 then 'queued'
    when dc.failed_count > 0 and dc.successful_count = 0 then 'failed'
    when dc.failed_count > 0 and dc.successful_count > 0 then 'partially_successful'
    when dc.successful_count > 0 then 'completed'
    else 'no_delivery'
  end as aggregate_matches,
  bec.business_event_identity_count = 1 as exactly_one_business_event
from public.notification_business_events e
join public.notifications n on n.business_event_id = e.id
join notification_counts nc on nc.business_event_id = e.id
join delivery_counts dc on dc.notification_id = n.id
join business_event_counts bec
  on bec.event_type = e.event_type
 and bec.subject_type = e.subject_type
 and bec.subject_id = e.subject_id
 and bec.occurrence_id = e.occurrence_id;

revoke all on function public.claim_resend_email_delivery_cutover(
  text, text, integer
) from public;
revoke all on function public.complete_resend_email_delivery_cutover(
  text, text, text, integer, text, text, text, text, text, jsonb,
  integer, integer, integer, timestamptz, timestamptz
) from public;

grant execute on function public.claim_resend_email_delivery_cutover(
  text, text, integer
) to service_role;
grant execute on function public.complete_resend_email_delivery_cutover(
  text, text, text, integer, text, text, text, text, text, jsonb,
  integer, integer, integer, timestamptz, timestamptz
) to service_role;
