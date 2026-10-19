-- Tee & Co RLS hardening (idempotent). Safe to re-run.
-- Purpose: turn on Row Level Security for EVERY table in schema public and add
-- least-privilege policies:
--   * catalog tables: anyone may READ, only operational staff may write
--   * customers / orders / customer_artwork: a signed-in customer sees only their own rows;
--     staff see everything
--   * money, staff, notification and log tables: operational staff only
--   * any other public table: RLS on; existing policies kept; if it has none, only the
--     service role (Netlify functions) can use it
-- Staff = Supabase Auth user whose IMMUTABLE app_metadata.operational_role (or .role) is
-- owner / manager / staff. user_metadata is NOT trusted (users can edit it themselves).
-- Netlify functions use the service role, which bypasses RLS, and are unaffected.
-- Pre-existing policies that let anon/public touch sensitive tables are dropped, after being
-- backed up into tee_co_private.rls_hardening_backup (see rls-hardening-rollback.sql).
-- GO-LIVE PHASE B. Requires phase A (staff-pin-auth-phase-a.sql) AND the PR 68 code deployed:
-- PIN staff then get a real Supabase session from /.netlify/functions/staff-pin-login.
-- v3: adds the token-protected public approval page and the narrow customer order actions
-- (section 9), so phase B no longer breaks /approval/<order> or the portal deposit/artwork steps.
-- v2: works with text ids (live: customers.id / auth_user_id / *.customer_id are text) and uuid ids
-- (staging); customers may read their own payments / payment requests / payment events; an
-- auth.users trigger keeps the old "link my existing customer row by email" behaviour working.

begin;

do $$ begin
  if to_regprocedure('tee_co_private.pin_staff_still_active()') is null then
    raise exception 'Run supabase/staff-pin-auth-phase-a.sql first';
  end if;
end $$;

create schema if not exists tee_co_private;
revoke all on schema tee_co_private from public, anon;
grant usage on schema tee_co_private to authenticated;

create table if not exists tee_co_private.rls_hardening_backup (
  id bigserial primary key,
  captured_at timestamptz not null default now(),
  kind text not null,              -- 'rls' or 'policy'
  table_name text not null,
  rls_enabled boolean,
  policy_name text,
  policy_sql text
);
revoke all on tee_co_private.rls_hardening_backup from public, anon, authenticated;

-- Back up RLS flags once (first run only), so rollback restores the true original state.
insert into tee_co_private.rls_hardening_backup (kind, table_name, rls_enabled)
select 'rls', c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
  and not exists (select 1 from tee_co_private.rls_hardening_backup b where b.kind = 'rls' and b.table_name = c.relname);

-- Back up anon table privileges once, so rollback restores exactly what anon had.
insert into tee_co_private.rls_hardening_backup (kind, table_name, policy_sql)
select 'anon_grant', c.relname, string_agg(pr, ', ')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
cross join unnest(array['select','insert','update','delete']) pr
where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege('anon', c.oid, pr)
  and not exists (select 1 from tee_co_private.rls_hardening_backup b where b.kind = 'anon_grant' and b.table_name = c.relname)
group by c.relname;

-- Back up the current staff-check function once (live: it still trusts user_metadata)
insert into tee_co_private.rls_hardening_backup (kind, table_name, policy_sql)
select 'function', 'is_tee_co_operational_staff', pg_get_functiondef('public.is_tee_co_operational_staff()'::regprocedure)
where to_regprocedure('public.is_tee_co_operational_staff()') is not null
  and not exists (select 1 from tee_co_private.rls_hardening_backup b where b.kind = 'function');

-- Helpers ------------------------------------------------------------------
create or replace function public.is_tee_co_operational_staff()
returns boolean language sql stable set search_path = '' as $$
  select lower(coalesce(
    auth.jwt() -> 'app_metadata' ->> 'operational_role',
    auth.jwt() -> 'app_metadata' ->> 'role',
    '')) = any (array['owner', 'manager', 'staff'])
    and tee_co_private.pin_staff_still_active();
$$;

create or replace function tee_co_private.owns_customer(target_customer_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.customers c
    where c.id::text = target_customer_id and c.auth_user_id::text = auth.uid()::text);
