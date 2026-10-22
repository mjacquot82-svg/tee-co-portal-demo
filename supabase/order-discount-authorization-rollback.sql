-- Rollback for order-discount-authorization.sql. Removes the discount guard
-- (discounts become unprotected at the database level).
begin;
drop trigger if exists orders_guard_discount on public.orders;
drop function if exists tee_co_private.guard_order_discount();
commit;
