# Teresa approved changes: staging checkpoint

## Scope and isolation

Work continues on `staging` only. No production database, Auth configuration,
Netlify project configuration, payment credentials, or main branch was changed.
The separate Netlify project `teeandco-staging` exists, but it has no published
deployment. No Tee & Co staging Supabase project or branch was returned by the
connected project and branch inventory. Do not point staging at production.

## Implemented in this checkpoint

- Corrected literal escaped newlines in QuoteDetail, orderFinancials and
  OrderPreview that prevented a build.
- Passed the owner permission into the intake discount summary.
- Preserved artwork location through draft normalization, review autosave,
  saved-order normalization and staff garment cards. Custom locations reopen
  under Other with their saved text.
- Fixed Square payload generation so fully paid or overpaid requests produce
  zero outstanding amount instead of requesting the original amount again.
- Added discounted-balance/deposit Square payload tests and artwork location
  round-trip tests. These use local fixtures; no provider charges are made.
- Prepared `supabase/templates/tee-co-confirm-signup.html`. Subject:
  `Confirm your Tee & Co account`. Install in the isolated staging Auth project
  first. This file alone does not update Supabase email settings or sender name.

## Blocking external setup

An isolated staging database requires cost approval or an existing dedicated
project supplied by the owner. The connected Supabase `get_cost` operation was
unavailable. Published Micro pricing starts at US$10/month for an additional
project; this is not an account-specific quote. No project was purchased.

Teresa was emailed in her S&S Website links thread requesting Canada API account
identification, an API key through a secure process, read-only style/colour image
data, size chart/measurement information, and confirmation of fees and image-use
requirements. No supplier credentials were received in this checkpoint.

## Remaining work

- Provision the isolated database and schema, synthetic users, private artwork
  storage and staging-only Auth redirects; prohibit live provider credentials
  and scheduled outbound deliveries in staging.
- Enforce owner-only discount writes at the database boundary, including both
  metadata and embedded snapshots, then add apply/clear controls and test owner,
  staff, customer and anonymous write attempts against that database. The current
  serializer preserves metadata; it is not an authorization boundary. Discount
  editing remains unavailable.
- Add garment galleries with at least four durable upload slots and a manual
  size-chart fallback; integrate verified S&S colour images and supplier chart
  data after credentials and response contracts are available.
- Install the branded signup subject/body and sender configuration in staging,
  and verify a real test-account confirmation email and redirect.
- Deploy only the separate staging site and perform authenticated end-to-end
  persistence, discount and sandbox Square tests. Local calculation/provider
  mocks are not live sandbox acceptance.

## Validation for this checkpoint

- `npm run build`: passed (existing large-bundle warning remains).
- `npm run type-check`: passed.
- `npm run test:vitest`: 84 tests passed across 22 files.
- Targeted Square, webhook, artwork handoff/reference, intake pricing and tax
  Playwright regression run: 52 passed; one live artwork-upload case could not
  launch because the Chromium runtime is absent. It also needs an isolated
  operational account and customer fixture before it may run. Do not run it
  against production to satisfy staging acceptance.
- `git diff --check`: passed.

## References

- S&S Canada integration resources: https://en-ca.ssactivewear.com/marketing/edi
- Supabase pricing: https://supabase.com/pricing
- Auth email templates: https://supabase.com/docs/guides/auth/auth-email-templates
