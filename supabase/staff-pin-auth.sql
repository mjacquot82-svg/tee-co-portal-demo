-- Tee & Co server-side staff PIN login. Run AFTER supabase/rls-hardening.sql. Idempotent.
-- * PINs are stored only as bcrypt hashes (pin_hash); the plaintext pin column is cleared and
--   any PIN written to it later (staff admin screen) is hashed by a trigger, then cleared.
-- * The browser can no longer read pin / pin_hash / lockout columns (column grants).
-- * The login screen gets names only via public.list_pin_login_staff().
-- * PIN checks happen only in public.verify_staff_pin(), callable by the service role
--   (Netlify functions), with lockout: 5 wrong PINs -> locked 15 minutes.
-- * A PIN-only staff member gets a dedicated Supabase Auth user (linked via auth_user_id) whose
--   app_metadata carries operational_role + staff_user_id; the RLS staff check also requires
--   that staff_users row to still be Active, so deactivating staff cuts DB access immediately.

begin;

alter table public.staff_users add column if not exists pin_hash text;
alter table public.staff_users add column if not exists auth_user_id uuid;
alter table public.staff_users add column if not exists failed_pin_attempts integer not null default 0;
alter table public.staff_users add column if not exists pin_locked_until timestamptz;
alter table public.staff_users add column if not exists has_pin boolean generated always as (pin_hash is not null) stored;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'staff_users_auth_user_id_key') then
    alter table public.staff_users add constraint staff_users_auth_user_id_key unique (auth_user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_users_auth_user_id_fkey') then
    alter table public.staff_users add constraint staff_users_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users (id) on delete set null;
  end if;
end $$;

-- Hash PINs on write, never keep plaintext
create or replace function tee_co_private.hash_staff_pin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.pin is not null and btrim(new.pin) <> '' then
    if regexp_replace(new.pin, '\D', '', 'g') !~ '^\d{4}$' then
      raise exception 'Staff PIN must be 4 digits' using errcode = '22023';
    end if;
    new.pin_hash := extensions.crypt(regexp_replace(new.pin, '\D', '', 'g'), extensions.gen_salt('bf', 10));
    new.failed_pin_attempts := 0;
    new.pin_locked_until := null;
  end if;
  new.pin := null;
  return new;
end $$;
drop trigger if exists staff_users_hash_pin on public.staff_users;
create trigger staff_users_hash_pin before insert or update of pin on public.staff_users
  for each row execute function tee_co_private.hash_staff_pin();

-- Migrate existing plaintext PINs (fires the trigger)
update public.staff_users set pin = pin where pin is not null;

-- Column-level privileges: browser never reads PIN or lockout data
revoke all on public.staff_users from anon;
revoke select, insert, update on public.staff_users from authenticated;
grant select (id, legacy_staff_id, name, role, status, last_active_at, created_at, updated_at, auth_user_id, has_pin)
  on public.staff_users to authenticated;
grant insert (name, role, status, pin, legacy_staff_id) on public.staff_users to authenticated;
grant update (name, role, status, pin, last_active_at, updated_at) on public.staff_users to authenticated;

-- Login picker: names only
create or replace function public.list_pin_login_staff()
returns table (id uuid, name text, role text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.role from public.staff_users s
  where s.status = 'Active' and s.pin_hash is not null order by s.name;
$$;
revoke all on function public.list_pin_login_staff() from public;
grant execute on function public.list_pin_login_staff() to anon, authenticated;

-- PIN verification with lockout (service role only)
create or replace function public.verify_staff_pin(p_staff_user_id uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.staff_users%rowtype; clean text := regexp_replace(coalesce(p_pin, ''), '\D', '', 'g');
begin
  select * into s from public.staff_users where id = p_staff_user_id for update;
  if not found or s.status <> 'Active' or s.pin_hash is null then
    perform extensions.crypt(clean, extensions.gen_salt('bf', 10)); -- similar timing
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

-- Per-IP failure log for the login function (service role only)
create table if not exists public.staff_pin_login_attempts (
  id bigserial primary key,
  ip_key text not null,
  staff_user_id uuid,
  success boolean not null,
  attempted_at timestamptz not null default now()
);
create index if not exists staff_pin_login_attempts_ip_idx on public.staff_pin_login_attempts (ip_key, attempted_at);
alter table public.staff_pin_login_attempts enable row level security;
revoke all on public.staff_pin_login_attempts from anon, authenticated;
-- The login function (service role) needs these; Supabase grants them by default, but some
-- projects (e.g. staging) were created without default service_role table grants.
grant select, insert on public.staff_pin_login_attempts to service_role;
grant usage on sequence public.staff_pin_login_attempts_id_seq to service_role;
grant select, update (auth_user_id) on public.staff_users to service_role;

-- Staff check: PIN-session users must still be an Active staff_users row linked to this auth user
create or replace function tee_co_private.pin_staff_still_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when (auth.jwt() -> 'app_metadata' ->> 'staff_user_id') is null then true
    else exists (select 1 from public.staff_users s
                 where s.id::text = auth.jwt() -> 'app_metadata' ->> 'staff_user_id'
                   and s.auth_user_id = auth.uid() and s.status = 'Active')
  end;
$$;
revoke all on function tee_co_private.pin_staff_still_active() from public, anon;
grant execute on function tee_co_private.pin_staff_still_active() to authenticated;

create or replace function public.is_tee_co_operational_staff()
returns boolean language sql stable set search_path = '' as $$
  select lower(coalesce(
    auth.jwt() -> 'app_metadata' ->> 'operational_role',
    auth.jwt() -> 'app_metadata' ->> 'role',
    '')) = any (array['owner', 'manager', 'staff'])
    and tee_co_private.pin_staff_still_active();
$$;

create or replace function tee_co_private.operational_role()
returns text language sql stable set search_path = '' as $$
  select case when tee_co_private.pin_staff_still_active()
    then lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'operational_role',
                        auth.jwt() -> 'app_metadata' ->> 'role', ''))
    else '' end;
$$;

commit;
