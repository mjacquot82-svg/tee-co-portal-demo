# Local quantity persistence repair — 2026-10-14

This supersedes the quantity blocker in `artwork-full-app-mobile-findings.md`. It is local evidence, not hosted or deployment clearance. Parent of this repair: `aeca947b7e1d649ad737a6a6f39e95176569d9a2`.

## Cause and minimal production change

`OrderPreview` initialized size state from the original route quantity (normally 1) or saved line item. The editor changed only React state. Artwork choice/description replaced history state but did not persist sizes. Reload therefore restored M=1; saving and submission faithfully persisted that wrong value. The fixture captured the actual SDK POST without modifying it.

The only production change is in `src/pages/OrderPreview.jsx`: initialize from optional `sizeBreakdownDraft` first; write editor changes to that same garment's history entry using replace; wire the editor to that handler. Existing artwork history updates retain this field. Old drafts without the field retain their existing initialization. Empty objects, blank strings, zero and negative inputs are preserved, not converted into a valid default. Quantity validation, garment identifiers, saved draft schema, artwork handling, pricing, approval and production gates are unchanged. A newly selected garment starts a fresh route state, verified by its default M=1 in the mixed case.

## Before / after evidence

- Before: `artwork-request-evidence/full-app-mobile.txt`: two failures, entered 2 but submitted 1. Original JSON/PNG evidence remains untouched.
- After: `artwork-request-evidence/full-app-mobile-repaired.txt`: **2 passed, 8.5s**, one worker, zero retries, installed Edge, full real app with synthetic loopback SDK interception.
- Additional regression: `artwork-request-evidence/artwork-after-quantity-repair.txt`: **3 passed, 5.6s**, one worker, zero retries. Covers two design-only garments, required description, mixed upload/design switching, Back/Forward, reload, staff missing-file indication and approval/production gates.
- After payloads/screenshots: `artwork-request-evidence/repaired-submitted-{no-file,mixed}.{json,png}`. Per-line M=2 and quantity=2; correct product IDs; order `qty` and quote quantity =2 / 4. No-file uploads=0; mixed uploads=1 with correct artwork association. Pending Review, approval required, production_ready=false, operational_visible=false.
- New checks assert quantity 2 immediately before and after configuration reload, after Back, and in actual submitted size breakdown/line quantity/aggregate. Both create and upload paths are exercised. Default 1 and invalid 0, blank, -1, and removing all sizes are checked through reload; invalid inputs cannot save. The existing failing assertion was retained unchanged.
- First repair run passed the original quantity checks but failed a newly added assertion using nonexistent top-level `quantity`. Source/payload inspection established the actual field is `qty`; final checks assert both order qty and quote.quantity. No production code was changed to accommodate that assertion.
- `git diff --check` and Git Bash syntax-only validation passed. Git Bash required escalation because sandbox MSYS object creation failed; the CI script was not executed. Process inspections before/after batches found no Playwright/Vite process; no other session or machine setting changed. No full local suite ran.

## Proposed artifact adjustment

`scripts/run-artwork-offline-ci.sh` now collects only the two exact synthetic payload basenames, each under 64KiB, maximum two. Screenshot cap is reduced from four to three under 1MiB each, so combined evidence remains below the previous 4MiB image allowance. Existing log caps and three-day retention are unchanged. No credentials, traces, profiles, deployed payloads, workflow trigger, network rule or permission is added. Syntax checked only; hosted collection has not run.

## Release proposal and remaining blockers

No push was attempted in this repair. The prior push of the follow-up branch commits was **denied by automatic approval review** because it did not accept delegated authorization; that action remains denied, not pending or uncertain. Remote branch remains last known `58778f8ff862bbc0295508a424d2defe4baa008f`. Do not retry or bypass the denial. A supported authorization resolution is needed before any external write.

After independent review of this exact local diff, reverify current production/main source against the original verified base `3c55abf299c2de3012de18253bd2c49e5aa1bc0a` and reverify branch deployment filters. Only if separately authorized, publish this isolated branch for the prepared offline hosted CI; no PR/preview creation is included because preview environment/provider isolation is unsafe/unverified. The last hosted run [38617861642](https://github.com/mjacquot82-svg/tee-co-portal-demo/actions/runs/38617861642) remains failed at the older SHA. Obtain repaired hosted results, classify broad failures with comparable baseline evidence or explicit scoped acceptance, and review the exact release head before separate merge/deploy authorization. Preserve the recovery/payment checkout and branch throughout.

These fixtures validate application behavior and outbound payloads. Seeded sessions and mocked SDK responses do not establish real sign-in, RLS, deployed schema constraints or backend persistence. Any eventual isolated backend acceptance requires verified isolation and separate authorization. No live database, real order, notification, payment, deployment, credential retrieval or paid resource action occurred in this repair.
