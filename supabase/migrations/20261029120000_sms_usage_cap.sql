-- SMS usage tracking and monthly cap (per-shop add-on).
-- Additive only: new tables + functions. Existing message content and
-- delivery behaviour are unchanged unless the dispatcher is started with
-- SMS_USAGE_CAP_ENABLED=true, which makes it call public.sms_usage_reserve
-- before each Twilio send.
-- Tee & Co is a single-shop app, so usage is tracked per account (one row
-- per calendar month, America/Toronto).

create table if not exists public.sms_usage_settings (
  id boolean primary key default true check (id),
  monthly_cap integer not null default 300 check (monthly_cap between 0 and 100000),
  warning_percent integer not null default 80 check (warning_percent between 1 and 100),
  allow_overage boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

insert into public.sms_usage_settings (id) values (true)
on conflict (id) do nothing;

create table if not exists public.sms_usage_months (
  month_key text primary key check (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  sent_count integer not null default 0 check (sent_count >= 0),
  overage_count integer not null default 0 check (overage_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  warning_reached_at timestamptz,
  cap_reached_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.sms_usage_events (
  id bigserial primary key,
  month_key text not null,
  delivery_id text not null,
  attempt_id text not null,
  decision text not null check (decision in ('send', 'send_overage', 'blocked')),
  released boolean not null default false,
  email_fallback text not null default '',
  created_at timestamptz not null default now(),
  unique (attempt_id)
);

create index if not exists sms_usage_events_month_idx
  on public.sms_usage_events (month_key, created_at desc);

alter table public.sms_usage_settings enable row level security;
alter table public.sms_usage_months enable row level security;
alter table public.sms_usage_events enable row level security;

create or replace function public.sms_usage_month_key(p_now timestamptz)
returns text
language sql
immutable
as $$
  select to_char(coalesce(p_now, now()) at time zone 'America/Toronto', 'YYYY-MM');
$$;

create or replace function public.sms_usage_warning_threshold(
  p_cap integer,
  p_percent integer
)
returns integer
language sql
immutable
as $$
  select greatest(1, ceil(greatest(p_cap, 0) * p_percent / 100.0)::integer);
$$;

-- Called by the scheduled SMS dispatcher (service role) immediately before a
-- Twilio send. Atomically decides send / send_overage / blocked and counts it.
-- Idempotent per attempt id.
create or replace function public.sms_usage_reserve(
  p_delivery_id text,
  p_attempt_id text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.sms_usage_settings;
  v_month public.sms_usage_months;
  v_key text := public.sms_usage_month_key(p_now);
  v_existing public.sms_usage_events;
  v_decision text;
  v_threshold integer;
  v_warning_now boolean := false;
  v_cap_now boolean := false;
  v_email text := '';
  v_notification_id text;
begin
  if nullif(trim(p_delivery_id), '') is null
    or nullif(trim(p_attempt_id), '') is null then
    raise exception 'SMS usage reservation requires delivery and attempt ids.';
  end if;

  insert into public.sms_usage_settings (id) values (true)
  on conflict (id) do nothing;
  select * into v_settings from public.sms_usage_settings where id;

  insert into public.sms_usage_months (month_key) values (v_key)
  on conflict (month_key) do nothing;
  select * into v_month from public.sms_usage_months
  where month_key = v_key for update;

  v_threshold := public.sms_usage_warning_threshold(
    v_settings.monthly_cap, v_settings.warning_percent
  );

  select * into v_existing from public.sms_usage_events
  where attempt_id = p_attempt_id;
  if found then
    return jsonb_build_object(
      'decision', v_existing.decision,
      'replayed', true,
      'month_key', v_existing.month_key,
      'sent_count', v_month.sent_count,
      'overage_count', v_month.overage_count,
      'skipped_count', v_month.skipped_count,
      'monthly_cap', v_settings.monthly_cap,
      'warning_threshold', v_threshold,
      'allow_overage', v_settings.allow_overage,
      'warning_reached_now', false,
      'cap_reached_now', false,
      'email_fallback', v_existing.email_fallback
    );
  end if;

  if v_month.sent_count < v_settings.monthly_cap then
    v_decision := 'send';
  elsif v_settings.allow_overage then
    v_decision := 'send_overage';
  else
    v_decision := 'blocked';
  end if;

  if v_decision = 'blocked' then
    select notification_id into v_notification_id
    from public.notification_deliveries where id = p_delivery_id;
    v_email := case when exists (
      select 1 from public.notification_deliveries d
      where d.notification_id = v_notification_id
        and d.channel = 'email'
        and d.status not in ('cancelled', 'failed')
    ) then 'email_delivery_present' else 'no_email_available' end;

    update public.sms_usage_months
    set skipped_count = skipped_count + 1,
        cap_reached_at = coalesce(cap_reached_at, p_now),
        updated_at = p_now
    where month_key = v_key
    returning * into v_month;
  else
    update public.sms_usage_months
    set sent_count = sent_count + 1,
        overage_count = overage_count
          + case when v_decision = 'send_overage' then 1 else 0 end,
        updated_at = p_now
    where month_key = v_key
    returning * into v_month;

    if v_month.warning_reached_at is null and v_month.sent_count >= v_threshold then
      v_warning_now := true;
      update public.sms_usage_months set warning_reached_at = p_now
      where month_key = v_key returning * into v_month;
    end if;
    if v_month.cap_reached_at is null
      and v_month.sent_count >= v_settings.monthly_cap then
      v_cap_now := true;
      update public.sms_usage_months set cap_reached_at = p_now
      where month_key = v_key returning * into v_month;
    end if;
  end if;

  insert into public.sms_usage_events (
    month_key, delivery_id, attempt_id, decision, email_fallback, created_at
  ) values (
    v_key, p_delivery_id, p_attempt_id, v_decision, v_email, p_now
  );

  return jsonb_build_object(
    'decision', v_decision,
    'replayed', false,
    'month_key', v_key,
    'sent_count', v_month.sent_count,
    'overage_count', v_month.overage_count,
    'skipped_count', v_month.skipped_count,
    'monthly_cap', v_settings.monthly_cap,
    'warning_threshold', v_threshold,
    'allow_overage', v_settings.allow_overage,
    'warning_reached_now', v_warning_now,
    'cap_reached_now', v_cap_now,
    'email_fallback', v_email
  );
end;
$$;

-- Called when Twilio rejected the send (nothing billed): un-count it.
create or replace function public.sms_usage_release(p_attempt_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.sms_usage_events;
begin
  update public.sms_usage_events
  set released = true
  where attempt_id = p_attempt_id
    and released = false
    and decision in ('send', 'send_overage')
  returning * into v_event;
  if v_event.id is null then
    return false;
  end if;
  update public.sms_usage_months
  set sent_count = greatest(0, sent_count - 1),
      overage_count = greatest(
        0,
        overage_count - case when v_event.decision = 'send_overage' then 1 else 0 end
      ),
      updated_at = now()
  where month_key = v_event.month_key;
  return true;
end;
$$;

-- Owner view: settings, this month's usage, alert state and recent skips.
create or replace function public.get_sms_usage_summary(p_now timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_settings public.sms_usage_settings;
  v_month public.sms_usage_months;
  v_key text := public.sms_usage_month_key(p_now);
begin
  if not public.is_notification_engine_owner() then
    raise exception 'Only the owner can view SMS usage.';
  end if;
  select * into v_settings from public.sms_usage_settings where id;
  select * into v_month from public.sms_usage_months where month_key = v_key;
  return jsonb_build_object(
    'month_key', v_key,
    'monthly_cap', coalesce(v_settings.monthly_cap, 300),
    'warning_percent', coalesce(v_settings.warning_percent, 80),
    'allow_overage', coalesce(v_settings.allow_overage, false),
    'warning_threshold', public.sms_usage_warning_threshold(
      coalesce(v_settings.monthly_cap, 300), coalesce(v_settings.warning_percent, 80)
    ),
    'sent_count', coalesce(v_month.sent_count, 0),
    'overage_count', coalesce(v_month.overage_count, 0),
    'skipped_count', coalesce(v_month.skipped_count, 0),
    'warning_reached_at', v_month.warning_reached_at,
    'cap_reached_at', v_month.cap_reached_at,
    'recent_skipped', coalesce((
      select jsonb_agg(row_to_json(s) order by s.created_at desc)
      from (
        select delivery_id, email_fallback, created_at
        from public.sms_usage_events
        where month_key = v_key and decision = 'blocked'
        order by created_at desc
        limit 20
      ) s
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.update_sms_usage_settings(
  p_monthly_cap integer,
  p_warning_percent integer,
  p_allow_overage boolean
)
returns public.sms_usage_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.sms_usage_settings;
begin
  if not public.is_notification_engine_owner() then
    raise exception 'Only the owner can change SMS usage settings.';
  end if;
  insert into public.sms_usage_settings (id, monthly_cap, warning_percent, allow_overage, updated_at, updated_by)
  values (
    true, p_monthly_cap, p_warning_percent, coalesce(p_allow_overage, false), now(),
    coalesce(auth.jwt() ->> 'email', '')
  )
  on conflict (id) do update set
    monthly_cap = excluded.monthly_cap,
    warning_percent = excluded.warning_percent,
    allow_overage = excluded.allow_overage,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.sms_usage_reserve(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.sms_usage_release(text) from public, anon, authenticated;
revoke all on function public.get_sms_usage_summary(timestamptz) from public, anon;
revoke all on function public.update_sms_usage_settings(integer, integer, boolean) from public, anon;
grant execute on function public.sms_usage_reserve(text, text, timestamptz) to service_role;
grant execute on function public.sms_usage_release(text) to service_role;
grant execute on function public.get_sms_usage_summary(timestamptz) to authenticated, service_role;
grant execute on function public.update_sms_usage_settings(integer, integer, boolean) to authenticated, service_role;
