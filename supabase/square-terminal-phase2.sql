-- Square Terminal Phase 2. Apply only after review; deployment keeps checkout disabled by default.

alter table public.square_terminal_device_registrations
  add column if not exists is_active boolean not null default false,
  add column if not exists disabled_at timestamptz;

create unique index if not exists square_terminal_one_active_device_per_location
  on public.square_terminal_device_registrations (square_location_id)
  where is_active and status = 'PAIRED' and disabled_at is null;

create table if not exists public.square_terminal_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  payment_request_id uuid not null references public.payment_requests(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  order_number text not null default '',
  customer_id text references public.customers(id) on delete set null,
  device_registration_id uuid not null references public.square_terminal_device_registrations(id) on delete restrict,
  square_device_id text not null,
  square_location_id text not null,
  square_checkout_id text,
  square_reference_id text not null,
  create_idempotency_key text not null,
  amount numeric(10, 2) not null check (amount > 0),
  currency text not null default 'CAD',
  status text not null default 'creating',
  provider_status text not null default '',
  square_payment_ids text[] not null default '{}',
  verified_payment_id text,
  cancel_reason text not null default '',
  failure_code text not null default '',
  failure_message text not null default '',
  deadline_at timestamptz not null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  failed_at timestamptz,
  timed_out_at timestamptz,
  last_square_event_id text,
  last_square_event_at timestamptz,
  provider_snapshot jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint square_terminal_attempt_status_check check (status in (
    'creating', 'create_unknown', 'pending', 'in_progress', 'cancel_requested',
    'completed_unverified', 'completed', 'failed', 'canceled', 'timed_out',
    'reconciliation_required'
  )),
  constraint square_terminal_attempt_reference_length check (char_length(square_reference_id) <= 40),
  constraint square_terminal_attempt_idempotency_length check (char_length(create_idempotency_key) <= 64)
);

create unique index if not exists square_terminal_attempt_checkout_unique
  on public.square_terminal_checkout_attempts (square_checkout_id)
  where square_checkout_id is not null and square_checkout_id <> '';
create unique index if not exists square_terminal_attempt_reference_unique
  on public.square_terminal_checkout_attempts (square_reference_id);
create unique index if not exists square_terminal_attempt_create_key_unique
  on public.square_terminal_checkout_attempts (create_idempotency_key);
create unique index if not exists square_terminal_one_active_attempt_per_target
  on public.square_terminal_checkout_attempts (payment_request_id)
  where status in ('creating', 'create_unknown', 'pending', 'in_progress', 'cancel_requested', 'completed_unverified');
create unique index if not exists square_terminal_one_active_attempt_per_order
  on public.square_terminal_checkout_attempts (order_number)
  where order_number <> '' and status in ('creating', 'create_unknown', 'pending', 'in_progress', 'cancel_requested', 'completed_unverified');
create index if not exists square_terminal_attempt_status_deadline_idx
  on public.square_terminal_checkout_attempts (status, deadline_at);
create index if not exists square_terminal_attempt_order_idx
  on public.square_terminal_checkout_attempts (order_number);
create index if not exists square_terminal_attempt_payment_ids_idx
  on public.square_terminal_checkout_attempts using gin (square_payment_ids);

drop trigger if exists set_square_terminal_attempts_updated_at on public.square_terminal_checkout_attempts;
create trigger set_square_terminal_attempts_updated_at
before update on public.square_terminal_checkout_attempts
for each row execute function public.set_updated_at();

alter table public.square_terminal_checkout_attempts enable row level security;
revoke all on table public.square_terminal_checkout_attempts from anon, authenticated;