$$;
revoke all on function tee_co_private.owns_customer(text) from public, anon;
grant execute on function tee_co_private.owns_customer(text) to authenticated;

-- Customer's own payment request ids (for payment_events)
create or replace function tee_co_private.owns_payment_request(target_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.payment_requests r
    where r.id::text = target_id and tee_co_private.owns_customer(r.customer_id::text));
$$;
revoke all on function tee_co_private.owns_payment_request(text) from public, anon;
grant execute on function tee_co_private.owns_payment_request(text) to authenticated;
revoke all on function public.is_tee_co_operational_staff() from public, anon;
grant execute on function public.is_tee_co_operational_staff() to authenticated;

-- Main ---------------------------------------------------------------------
do $$
declare
  catalog_tables text[] := array['products','brands','categories','colors','sizes',
    'garment_library_items','garment_models','garment_model_colors','storefront_categories'];
  staff_tables text[] := array['activity_logs','payments','payment_requests','payment_events',
    'sales','staff_users','notification_activity','notification_templates','staff_notifications',
    'square_terminal_checkout_attempts','square_terminal_device_registrations',
    'product_image_upload_attempts'];
  customer_tables text[] := array['customers','orders','customer_artwork'];
  t text; p record;
begin
  -- 1) RLS on for every public table
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r','p') loop
    execute format('alter table public.%I enable row level security', t);
  end loop;

  -- 2) Drop (after backup) policies that open sensitive tables to anon/public
  for p in select * from pg_policies
           where schemaname = 'public'
             and tablename = any (staff_tables || customer_tables)
             and (roles && array['anon','public']::name[]) loop
    insert into tee_co_private.rls_hardening_backup (kind, table_name, policy_name, policy_sql)
    values ('policy', p.tablename, p.policyname, format(
      'create policy %I on public.%I as %s for %s to %s%s%s',
      p.policyname, p.tablename, p.permissive, p.cmd, array_to_string(p.roles, ', '),
      coalesce(' using (' || p.qual || ')', ''), coalesce(' with check (' || p.with_check || ')', '')));
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;

  -- 3) Catalog: public read, staff write
  foreach t in array catalog_tables loop
    continue when to_regclass('public.' || t) is null;
    execute format('drop policy if exists rls_hardening_catalog_read on public.%I', t);
    execute format('create policy rls_hardening_catalog_read on public.%I for select to anon, authenticated using (true)', t);
    execute format('drop policy if exists rls_hardening_staff_all on public.%I', t);
    execute format('create policy rls_hardening_staff_all on public.%I for all to authenticated using (public.is_tee_co_operational_staff()) with check (public.is_tee_co_operational_staff())', t);
  end loop;

  -- 4) Staff-only tables and staff access to customer tables
  foreach t in array staff_tables || customer_tables loop
    continue when to_regclass('public.' || t) is null;
    execute format('drop policy if exists rls_hardening_staff_all on public.%I', t);
    execute format('create policy rls_hardening_staff_all on public.%I for all to authenticated using (public.is_tee_co_operational_staff()) with check (public.is_tee_co_operational_staff())', t);
  end loop;

  -- 5) Customers: own profile only
  if to_regclass('public.customers') is not null then
    drop policy if exists rls_hardening_customer_own_select on public.customers;
    create policy rls_hardening_customer_own_select on public.customers for select to authenticated
      using (auth_user_id::text = (select auth.uid())::text);
    drop policy if exists rls_hardening_customer_own_insert on public.customers;
    create policy rls_hardening_customer_own_insert on public.customers for insert to authenticated
      with check (auth_user_id::text = (select auth.uid())::text);
    drop policy if exists rls_hardening_customer_own_update on public.customers;
    create policy rls_hardening_customer_own_update on public.customers for update to authenticated
      using (auth_user_id::text = (select auth.uid())::text) with check (auth_user_id::text = (select auth.uid())::text);
  end if;

  -- 6) Orders: customer reads own, creates own portal orders
  if to_regclass('public.orders') is not null then
    drop policy if exists rls_hardening_order_own_select on public.orders;
    create policy rls_hardening_order_own_select on public.orders for select to authenticated
      using (tee_co_private.owns_customer(customer_id::text));
    drop policy if exists rls_hardening_order_own_insert on public.orders;
    create policy rls_hardening_order_own_insert on public.orders for insert to authenticated
      with check (customer_id is not null and source = 'Customer Portal'
                  and tee_co_private.owns_customer(customer_id::text));
  end if;

  -- 7) Customer artwork metadata: own rows, stored under own folder
  if to_regclass('public.customer_artwork') is not null then
    drop policy if exists rls_hardening_artwork_own_select on public.customer_artwork;
    create policy rls_hardening_artwork_own_select on public.customer_artwork for select to authenticated
      using (tee_co_private.owns_customer(customer_id::text));
    drop policy if exists rls_hardening_artwork_own_insert on public.customer_artwork;
    create policy rls_hardening_artwork_own_insert on public.customer_artwork for insert to authenticated
      with check (tee_co_private.owns_customer(customer_id::text)
                  and (storage.foldername(storage_path))[1] = customer_id::text);
  end if;

  -- 7b) Customers can see their own payments / payment requests / payment events (portal)
  if to_regclass('public.payments') is not null then
    drop policy if exists rls_hardening_payment_own_select on public.payments;
    create policy rls_hardening_payment_own_select on public.payments for select to authenticated
      using (tee_co_private.owns_customer(customer_id::text));
  end if;
  if to_regclass('public.payment_requests') is not null then
    drop policy if exists rls_hardening_payment_request_own_select on public.payment_requests;
    create policy rls_hardening_payment_request_own_select on public.payment_requests for select to authenticated
      using (tee_co_private.owns_customer(customer_id::text));
  end if;
  if to_regclass('public.payment_events') is not null then
    drop policy if exists rls_hardening_payment_event_own_select on public.payment_events;
    create policy rls_hardening_payment_event_own_select on public.payment_events for select to authenticated
      using (payment_request_id is not null and tee_co_private.owns_payment_request(payment_request_id::text));
  end if;
