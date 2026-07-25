-- Notification Engine policy-administration authorization reconciliation.
-- Reasserts the C4 browser privileges required by the Owner administration UI.
-- Notification evaluation, dispatch, delivery, and provider behavior are unchanged.

alter table public.notification_policies enable row level security;
alter table public.notification_template_versions enable row level security;

revoke all on table public.notification_policies from anon;
revoke all on table public.notification_template_versions from anon;

grant select on table public.notification_policies to authenticated;
grant select on table public.notification_template_versions to authenticated;

grant all on table public.notification_policies to service_role;
grant all on table public.notification_template_versions to service_role;

drop policy if exists "Operational users read notification policies"
  on public.notification_policies;
create policy "Operational users read notification policies"
on public.notification_policies
for select
to authenticated
using (public.is_notification_engine_operational_user());

drop policy if exists "Operational users read notification template versions"
  on public.notification_template_versions;
create policy "Operational users read notification template versions"
on public.notification_template_versions
for select
to authenticated
using (public.is_notification_engine_operational_user());

revoke all on function public.is_notification_engine_operational_user()
  from public, anon;
revoke all on function public.is_notification_engine_owner()
  from public, anon;
grant execute on function public.is_notification_engine_operational_user()
  to authenticated, service_role;
grant execute on function public.is_notification_engine_owner()
  to authenticated, service_role;

revoke all on function public.save_notification_policy_version(
  text, boolean, text, boolean, boolean, boolean, boolean, boolean, boolean, jsonb, text
) from public, anon, authenticated;
grant execute on function public.save_notification_policy_version(
  text, boolean, text, boolean, boolean, boolean, boolean, boolean, boolean, jsonb, text
) to authenticated, service_role;
