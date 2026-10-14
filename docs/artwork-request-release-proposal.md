# Artwork creation request — review and release proposal

Status: implemented and committed locally; NOT pushed, merged, deployed, or tested against live orders.

## Isolation and source verification

- Fresh GitHub clone: `C:\Users\mjacq\Documents\Codex\2026-10-14\task\tee-artwork`.
- Local branch: `fix/customer-artwork-request`.
- Base: `3c55abf299c2de3012de18253bd2c49e5aa1bc0a`.
- Implementation commit: `4190d248195ed378e9261a23b86fd7f51c7f69b8`.
- On 2026-10-14, GitHub's branches/main read returned this SHA. Netlify's current production deploy `6acbc00fe89cc000083fd234` for site `bda24aaa-656f-4722-a508-8239b27bdea9` (`teeandco.jdsstudio.ca`) independently returned the same commit, branch main, context production, state ready; published 2026-10-11T16:58:09.903Z.
- Existing recovery checkout was inspected read-only: clean, branch `recovery/teresa-improvements`, HEAD `ec3910f645e2f2b9d75ad3fc6f2f64fcb8224f21`. No recovery files, commits, or references were modified.
- No tracked AGENTS.md or .agents/skills instructions exist in the verified source tree. The repository .codex file is empty. README test instructions were read. The Supabase skill was consulted for persistence review; no Supabase API/schema feature was introduced.

## Behavior and persistence

Each garment can explicitly request Tee & Co artwork creation with a required wording/design description. This appears in both garment configuration and final review. The choice and description persist through browser-history Back/Next, configuration reload, draft save/reload, final submission, JSON payload mapping, and readback. Returning through history reuses the same garment ID instead of duplicating the request.

Drafts use `artworkMode` / `artworkDescription`; persisted `line_items` use `artwork_mode` / `artwork_description`. Creation mode clears draft artwork assignments. For mixed orders only artwork selected for upload-mode items is submitted. Multiple decorated garments must each select artwork or request creation. The legacy single-item library-only upload remains supported.

Design requests remain `Pending Staff Review`, `production_ready: false`, `operational_visible: false`, `artwork_status: Design Requested`, `artwork_approval_required: true`, and `artwork_approval_status: Pending Review`. Nothing is approved automatically. Description text also appears in customer/request notes, staff quote details, shared garment production cards, and printed production tickets. Missing artwork remains marked Missing in production cards.

The copy says Tee & Co will confirm design work and any cost during review. No price calculation, fee, payment, notification, or authorization logic was changed.

The actual application write path is CustomerPortalRequestOrder -> createStoredOrder -> normalizeStoredOrder -> createOrderInSupabase -> direct Supabase `orders` insert. There is no separate order-submit HTTP handler in this path. Existing order payload serialization preserves arbitrary line-item JSON and the quote snapshot; readback restores it. The checked-in `supabase/phase1-schema.sql` defines `line_items` and `artwork_files` as JSONB and does not require a file. The production phase-2 schema contains the existing approval fields. No new column or migration is needed. The repository create boundary now rejects empty design descriptions before issuing an insert.

Live deployed RLS, triggers, and schema were not queried or changed. Synthetic tests use the real UI and serialization/repository code with fake external services; they do not prove the live database configuration.

## Bounded validation

All test batches ran sequentially on Windows, one worker; no WSL, full local suites, machine-setting changes, or agents were used.