end $$;

-- 7c) Keep "existing customer row is linked on sign-in by email" working now that a customer can
-- no longer see unlinked rows. Links ONLY when the auth email is confirmed, exactly one unlinked
-- customer row has that email, and no row is linked to this user yet. Never blocks sign-in.
create or replace function tee_co_private.link_customer_on_auth()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target text; n int;
begin
  begin
    if new.email is null or new.email_confirmed_at is null then return new; end if;
    if exists (select 1 from public.customers c where c.auth_user_id::text = new.id::text) then return new; end if;
    select count(*), min(c.id::text) into n, target from public.customers c
      where c.auth_user_id is null and lower(c.email) = lower(new.email);
    if n = 1 then
      update public.customers set auth_user_id = new.id
        where id::text = target and auth_user_id is null;
    end if;
  exception when others then
    raise warning 'link_customer_on_auth skipped: %', sqlerrm;
  end;
  return new;
end $$;
revoke all on function tee_co_private.link_customer_on_auth() from public, anon, authenticated;
drop trigger if exists tee_co_link_customer_on_auth on auth.users;
create trigger tee_co_link_customer_on_auth
  after insert or update of email_confirmed_at, last_sign_in_at on auth.users
  for each row execute function tee_co_private.link_customer_on_auth();

-- 8) Defense in depth: anon never needs to write or read sensitive tables directly.
do $$
declare t text;
begin
  foreach t in array array['customers','orders','customer_artwork','payments','payment_requests',
    'payment_events','sales','staff_users','activity_logs','notification_activity',
    'notification_templates','staff_notifications'] loop
    continue when to_regclass('public.' || t) is null;
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- 9) Replacements for the two things the old (wide-open) policies allowed and the portal uses.
--    They go through narrow SECURITY DEFINER functions instead of reopening the tables.
--
--    a) Public /approval/<order>?token=... page. Staff create a random token when a quote goes to
--       "Awaiting Approval"; only its SHA-256 hash is stored. Without the exact token nothing is
--       shown or changed. The page sees only order number, garment, placement, decoration,
--       quantity, approval status and artwork file names (no names, emails, phones or prices).
--       A token works once (approve OR request changes), expires (30 days by default) and is
--       replaced when staff send a new approval request.
--    b) Signed-in customers changing their OWN existing order: "deposit sent", artwork uploaded,
--       "upload later" and "need help". Only these four actions, only the fields each one needs;
--       the customer can never change prices, payments, status or another customer's order.

