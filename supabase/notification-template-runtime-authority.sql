-- Make administrator template publication immediately authoritative.
-- Publishing and active-policy reassignment occur in one transaction.

create or replace function public.save_notification_template_version(
  p_template_type text,
  p_name text,
  p_email_subject text,
  p_email_body text,
  p_sms_message text,
  p_status text default 'published',
  p_required_merge_fields jsonb default '[]'::jsonb
)
returns public.notification_template_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_type text := trim(coalesce(p_template_type, ''));
  v_status text := lower(trim(coalesce(p_status, 'published')));
  v_now timestamptz := timezone('utc', now());
  v_version integer;
  v_result public.notification_template_versions;
  v_published_by text := coalesce(auth.uid()::text, 'service_role');
begin
  if not public.is_notification_engine_owner() then
    raise exception 'Owner authorization is required.'
      using errcode = '42501';
  end if;
  if v_template_type = '' then
    raise exception 'A notification template type is required.';
  end if;
  if v_status not in ('draft', 'published') then
    raise exception 'Template status must be draft or published.';
  end if;
  if not exists (
    select 1
    from public.notification_templates template
    where template.type = v_template_type
  ) then
    raise exception 'Unknown notification template type.';
  end if;
  if jsonb_typeof(coalesce(p_required_merge_fields, '[]'::jsonb)) <> 'array' then
    raise exception 'Required merge fields must be an array.';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('notification-template-version:' || v_template_type)
  );

  select coalesce(max(version), 0) + 1
  into v_version
  from public.notification_template_versions
  where template_type = v_template_type;

  insert into public.notification_template_versions (
    id,
    template_type,
    version,
    name,
    email_subject,
    email_body,
    sms_message,
    required_merge_fields,
    status,
    published_at,
    published_by,
    created_at
  )
  values (
    concat(v_template_type, ':v', v_version),
    v_template_type,
    v_version,
    coalesce(p_name, ''),
    coalesce(p_email_subject, ''),
    coalesce(p_email_body, ''),
    coalesce(p_sms_message, ''),
    coalesce(p_required_merge_fields, '[]'::jsonb),
    v_status,
    case when v_status = 'published' then v_now else null end,
    case when v_status = 'published' then v_published_by else '' end,
    v_now
  )
  returning * into v_result;

  if v_status = 'published' then
    update public.notification_templates
    set
      name = coalesce(p_name, ''),
      email_subject = coalesce(p_email_subject, ''),
      email_body = coalesce(p_email_body, ''),
      sms_message = coalesce(p_sms_message, ''),
      updated_at = v_now
    where type = v_template_type;

    update public.notification_policies
    set
      channel_template_assignments =
        coalesce(channel_template_assignments, '{}'::jsonb)
        || case
          when email_enabled then jsonb_build_object('email', v_result.id)
          else '{}'::jsonb
        end
        || case
          when sms_enabled then jsonb_build_object('sms', v_result.id)
          else '{}'::jsonb
        end
        || case
          when staff_notification_enabled then
            jsonb_build_object('staff', v_result.id)
          else '{}'::jsonb
        end,
      updated_at = v_now
    where event_type = v_template_type
      and effective_to is null;
  end if;

  return v_result;
end;
$$;

revoke all on function public.save_notification_template_version(
  text, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.save_notification_template_version(
  text, text, text, text, text, text, jsonb
) to authenticated, service_role;
