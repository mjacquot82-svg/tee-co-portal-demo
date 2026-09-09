-- Staff Portal order creation idempotency guard.
-- Review and apply manually before enabling the staff order endpoint in production.
-- The key is scoped to the authenticated operational user stored in order_metadata.

create unique index if not exists orders_staff_create_idempotency_idx
  on public.orders (
    (order_metadata ->> 'created_by_auth_user_id'),
    (order_metadata ->> 'staff_create_idempotency_key')
  )
  where
    order_metadata ->> 'source' = 'Staff Portal'
    and nullif(order_metadata ->> 'created_by_auth_user_id', '') is not null
    and nullif(order_metadata ->> 'staff_create_idempotency_key', '') is not null;