create table if not exists tee_co_private.order_approval_tokens (
  id bigserial primary key,
  order_id uuid not null,
  order_number text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_by text,
  used_at timestamptz,
  used_decision text,
  revoked_at timestamptz
);
create index if not exists order_approval_tokens_order_idx on tee_co_private.order_approval_tokens (order_id);
revoke all on tee_co_private.order_approval_tokens from public, anon, authenticated;
revoke all on sequence tee_co_private.order_approval_tokens_id_seq from public, anon, authenticated;

create or replace function tee_co_private.iso_now()
returns text language sql stable set search_path = '' as $$
  select to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

create or replace function tee_co_private.approval_token_hash(p_token text)
returns text language sql immutable set search_path = '' as $$
  select encode(pg_catalog.sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

-- Applies an allow-listed change to one order: real columns, the app's order snapshot inside
-- quote, one activity entry, plus (best effort) an activity_logs row and a staff notification.
create or replace function tee_co_private.apply_customer_order_change(
  p_order_id uuid, p_columns jsonb, p_snapshot jsonb, p_activity_type text, p_activity_note text,
  p_actor text, p_source text, p_staff_type text, p_staff_text text)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare
  v_now text := tee_co_private.iso_now();
  v_entry jsonb;
  c jsonb := coalesce(p_columns, '{}'::jsonb);
  r public.orders;
begin
  v_entry := jsonb_build_object(
    'id', 'activity-' || replace(gen_random_uuid()::text, '-', ''),
    'type', p_activity_type, 'note', p_activity_note,
    'staff_id', '', 'staff_name', p_actor, 'staff_role', 'customer', 'created_at', v_now);

  update public.orders o set
    quote_status = case when c ? 'quote_status' then c->>'quote_status' else o.quote_status end,
    approval_status = case when c ? 'approval_status' then c->>'approval_status' else o.approval_status end,
    artwork_approval_status = case when c ? 'artwork_approval_status' then c->>'artwork_approval_status' else o.artwork_approval_status end,
    artwork_status = case when c ? 'artwork_status' then c->>'artwork_status' else o.artwork_status end,
    artwork_approval_required = case when c ? 'artwork_approval_required' then (c->>'artwork_approval_required')::boolean else o.artwork_approval_required end,
    customer_artwork_id = case when c ? 'customer_artwork_id' then c->>'customer_artwork_id' else o.customer_artwork_id end,
    customer_artwork_name = case when c ? 'customer_artwork_name' then c->>'customer_artwork_name' else o.customer_artwork_name end,
    artwork_files = case when c ? 'artwork_files' then c->'artwork_files' else o.artwork_files end,
    artwork_reference_names = case when c ? 'artwork_reference_names' then c->'artwork_reference_names' else o.artwork_reference_names end,
    deposit_details = case when c ? 'deposit_details'
      then (case when jsonb_typeof(o.deposit_details) = 'object' then o.deposit_details else '{}'::jsonb end) || (c->'deposit_details')
      else o.deposit_details end,
    activity_log = jsonb_build_array(v_entry)
      || (case when jsonb_typeof(o.activity_log) = 'array' then o.activity_log else '[]'::jsonb end),
    quote = jsonb_set(
      case when jsonb_typeof(o.quote) = 'object' then o.quote else '{}'::jsonb end,
      '{__tee_co_order_snapshot}',
      (case when jsonb_typeof(o.quote -> '__tee_co_order_snapshot') = 'object' then o.quote -> '__tee_co_order_snapshot' else '{}'::jsonb end)
        || (c - 'deposit_details')
        || coalesce(p_snapshot, '{}'::jsonb)
        || jsonb_build_object(
             'activity_log', jsonb_build_array(v_entry)
               || (case when jsonb_typeof(o.activity_log) = 'array' then o.activity_log else '[]'::jsonb end),
             'updated_at', v_now),
      true),
    updated_at = now()
  where o.id = p_order_id
  returning o.* into r;

  -- Side records: useful for staff, never allowed to block the customer's change.
  begin
    insert into public.activity_logs (entity_type, entity_id, entity_reference, activity_type, operational_status, note, metadata)
    values ('order', r.id, r.order_number, p_activity_type, coalesce(r.status, ''), p_activity_note,
            jsonb_build_object('source', p_source, 'actor', 'customer'));
  exception when others then
    raise warning 'activity_logs entry skipped: %', sqlerrm;
  end;
  begin
    insert into public.staff_notifications (id, type, order_number, assigned_to_staff_id, assigned_to_staff_name, description, link_to, read, created_at)
    values ('staff-notif-' || gen_random_uuid()::text, p_staff_type, r.order_number,
            coalesce(r.assigned_to_staff_user_id::text, ''), coalesce(r.assigned_to_staff_name, ''),
            p_staff_text, '/admin/orders/' || r.order_number, false, now());
  exception when others then
    raise warning 'staff notification skipped: %', sqlerrm;
  end;
  return r;
end $$;
revoke all on function tee_co_private.apply_customer_order_change(uuid, jsonb, jsonb, text, text, text, text, text, text) from public, anon, authenticated;

-- 9a) Approval links ---------------------------------------------------------
create or replace function public.create_order_approval_token(p_order_number text, p_valid_days integer default 30)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid; v_number text; v_token text;
  v_days integer := least(greatest(coalesce(p_valid_days, 30), 1), 90);
