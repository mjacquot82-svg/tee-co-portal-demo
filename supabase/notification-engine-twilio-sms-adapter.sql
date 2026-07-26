-- Notification Engine Twilio SMS provider adapter migration.
-- Provides authoritative SMS run, recovery, claim, and completion functions.

create or replace function public.start_twilio_sms_dispatch_run(
  p_run_id text,
  p_worker_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.notification_dispatch_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.notification_dispatch_runs;
begin
  if nullif(trim(p_run_id), '') is null
    or nullif(trim(p_worker_id), '') is null
  then
    raise exception 'Twilio dispatcher run and worker identities are required.';
  end if;

  insert into public.notification_dispatch_runs (
    id,
    worker_id,
    runner_type,
    metadata
  )
  values (
    trim(p_run_id),
    trim(p_worker_id),
    'scheduled_twilio_authoritative',
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (id) do nothing
  returning * into v_run;

  if v_run.id is null then
    select * into v_run
    from public.notification_dispatch_runs
    where id = trim(p_run_id);
  end if;
  return v_run;
end;
$$;

create or replace function public.recover_abandoned_twilio_sms_claims_authoritative(
  p_limit integer default 100
)
returns setof public.notification_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.notification_deliveries;
  v_recovered_status text;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Twilio recovery limit must be between 1 and 500.';
  end if;

  for v_delivery in
    select delivery.*
    from public.notification_deliveries delivery
    join public.notifications notification
      on notification.id = delivery.notification_id
    where delivery.status = 'processing'
      and delivery.claim_expires_at is not null
      and delivery.claim_expires_at <= clock_timestamp()
      and delivery.channel = 'sms'
      and notification.delivery_mode = 'automatic'
      and coalesce(
        (notification.policy_snapshot ->> 'sms_enabled')::boolean,
        false
      )
      and not coalesce(
        (notification.engine_metadata ->> 'observationOnly')::boolean,
        true
      )
      and coalesce(
        (
          notification.engine_metadata
            #>> '{phase2D,dispatcherEligible}'
        )::boolean,
        false
      )
      and not coalesce(
        (delivery.destination_snapshot ->> 'observationOnly')::boolean,
        true
      )
    order by delivery.claim_expires_at, delivery.id
    for update of delivery skip locked
    limit p_limit
  loop
    v_recovered_status := case
      when v_delivery.attempt_count > 0 then 'retry_scheduled'
      else 'queued'
    end;

    update public.notification_deliveries
    set
      status = v_recovered_status,
      next_retry_at = case
        when v_recovered_status = 'retry_scheduled'
          then clock_timestamp()
        else null
      end,
      claim_token = '',
      claimed_at = null,
      claim_expires_at = null
    where id = v_delivery.id
    returning * into v_delivery;

    return next v_delivery;
  end loop;
end;
$$;

create or replace function public.claim_twilio_sms_deliveries_authoritative(
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
    raise exception 'Twilio dispatcher worker id is required.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Twilio claim limit must be between 1 and 100.';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 5 or p_lease_seconds > 900 then
    raise exception 'Twilio claim lease must be between 5 and 900 seconds.';
  end if;

  v_claim_token := concat(
    'twilio-authoritative:',
    trim(p_worker_id),
    ':',
    md5(random()::text || clock_timestamp()::text)
  );

  return query
  with eligible as (
    select delivery_row.id
    from public.notification_deliveries delivery_row
    join public.notifications notification_row
      on notification_row.id = delivery_row.notification_id
    where delivery_row.channel = 'sms'
      and notification_row.delivery_mode = 'automatic'
      and coalesce(
        (notification_row.policy_snapshot ->> 'sms_enabled')::boolean,
        false
      )
      and (
        delivery_row.status = 'queued'
        or (
          delivery_row.status = 'retry_scheduled'
          and delivery_row.next_retry_at is not null
          and delivery_row.next_retry_at <= clock_timestamp()
        )
      )
      and not coalesce(
        (notification_row.engine_metadata ->> 'observationOnly')::boolean,
        true
      )
      and coalesce(
        (
          notification_row.engine_metadata
            #>> '{phase2D,dispatcherEligible}'
        )::boolean,
        false
      )
      and not coalesce(
        (delivery_row.destination_snapshot ->> 'observationOnly')::boolean,
        true
      )
    order by
      coalesce(
        delivery_row.next_retry_at,
        delivery_row.queued_at,
        delivery_row.created_at
      ),
      delivery_row.id
    for update of delivery_row skip locked
    limit p_limit
  ),
  claimed as (
    update public.notification_deliveries delivery_row
    set
      status = 'processing',
      claim_token = v_claim_token,
      claimed_at = clock_timestamp(),
      claim_expires_at =
        clock_timestamp() + make_interval(secs => p_lease_seconds),
      processing_at = clock_timestamp(),
      next_retry_at = null
    from eligible
    where delivery_row.id = eligible.id
    returning delivery_row.*
  )
  select
    to_jsonb(claimed),
    to_jsonb(notification_row),
    to_jsonb(event)
  from claimed
  join public.notifications notification_row
    on notification_row.id = claimed.notification_id
  join public.notification_business_events event
    on event.id = notification_row.business_event_id;
end;
$$;

create or replace function public.complete_twilio_sms_delivery_authoritative(
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
  v_delivery_status text;
  v_retry_safe boolean;
  v_delay_seconds integer;
  v_next_retry_at timestamptz;
begin
  if nullif(trim(p_claim_token), '') is null
    or nullif(trim(p_attempt_id), '') is null
  then
    raise exception 'Twilio Delivery completion identities are required.';
  end if;
  if p_outcome not in ('sent', 'failed') then
    raise exception 'Unsupported Twilio outcome.';
  end if;
  if p_retryability not in (
    'retryable',
    'terminal',
    'indeterminate',
    'unknown'
  ) then
    raise exception 'Unsupported Twilio retryability classification.';
  end if;
  if p_attempt_number is null or p_attempt_number < 1 then
    raise exception 'Delivery attempt number must be positive.';
  end if;
  if p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 20
    or p_base_delay_seconds is null
    or p_base_delay_seconds < 1
    or p_base_delay_seconds > 86400
    or p_max_delay_seconds is null
    or p_max_delay_seconds < p_base_delay_seconds
    or p_max_delay_seconds > 604800
  then
    raise exception 'Invalid retry policy.';
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

  if v_delivery.channel <> 'sms'
    or not exists (
      select 1
      from public.notifications notification
      where notification.id = v_delivery.notification_id
        and notification.delivery_mode = 'automatic'
        and coalesce(
          (notification.policy_snapshot ->> 'sms_enabled')::boolean,
          false
        )
        and not coalesce(
          (notification.engine_metadata ->> 'observationOnly')::boolean,
          true
        )
        and coalesce(
          (
            notification.engine_metadata
              #>> '{phase2D,dispatcherEligible}'
          )::boolean,
          false
        )
    )
    or coalesce(
      (v_delivery.destination_snapshot ->> 'observationOnly')::boolean,
      true
    )
    or v_delivery.status <> 'processing'
    or v_delivery.claim_token <> p_claim_token
    or v_delivery.claim_expires_at is null
    or v_delivery.claim_expires_at <= clock_timestamp()
  then
    raise exception 'Twilio SMS Delivery claim is no longer valid.';
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
    'twilio',
    v_delivery.idempotency_key,
    p_outcome,
    p_retryability,
    coalesce(p_provider_message_id, ''),
    coalesce(p_failure_code, ''),
    coalesce(p_failure_reason, ''),
    coalesce(p_provider_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'observationOnly',
        false,
        'channel',
        'sms'
      ),
    p_started_at,
    p_completed_at
  );

  v_retry_safe := p_retryability = 'retryable'
    or (
      p_retryability = 'indeterminate'
      and nullif(trim(v_delivery.idempotency_key), '') is not null
    );
  v_delay_seconds := least(
    p_max_delay_seconds,
    (
      p_base_delay_seconds
      * power(2, greatest(0, p_attempt_number - 1))
    )::integer
  );
  v_delivery_status := case
    when p_outcome = 'sent' then 'sent'
    when v_retry_safe and p_attempt_number < p_max_attempts
      then 'retry_scheduled'
    else 'failed'
  end;
  v_next_retry_at := case
    when v_delivery_status = 'retry_scheduled'
      then p_completed_at + make_interval(secs => v_delay_seconds)
    else null
  end;

  update public.notification_deliveries
  set
    status = v_delivery_status,
    provider_key = 'twilio',
    provider_message_id = case
      when nullif(trim(coalesce(p_provider_message_id, '')), '') is not null
        then p_provider_message_id
      else provider_message_id
    end,
    attempt_count = greatest(attempt_count, p_attempt_number),
    last_failure_code = case
      when p_outcome = 'failed' then coalesce(p_failure_code, '')
      else ''
    end,
    last_failure_reason = case
      when p_outcome = 'failed' then coalesce(p_failure_reason, '')
      else ''
    end,
    sent_at = case
      when p_outcome = 'sent' then p_completed_at
      else sent_at
    end,
    failed_at = case
      when v_delivery_status = 'failed' then p_completed_at
      else null
    end,
    next_retry_at = v_next_retry_at,
    claim_token = '',
    claimed_at = null,
    claim_expires_at = null
  where id = p_delivery_id
  returning * into v_delivery;

  perform public.refresh_notification_aggregate_status(
    v_delivery.notification_id
  );
  return v_delivery;
end;
$$;

revoke all on function public.start_twilio_sms_dispatch_run(
  text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.recover_abandoned_twilio_sms_claims_authoritative(
  integer
) from public, anon, authenticated;
revoke all on function public.claim_twilio_sms_deliveries_authoritative(
  text, integer, integer
) from public, anon, authenticated;
revoke all on function public.complete_twilio_sms_delivery_authoritative(
  text, text, text, integer, text, text, text, text, text, jsonb,
  integer, integer, integer, timestamptz, timestamptz
) from public, anon, authenticated;

grant execute on function public.start_twilio_sms_dispatch_run(
  text, text, jsonb
) to service_role;
grant execute on function public.recover_abandoned_twilio_sms_claims_authoritative(
  integer
) to service_role;
grant execute on function public.claim_twilio_sms_deliveries_authoritative(
  text, integer, integer
) to service_role;
grant execute on function public.complete_twilio_sms_delivery_authoritative(
  text, text, text, integer, text, text, text, text, text, jsonb,
  integer, integer, integer, timestamptz, timestamptz
) to service_role;
