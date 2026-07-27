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
    'Your order has been approved',
    $template$Hi {{customer_name}},

Your order {{order_number}} has been reviewed and approved by Tee & Co.

No action is required from you at this time.

We are preparing your order for the next stage and will notify you if anything is required or when your order is ready.

Thanks,
The {{company_name}} Team$template$,
    'Hi {{customer_name}}, your order {{order_number}} has been approved. No action is required right now.',
    true,
    false,
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
    'Deposit required to begin your order — {{order_number}}',
    $template$Hi {{customer_name}},

Your order {{order_number}} is ready to go into production once we receive your deposit.

Deposit Amount: {{deposit_amount}}

Please submit your deposit using the link below:
{{payment_link}}

Once your deposit is received, we'll get started right away!

Thanks,
The {{company_name}} Team$template$,
    'Hi {{customer_name}}, deposit of {{deposit_amount}} required for order {{order_number}}. Pay here: {{payment_link}}',
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
    'Payment received — {{order_number}}',
    $template$Hi {{customer_name}},

Thank you! We've received your payment for order {{order_number}}.

Amount Paid: {{deposit_amount}}
Balance Due: {{balance_due}}

We'll keep you updated as your order progresses.

Thanks,
The {{company_name}} Team$template$,
    'Hi {{customer_name}}, payment received for order {{order_number}}. Balance due: {{balance_due}}. Thanks!',
    true,
    false,
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
    'Your order is in production — {{order_number}}',
    $template$Hi {{customer_name}},

Your order {{order_number}} is now in production! Our team is working hard to bring your design to life.

We'll notify you when your order is ready for pickup.

Thanks,
The {{company_name}} Team$template$,
    'Hi {{customer_name}}, your order {{order_number}} has entered our production schedule. We''ll let you know when it''s ready.',
    true,
    true,
    false
  ),
  (
    'order_ready_for_pickup',
    'Order Ready For Pickup',
    'Your order is ready for pickup — {{order_number}}',
    $template$Hi {{customer_name}},

Great news! Your order {{order_number}} is complete and ready for pickup.

Pickup Date: {{pickup_date}}
Balance Due: {{balance_due}}

Please bring your remaining balance when you come to pick up your order.

Thanks,
The {{company_name}} Team$template$,
    'Hi {{customer_name}}, your order {{order_number}} is ready for pickup on {{pickup_date}}! Balance due: {{balance_due}}.',
    true,
    true,
    false
  ),
  (
    'order_completed',
    'Order Completed',
    'Order complete — thank you, {{customer_name}}!',
    $template$Hi {{customer_name}},

Thank you for choosing {{company_name}}! Your order {{order_number}} is now complete.

We hope you love your new gear. We'd love to see you again for your next order!

Thanks,
The {{company_name}} Team$template$,
    'Hi {{customer_name}}, your order {{order_number}} is complete. Thanks for choosing {{company_name}}!',
    true,
    false,
    false
  )
on conflict (type) do nothing;