begin
  if not (public.is_tee_co_operational_staff() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'Only Tee & Co staff can create approval links.' using errcode = '42501';
  end if;
  select o.id, o.order_number into v_id, v_number from public.orders o where o.order_number = btrim(p_order_number);
  if v_id is null then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  -- 2 x 122 random bits from the server's cryptographic random generator
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  -- a new link replaces every earlier one for this order (used or not)
  update tee_co_private.order_approval_tokens set revoked_at = now()
    where order_id = v_id and revoked_at is null;
  insert into tee_co_private.order_approval_tokens (order_id, order_number, token_hash, expires_at, created_by)
  values (v_id, v_number, tee_co_private.approval_token_hash(v_token), now() + make_interval(days => v_days),
          coalesce(auth.jwt() -> 'app_metadata' ->> 'staff_user_id', auth.uid()::text, 'service_role'));
  return v_token;
end $$;
revoke all on function public.create_order_approval_token(text, integer) from public, anon;
grant execute on function public.create_order_approval_token(text, integer) to authenticated, service_role;

create or replace function tee_co_private.approval_view(p_order public.orders, p_token tee_co_private.order_approval_tokens)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'order_number', p_order.order_number,
    'garment', coalesce(p_order.garment, ''),
    'placement', coalesce(p_order.placement, ''),
    'decoration_type', coalesce(p_order.decoration_type, ''),
    'quantity', coalesce(p_order.qty, 0),
    'approval_status', coalesce(p_order.approval_status, ''),
    'artwork_approval_status', coalesce(p_order.artwork_approval_status, ''),
    'decided', p_token.used_at is not null,
    'decision', p_token.used_decision,
    'decided_at', p_token.used_at,
    'expires_at', p_token.expires_at,
    'artwork_files', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', coalesce(f ->> 'id', 'file-' || ord),
        'name', coalesce(nullif(f ->> 'display_name', ''), nullif(f ->> 'name', ''), nullif(f ->> 'file_name', ''),
                         nullif(f ->> 'original_filename', ''), 'Artwork file'),
        'type', coalesce(nullif(f ->> 'file_type', ''), f ->> 'type', ''),
        'has_preview', coalesce(nullif(f ->> 'storage_path', ''), nullif(f ->> 'storage_reference', '')) is not null
      ) order by ord), '[]'::jsonb)
      from jsonb_array_elements(case when jsonb_typeof(p_order.artwork_files) = 'array' then p_order.artwork_files else '[]'::jsonb end)
        with ordinality as e(f, ord)));
$$;
revoke all on function tee_co_private.approval_view(public.orders, tee_co_private.order_approval_tokens) from public, anon, authenticated;

