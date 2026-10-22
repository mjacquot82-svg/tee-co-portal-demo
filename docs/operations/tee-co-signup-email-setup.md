# Tee & Co signup confirmation email — Supabase dashboard setup

The repo can't change Supabase Auth emails by itself; they are set per project in the dashboard
(or via the Management API with an auth-config token). Do staging first, then production.

## 1. Subject and body
Supabase dashboard → your project → **Authentication → Emails → Templates → Confirm signup**

- **Subject:** `Confirm your Tee & Co account`
- **Body (Source / HTML):** paste the whole file `supabase/templates/tee-co-confirm-signup.html`.
  Keep `{{ .ConfirmationURL }}` exactly as written — Supabase replaces it with the link.
- Click **Save**.

## 2. Sender name and address ("From")
The default Supabase mailer always sends as "Supabase Auth <noreply@mail.app.supabase.io>" and is
rate-limited (a few emails per hour) — the sender name can't be changed without custom SMTP.

Authentication → Emails → **SMTP Settings** → enable **Custom SMTP**:
- **Sender name:** `Tee & Co`
- **Sender email:** e.g. `hello@teeandco.ca` (an address on a domain you control)
- Host / port / username / password: from your email provider (e.g. Resend, which the app already
  uses for notifications: host `smtp.resend.com`, port `465`, username `resend`, password = a Resend API key;
  the sender domain must be verified in Resend).

## 3. Redirect
Authentication → **URL Configuration**: Site URL `https://teeandco.jdsstudio.ca` (production) and the
staging site URL for staging, so the confirmation link returns to the right site.

## 4. Check
Sign up with a test email address, confirm the email shows "Tee & Co" as sender and subject,
click the button, and make sure it lands on the Tee & Co site signed in.
