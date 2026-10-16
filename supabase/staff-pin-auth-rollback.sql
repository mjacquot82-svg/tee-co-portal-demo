-- Rollback for staff-pin-auth.sql. NOTE: plaintext PINs are NOT restored (they were hashed);
-- staff must have PINs re-set after a rollback. Restores the pre-change staff check.
begin;
drop trigger if exists staff_users_hash_pin on public.staff_users;
drop function if exists tee_co_private.hash_staff_pin();
drop function if exists public.list_pin_login_staff();
drop function if exists public.verify_staff_pin(uuid, text);
drop table if exists public.staff_pin_login_attempts;
create or replace function public.is_tee_co_operational_staff()
returns boolean language sql stable set search_path = '' as $$
  select lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'operational_role',
    auth.jwt() -> 'app_metadata' ->> 'role', '')) = any (array['owner', 'manager', 'staff']);
$$;
create or replace function tee_co_private.operational_role()
returns text language sql stable set search_path = '' as $$
  select lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'operational_role',
    auth.jwt() -> 'app_metadata' ->> 'role', ''));
$$;
drop function if exists tee_co_private.pin_staff_still_active();
grant select, insert, update on public.staff_users to authenticated;
alter table public.staff_users drop column if exists failed_pin_attempts;
alter table public.staff_users drop column if exists pin_locked_until;
alter table public.staff_users drop column if exists auth_user_id;
alter table public.staff_users drop column if exists has_pin;
alter table public.staff_users drop column if exists pin_hash;
commit;
