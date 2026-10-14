# Full-app mobile acceptance: quantity reload defect found

Starting HEAD: `ebcd82a9583e411721469994690c9f8a32e4531c`, clean, on `fix/customer-artwork-request`. Existing reviewed commits are preserved. This follow-up changes only tests, proposed CI test wiring, and evidence; no production code is changed.

## Actual result

The final two targeted mobile tests **fail** on a real quantity-persistence assertion. Entering M quantity **2**, choosing artwork creation and entering a description, then reloading the garment configuration page restores quantity **1**. The real app subsequently submits that quantity. Both no-file and mixed-upload paths reproduce it. Expected 2, received 1; exact synthetic payloads and screenshots are saved in `docs/artwork-request-evidence/full-app-submitted-{no-file,mixed}.{json,png}` and the final run log is `full-app-mobile.txt`.

All earlier assertions in both cases pass: actual catalog selection, configuration validation rejecting a blank design description, description surviving configuration reload, Save Garment, adding a second catalog garment for the mixed case, browser Back/Forward, review reload, exact line count, one real app order insert intercepted at REST, actual submission confirmation, customer association, no-file/create description fields, Pending Review, approval required, production_ready false and operational_visible false. The mixed case makes one synthetic upload through the real SDK, inserts artwork metadata, links it to the quote, and associates that ID with its upload line. The no-file case makes zero upload calls. No unexpected-service/external-request assertion failed in the final run.

The earlier two-case run passed before the quantity assertion existed (5.9s). Inspection of its screenshot exposed the mismatch; that weaker success is superseded by the final failing run. The quantity assertion is retained, not skipped or changed to expect the wrong quantity.

Source finding: OrderPreview initializes sizeBreakdown from editing/passed route state, and SizeBreakdownEditor changes only React state. The artwork draft handler writes choice/description/lineItemId to route history but not the edited size breakdown. Reload therefore restores the old quantity. The size initializer and state-only editor binding also exist at production base `3c55abf`; this is source evidence of an existing gap, not a same-environment baseline reproduction. A minimal production repair should persist current garment configuration draft fields across reload/history, with a scoped test covering both create and existing upload choices. It needs review before broadening beyond this test-only follow-up.

## Isolation and reviewer correction

The test uses real App routes/shells, catalogue/configuration/review components, stores, order repository and SDK. Only browser HTTP responses are substituted. It seeds a synthetic customer/session, not a request draft or successful order. Customer/catalog/order data is entirely synthetic; storage bytes are an inline SVG. Loopback URL and synthetic noncredential key are defined by the dedicated Vite config, no app env files or proxy. CSP restricts connections; service workers are blocked. Every service request must match an explicit origin, path and method contract. Unknown requests are aborted and fail the test. Explicit allowed writes are synthetic order insert, customer summary update after that insert, artwork upload/metadata/quote association, and notification activity metadata. No notification provider/function endpoint is permitted; no emails or payment writes occur.

The reviewed hydration/profile handlers were tightened: exact `http://127.0.0.1:4191/rest/v1/customers`, GET only for hydration, GET/POST only for profile. Unexpected methods abort and throw. Profile POST asserts customer ID, auth-user ID, email, edited name/company/normalized phone, and exactly one write. Two focused boundary tests cover foreign origins, wrong ports, path suffixes, unexpected methods, and abort-before-success behavior. Seeded sessions do **not** validate sign-in, authentication or RLS.

## Focused validation and prepared hosted wiring

- Tightened desktop/phone hydration/profile: **4 passed**, one worker, no retries, 6.6s; log `customer-profile-tightened.txt`.
- Request boundary rejection tests: **2 passed**, Node test concurrency 1, ~84ms.
- Final mobile: **2 failed**, both quantity 2 -> 1, one worker, no retries. No full local suite ran.
- Hosted customer config syntax/import checks passed; list-only discovery found exactly six cases across three projects. It uses installed Chromium, no msedge channel, and correct repository server cwd. No hosted config was executed.
- CI script proposal adds customer acceptance and boundary checks sequentially inside the existing unprivileged loopback-only namespace. It keeps existing broad failures visible, same 2MiB cap per log (now eight logs), four synthetic PNGs total under 1MiB each, and three-day retention. No workflow trigger, permission, secret, network or deployment setting is changed.
- Fresh reads succeeded after the transient connection notice; known sessions were polled rather than restarted. Bruce was paused before tests. Final process inspection found no Playwright/Vite batch remaining; background Codex/MCP Node services were left untouched.

Initial fixture attempts failed closed on unmodeled read models and post-submit metadata/relationship calls. Those exact calls were inspected and given explicit synthetic contracts; no blanket service passthrough or application validation bypass was introduced.

## Release requirements still open

1. Fix and review quantity draft persistence; rerun these two targeted cases plus relevant existing artwork navigation/upload cases sequentially.
2. Independently review this fixture-boundary correction and CI wiring; resolve the existing push denial through the supported approval path. No push retry or workaround was attempted here.
3. Obtain hosted results for the repaired artwork tests and new customer/mobile acceptance. Last hosted run remains failed at `58778f8`; local results are not hosted clearance.
4. Classify remaining broad failures with comparable baseline evidence or an explicit scoped acceptance decision; no full-green claim.
5. Reverify current production source and deployment/preview isolation, then obtain separate release authorization. No PR/preview/live database test is safe by assumption; no deployment is claimed.
