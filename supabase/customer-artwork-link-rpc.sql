-- Customer Artwork: ownership-checked order/quote linking for customers.
--
-- NOT APPLIED. Review and deploy deliberately (staging first). Staging was
-- verified to lack any customer UPDATE permission on public.customer_artwork;
-- this RPC is the only customer path for recording artwork<->order links and
-- intentionally does not add a broad UPDATE policy (which would let customers
-- edit artwork_status and other staff-controlled fields).
--
-- Guarantees:
--   * caller must be authenticated (auth.uid() not null)
--   * the artwork's customer row must have auth_user_id = auth.uid()
--   * the order (by order_number) must belong to that same customer
--   * only appends to linked_order_ids / linked_quote_ids and sets
--     last_used_at / updated_at; status/approval columns are never touched
--   * empty search_path, fully qualified names, least-privilege grants
--
-- Prerequisite (deployed state, not inferable from source): customers.auth_user_id
-- is uuid. Customers still need a separate, reviewed INSERT permission on
-- public.orders before portal orders can be created at all; that is out of scope.

create or replace function public.link_customer_artwork_to_order(
  p_artwork_id uuid,
  p_order_number text,
  p_relationship text default 'order'
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_customer_id uuid;
  v_order_number text := nullif(btrim(coalesce(p_order_number, '')), '');
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_artwork_id is null or v_order_number is null
     or p_relationship is null or p_relationship not in ('order', 'quote') then
    raise exception 'invalid artwork link request' using errcode = '22023';
  end if;

  select artwork.customer_id
    into v_customer_id
  from public.customer_artwork as artwork
  join public.customers as customer
    on customer.id = artwork.customer_id
  where artwork.id = p_artwork_id
    and customer.auth_user_id = v_uid
  for update of artwork;

  if v_customer_id is null then
    -- Same error for "missing" and "not yours" to avoid leaking existence.
    raise exception 'artwork not found' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.orders as ord
    where ord.order_number = v_order_number
      and ord.customer_id = v_customer_id
  ) then
    raise exception 'order not found' using errcode = '42501';
  end if;

  if p_relationship = 'order' then
    update public.customer_artwork
    set linked_order_ids = case
          when v_order_number = any (linked_order_ids) then linked_order_ids
          else pg_catalog.array_append(linked_order_ids, v_order_number)
        end,
        last_used_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where id = p_artwork_id;
  else
    update public.customer_artwork
    set linked_quote_ids = case
          when v_order_number = any (linked_quote_ids) then linked_quote_ids
          else pg_catalog.array_append(linked_quote_ids, v_order_number)
        end,
        last_used_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where id = p_artwork_id;
  end if;
end;
$$;

revoke all on function public.link_customer_artwork_to_order(uuid, text, text) from public;
revoke all on function public.link_customer_artwork_to_order(uuid, text, text) from anon;
grant execute on function public.link_customer_artwork_to_order(uuid, text, text) to authenticated;
