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
-- IMPORTANT: staff who sign in with only the 4-digit PIN have NO Supabase session (they are
-- "anon" to the database) and will no longer be able to load staff-only data.

begin;

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

-- Helpers ------------------------------------------------------------------
create or replace function public.is_tee_co_operational_staff()
returns boolean language sql stable set search_path = '' as $$
  select lower(coalesce(
    auth.jwt() -> 'app_metadata' ->> 'operational_role',
    auth.jwt() -> 'app_metadata' ->> 'role',
    '')) = any (array['owner', 'manager', 'staff']);
$$;

create or replace function tee_co_private.owns_customer(target_customer_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.customers c
    where c.id::text = target_customer_id and c.auth_user_id = auth.uid());
$$;
revoke all on function tee_co_private.owns_customer(text) from public, anon;
grant execute on function tee_co_private.owns_customer(text) to authenticated;
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
      using (auth_user_id = (select auth.uid()));
    drop policy if exists rls_hardening_customer_own_insert on public.customers;
    create policy rls_hardening_customer_own_insert on public.customers for insert to authenticated
      with check (auth_user_id = (select auth.uid()));
    drop policy if exists rls_hardening_customer_own_update on public.customers;
    create policy rls_hardening_customer_own_update on public.customers for update to authenticated
      using (auth_user_id = (select auth.uid())) with check (auth_user_id = (select auth.uid()));
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
end $$;

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

commit;
