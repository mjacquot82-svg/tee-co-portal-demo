-- Notification Engine Phase 2E: Staff Internal Adapter
-- Additive Staff Inbox identity links and staff-only observation dispatch.

alter table public.staff_notifications
  add column if not exists business_event_id text
    references public.notification_business_events(id),
  add column if not exists notification_id text
    references public.notifications(id),
  add column if not exists delivery_id text
    references public.notification_deliveries(id),
  add column if not exists delivery_attempt_id text;

create unique index if not exists staff_notifications_delivery_unique
  on public.staff_notifications (delivery_id)
  where delivery_id is not null;

create unique index if not exists staff_notifications_attempt_unique
  on public.staff_notifications (delivery_attempt_id)
  where delivery_attempt_id is not null;

create or replace function public.claim_staff_notification_deliveries_observation(
  p_worker_id text,
  p_limit integer default 25,
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
  if nullif(trim(p_worker_id), '') is null then
    raise exception 'Dispatcher worker id is required.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Dispatcher claim limit must be between 1 and 100.';
  end if;
  if p_lease_seconds is null
    or p_lease_seconds < 5
    or p_lease_seconds > 900
  then
    raise exception 'Dispatcher lease must be between 5 and 900 seconds.';
  end if;

  v_claim_token := concat(
    'staff-observation:',
    p_worker_id,
    ':',
    md5(random()::text || clock_timestamp()::text)
  );

  return query
  with eligible as (
    select d.id
    from public.notification_deliveries d
    join public.notifications n on n.id = d.notification_id
    where
      d.channel = 'staff'
      and (
        d.status = 'queued'
        or (
          d.status = 'processing'
          and d.claim_expires_at is not null
          and d.claim_expires_at <= clock_timestamp()
        )
      )
      and coalesce(
        (n.engine_metadata ->> 'observationOnly')::boolean,
        false
      )
      and coalesce(
        (d.destination_snapshot ->> 'observationOnly')::boolean,
        false
      )
    order by d.queued_at nulls last, d.created_at, d.id
    for update of d skip locked
    limit p_limit
  ),
  claimed as (
    update public.notification_deliveries d
    set
      status = 'processing',
      claim_token = v_claim_token,
      claimed_at = clock_timestamp(),
      claim_expires_at =
        clock_timestamp() + make_interval(secs => p_lease_seconds),
      processing_at = clock_timestamp()
    from eligible
    where d.id = eligible.id
    returning d.*
  )
  select
    to_jsonb(claimed),
    to_jsonb(n),
    to_jsonb(e)
  from claimed
  join public.notifications n on n.id = claimed.notification_id
  join public.notification_business_events e on e.id = n.business_event_id;
end;
$$;

create or replace function public.complete_staff_internal_delivery_observation(
  p_delivery_id text,
  p_claim_token text,
  p_attempt_id text,
  p_attempt_number integer,
  p_staff_notification_id text,
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
  if nullif(trim(p_claim_token), '') is null
    or nullif(trim(p_staff_notification_id), '') is null
  then
    raise exception 'Staff Delivery completion identities are required.';
  end if;
  if p_attempt_number is null or p_attempt_number < 1 then
    raise exception 'Delivery attempt number must be positive.';
  end if;

  select *
  into v_delivery
  from public.notification_deliveries
  where id = p_delivery_id
  for update;

  if not found then
    raise exception 'Delivery % was not found.', p_delivery_id;
  end if;

  if exists (
    select 1
    from public.notification_delivery_attempts
    where id = p_attempt_id
      and delivery_id = p_delivery_id
      and attempt_number = p_attempt_number
  ) then
    return v_delivery;
  end if;

  if v_delivery.channel <> 'staff'
    or v_delivery.status <> 'processing'
    or v_delivery.claim_token <> p_claim_token
    or v_delivery.claim_expires_at is null
    or v_delivery.claim_expires_at <= clock_timestamp()
  then
    raise exception 'Staff Delivery claim is no longer valid.';
  end if;

  if not exists (
    select 1
    from public.staff_notifications
    where id = p_staff_notification_id
      and business_event_id = (
        select n.business_event_id
        from public.notifications n
        where n.id = v_delivery.notification_id
      )
      and notification_id = v_delivery.notification_id
      and delivery_id = p_delivery_id
      and delivery_attempt_id = p_attempt_id
  ) then
    raise exception 'Linked Staff Inbox record was not found.';
  end if;

  insert into public.notification_delivery_attempts (
    id,
    delivery_id,
    attempt_number,
    provider_key,
    provider_idempotency_key,
    outcome,
    retryability,
    provider_message_id,
    failure_code,
    failure_reason,
    provider_metadata,
    started_at,
    completed_at
  )
  values (
    p_attempt_id,
    p_delivery_id,
    p_attempt_number,
    'staff_internal',
    p_attempt_id,
    'sent',
    'terminal',
    p_staff_notification_id,
    '',
    '',
    jsonb_build_object(
      'observationOnly', true,
      'staffNotificationId', p_staff_notification_id
    ),
    p_started_at,
    p_completed_at
  );

  update public.notification_deliveries
  set
    status = 'sent',
    provider_key = 'staff_internal',
    provider_message_id = p_staff_notification_id,
    attempt_count = greatest(attempt_count, p_attempt_number),
    sent_at = p_completed_at,
    claim_token = '',
    claimed_at = null,
    claim_expires_at = null
  where id = p_delivery_id
  returning * into v_delivery;

  return v_delivery;
end;
$$;

revoke all on function public.claim_staff_notification_deliveries_observation(
  text,
  integer,
  integer
) from public;
revoke all on function public.complete_staff_internal_delivery_observation(
  text,
  text,
  text,
  integer,
  text,
  timestamptz,
  timestamptz
) from public;

grant execute on function public.claim_staff_notification_deliveries_observation(
  text,
  integer,
  integer
) to service_role;
grant execute on function public.complete_staff_internal_delivery_observation(
  text,
  text,
  text,
  integer,
  text,
  timestamptz,
  timestamptz
) to service_role;
