# Local full-app customer fixture validation

Starting checkout was clean at `ebe28ebaba09792bbadb2fa2f69a4b6f210bd4db` on `fix/customer-artwork-request`. That reviewed commit remains an ancestor. No production code or hosted workflow is changed in this follow-up.

## Finding and minimal test improvement

The saved hosted logs show hydration/profile rendering failures with `isSupabaseConfigured: false`. The existing tests intercepted customer REST responses, but the app's real SDK was never initialized, so those mocks could not exercise remote hydration or profile persistence. This is a test-environment gap, not proof that the customer feature is broken in production.

The dedicated `tests/customer-mock` Vite config retains the real `src/main.jsx`, App routes/shells, stores, profile editor, order review, and installed Supabase SDK. It defines only a loopback URL and an explicitly synthetic noncredential key, reads no application env files, and has no production proxy. The automatic Playwright fixture intercepts unrelated REST reads with empty models; each existing test owns its customer REST responses. Unexpected service writes, external origins and unmocked customer requests are aborted and fail the test. CSP restricts connection/image destinations and service workers are blocked. No real database or Supabase project is used.

The two existing test bodies and their meaningful assertions were retained; only their test/expect imports changed. The mock guard is enabled only for dedicated customer-mock projects, leaving the existing broad-suite failures visible. This is local Edge validation; the new config is not wired into hosted CI and does not replace the broad suite.

## Execution evidence

Tests waited until Bruce checkpointed and paused; parent confirmed its batch ended with no process remaining at 20:03:09 UTC. Immediately before the run, native `Get-Process node,python` found no matching process. The earlier detailed CIM query was unavailable, so it was not treated as evidence that processes were absent. No process was terminated or machine setting changed.

Command: `node node_modules/@playwright/test/cli.js test --config tests/customer-mock/playwright.config.js --workers=1 --retries=0`

Result: **4 passed, 1 worker, zero retries, 7.2 seconds**, 2026-10-14 approximately 20:04 UTC. Two cases at 1280x900 and 390x844:

- Hydration removed unsupported archived and archived_at columns in exactly three intercepted requests, rendered the canonical company/phone, and replaced stale cached values.
- Profile editing retained read-only email, saved name/company/normalized phone through the real SDK with intercepted responses, and reached real order review with account-associated identity and no editable contact fields.

The fixture's no-unmocked-service/no-external-request assertion passed in all four cases. Node syntax checks and `git diff --check` passed. No Node/Python test process remained after completion. No full local suite, live order, payment action, email, credential retrieval, push, PR, merge or deployment occurred.

## Coverage limits and exact release requirements

The existing isolated artwork fixture covers real garment configuration and request components, multiple no-file garments, mixed uploaded/create items, required descriptions, reload/history, submission payload and staff approval/production guards. It substitutes its router shell and customer/catalog/order/upload services. Its phone case is therefore not full-app mobile acceptance.

This follow-up exercises actual app shells/profile-to-review routes at phone width, but does not exercise catalog selection through final submission in that real shell. Next targeted test should reuse this loopback SDK fixture, provide explicit synthetic catalog/customer/order REST contracts, traverse catalog/configuration/review on phone, and assert persisted create-description fields plus pending approval and production disabled in the intercepted order payload. Do not use live credentials/orders to fill this gap. Hosted replay should use installed Chromium inside the existing network namespace after review; do not simply use the Edge-only local config on Linux.

Release remains blocked: (1) resolve the explicit push denial via the supported approval boundary, without retries/workarounds; (2) review local test commits and obtain hosted evidence for the repaired mixed-order case and label assertion; (3) close the remaining full-app mobile submission gap with a synthetic test; (4) classify the remaining broad-suite failures against a comparable isolated baseline or make an explicit scoped acceptance decision—do not claim green full CI; (5) reverify production source and deployment/preview isolation and obtain a separately authorized release plan. PR previews currently share live services and must not be opened/executed as validation. No schema/payment change is proposed. The failed hosted run remains the latest hosted result at `58778f8`.
