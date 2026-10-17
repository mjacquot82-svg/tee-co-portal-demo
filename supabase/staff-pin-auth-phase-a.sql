-- Tee & Co go-live PHASE A (additive). Idempotent. Run BEFORE deploying the PR 68 code.
-- Safe for the CURRENT (old main) app: plaintext staff_users.pin is KEPT and still works for the
-- old browser PIN check and the old upload functions. Nothing is revoked, no RLS is changed.
-- Adds what the new server-side PIN login needs:
--   * schema tee_co_private
--   * staff_users: pin_hash (bcrypt, kept in sync with pin by a trigger), auth_user_id,
--     failed_pin_attempts, pin_locked_until, has_pin; plus nullable compatibility columns the new
--     frontend selects (status, legacy_staff_id, last_active_at, updated_at). "active" stays the
--     source of truth: a staff member is active unless active = false or status = 'Inactive'.
--   * list_pin_login_staff() (names only, anon), verify_staff_pin() (service role only, lockout)
--   * staff_pin_login_attempts (per-IP rate limit log, service role only)
--   * tee_co_private.pin_staff_still_active() / tee_co_private.operational_role() helpers
-- Works on both shapes: live (text ids, staff_users.active) and staging (uuid ids, status).

begin;

do $$ begin
  -- Phase C already applied (browser can no longer read pin_hash)? Then phase A must not run
  -- again: it would put back the "keep plaintext PIN" trigger.
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='staff_users' and column_name='pin_hash')
     and not has_column_privilege('authenticated', 'public.staff_users', 'pin_hash', 'select') then
    raise exception 'Phase C is already applied; do not re-run phase A (roll back phase C first)';
  end if;
end $$;

create schema if not exists tee_co_private;
revoke all on schema tee_co_private from public, anon;
grant usage on schema tee_co_private to authenticated, service_role;

alter table public.staff_users add column if not exists pin_hash text;
alter table public.staff_users add column if not exists auth_user_id uuid;
alter table public.staff_users add column if not exists failed_pin_attempts integer not null default 0;
alter table public.staff_users add column if not exists pin_locked_until timestamptz;
alter table public.staff_users add column if not exists has_pin boolean generated always as (pin_hash is not null) stored;
create table if not exists tee_co_private.golive_added_columns (
  table_name text not null, column_name text not null, added_at timestamptz not null default now(),
  primary key (table_name, column_name));
