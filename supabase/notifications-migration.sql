-- Notification persistence migration
-- Migrates notification templates, staff notifications, and notification activity
-- from browser localStorage to durable Supabase-backed tables.

-- notification_templates: one row per notification type, stores customized template fields.
-- The 'type' column is the primary key so each notification type has exactly one row.
create table if not exists public.notification_templates (
  type text primary key,
  name text not null default '',
  email_subject text not null default '',
  email_body text not null default '',
  sms_message text not null default '',
  email_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  staff_notification_enabled boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists notification_templates_updated_at on public.notification_templates;
create trigger notification_templates_updated_at
  before update on public.notification_templates
  for each row execute procedure public.set_updated_at();

-- staff_notifications: stores individual staff notification inbox records.
-- The 'id' is the application-generated id (e.g. "staff-notif-<uuid>").
create table if not exists public.staff_notifications (
  id text primary key,
  type text not null,
  order_number text not null default '',
  assigned_to_staff_id text not null default '',
  assigned_to_staff_name text not null default '',
  description text not null default '',
  link_to text not null default '',
  read boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

-- notification_activity: auditable log of notification events triggered by the system.
-- The 'id' is the application-generated id (e.g. "notification-<uuid>").
create table if not exists public.notification_activity (
  id text primary key,
  event_type text not null,
  recipient_type text not null default '',
  recipient jsonb not null default '{}'::jsonb,
  template_type text not null default '',
  template_name text not null default '',
  generated_content jsonb not null default '{}'::jsonb,
  channels jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);
