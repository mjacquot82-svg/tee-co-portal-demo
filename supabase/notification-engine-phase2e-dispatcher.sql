-- Notification Engine Phase 2E
-- Durable, observation-only dispatcher primitives.
--
-- These functions do not invoke providers or staff inbox behavior. Active
-- delivery execution remains disabled until a later phase supplies adapters.

create or replace function public.claim_notification_deliveries_observation(
  p_worker_id text,
  p_limit integer default 25,
  p_lease_seconds integer default 60
)
returns setof public.notification_deliveries
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
    'observation:',
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
      (
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
  )
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
  returning d.*;
end;
$$;

create or replace function public.recover_abandoned_notification_delivery_claims(
  p_limit integer default 100
)
returns setof public.notification_deliveries
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Dispatcher recovery limit must be between 1 and 500.';
  end if;

  return query
  with abandoned as (
    select d.id
    from public.notification_deliveries d
    join public.notifications n on n.id = d.notification_id
    where
      d.status = 'processing'
      and d.claim_expires_at is not null
      and d.claim_expires_at <= clock_timestamp()
      and coalesce(
        (n.engine_metadata ->> 'observationOnly')::boolean,
        false
      )
      and coalesce(
        (d.destination_snapshot ->> 'observationOnly')::boolean,
        false
      )
    order by d.claim_expires_at, d.id
    for update of d skip locked
    limit p_limit
  )
  update public.notification_deliveries d
  set
    status = 'queued',
    claim_token = '',
    claimed_at = null,
    claim_expires_at = null
  from abandoned
  where d.id = abandoned.id
  returning d.*;
end;
$$;

create or replace function public.complete_notification_delivery_observation(
  p_delivery_id text,
  p_claim_token text,
  p_attempt_id text,
  p_attempt_number integer,
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
  if nullif(trim(p_claim_token), '') is null then
    raise exception 'Dispatcher claim token is required.';
  end if;

  if p_attempt_number < 1 then
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

  -- A replay after a successful transaction returns the same durable result.
  if exists (
    select 1
    from public.notification_delivery_attempts
    where id = p_attempt_id
      and delivery_id = p_delivery_id
      and attempt_number = p_attempt_number
  ) then
    return v_delivery;
  end if;

  if v_delivery.status <> 'processing'
    or v_delivery.claim_token <> p_claim_token
    or v_delivery.claim_expires_at is null
    or v_delivery.claim_expires_at <= clock_timestamp()
  then
    raise exception 'Delivery claim is no longer valid.';
  end if;

  insert into public.notification_delivery_attempts (
    id,
    delivery_id,
    attempt_number,
    provider_key,
    provider_idempotency_key,
    outcome,
    retryability,
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
    'observation_dispatcher',
    p_attempt_id,
    'indeterminate',
    'unknown',
    '',
    '',
    jsonb_build_object(
      'observationOnly', true,
      'adapterInvoked', false
    ),
    p_started_at,
    p_completed_at
  );

  update public.notification_deliveries
  set
    status = 'queued',
    attempt_count = greatest(attempt_count, p_attempt_number),
    claim_token = '',
    claimed_at = null,
    claim_expires_at = null
  where id = p_delivery_id
  returning * into v_delivery;

  return v_delivery;
end;
$$;

revoke all on function public.claim_notification_deliveries_observation(
  text,
  integer,
  integer
) from public;
revoke all on function public.recover_abandoned_notification_delivery_claims(
  integer
) from public;
revoke all on function public.complete_notification_delivery_observation(
  text,
  text,
  text,
  integer,
  timestamptz,
  timestamptz
) from public;

grant execute on function public.claim_notification_deliveries_observation(
  text,
  integer,
  integer
) to service_role;
grant execute on function public.recover_abandoned_notification_delivery_claims(
  integer
) to service_role;
grant execute on function public.complete_notification_delivery_observation(
  text,
  text,
  text,
  integer,
  timestamptz,
  timestamptz
) to service_role;
