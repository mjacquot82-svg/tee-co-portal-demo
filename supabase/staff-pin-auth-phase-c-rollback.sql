-- Rollback PHASE C: restores plaintext PINs from tee_co_private.staff_pin_plain_backup (if it
-- still exists), puts back the phase A trigger (hash + keep plaintext) and full table grants.
begin;
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
    null;
  else
    raise exception 'Staff PIN must be 4 digits' using errcode = '22023';
  end if;
  return new;
end $$;
do $$ begin
  if to_regclass('tee_co_private.staff_pin_plain_backup') is not null then
    -- only restore where the PIN was not changed after phase C (hash still matches backup)
    update public.staff_users s set pin = b.pin
      from tee_co_private.staff_pin_plain_backup b
     where b.staff_user_id = s.id and s.pin is null
       and extensions.crypt(regexp_replace(b.pin, '\D', '', 'g'), s.pin_hash) = s.pin_hash;
    drop table tee_co_private.staff_pin_plain_backup;
  end if;
end $$;
grant select, insert, update, delete on public.staff_users to authenticated;
do $$ begin
  -- anon only had table access before phase B; do not re-open it while phase B is in place
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='staff_users'
                 and policyname='rls_hardening_staff_all') then
    grant select, insert, update, delete on public.staff_users to anon;
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
