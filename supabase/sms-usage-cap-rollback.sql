-- Rollback for migrations/20261029120000_sms_usage_cap.sql
-- First unset SMS_USAGE_CAP_ENABLED in Netlify so the dispatcher stops calling these.
drop function if exists public.update_sms_usage_settings(integer, integer, boolean);
drop function if exists public.get_sms_usage_summary(timestamptz);
drop function if exists public.sms_usage_release(text);
drop function if exists public.sms_usage_reserve(text, text, timestamptz);
drop function if exists public.sms_usage_warning_threshold(integer, integer);
drop function if exists public.sms_usage_month_key(timestamptz);
drop table if exists public.sms_usage_events;
drop table if exists public.sms_usage_months;
drop table if exists public.sms_usage_settings;