alter table public.activity_logs add column if not exists idempotency_key text;
create unique index if not exists activity_logs_idempotency_key_unique
  on public.activity_logs (idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';

create unique index if not exists payment_events_terminal_finalization_unique
  on public.payment_events ((payload->>'terminal_finalization_key'))
  where payload ? 'terminal_finalization_key' and payload->>'terminal_finalization_key' <> '';

create or replace function public.activate_square_terminal_device(p_registration_id uuid)
returns public.square_terminal_device_registrations
language plpgsql
security definer
set search_path = public
as $$
declare v_registration public.square_terminal_device_registrations%rowtype;
begin
  select * into v_registration from public.square_terminal_device_registrations
    where id = p_registration_id for update;
  if not found or v_registration.status <> 'PAIRED' or coalesce(v_registration.square_device_id, '') = '' then
    raise exception 'Only a paired Square Terminal can be activated';
  end if;
  update public.square_terminal_device_registrations set is_active = false
    where square_location_id = v_registration.square_location_id and is_active;
  update public.square_terminal_device_registrations set is_active = true, disabled_at = null
    where id = p_registration_id returning * into v_registration;
  return v_registration;
end;
$$;
revoke all on function public.activate_square_terminal_device(uuid) from public, anon, authenticated;
grant execute on function public.activate_square_terminal_device(uuid) to service_role;

-- Called only by the service-role Terminal finalizer after retrieving and verifying
-- the Square Payment. The payment, request total, and attempt transition commit together.
create or replace function public.finalize_square_terminal_payment(
  p_attempt_id uuid,
  p_square_payment_id text,
  p_amount numeric,
  p_currency text,
  p_provider_order_id text default '',
  p_receipt_url text default '',
  p_captured_at timestamptz default timezone('utc', now()),
  p_provider_snapshot jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.square_terminal_checkout_attempts%rowtype;
  v_request public.payment_requests%rowtype;
  v_payment public.payments%rowtype;
  v_amount_paid numeric(10,2);
  v_applied boolean := false;
begin
  select * into v_attempt from public.square_terminal_checkout_attempts
    where id = p_attempt_id for update;
  if not found then raise exception 'Terminal checkout attempt not found'; end if;

  select * into v_request from public.payment_requests
    where id = v_attempt.payment_request_id for update;
  if not found then raise exception 'Payment request not found'; end if;

  if v_attempt.status = 'completed' then
    if v_attempt.verified_payment_id is distinct from p_square_payment_id then
      raise exception 'Terminal checkout attempt is already completed with another payment';
    end if;
    select * into v_payment from public.payments
      where provider = 'square' and provider_payment_id = p_square_payment_id;
    if not found or v_payment.payment_request_id is distinct from v_attempt.payment_request_id then
      raise exception 'Completed Terminal checkout payment is inconsistent';
    end if;
    return jsonb_build_object('applied', false, 'reconciliationRequired', false,
      'paymentId', v_payment.id, 'paymentRequestId', v_request.id,
      'orderNumber', v_attempt.order_number);
  end if;

  if v_attempt.status <> 'completed_unverified' then
    raise exception 'Terminal checkout attempt is not eligible for finalization';
  end if;

  if upper(coalesce(p_currency, '')) <> upper(v_attempt.currency)
     or round(p_amount, 2) <> round(v_attempt.amount, 2) then
    update public.square_terminal_checkout_attempts set
      status = 'reconciliation_required', failure_code = 'PAYMENT_MISMATCH',
      failure_message = 'Verified Square payment amount or currency did not match the attempt.',
      provider_snapshot = p_provider_snapshot, version = version + 1
    where id = v_attempt.id;
    return jsonb_build_object('applied', false, 'reconciliationRequired', true);
  end if;

  select * into v_payment from public.payments
    where provider = 'square' and provider_payment_id = p_square_payment_id;

  if not found then
    insert into public.payments (
      customer_id, order_id, order_number, payment_request_id, payment_type,
      status, amount, currency, method, provider, provider_payment_id,
      provider_order_id, provider_location_id, provider_receipt_url,
      provider_status, idempotency_key, captured_at, note, metadata,
      created_at, updated_at
    ) values (
      v_attempt.customer_id, v_attempt.order_id, v_attempt.order_number,
      v_attempt.payment_request_id, v_request.request_type, 'captured', p_amount,
      upper(p_currency), 'square_terminal', 'square', p_square_payment_id,
      p_provider_order_id, v_attempt.square_location_id, p_receipt_url,
      'COMPLETED', 'square-payment:' || p_square_payment_id, p_captured_at,
      'Square Terminal payment', jsonb_build_object(
        'source', 'square_terminal', 'terminal_attempt_id', v_attempt.id,
        'square_checkout_id', v_attempt.square_checkout_id,
        'square_reference_id', v_attempt.square_reference_id
      ), p_captured_at, p_captured_at
    ) returning * into v_payment;
    v_applied := true;
  elsif v_payment.payment_request_id is distinct from v_attempt.payment_request_id then
    update public.square_terminal_checkout_attempts set
      status = 'reconciliation_required', failure_code = 'PAYMENT_ALREADY_APPLIED',
      failure_message = 'Square payment is already associated with another payment target.',
      provider_snapshot = p_provider_snapshot, version = version + 1
    where id = v_attempt.id;
    return jsonb_build_object('applied', false, 'reconciliationRequired', true, 'paymentId', v_payment.id);
  end if;

  select coalesce(sum(amount), 0) into v_amount_paid from public.payments
    where payment_request_id = v_request.id
      and lower(status) in ('approved','captured','completed','paid','settled','succeeded','success');

  update public.payment_requests set
    amount_paid = v_amount_paid,
    status = case when v_amount_paid >= amount_requested then 'paid'
                  when v_amount_paid > 0 then 'partially_paid' else status end,
    paid_at = case when v_amount_paid >= amount_requested then coalesce(paid_at, p_captured_at) else paid_at end,
    updated_at = timezone('utc', now())
  where id = v_request.id;

  update public.square_terminal_checkout_attempts set
    status = 'completed', provider_status = 'COMPLETED',
    verified_payment_id = p_square_payment_id,
    square_payment_ids = case when p_square_payment_id = any(square_payment_ids)
      then square_payment_ids else array_append(square_payment_ids, p_square_payment_id) end,
    completed_at = coalesce(completed_at, p_captured_at), provider_snapshot = p_provider_snapshot,
    failure_code = '', failure_message = '', version = version + 1
  where id = v_attempt.id;

  insert into public.payment_events (
    payment_id, payment_request_id, order_id, order_number, event_type,
    event_source, summary, payload, created_at
  ) values (
    v_payment.id, v_attempt.payment_request_id, v_attempt.order_id, v_attempt.order_number,
    'square_terminal_payment_finalized', 'square_terminal',
    'Verified Square Terminal payment finalized.',
    jsonb_build_object('terminal_finalization_key', 'square-terminal:' || p_square_payment_id,
      'terminal_attempt_id', v_attempt.id, 'square_checkout_id', v_attempt.square_checkout_id,
      'square_payment_id', p_square_payment_id), p_captured_at
  ) on conflict do nothing;

  return jsonb_build_object('applied', v_applied, 'reconciliationRequired', false,
    'paymentId', v_payment.id, 'paymentRequestId', v_request.id,
    'orderNumber', v_attempt.order_number);
end;
$$;

revoke all on function public.finalize_square_terminal_payment(uuid,text,numeric,text,text,text,timestamptz,jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_square_terminal_payment(uuid,text,numeric,text,text,text,timestamptz,jsonb)
  to service_role;
