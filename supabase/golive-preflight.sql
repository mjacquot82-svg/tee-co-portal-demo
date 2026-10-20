-- READ-ONLY go-live status check. Safe to run any time (SELECT only). Shows which phases are in.
select
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity) as public_tables_without_rls,
  to_regprocedure('public.verify_staff_pin(uuid,text)') is not null as phase_a_installed,
  (select count(*) from public.staff_users where pin_hash is null and pin is not null) as staff_pins_missing_hash,
  exists (select 1 from pg_policies where schemaname='public' and policyname like 'rls\_hardening\_%') as phase_b_installed,
  (select count(*) from public.staff_users where pin is not null) as staff_plaintext_pins,
  not has_column_privilege('authenticated', 'public.staff_users', 'pin_hash', 'select') as phase_c_column_grants,
  exists (select 1 from pg_policies where schemaname='storage' and policyname like 'storage\_hardening\_%') as phase_d_installed,
  exists (select 1 from pg_policies where schemaname='storage' and policyname in ('Allow public reads','Allow public uploads','Allow public deletes')) as artwork_bucket_still_public,
  has_table_privilege('service_role', 'public.payments', 'insert') as service_role_can_write_payments,
  has_table_privilege('service_role', 'public.payment_events', 'insert') as service_role_can_write_payment_events,
  has_table_privilege('anon', 'public.orders', 'select') as anon_can_read_orders;
