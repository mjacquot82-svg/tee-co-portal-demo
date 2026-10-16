-- Only signed-in Tee & Co operational staff (owner / manager / staff, including PIN sessions)
-- may set, change or remove an order discount. Run after rls-hardening.sql and
-- staff-pin-auth.sql. Idempotent.
-- Discount data lives in orders.order_metadata->'owner_discount' and in the order snapshot
-- orders.quote->'__tee_co_order_snapshot' (discount_type / discount_value / discount_reason);
-- both must agree. Anyone else (customers, anon) gets error 42501 if they try to change it.
-- Values are validated: type percent|fixed, value > 0, percent <= 100.
-- Service role (Netlify functions) and database admins are not restricted.
-- (Generalises the owner-only guard first prototyped on staging as staging_guard_owner_discount.)

begin;

create or replace function tee_co_private.guard_order_discount()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  new_metadata jsonb := coalesce(new.order_metadata->'owner_discount','null'::jsonb);
  old_metadata jsonb := 'null'::jsonb;
  new_snapshot jsonb := coalesce(new.quote->'__tee_co_order_snapshot','{}'::jsonb);
  old_snapshot jsonb := '{}'::jsonb;
  snapshot_discount jsonb;
  old_snapshot_discount jsonb;
  discount_changed boolean;
begin
  if tg_op = 'UPDATE' then
    old_metadata := coalesce(old.order_metadata->'owner_discount','null'::jsonb);
    old_snapshot := coalesce(old.quote->'__tee_co_order_snapshot','{}'::jsonb);
  end if;
  snapshot_discount := jsonb_build_array(coalesce(new_snapshot->>'discount_type',''),
    coalesce(nullif(new_snapshot->>'discount_value','')::numeric,0),
    coalesce(new_snapshot->>'discount_reason',''));
  old_snapshot_discount := jsonb_build_array(coalesce(old_snapshot->>'discount_type',''),
    coalesce(nullif(old_snapshot->>'discount_value','')::numeric,0),
    coalesce(old_snapshot->>'discount_reason',''));
  discount_changed := new_metadata is distinct from old_metadata
    or snapshot_discount is distinct from old_snapshot_discount
    or (new_snapshot->'discount') is distinct from (old_snapshot->'discount')
    or (new_snapshot->'order_metadata'->'owner_discount') is distinct from (old_snapshot->'order_metadata'->'owner_discount')
    or jsonb_build_array(new.quote->'discount',new.quote->'discount_type',new.quote->'discount_value',new.quote->'discount_reason')
      is distinct from jsonb_build_array(case when tg_op='UPDATE' then old.quote->'discount' end,
        case when tg_op='UPDATE' then old.quote->'discount_type' end,
        case when tg_op='UPDATE' then old.quote->'discount_value' end,
        case when tg_op='UPDATE' then old.quote->'discount_reason' end);
  if discount_changed and not (
    coalesce(auth.role(),'') = 'service_role'
    or current_user not in ('anon', 'authenticated')
    or (auth.uid() is not null and public.is_tee_co_operational_staff())
  ) then
    raise exception 'Only Tee & Co staff can change discounts' using errcode = '42501';
  end if;
  if discount_changed and new_metadata <> 'null'::jsonb then
    if new_metadata->>'type' not in ('percent','fixed')
      or (new_metadata->>'value')::numeric <= 0
      or ((new_metadata->>'type') = 'percent' and (new_metadata->>'value')::numeric > 100)
      or new_metadata->>'type' is null or new_metadata->>'value' is null then
      raise exception 'Invalid discount' using errcode = '23514';
    end if;
    if snapshot_discount is distinct from jsonb_build_array(new_metadata->>'type',
      (new_metadata->>'value')::numeric,coalesce(new_metadata->>'reason','')) then
      raise exception 'Discount metadata and order snapshot must agree' using errcode = '23514';
    end if;
  elsif discount_changed and snapshot_discount <> '["",0,""]'::jsonb then
    raise exception 'Cleared discount must be removed from both representations' using errcode = '23514';
  end if;
  return new;
end $function$;

revoke all on function tee_co_private.guard_order_discount() from public, anon;
grant execute on function tee_co_private.guard_order_discount() to authenticated;

drop trigger if exists staging_guard_owner_discount on public.orders;
drop function if exists tee_co_private.guard_owner_discount();
drop function if exists tee_co_private.order_discount_keep(jsonb, jsonb, jsonb, jsonb);
drop trigger if exists orders_guard_discount on public.orders;
create trigger orders_guard_discount before insert or update on public.orders
  for each row execute function tee_co_private.guard_order_discount();

commit;
