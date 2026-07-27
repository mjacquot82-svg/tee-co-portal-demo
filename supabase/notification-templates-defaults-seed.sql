-- Canonical Notification Template defaults.
-- Apply after notifications-migration.sql and before Notification Engine Phase 2A.
-- Existing templates are authoritative and are never overwritten.

insert into public.notification_templates (
  type,
  name,
  email_subject,
  email_body,
  sms_message,
  email_enabled,
  sms_enabled,
  staff_notification_enabled
)
values
  (
    'new_customer_request',
    'New Customer Request',
    'We received your request, {{customer_name}}!',
    $template$Hi {{customer_name}},

Thank you for reaching out to {{company_name}}! We've received your order request and our team will review it shortly.

We'll be in touch soon with a quote and next steps.

Thanks,
The {{company_name}} Team$template$,
    'Hi {{customer_name}}, we''ve received your request at {{company_name}} and will be in touch soon!',
    true,
    false,
    true
  ),
  (
    'quote_ready_for_approval',
    'Quote Ready For Approval',
    'Your quote is ready for review — {{order_number}}',
    $template$Hi {{customer_name}},

Your quote for order {{order_number}} is ready for your review!

Quote Total: {{quote_total}}

Please review and approve your quote using the link below:
{{approval_link}}

If you have any questions, don't hesitate to reach out.

Thanks,
The {{company_name}} Team$template$,
    'Hi {{customer_name}}, your quote for {{order_number}} is ready! Total: {{quote_total}}. Review here: {{approval_link}}',
    true,
    false,
    false
  ),
  (
    'quote_approved',
    'Order Approved',
    'Order approved — {{order_number}}',
    $template$Hi {{customer_name}},

Your order {{order_number}} has been approved.

No action is needed. We'll let you know when it enters production.

Thanks,
The {{company_name}} Team$template$,
    'Hi {{customer_name}}, order {{order_number}} is approved. No action is needed. We''ll let you know when production begins.',
    true,
    true,
    true
  ),
  (
    'artwork_revision_requested',
    'Artwork Revision Requested',
    'Artwork revision needed — {{order_number}}',
    $template$Hi {{customer_name}},

We've reviewed your artwork for order {{order_number}} and have a few revisions to discuss before we can proceed.

Please log in to your customer portal to review our feedback and upload updated artwork:
{{approval_link}}

Thanks,
The {{company_name}} Team$template$,
    'Hi {{customer_name}}, your artwork for order {{order_number}} needs a revision. Please check your portal: {{approval_link}}',
    true,
    false,
    false
  ),
  (
    'artwork_approved',
    'Artwork Approved',
    'Your artwork is approved — {{order_number}}',
    $template$Hi {{customer_name}},

Excellent news! Your artwork for order {{order_number}} has been approved and is ready for production.

We'll keep you updated as your order progresses.

Thanks,
The {{company_name}} Team$template$,
    'Hi {{customer_name}}, your artwork for order {{order_number}} is approved and heading to production!',
    true,
    false,
    false
  ),
  (
    'deposit_requested',
    'Deposit Requested',
    'Deposit required for order {{order_number}}',
    $template$Hi {{customer_name}},

A deposit of {{deposit_amount}} is now required for order {{order_number}} before production can be scheduled.

Action required: submit your deposit here:
{{payment_link}}

We'll confirm when it is received.

Thanks,
The {{company_name}} Team$template$,
    'Hi {{customer_name}}, a {{deposit_amount}} deposit is required for order {{order_number}} before production can be scheduled. Pay here: {{payment_link}}',
    true,
    true,
    false
  ),
  (
    'payment_request_created',
    'Payment Request Created',
    'Payment request created — {{order_number}}',
    $template$Hi {{customer_name}},

A new payment request has been created for order {{order_number}}.

Amount Requested: {{deposit_amount}}
Payment Link: {{payment_link}}

Please use the payment link when you're ready.

Thanks,
The {{company_name}} Team$template$,
    'Hi {{customer_name}}, a payment request for {{order_number}} is ready. Amount: {{deposit_amount}}. Pay here: {{payment_link}}',
    true,
    false,
    true
  ),
  (
    'payment_received',
    'Payment Received',
    'Deposit received — {{order_number}}',
    $template$Hi {{customer_name}},

We've received your {{deposit_amount}} deposit for order {{order_number}}.

No action is needed. We'll notify you when production begins.

Thanks,
The {{company_name}} Team$template$,
    'Hi {{customer_name}}, we received your {{deposit_amount}} deposit for order {{order_number}}. No action is needed; we''ll notify you when production begins.',
    true,
    true,
    true
  ),
  (
    'payment_failed',
    'Payment Failed',
    'Payment could not be completed — {{order_number}}',
    $template$Hi {{customer_name}},

We were unable to complete the payment for order {{order_number}}.

Amount: {{deposit_amount}}
Payment Link: {{payment_link}}

Please try again or contact Tee & Co if you have questions.

Thanks,
The {{company_name}} Team$template$,
    'Hi {{customer_name}}, payment for {{order_number}} could not be completed. Please try again: {{payment_link}}',
    true,
    false,
    true
  ),
  (
    'order_in_production',
    'Order In Production',
    'Your order has entered production — {{order_number}}',
    $template$Hi {{customer_name}},

Your order {{order_number}} has entered production.

No action is needed. We'll notify you when it is ready for pickup.

Thanks,
The {{company_name}} Team$template$,
    'Hi {{customer_name}}, order {{order_number}} has entered production. No action is needed; we''ll let you know when it''s ready for pickup.',
    true,
    true,
    false
  ),
  (
    'order_ready_for_pickup',
    'Order Ready For Pickup',
    'Your order is ready for pickup — {{order_number}}',
    $template$Hi {{customer_name}},

Your order {{order_number}} is ready for pickup.

Action required: please arrange to pick it up. Your remaining balance is {{balance_due}}.

Thanks,
The {{company_name}} Team$template$,
    'Hi {{customer_name}}, order {{order_number}} is ready for pickup. Please arrange pickup; your remaining balance is {{balance_due}}.',
    true,
    true,
    false
  ),
  (
    'order_completed',
    'Order Completed',
    'Order complete — {{order_number}}',
    $template$Hi {{customer_name}},

Your order {{order_number}} has been completed.

No action is needed. Thank you for choosing {{company_name}} — we hope you enjoy your order!

Thanks,
The {{company_name}} Team$template$,
    'Hi {{customer_name}}, order {{order_number}} is complete. No action is needed. Thanks for choosing {{company_name}}!',
    true,
    true,
    false
  )
on conflict (type) do nothing;
