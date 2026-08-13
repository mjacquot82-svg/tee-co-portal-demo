-- Square Terminal Phase 1: durable device-code and pairing registration state.
-- Apply this migration before enabling the Terminal pairing administration page.

create table if not exists public.square_terminal_device_registrations (
  id uuid primary key default gen_random_uuid(),
  square_device_code_id text not null unique,
  pairing_code text not null default '',
  square_device_id text unique,
  square_location_id text not null,
  device_name text not null default 'Tee & Co Front Counter',
  product_type text not null default 'TERMINAL_API',
  status text not null default 'UNPAIRED',
  pair_by timestamptz,
  square_created_at timestamptz,
  status_changed_at timestamptz,
  paired_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint square_terminal_registration_status_check
    check (status in ('UNKNOWN', 'UNPAIRED', 'PAIRED', 'EXPIRED')),
  constraint square_terminal_registration_product_type_check
    check (product_type = 'TERMINAL_API')
);

create index if not exists square_terminal_registrations_status_idx
  on public.square_terminal_device_registrations (status);

create index if not exists square_terminal_registrations_location_idx
  on public.square_terminal_device_registrations (square_location_id);

alter table public.square_terminal_device_registrations enable row level security;

-- Pairing state is intentionally server-only. The Netlify function uses the
-- Supabase service role after independently validating the caller's JWT/role.
revoke all on table public.square_terminal_device_registrations from anon, authenticated;
