-- Rollback for supabase/rls-hardening.sql. Restores original RLS on/off flags, recreates
-- policies the hardening dropped, removes rls_hardening_* policies and re-grants anon.
-- WARNING: rolling back re-opens the tables that were unprotected before.
begin;
do $$
declare r record; p record;
begin
  for p in select tablename, policyname from pg_policies
           where schemaname = 'public' and policyname like 'rls\_hardening\_%' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
  for r in select distinct on (table_name, policy_name) * from tee_co_private.rls_hardening_backup
           where kind = 'policy' order by table_name, policy_name, captured_at loop
    if to_regclass('public.' || r.table_name) is not null and not exists (
       select 1 from pg_policies where schemaname='public' and tablename=r.table_name and policyname=r.policy_name) then
      execute r.policy_sql;
    end if;
  end loop;
  for r in select * from tee_co_private.rls_hardening_backup where kind = 'rls' loop
    if to_regclass('public.' || r.table_name) is not null then
      execute format('alter table public.%I %s row level security', r.table_name,
                     case when r.rls_enabled then 'enable' else 'disable' end);
    end if;
  end loop;
  for r in select * from tee_co_private.rls_hardening_backup where kind = 'anon_grant' loop
    if to_regclass('public.' || r.table_name) is not null then
      execute format('grant %s on public.%I to anon', r.policy_sql, r.table_name);
    end if;
  end loop;
end $$;
drop trigger if exists tee_co_link_customer_on_auth on auth.users;
drop function if exists tee_co_private.link_customer_on_auth();
drop function if exists tee_co_private.owns_payment_request(text);
drop function if exists tee_co_private.owns_customer(text);
do $$ declare d text; begin
  select policy_sql into d from tee_co_private.rls_hardening_backup where kind = 'function'
    and table_name = 'is_tee_co_operational_staff' order by captured_at limit 1;
  if d is not null then
    execute d;
    grant execute on function public.is_tee_co_operational_staff() to public, anon, authenticated;
  end if;
end $$;
drop table if exists tee_co_private.rls_hardening_backup;
notify pgrst, 'reload schema';
commit;
