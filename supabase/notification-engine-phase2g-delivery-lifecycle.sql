-- Notification Engine Phase 2G: Retry and Delivery Lifecycle
-- Adds immutable status history, due-retry claiming, retry scheduling,
-- abandoned-claim recovery, delivery confirmation, and cancellation.

alter table public.notification_delivery_attempts
  drop constraint if exists notification_delivery_attempts_provider_key_unique;

create index if not exists notification_delivery_attempts_provider_key_idx
  on public.notification_delivery_attempts (provider_idempotency_key);

create table if not exists public.notification_delivery_status_history (
  id text primary key,
  delivery_id text not null references public.notification_deliveries(id),
  notification_id text not null references public.notifications(id),
  status text not null
    check (
      status in (
        'queued',
        'processing',
        'sent',
        'delivered',
        'failed',
        'retry_scheduled',
        'not_deliverable',
        'suppressed',
        'cancelled'
      )
    ),
  attempt_id text,
  provider_key text not null default '',
  provider_message_id text not null default '',
  failure_code text not null default '',
  failure_reason text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default timezone('utc', now())
);

create index if not exists notification_delivery_status_history_delivery_idx
  on public.notification_delivery_status_history (delivery_id, occurred_at);

create or replace function public.record_notification_delivery_status_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.notification_delivery_status_history (
      id,
      delivery_id,
      notification_id,
      status,
      attempt_id,
      provider_key,
      provider_message_id,
      failure_code,
      failure_reason,
      metadata,
      occurred_at
    )
    values (
      concat(
        'history:',
        new.id,
        ':',
        new.status,
        ':',
        md5(clock_timestamp()::text || random()::text)
      ),
      new.id,
      new.notification_id,
      new.status,
      case
        when new.attempt_count > 0
          and new.status in ('sent', 'failed', 'retry_scheduled')
          then concat('attempt:', new.id, ':', new.attempt_count)
        else null
      end,
      new.provider_key,
      new.provider_message_id,
      new.last_failure_code,
      new.last_failure_reason,
      jsonb_build_object(
        'attemptCount', new.attempt_count,
        'nextRetryAt', new.next_retry_at
      ),
      coalesce(
        new.updated_at,
        new.delivered_at,
        new.sent_at,
        new.failed_at,
        new.processing_at,
        new.queued_at,
        clock_timestamp()
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notification_delivery_status_history_trigger
  on public.notification_deliveries;
create trigger notification_delivery_status_history_trigger
  after insert or update of status on public.notification_deliveries
  for each row execute procedure
    public.record_notification_delivery_status_history();

insert into public.notification_delivery_status_history (
  id,
  delivery_id,
  notification_id,
  status,
  provider_key,
  provider_message_id,
  failure_code,
  failure_reason,
  metadata,
  occurred_at
)
select
  concat('history:', d.id, ':baseline'),
  d.id,
  d.notification_id,
  d.status,
  d.provider_key,
  d.provider_message_id,
  d.last_failure_code,
  d.last_failure_reason,
  jsonb_build_object(
    'baseline', true,
    'attemptCount', d.attempt_count,
    'nextRetryAt', d.next_retry_at
  ),
  coalesce(
    d.delivered_at,
    d.sent_at,
    d.failed_at,
    d.processing_at,
    d.queued_at,
    d.created_at
  )
from public.notification_deliveries d
on conflict (id) do nothing;

create or replace function public.refresh_notification_aggregate_status(
  p_notification_id text
)
returns public.notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification public.notifications;
  v_total integer;
  v_successful integer;
  v_failed integer;
  v_pending integer;
  v_non_delivery integer;
  v_status text;
begin
  select
    count(*),
    count(*) filter (where status in ('sent', 'delivered')),
    count(*) filter (where status = 'failed'),
    count(*) filter (
      where status in ('queued', 'processing', 'retry_scheduled')
    ),
    count(*) filter (
      where status in ('not_deliverable', 'suppressed', 'cancelled')
    )
  into
    v_total,
    v_successful,
    v_failed,
    v_pending,
    v_non_delivery
  from public.notification_deliveries
  where notification_id = p_notification_id;

  v_status := case
    when v_total = 0 or v_non_delivery = v_total then 'no_delivery'
    when v_successful > 0 and (v_failed > 0 or v_pending > 0)
      then 'partially_successful'
    when v_pending > 0 then 'queued'
    when v_failed > 0 and v_successful = 0 then 'failed'
    when v_failed > 0 and v_successful > 0 then 'partially_successful'
    when v_successful > 0 then 'completed'
    else 'no_delivery'
  end;

  update public.notifications
  set status = v_status
  where id = p_notification_id
  returning * into v_notification;

  return v_notification;
end;
$$;

create or replace function public.claim_resend_email_deliveries_observation(
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
    'resend-observation:',
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
      d.channel = 'email'
      and n.event_type = 'quote_approved'
      and (
        d.status = 'queued'
        or (
          d.status = 'retry_scheduled'
          and d.next_retry_at is not null
          and d.next_retry_at <= clock_timestamp()
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
    order by
      coalesce(d.next_retry_at, d.queued_at, d.created_at),
      d.id
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
      processing_at = clock_timestamp(),
      next_retry_at = null
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

drop function if exists public.complete_resend_email_delivery_observation(
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  timestamptz,
  timestamptz
);

create function public.complete_resend_email_delivery_observation(
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
    raise exception 'Resend Delivery completion identities are required.';
  end if;
  if p_outcome not in ('sent', 'failed') then
    raise exception 'Unsupported Resend outcome.';
  end if;
  if p_retryability not in (
    'retryable',
    'terminal',
    'indeterminate',
    'unknown'
  ) then
    raise exception 'Unsupported retryability classification.';
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

  if v_delivery.channel <> 'email'
    or not exists (
      select 1
      from public.notifications n
      where n.id = v_delivery.notification_id
        and n.event_type = 'quote_approved'
    )
    or v_delivery.status <> 'processing'
    or v_delivery.claim_token <> p_claim_token
    or v_delivery.claim_expires_at is null
    or v_delivery.claim_expires_at <= clock_timestamp()
  then
    raise exception 'Resend Delivery claim is no longer valid.';
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
    'resend',
    v_delivery.idempotency_key,
    p_outcome,
    p_retryability,
    coalesce(p_provider_message_id, ''),
    coalesce(p_failure_code, ''),
    coalesce(p_failure_reason, ''),
    coalesce(p_provider_metadata, '{}'::jsonb)
      || jsonb_build_object('observationOnly', true),
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
    provider_key = 'resend',
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

create or replace function public.recover_abandoned_notification_delivery_claims(
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
    raise exception 'Dispatcher recovery limit must be between 1 and 500.';
  end if;

  for v_delivery in
    select d.*
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

create or replace function public.mark_notification_delivery_delivered(
  p_delivery_id text,
  p_provider_message_id text,
  p_occurred_at timestamptz,
  p_provider_metadata jsonb default '{}'::jsonb
)
returns public.notification_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.notification_deliveries;
begin
  update public.notification_deliveries
  set
    status = 'delivered',
    provider_message_id = case
      when nullif(trim(coalesce(p_provider_message_id, '')), '') is not null
        then p_provider_message_id
      else provider_message_id
    end,
    delivered_at = p_occurred_at
  where id = p_delivery_id
    and status in ('sent', 'delivered')
  returning * into v_delivery;

  if v_delivery.id is null then
    raise exception 'Only sent Deliveries can become delivered.';
  end if;

  update public.notification_delivery_status_history
  set metadata = metadata || coalesce(p_provider_metadata, '{}'::jsonb)
  where id = (
    select id
    from public.notification_delivery_status_history
    where delivery_id = p_delivery_id
      and status = 'delivered'
    order by occurred_at desc
    limit 1
  );

  perform public.refresh_notification_aggregate_status(
    v_delivery.notification_id
  );
  return v_delivery;
end;
$$;

create or replace function public.cancel_notification_delivery(
  p_delivery_id text,
  p_reason text,
  p_occurred_at timestamptz
)
returns public.notification_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.notification_deliveries;
begin
  update public.notification_deliveries
  set
    status = 'cancelled',
    last_failure_code = 'cancelled',
    last_failure_reason = coalesce(p_reason, ''),
    next_retry_at = null,
    claim_token = '',
    claimed_at = null,
    claim_expires_at = null
  where id = p_delivery_id
    and status in ('queued', 'retry_scheduled')
  returning * into v_delivery;

  if v_delivery.id is null then
    raise exception 'Only queued Deliveries can be cancelled.';
  end if;

  perform public.refresh_notification_aggregate_status(
    v_delivery.notification_id
  );
  return v_delivery;
end;
$$;

revoke all on function public.refresh_notification_aggregate_status(text)
  from public;
revoke all on function public.complete_resend_email_delivery_observation(
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  integer,
  integer,
  integer,
  timestamptz,
  timestamptz
) from public;
revoke all on function public.mark_notification_delivery_delivered(
  text,
  text,
  timestamptz,
  jsonb
) from public;
revoke all on function public.cancel_notification_delivery(
  text,
  text,
  timestamptz
) from public;

grant execute on function public.complete_resend_email_delivery_observation(
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  integer,
  integer,
  integer,
  timestamptz,
  timestamptz
) to service_role;
grant execute on function public.mark_notification_delivery_delivered(
  text,
  text,
  timestamptz,
  jsonb
) to service_role;
grant execute on function public.cancel_notification_delivery(
  text,
  text,
  timestamptz
) to service_role;
