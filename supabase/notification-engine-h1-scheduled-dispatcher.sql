-- Notification Engine production-readiness remediation H1.
-- Scheduled execution for the already-authorized Order Approved email channel.

create table if not exists public.notification_dispatch_runs (
  id text primary key,
  worker_id text not null,
  runner_type text not null default 'scheduled_resend_authoritative',
  status text not null default 'running'
    check (status in ('running', 'completed', 'completed_with_errors', 'failed')),
  recovered_count integer not null default 0 check (recovered_count >= 0),
  claimed_count integer not null default 0 check (claimed_count >= 0),
  completed_count integer not null default 0 check (completed_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  error_summary jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create index if not exists notification_dispatch_runs_started_idx
  on public.notification_dispatch_runs (started_at desc);

alter table public.notification_dispatch_runs enable row level security;
revoke all on table public.notification_dispatch_runs from anon, authenticated;
grant all on table public.notification_dispatch_runs to service_role;

create or replace function public.start_notification_dispatch_run(
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
    raise exception 'Dispatcher run and worker identities are required.';
  end if;

  insert into public.notification_dispatch_runs (
    id,
    worker_id,
    metadata
  )
  values (
    trim(p_run_id),
    trim(p_worker_id),
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

create or replace function public.complete_notification_dispatch_run(
  p_run_id text,
  p_status text,
  p_recovered_count integer,
  p_claimed_count integer,
  p_completed_count integer,
  p_failed_count integer,
  p_error_summary jsonb default '[]'::jsonb,
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
  if p_status not in ('completed', 'completed_with_errors', 'failed') then
    raise exception 'Unsupported dispatcher run status.';
  end if;
  if least(
    coalesce(p_recovered_count, -1),
    coalesce(p_claimed_count, -1),
    coalesce(p_completed_count, -1),
    coalesce(p_failed_count, -1)
  ) < 0 then
    raise exception 'Dispatcher run counts cannot be negative.';
  end if;

  update public.notification_dispatch_runs
  set
    status = p_status,
    recovered_count = p_recovered_count,
    claimed_count = p_claimed_count,
    completed_count = p_completed_count,
    failed_count = p_failed_count,
    error_summary = coalesce(p_error_summary, '[]'::jsonb),
    metadata = metadata || coalesce(p_metadata, '{}'::jsonb),
    completed_at = timezone('utc', now())
  where id = trim(p_run_id)
  returning * into v_run;

  if v_run.id is null then
    raise exception 'Dispatcher run % was not found.', p_run_id;
  end if;
  return v_run;
end;
$$;

create or replace function public.recover_abandoned_notification_delivery_claims_authoritative(
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
    select delivery.*
    from public.notification_deliveries delivery
    join public.notifications notification
      on notification.id = delivery.notification_id
    where delivery.status = 'processing'
      and delivery.claim_expires_at is not null
      and delivery.claim_expires_at <= clock_timestamp()
      and delivery.channel = 'email'
      and notification.event_type = 'quote_approved'
      and not coalesce(
        (notification.engine_metadata ->> 'observationOnly')::boolean,
        true
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

create or replace function public.claim_resend_email_deliveries_authoritative(
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
  if p_lease_seconds is null or p_lease_seconds < 5 or p_lease_seconds > 900 then
    raise exception 'Dispatcher lease must be between 5 and 900 seconds.';
  end if;

  v_claim_token := concat(
    'resend-authoritative:',
    trim(p_worker_id),
    ':',
    md5(random()::text || clock_timestamp()::text)
  );

  return query
  with eligible as (
    select delivery.id
    from public.notification_deliveries delivery
    join public.notifications notification
      on notification.id = delivery.notification_id
    where delivery.channel = 'email'
      and notification.event_type = 'quote_approved'
      and (
        delivery.status = 'queued'
        or (
          delivery.status = 'retry_scheduled'
          and delivery.next_retry_at is not null
          and delivery.next_retry_at <= clock_timestamp()
        )
      )
      and not coalesce(
        (notification.engine_metadata ->> 'observationOnly')::boolean,
        true
      )
      and not coalesce(
        (delivery.destination_snapshot ->> 'observationOnly')::boolean,
        true
      )
    order by
      coalesce(delivery.next_retry_at, delivery.queued_at, delivery.created_at),
      delivery.id
    for update of delivery skip locked
    limit p_limit
  ),
  claimed as (
    update public.notification_deliveries delivery
    set
      status = 'processing',
      claim_token = v_claim_token,
      claimed_at = clock_timestamp(),
      claim_expires_at =
        clock_timestamp() + make_interval(secs => p_lease_seconds),
      processing_at = clock_timestamp(),
      next_retry_at = null
    from eligible
    where delivery.id = eligible.id
    returning delivery.*
  )
  select
    to_jsonb(claimed),
    to_jsonb(notification),
    to_jsonb(event)
  from claimed
  join public.notifications notification
    on notification.id = claimed.notification_id
  join public.notification_business_events event
    on event.id = notification.business_event_id;
end;
$$;

revoke all on function public.start_notification_dispatch_run(
  text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.complete_notification_dispatch_run(
  text, text, integer, integer, integer, integer, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.recover_abandoned_notification_delivery_claims_authoritative(
  integer
) from public, anon, authenticated;
revoke all on function public.claim_resend_email_deliveries_authoritative(
  text, integer, integer
) from public, anon, authenticated;

grant execute on function public.start_notification_dispatch_run(
  text, text, jsonb
) to service_role;
grant execute on function public.complete_notification_dispatch_run(
  text, text, integer, integer, integer, integer, jsonb, jsonb
) to service_role;
grant execute on function public.recover_abandoned_notification_delivery_claims_authoritative(
  integer
) to service_role;
grant execute on function public.claim_resend_email_deliveries_authoritative(
  text, integer, integer
) to service_role;
