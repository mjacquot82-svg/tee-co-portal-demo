create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text unique,
  customer_id text references public.customers(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  order_number text default '',
  quote_id uuid,
  sale_id uuid references public.sales(id) on delete set null,
  request_type text not null default 'deposit',
  status text not null default 'draft',
  amount_requested numeric(10, 2) not null default 0,
  amount_paid numeric(10, 2) not null default 0,
  currency text not null default 'CAD',
  due_at timestamptz,
  expires_at timestamptz,
  description text default '',
  customer_message text default '',
  payment_provider text not null default 'manual',
  provider_checkout_url text default '',
  provider_order_id text default '',
  provider_payment_link_id text default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by_staff_user_id uuid references public.staff_users(id) on delete set null,
  sent_at timestamptz,
  paid_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  payment_number text unique,
  customer_id text references public.customers(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  order_number text default '',
  payment_request_id uuid references public.payment_requests(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  payment_type text not null default 'partial',
  status text not null default 'captured',
  amount numeric(10, 2) not null default 0,
  currency text not null default 'CAD',
  method text not null default 'manual_other',
  provider text not null default 'manual',
  provider_payment_id text default '',
  provider_order_id text default '',
  provider_location_id text default '',
  provider_receipt_url text default '',
  provider_status text default '',
  idempotency_key text unique,
  recorded_by_staff_user_id uuid references public.staff_users(id) on delete set null,
  customer_confirmed_at timestamptz,
  captured_at timestamptz,
  settled_at timestamptz,
  note text default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete cascade,
  payment_request_id uuid references public.payment_requests(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  order_number text default '',
  event_type text not null,
  event_source text not null default 'system',
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb,
  staff_user_id uuid references public.staff_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists payment_requests_order_number_idx
  on public.payment_requests (order_number);
create index if not exists payment_requests_customer_id_idx
  on public.payment_requests (customer_id);
create index if not exists payment_requests_status_idx
  on public.payment_requests (status);
create index if not exists payments_order_number_idx
  on public.payments (order_number);
create index if not exists payments_customer_id_idx
  on public.payments (customer_id);
create index if not exists payments_payment_request_id_idx
  on public.payments (payment_request_id);
create index if not exists payments_status_idx
  on public.payments (status);
create index if not exists payment_events_order_number_idx
  on public.payment_events (order_number);
create index if not exists payment_events_payment_id_idx
  on public.payment_events (payment_id);
create index if not exists payment_events_payment_request_id_idx
  on public.payment_events (payment_request_id);

drop trigger if exists set_payment_requests_updated_at on public.payment_requests;
create trigger set_payment_requests_updated_at
before update on public.payment_requests
for each row execute function public.set_updated_at();

drop trigger if exists set_payments_updated_at on public.payments;
create trigger set_payments_updated_at
before update on public.payments
for each row execute function public.set_updated_at();
