-- Rollback PHASE D: re-creates the original public customer-artwork policies, removes staff ones.
-- WARNING: re-opens customer artwork files to anonymous read/upload/delete.
begin;
do $$ declare r record; begin
  for r in select distinct on (policy_name) * from tee_co_private.rls_hardening_backup
           where kind = 'storage_policy' order by policy_name, captured_at loop
    if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname=r.policy_name) then
      execute r.policy_sql;
    end if;
  end loop;
  delete from tee_co_private.rls_hardening_backup where kind = 'storage_policy';
end $$;
drop policy if exists storage_hardening_staff_artwork_select on storage.objects;
drop policy if exists storage_hardening_staff_artwork_insert on storage.objects;
drop policy if exists storage_hardening_staff_artwork_update on storage.objects;
drop policy if exists storage_hardening_staff_artwork_delete on storage.objects;
commit;