create or replace function public.get_order_approval(p_order_number text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t tee_co_private.order_approval_tokens; o public.orders;
begin
  select * into t from tee_co_private.order_approval_tokens x
    where length(coalesce(p_token, '')) >= 32
      and x.token_hash = tee_co_private.approval_token_hash(p_token)
      and x.order_number = btrim(coalesce(p_order_number, ''))
      and x.revoked_at is null and x.expires_at > now();
  if t.id is not null then
    select * into o from public.orders where id = t.order_id;
  end if;
  if t.id is null or o.id is null or o.order_number is distinct from t.order_number then
    raise exception 'This approval link is not valid or has expired.' using errcode = '28000';
  end if;
  return tee_co_private.approval_view(o, t);
end $$;
revoke all on function public.get_order_approval(text, text) from public;
grant execute on function public.get_order_approval(text, text) to anon, authenticated, service_role;

create or replace function public.submit_order_approval(p_order_number text, p_token text, p_decision text, p_note text default '')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  t tee_co_private.order_approval_tokens; o public.orders;
  v_note text := left(btrim(coalesce(p_note, '')), 2000);
  v_now text := tee_co_private.iso_now();
begin
  select * into t from tee_co_private.order_approval_tokens x
    where length(coalesce(p_token, '')) >= 32
      and x.token_hash = tee_co_private.approval_token_hash(p_token)
      and x.order_number = btrim(coalesce(p_order_number, ''))
      and x.revoked_at is null and x.expires_at > now()
    for update;
  if t.id is not null then
    select * into o from public.orders where id = t.order_id for update;
  end if;
  if t.id is null or o.id is null or o.order_number is distinct from t.order_number then
    raise exception 'This approval link is not valid or has expired.' using errcode = '28000';
  end if;
  if t.used_at is not null then
    raise exception 'This approval link has already been used.' using errcode = 'P0001';
  end if;
  if coalesce(o.quote_archived, false) or o.status = 'Canceled' or o.quote_status = 'Canceled' then
    raise exception 'This order can no longer be approved online. Please contact Tee & Co.' using errcode = 'P0001';
  end if;

  if p_decision = 'approve' then
    o := tee_co_private.apply_customer_order_change(o.id,
      jsonb_build_object(
        'quote_status', case when coalesce(o.deposit_required, false) then 'Awaiting Deposit' else 'Approved' end,
        'approval_status', 'Customer Approved',
        'artwork_approval_status', 'Approved'),
      jsonb_build_object('customer_approval_note', v_note, 'customer_approved_at', v_now),
      'customer_approval',
      'Customer approved the mockup from the approval link.' || case when v_note <> '' then ' Note: ' || v_note else '' end,
      'Customer', 'approval_link', 'production_status_changed',
      'Customer approved the mockup for order ' || o.order_number || '.');
  elsif p_decision = 'request_changes' then
    o := tee_co_private.apply_customer_order_change(o.id,
      jsonb_build_object(
        'quote_status', 'Awaiting Artwork Approval',
        'approval_status', 'Customer Requested Changes',
        'artwork_approval_status', 'Needs Revision'),
      jsonb_build_object('customer_approval_note', v_note, 'customer_revision_requested_at', v_now),
      'customer_requested_changes',
      'Customer requested changes from the approval link.' || case when v_note <> '' then ' Note: ' || v_note else '' end,
      'Customer', 'approval_link', 'artwork_required',
      'Customer requested mockup changes for order ' || o.order_number || '.');
  else
    raise exception 'Unknown decision.' using errcode = '22023';
  end if;

  update tee_co_private.order_approval_tokens set used_at = now(), used_decision = p_decision where id = t.id
    returning * into t;
  return tee_co_private.approval_view(o, t);
end $$;
revoke all on function public.submit_order_approval(text, text, text, text) from public;
grant execute on function public.submit_order_approval(text, text, text, text) to anon, authenticated, service_role;

-- Storage paths of the order's artwork, for the Netlify function that makes short-lived preview
-- links. Service role only; same token check as above.
create or replace function public.get_order_approval_file_paths(p_order_number text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t tee_co_private.order_approval_tokens; o public.orders;
begin
  select * into t from tee_co_private.order_approval_tokens x
    where length(coalesce(p_token, '')) >= 32
      and x.token_hash = tee_co_private.approval_token_hash(p_token)
      and x.order_number = btrim(coalesce(p_order_number, ''))
      and x.revoked_at is null and x.expires_at > now();
  if t.id is not null then
    select * into o from public.orders where id = t.order_id;
  end if;
  if t.id is null or o.id is null then
    raise exception 'This approval link is not valid or has expired.' using errcode = '28000';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', coalesce(f ->> 'id', 'file-' || ord),
      'storage_path', coalesce(nullif(f ->> 'storage_path', ''), f ->> 'storage_reference'))
      order by ord), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(o.artwork_files) = 'array' then o.artwork_files else '[]'::jsonb end)
      with ordinality as e(f, ord)
    where coalesce(nullif(f ->> 'storage_path', ''), nullif(f ->> 'storage_reference', '')) is not null
      and coalesce(nullif(f ->> 'storage_path', ''), f ->> 'storage_reference') not like 'http%');
