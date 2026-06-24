-- Square Phase 2A payment reliability indexes.
-- Run this once before live Square production payments.

create unique index if not exists payments_idempotency_key_unique
  on public.payments (idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';

create unique index if not exists payments_square_provider_payment_id_unique
  on public.payments (provider_payment_id)
  where provider = 'square' and provider_payment_id is not null and provider_payment_id <> '';

create unique index if not exists payment_events_square_event_id_unique
  on public.payment_events ((payload->>'square_event_id'))
  where event_source = 'square_webhook'
    and payload ? 'square_event_id'
    and payload->>'square_event_id' <> '';

create index if not exists payment_events_square_payment_id_idx
  on public.payment_events ((payload->>'square_payment_id'))
  where event_source = 'square_webhook'
    and payload ? 'square_payment_id';
