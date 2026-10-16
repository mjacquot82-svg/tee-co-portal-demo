-- Customer Portal: customers may create their own order requests.
--
-- Staging first. Idempotent. Staff/operational policies are unchanged.
-- * INSERT policy: authenticated callers may insert only for a customer row
--   linked to auth.uid() (public.is_customer_artwork_owner, security definer)
--   and only with source = 'Customer Portal'. Reading the inserted row back
--   uses the existing customer SELECT policy on public.orders.
-- * BEFORE INSERT guard (non-staff, non-service-role callers only): resets
--   staff-controlled columns (workflow status, assignment, pricing/payment,
--   deposit, internal notes) to the portal's initial values, and rejects
--   forged artwork approval or active workflow overrides. Customer-supplied
--   request content (line_items, size_breakdown, qty, quote estimate,
--   order_metadata incl. client_submission_key, notes, artwork refs) is kept.
--   Discounts remain guarded by the existing guard_owner_discount trigger.

create or replace function tee_co_private.guard_customer_portal_order_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role'
     or public.is_tee_co_operational_staff()
     or current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.artwork_status not in ('', 'Design Requested', 'Pending Review', 'Missing')
     or new.artwork_approval_status not in ('Pending Review', 'Not Required')
     or (new.artwork_approval_required and new.artwork_approval_status <> 'Pending Review') then
    raise exception 'Customer orders cannot set artwork approval' using errcode = '42501';
  end if;
  if jsonb_path_exists(coalesce(new.workflow_overrides, '{}'::jsonb), '$.** ? (@.active == true)') then
    raise exception 'Customer orders cannot set workflow overrides' using errcode = '42501';
  end if;

  new.status := 'New';
  new.approval_status := 'Pending Review';
  new.quote_status := 'Draft';
  new.quote_archived := false;
  new.operational_visible := false;
  new.production_ready := false;
  new.needs_assignment := true;
  new.assigned_to_staff_user_id := null;
  new.assigned_to_staff_name := '';
  new.assigned_to_staff_role := '';
  new.assigned_at := null;
  new.production_owner_staff_id := '';
  new.production_owner_staff_name := '';
  new.production_owner_staff_role := '';
  new.production_owner_assigned_at := null;
  new.approval_note := '';
  new.internal_notes := '';
  new.created_by_staff_user_id := null;
  new.updated_by_staff_user_id := null;
  new.workflow_state := '{}'::jsonb;
  new.is_rush := false;
  new.subtotal := 0;
  new.tax_amount := 0;
  new.total_amount := 0;
  new.total_paid := 0;
  new.balance_due := 0;
  new.deposit_amount := 0;
  new.deposit_paid_amount := 0;
  new.deposit_applied := 0;
  new.deposit_outstanding := 0;
  new.deposit_paid_at := null;
  new.deposit_required := null;
  new.deposit_details := '{}'::jsonb;
  new.deposit_status := 'Pending Decision';
  new.deposit_workflow_status := 'Pending Decision';
  new.deposit_requirement := 'undecided';
  new.deposit_requirement_status := 'Undecided';
  new.payment_status := 'Draft';
  new.payment_collection_state := 'Draft';
  new.payment_method := '';
  new.payment_reference := '';
  new.payment_history := '[]'::jsonb;
  new.invoice_status := 'Draft';
  new.pickup_status := 'Pending';
  return new;
end;
$$;

revoke all on function tee_co_private.guard_customer_portal_order_insert() from public;

drop trigger if exists customer_portal_order_insert_guard on public.orders;
create trigger customer_portal_order_insert_guard
before insert on public.orders
for each row execute function tee_co_private.guard_customer_portal_order_insert();

drop policy if exists "Customers can create their own portal orders" on public.orders;
create policy "Customers can create their own portal orders"
on public.orders
for insert
to authenticated
with check (
  customer_id is not null
  and source = 'Customer Portal'
  and public.is_customer_artwork_owner(customer_id::text)
);

-- Not added (propose separately): a partial unique index on
-- (customer_id, (order_metadata->>'client_submission_key')) where the key is set.
