-- Tee & Co go-live PHASE D (later, separate): lock down the customer-artwork bucket.
-- Live today has "Allow public reads / uploads / deletes" on customer-artwork for EVERYONE
-- (including anonymous visitors). This adds staff/owner policies first, then drops the public
-- ones (after backing them up). Customers keep their own-folder upload/view policies.
-- Requires phase B. Netlify functions (service role) are unaffected. Idempotent.
begin;
do $$ begin
  if to_regclass('tee_co_private.rls_hardening_backup') is null then
    raise exception 'Run phase B (rls-hardening.sql) first';
  end if;
end $$;
drop policy if exists storage_hardening_staff_artwork_select on storage.objects;
create policy storage_hardening_staff_artwork_select on storage.objects for select to authenticated
  using (bucket_id = 'customer-artwork' and public.is_tee_co_operational_staff());
drop policy if exists storage_hardening_staff_artwork_insert on storage.objects;
create policy storage_hardening_staff_artwork_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'customer-artwork' and public.is_tee_co_operational_staff());
drop policy if exists storage_hardening_staff_artwork_update on storage.objects;
create policy storage_hardening_staff_artwork_update on storage.objects for update to authenticated
  using (bucket_id = 'customer-artwork' and public.is_tee_co_operational_staff())
  with check (bucket_id = 'customer-artwork' and public.is_tee_co_operational_staff());
drop policy if exists storage_hardening_staff_artwork_delete on storage.objects;
create policy storage_hardening_staff_artwork_delete on storage.objects for delete to authenticated
  using (bucket_id = 'customer-artwork' and public.is_tee_co_operational_staff());
do $$ declare p record; begin
  for p in select * from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and policyname in ('Allow public reads', 'Allow public uploads', 'Allow public deletes') loop
    insert into tee_co_private.rls_hardening_backup (kind, table_name, policy_name, policy_sql)
    values ('storage_policy', 'objects', p.policyname, format(
      'create policy %I on storage.objects as %s for %s to %s%s%s',
      p.policyname, p.permissive, p.cmd, array_to_string(p.roles, ', '),
      coalesce(' using (' || p.qual || ')', ''), coalesce(' with check (' || p.with_check || ')', '')));
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;
commit;
