-- Tee & Co go-live PHASE C. Run only after the PR 68 code is live and staff have signed in with
-- the new server-side PIN login (phase A + deploy + phase B done). Idempotent.
-- * Clears plaintext staff PINs (bcrypt pin_hash stays; login keeps working).
-- * From now on any PIN written by the staff admin screen is hashed, then cleared.
-- * The browser can no longer read pin / pin_hash / lockout columns (column grants).
-- Plaintext is copied first into tee_co_private.staff_pin_plain_backup (service role/postgres
-- only) so phase C can be rolled back exactly; DROP that table once go-live is confirmed.
begin;

do $$ begin
  if to_regprocedure('public.verify_staff_pin(uuid,text)') is null then
    raise exception 'Run phase A first';
  end if;
  if exists (select 1 from public.staff_users where pin is not null and pin_hash is null) then
    raise exception 'Some staff have a PIN but no hash; re-run phase A first';
  end if;
end $$;

create table if not exists tee_co_private.staff_pin_plain_backup (
  staff_user_id uuid primary key, pin text, captured_at timestamptz not null default now());
revoke all on tee_co_private.staff_pin_plain_backup from public, anon, authenticated, service_role;
insert into tee_co_private.staff_pin_plain_backup (staff_user_id, pin)
select id, pin from public.staff_users where pin is not null
on conflict (staff_user_id) do nothing;

create or replace function tee_co_private.hash_staff_pin()
returns trigger language plpgsql security definer set search_path = '' as $$
declare clean text := regexp_replace(coalesce(new.pin, ''), '\D', '', 'g');
begin
  if new.pin is not null and btrim(new.pin) <> '' then
    if clean !~ '^\d{4}$' then
      raise exception 'Staff PIN must be 4 digits' using errcode = '22023';
    end if;
    new.pin_hash := extensions.crypt(clean, extensions.gen_salt('bf', 10));
    new.failed_pin_attempts := 0;
    new.pin_locked_until := null;
  end if;
  new.pin := null;
  return new;
end $$;

update public.staff_users set pin = null where pin is not null;

revoke all on public.staff_users from anon;
revoke select, insert, update on public.staff_users from authenticated;
grant select (id, legacy_staff_id, name, role, active, status, last_active_at, created_at, updated_at, auth_user_id, has_pin)
  on public.staff_users to authenticated;
grant insert (name, role, active, status, pin, legacy_staff_id) on public.staff_users to authenticated;
grant update (name, role, active, status, pin, last_active_at, updated_at) on public.staff_users to authenticated;

notify pgrst, 'reload schema';
commit;
