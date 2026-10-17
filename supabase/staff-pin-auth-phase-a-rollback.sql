-- Rollback PHASE A. Plaintext PINs were never removed in phase A, so nothing is lost.
-- Only run this if phase B and C are NOT applied (roll those back first).
begin;
drop trigger if exists staff_users_hash_pin on public.staff_users;
drop function if exists tee_co_private.hash_staff_pin();
drop function if exists public.list_pin_login_staff();
drop function if exists public.verify_staff_pin(uuid, text);
drop table if exists public.staff_pin_login_attempts;
drop function if exists tee_co_private.operational_role();
drop function if exists tee_co_private.pin_staff_still_active();
alter table public.staff_users drop constraint if exists staff_users_auth_user_id_fkey;
alter table public.staff_users drop constraint if exists staff_users_auth_user_id_key;
alter table public.staff_users drop column if exists has_pin;
alter table public.staff_users drop column if exists pin_hash;
alter table public.staff_users drop column if exists failed_pin_attempts;
alter table public.staff_users drop column if exists pin_locked_until;
alter table public.staff_users drop column if exists auth_user_id;
-- compatibility columns: drop only the ones phase A itself added
do $$ declare c record; begin
  if to_regclass('tee_co_private.golive_added_columns') is not null then
    for c in select column_name from tee_co_private.golive_added_columns where table_name='staff_users' loop
      execute format('alter table public.staff_users drop column if exists %I', c.column_name);
    end loop;
    drop table tee_co_private.golive_added_columns;
  end if;
end $$;
drop function if exists tee_co_private.staff_row_is_active(boolean, text);
do $$ begin
  if to_regnamespace('tee_co_private') is not null and not exists (
       select 1 from pg_class where relnamespace = 'tee_co_private'::regnamespace
       union all select 1 from pg_proc where pronamespace = 'tee_co_private'::regnamespace) then
    drop schema tee_co_private;
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