revoke all on tee_co_private.golive_added_columns from public, anon, authenticated;
do $$ declare c record; begin
  for c in select * from (values ('active','boolean'),('status','text'),('legacy_staff_id','text'),
                                 ('last_active_at','timestamptz'),('updated_at','timestamptz')) v(col, typ) loop
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='staff_users' and column_name=c.col) then
      execute format('alter table public.staff_users add column %I %s', c.col, c.typ);
      insert into tee_co_private.golive_added_columns values ('staff_users', c.col) on conflict do nothing;
    end if;
  end loop;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'staff_users_auth_user_id_key') then
    alter table public.staff_users add constraint staff_users_auth_user_id_key unique (auth_user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_users_auth_user_id_fkey') then
    alter table public.staff_users add constraint staff_users_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users (id) on delete set null;
  end if;
end $$;

create or replace function tee_co_private.staff_row_is_active(p_active boolean, p_status text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_active, true) and coalesce(p_status, 'Active') <> 'Inactive';
$$;
grant execute on function tee_co_private.staff_row_is_active(boolean, text) to authenticated, service_role;

-- PHASE A trigger: hash every PIN write, KEEP plaintext (old app still compares it).
-- Phase C replaces this function with one that also clears plaintext.
create or replace function tee_co_private.hash_staff_pin()
returns trigger language plpgsql security definer set search_path = '' as $$
declare clean text := regexp_replace(coalesce(new.pin, ''), '\D', '', 'g');
begin
  if tg_op = 'UPDATE' and new.pin is not distinct from old.pin and new.pin_hash is not null then
    return new;
  end if;
  if clean ~ '^\d{4}$' then
    new.pin_hash := extensions.crypt(clean, extensions.gen_salt('bf', 10));
    new.failed_pin_attempts := 0;
    new.pin_locked_until := null;
  elsif new.pin is null or btrim(new.pin) = '' then
    null; -- keep existing hash (phase C clears plaintext on purpose)
  else
    raise exception 'Staff PIN must be 4 digits' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists staff_users_hash_pin on public.staff_users;
create trigger staff_users_hash_pin before insert or update of pin on public.staff_users
  for each row execute function tee_co_private.hash_staff_pin();

-- Backfill hashes for existing plaintext PINs (pin itself unchanged)
update public.staff_users
   set pin_hash = extensions.crypt(regexp_replace(pin, '\D', '', 'g'), extensions.gen_salt('bf', 10))
 where pin_hash is null and regexp_replace(coalesce(pin, ''), '\D', '', 'g') ~ '^\d{4}$';

create or replace function public.list_pin_login_staff()
returns table (id uuid, name text, role text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.role from public.staff_users s
  where tee_co_private.staff_row_is_active(s.active, s.status) and s.pin_hash is not null
  order by s.name;
$$;
revoke all on function public.list_pin_login_staff() from public;
grant execute on function public.list_pin_login_staff() to anon, authenticated, service_role;

create or replace function public.verify_staff_pin(p_staff_user_id uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.staff_users%rowtype; clean text := regexp_replace(coalesce(p_pin, ''), '\D', '', 'g');
begin
  select * into s from public.staff_users where id = p_staff_user_id for update;
  if not found or not tee_co_private.staff_row_is_active(s.active, s.status) or s.pin_hash is null then
    perform extensions.crypt(clean, extensions.gen_salt('bf', 10));
    return jsonb_build_object('ok', false, 'code', 'INVALID');
  end if;
  if s.pin_locked_until is not null and s.pin_locked_until > now() then
    return jsonb_build_object('ok', false, 'code', 'LOCKED', 'locked_until', s.pin_locked_until);
  end if;
  if length(clean) = 4 and extensions.crypt(clean, s.pin_hash) = s.pin_hash then
    update public.staff_users set failed_pin_attempts = 0, pin_locked_until = null, last_active_at = now()
      where id = s.id;
    return jsonb_build_object('ok', true, 'id', s.id, 'name', s.name, 'role', s.role, 'auth_user_id', s.auth_user_id);
  end if;
  if s.failed_pin_attempts + 1 >= 5 then
    update public.staff_users set failed_pin_attempts = 0, pin_locked_until = now() + interval '15 minutes'
      where id = s.id;
    return jsonb_build_object('ok', false, 'code', 'LOCKED', 'locked_until', now() + interval '15 minutes');
  end if;
  update public.staff_users set failed_pin_attempts = s.failed_pin_attempts + 1 where id = s.id;
  return jsonb_build_object('ok', false, 'code', 'INVALID');
end $$;
revoke all on function public.verify_staff_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.verify_staff_pin(uuid, text) to service_role;

create table if not exists public.staff_pin_login_attempts (
  id bigserial primary key,
  ip_key text not null,
  staff_user_id uuid,
  success boolean not null,
  attempted_at timestamptz not null default now()
);
create index if not exists staff_pin_login_attempts_ip_idx on public.staff_pin_login_attempts (ip_key, attempted_at);
alter table public.staff_pin_login_attempts enable row level security;
revoke all on public.staff_pin_login_attempts from public, anon, authenticated;
grant select, insert on public.staff_pin_login_attempts to service_role;
grant usage on sequence public.staff_pin_login_attempts_id_seq to service_role;
grant select, update on public.staff_users to service_role;

create or replace function tee_co_private.pin_staff_still_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when (auth.jwt() -> 'app_metadata' ->> 'staff_user_id') is null then true
    else exists (select 1 from public.staff_users s
                 where s.id::text = auth.jwt() -> 'app_metadata' ->> 'staff_user_id'
                   and s.auth_user_id = auth.uid()
                   and tee_co_private.staff_row_is_active(s.active, s.status))
  end;
$$;
revoke all on function tee_co_private.pin_staff_still_active() from public, anon;
grant execute on function tee_co_private.pin_staff_still_active() to authenticated, service_role;

create or replace function tee_co_private.operational_role()
returns text language sql stable set search_path = '' as $$
  select case when tee_co_private.pin_staff_still_active()
    then lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'operational_role',
                        auth.jwt() -> 'app_metadata' ->> 'role', ''))
    else '' end;
$$;
grant execute on function tee_co_private.operational_role() to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