- `npx vitest run src/customer-portal/artworkDesignRequest.test.tsx src/lib/pendingCustomerRequestStore.test.ts --maxWorkers=1 --no-file-parallelism`: **14 passed** (9 new regressions plus 5 existing draft regressions).
- `npx playwright test tests/customer-order-artwork-requirement.spec.js --project=chromium --workers=1 --retries=0 --reporter=line`: **5 passed**. These are existing logic/source assertions, not a browser visual run.
- Targeted ESLint across the 11 changed implementation files: **0 errors, 9 warnings** in existing effect/dependency code in RequestOrder and QuoteDetail. The new preview purity warning found during development was fixed.
- `git diff --check`: passed.
- `npm run build`: **blocked on Windows**. Vite resolves the extensionless `CustomerPortalPayments` import in App.jsx to `customerPortalPayments.js` and reports no default export, rather than selecting `CustomerPortalPayments.jsx`. Both payment files and App.jsx are unchanged from the verified production base; no payment fix was folded into this task. Hosted Linux build remains required. A baseline build was not separately run.
- Initial Vitest startup encountered a sandbox temp-directory rename EPERM. Retried successfully using a process-local TEMP/TMP directory inside this checkout; no machine settings changed.
- Dependencies installed with `npm ci --ignore-scripts --no-audit --no-fund`; lockfile unchanged.

Coverage includes two no-file design items, mixed design/upload items, real upload-path invocation mocked at the service boundary, blank/whitespace descriptions at UI and repository boundaries, choice switching, Back/Next, reload, no duplicate garment on re-save, payload/readback, pending approval, production gating, and staff indication. All profile/order/upload/link services were mocked; no live order, database write, or real notification occurred.

Evidence logs are in `docs/artwork-request-evidence/`. The existing hosted Playwright workflow now includes the focused Vitest regressions; no workflow was dispatched.

## Exact proposed release (NOT executed)

1. Before any push, re-read production's current deploy and GitHub main SHA. If either differs from the base above, review the intervening changes and rebase this isolated branch only, then rerun the bounded regressions.
2. Verify Netlify production/staging branch filters, deploy-preview triggers, and preview environment separation while authenticated. Confirm previews cannot use production database writes, notification delivery, or payment credentials. Current tool output did not establish these settings; cloud browser was previously signed out. Do not infer safety from the branch name.
3. Confirm explicit authorization to push this branch and create a PR, and verify hosted CI allowance. Only after those gates, from the isolated checkout:
   `git push -u origin fix/customer-artwork-request`
   Create a PR targeting `main`, titled `Allow customers to request artwork creation without an upload`, containing only this branch's implementation and evidence commits. Do not merge/cherry-pick the recovery/payment branch.
4. On hosted CI, run the existing Playwright workflow plus the focused regressions, the full Vitest suite within the existing allowance, and `npm run build` on Linux. Do not run full suites locally. Resolve any failures before review. The added workflow step is targeted; full Vitest/build still need hosted scheduling/approval as applicable.
5. In a verified isolated preview with synthetic data and disabled outbound delivery, review phone/desktop UI; submit design-only and mixed orders; verify staff indication, descriptions, pending approval, missing-file status, and blocked production. Verify existing upload behavior. No live customer order is a test fixture.
6. Present the exact reviewed PR head, green CI/build, preview evidence, and deployment behavior for release authorization. Only then merge/deploy through the confirmed production path. After release, use read-only checks to verify the deployed commit and UI.
7. Rollback proposal: revert the artwork implementation commit through a reviewed PR or restore production deploy `6acbc00fe89cc000083fd234`, subject to authorization and current deployment policy. No database migration rollback is required. Preserve submitted request metadata and notes; the prior UI will not support resuming creation-mode drafts and requires staff handling for any already-submitted design requests.

## Access/approval history and remaining gates

- Denied: local clone from the recovery repository. Automatic approval review rejected it because copying that repository could violate isolation from unfinished recovery work. It did not execute. Resolved by a fresh direct GitHub main clone after verifying production. No denial remains pending.
- Sandbox DNS initially blocked direct clone and package install. Escalated read/install operations succeeded; no access approval is pending.
- Remaining: Windows production build failure described above; hosted full validation, authenticated preview isolation verification, and later push/release authorization. No push, PR, merge, deployment, credentials retrieval, live database change, real notification, or paid resource creation was performed.
