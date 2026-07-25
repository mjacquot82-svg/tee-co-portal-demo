-- Repair legacy customer identity rows without mixing name, email, company, or phone.
-- Prefer linked Auth metadata, then a real name/phone captured on a linked order.

with customer_repair_evidence as (
  select
    customer.id,
    nullif(trim(concat_ws(
      ' ',
      auth_user.raw_user_meta_data ->> 'first_name',
      auth_user.raw_user_meta_data ->> 'last_name'
    )), '') as auth_full_name,
    nullif(trim(coalesce(
      auth_user.raw_user_meta_data ->> 'full_name',
      auth_user.raw_user_meta_data ->> 'display_name',
      auth_user.raw_user_meta_data ->> 'name'
    )), '') as auth_display_name,
    case
      when trim(coalesce(auth_user.raw_user_meta_data ->> 'phone', '')) ~ '[0-9]'
        then nullif(trim(auth_user.raw_user_meta_data ->> 'phone'), '')
      else null
    end as auth_phone,
    auth_user.id as resolved_auth_user_id,
    order_evidence.customer_name as order_name,
    order_evidence.customer_phone as order_phone
  from public.customers customer
  left join auth.users auth_user
    on auth_user.id = customer.auth_user_id
    or (
      customer.external_reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and auth_user.id = customer.external_reference::uuid
    )
  left join lateral (
    select
      nullif(trim(linked_order.customer_name), '') as customer_name,
      case
        when trim(coalesce(linked_order.customer_phone, '')) ~ '[0-9]'
          then nullif(trim(linked_order.customer_phone), '')
        else null
      end as customer_phone
    from public.orders linked_order
    where linked_order.customer_id = customer.id
      and linked_order.customer_name !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and lower(trim(linked_order.customer_name)) not in (
        'customer',
        'customer account',
        'customer identity unavailable',
        'walk-in customer'
      )
    order by linked_order.created_at desc
    limit 1
  ) order_evidence on true
)
update public.customers customer
set
  name = case
    when customer.name ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      then coalesce(
        customer_repair_evidence.auth_full_name,
        customer_repair_evidence.auth_display_name,
        customer_repair_evidence.order_name,
        customer.name
      )
    else customer.name
  end,
  phone = case
    when coalesce(trim(customer.phone), '') = ''
      or customer.phone = customer.company
      or customer.phone !~ '[0-9]'
      then coalesce(
        customer_repair_evidence.auth_phone,
        customer_repair_evidence.order_phone,
        customer.phone
      )
    else customer.phone
  end,
  auth_user_id = coalesce(
    customer.auth_user_id,
    customer_repair_evidence.resolved_auth_user_id
  ),
  updated_at = timezone('utc', now())
from customer_repair_evidence
where customer.id = customer_repair_evidence.id
  and (
    (
      customer.name ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and coalesce(
        customer_repair_evidence.auth_full_name,
        customer_repair_evidence.auth_display_name,
        customer_repair_evidence.order_name
      ) is not null
    )
    or (
      (
        coalesce(trim(customer.phone), '') = ''
        or customer.phone = customer.company
        or customer.phone !~ '[0-9]'
      )
      and coalesce(
        customer_repair_evidence.auth_phone,
        customer_repair_evidence.order_phone
      ) is not null
    )
    or (
      customer.auth_user_id is null
      and customer_repair_evidence.resolved_auth_user_id is not null
    )
  );