end $$;
revoke all on function public.get_order_approval_file_paths(text, text) from public, anon, authenticated;
grant execute on function public.get_order_approval_file_paths(text, text) to service_role;

-- 9b) Customer changes to their own existing order ---------------------------
create or replace function public.customer_order_action(p_order_number text, p_action text, p_payload jsonb default '{}'::jsonb)
returns public.orders language plpgsql volatile security definer set search_path = '' as $$
declare
  o public.orders; a public.customer_artwork;
  p jsonb := coalesce(p_payload, '{}'::jsonb);
  v_now text := tee_co_private.iso_now();
  v_note text; v_entry jsonb; v_files jsonb; v_name text; v_revision boolean;
begin
  if auth.uid() is null then
    raise exception 'Please sign in to update your order.' using errcode = '28000';
  end if;
  select * into o from public.orders where order_number = btrim(coalesce(p_order_number, '')) for update;
  -- same message whether the order does not exist or belongs to someone else
  if o.id is null or o.customer_id is null or not tee_co_private.owns_customer(o.customer_id::text) then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  if coalesce(o.quote_archived, false) or o.status in ('Canceled', 'Completed', 'Picked Up') or o.quote_status = 'Canceled' then
    raise exception 'This order can no longer be changed online. Please contact Tee & Co.' using errcode = 'P0001';
  end if;

  if p_action = 'deposit_sent' then
    if not (coalesce(o.deposit_required, false) or coalesce(o.deposit_amount, 0) > 0) then
      raise exception 'There is no deposit due on this order.' using errcode = 'P0001';
    end if;
    v_note := left(btrim(coalesce(p ->> 'note', '')), 1000);
    return tee_co_private.apply_customer_order_change(o.id,
      jsonb_build_object('deposit_details', jsonb_build_object(
        'customer_confirmation_status', 'sent', 'customer_marked_sent_at', v_now, 'customer_confirmation_note', v_note)),
      jsonb_build_object(
        'deposit_customer_confirmation_status', 'Sent', 'deposit_customer_confirmed_at', v_now,
        'deposit_customer_confirmation_note', v_note,
        'deposit', (case when jsonb_typeof(o.deposit_details) = 'object' then o.deposit_details else '{}'::jsonb end)
          || jsonb_build_object('customer_confirmation_status', 'sent', 'customer_marked_sent_at', v_now, 'customer_confirmation_note', v_note)),
      'deposit_customer_confirmation',
      'Customer marked deposit payment as sent.' || case when v_note <> '' then ' Note: ' || v_note else '' end,
      'Customer', 'customer_portal', 'payment_hold',
      'Customer says the deposit for order ' || o.order_number || ' has been sent. Please confirm the payment.');

  elsif p_action = 'artwork_uploaded' then
    select * into a from public.customer_artwork ca
      where ca.id::text = coalesce(p ->> 'artwork_id', '') and ca.customer_id::text = o.customer_id::text;
    if not found then
      raise exception 'Uploaded artwork not found.' using errcode = 'P0002';
    end if;
    v_note := left(btrim(coalesce(p ->> 'notes', '')), 2000);
    v_revision := coalesce((p ->> 'revision')::boolean, false);
    v_name := coalesce(nullif(to_jsonb(a) ->> 'display_name', ''), nullif(to_jsonb(a) ->> 'original_filename', ''), a.file_name);
    v_entry := jsonb_build_object(
      'id', a.id::text, 'name', v_name, 'display_name', v_name, 'file_name', a.file_name,
      'original_filename', coalesce(to_jsonb(a) ->> 'original_filename', a.file_name),
      'file_type', coalesce(to_jsonb(a) ->> 'file_type', ''), 'type', coalesce(to_jsonb(a) ->> 'file_type', ''),
      'file_size', coalesce((to_jsonb(a) ->> 'file_size')::bigint, 0),
      'storage_path', a.storage_path, 'storage_reference', a.storage_path, 'asset_reference', a.storage_path,
      'customer_id', a.customer_id::text, 'uploaded_at', coalesce(to_char(a.uploaded_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), v_now),
      'uploaded_by', 'customer', 'notes', v_note, 'revision', v_revision);
    select jsonb_build_array(v_entry) || coalesce(jsonb_agg(f order by ord), '[]'::jsonb) into v_files
      from jsonb_array_elements(case when jsonb_typeof(o.artwork_files) = 'array' then o.artwork_files else '[]'::jsonb end)
        with ordinality as e(f, ord)
      where coalesce(f ->> 'id', '') <> a.id::text;
    return tee_co_private.apply_customer_order_change(o.id,
      jsonb_build_object(
        'artwork_files', v_files,
        'artwork_reference_names', (select coalesce(jsonb_agg(coalesce(nullif(f ->> 'display_name', ''), nullif(f ->> 'name', ''), f ->> 'file_name') order by ord), '[]'::jsonb)
                                    from jsonb_array_elements(v_files) with ordinality as e(f, ord)),
        'customer_artwork_id', a.id::text, 'customer_artwork_name', v_name,
        'artwork_status', 'Pending Review', 'artwork_approval_required', true,
        'artwork_approval_status', 'Pending Review', 'approval_status', 'Pending Review'),
      jsonb_build_object('artwork_requirement', 'Uploaded', 'customer_artwork_notes', v_note, 'customer_artwork_uploaded_at', v_now),
      case when v_revision then 'artwork_revised' else 'artwork_uploaded' end,
      case when v_revision then 'Customer uploaded revised artwork: ' else 'Customer uploaded artwork: ' end || v_name || '.',
      'Customer', 'customer_portal', 'artwork_required',
      'Customer uploaded ' || case when v_revision then 'revised ' else '' end || 'artwork for order ' || o.order_number || '. Please review.');

  elsif p_action = 'artwork_upload_later' then
    return tee_co_private.apply_customer_order_change(o.id,
      jsonb_build_object('artwork_status', 'Missing', 'artwork_approval_required', true, 'artwork_approval_status', 'Pending Review'),
      jsonb_build_object('artwork_requirement', 'Upload Later'),
      'artwork_upload_later', 'Customer chose to upload artwork later.',
      'Customer', 'customer_portal', 'artwork_required',
      'Customer will upload artwork later for order ' || o.order_number || '.');

  elsif p_action = 'artwork_help' then
    v_note := left(btrim(coalesce(p ->> 'message', '')), 2000);
    if v_note = '' then
      raise exception 'Tell us how Tee & Co can help with your artwork.' using errcode = '22023';
    end if;
    return tee_co_private.apply_customer_order_change(o.id,
      jsonb_build_object('artwork_status', 'Help Requested', 'artwork_approval_required', true, 'artwork_approval_status', 'Pending Review'),
      jsonb_build_object('artwork_requirement', 'Help Needed', 'artwork_help_message', v_note, 'customer_artwork_help_requested_at', v_now),
      'artwork_help_requested', 'Customer requested artwork help: ' || v_note,
      'Customer', 'customer_portal', 'artwork_required',
      'Customer asked for artwork help on order ' || o.order_number || '.');
  end if;
  raise exception 'Unknown order action.' using errcode = '22023';
end $$;
revoke all on function public.customer_order_action(text, text, jsonb) from public, anon;
grant execute on function public.customer_order_action(text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
