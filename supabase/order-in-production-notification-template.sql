update public.notification_templates
set
  sms_message = 'Hi {{customer_name}}, your order {{order_number}} has entered our production schedule. We''ll let you know when it''s ready.',
  sms_enabled = true,
  updated_at = timezone('utc', now())
where type = 'order_in_production';
