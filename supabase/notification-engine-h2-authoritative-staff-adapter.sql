-- Notification Engine production-readiness remediation H2.
-- Authoritative Order Approved Staff Deliveries through the internal adapter.

create or replace function public.claim_staff_notification_delivery_authoritative(
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
    raise exception 'Authoritative Staff Delivery and worker identities are required.';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 5 or p_lease_seconds > 900 then
    raise exception 'Dispatcher lease must be between 5 and 900 seconds.';
  end if;

  v_claim_token := concat(
    'staff-authoritative:',
    trim(p_worker_id),
    ':',
    md5(random()::text || clock_timestamp()::text)
  );

  return query
  with eligible as (
    select d.id
    from public.notification_deliveries d
    join public.notifications n on n.id = d.notification_id
    where d.id = p_delivery_id
      and d.channel = 'staff'
      and d.status = 'queued'
      and n.event_type = 'quote_approved'
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
      claim_expires_at =
        clock_timestamp() + make_interval(secs => p_lease_seconds),
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

create or replace function public.complete_staff_internal_delivery_authoritative(
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
  v_notification_id text;
begin
  select d.notification_id
  into v_notification_id
  from public.notification_deliveries d
  join public.notifications n on n.id = d.notification_id
  where d.id = p_delivery_id
    and d.channel = 'staff'
    and n.event_type = 'quote_approved'
    and not coalesce(
      (n.engine_metadata ->> 'observationOnly')::boolean,
      true
    )
    and not coalesce(
      (d.destination_snapshot ->> 'observationOnly')::boolean,
      true
    );

  if v_notification_id is null then
    raise exception 'Delivery is not eligible for authoritative Staff completion.';
  end if;

  select public.complete_staff_internal_delivery_observation(
    p_delivery_id,
    p_claim_token,
    p_attempt_id,
    p_attempt_number,
    p_staff_notification_id,
    p_started_at,
    p_completed_at
  ) into v_delivery;

  update public.notification_delivery_attempts
  set provider_metadata =
    (provider_metadata - 'observationOnly')
      || jsonb_build_object(
        'observationOnly', false,
        'cutoverMode', 'authoritative'
      )
  where id = p_attempt_id
    and delivery_id = p_delivery_id;

  perform public.refresh_notification_aggregate_status(v_notification_id);
  return v_delivery;
end;
$$;

revoke all on function public.claim_staff_notification_delivery_authoritative(
  text, text, integer
) from public, anon, authenticated;
revoke all on function public.complete_staff_internal_delivery_authoritative(
  text, text, text, integer, text, timestamptz, timestamptz
) from public, anon, authenticated;

grant execute on function public.claim_staff_notification_delivery_authoritative(
  text, text, integer
) to service_role;
grant execute on function public.complete_staff_internal_delivery_authoritative(
  text, text, text, integer, text, timestamptz, timestamptz
) to service_role;
