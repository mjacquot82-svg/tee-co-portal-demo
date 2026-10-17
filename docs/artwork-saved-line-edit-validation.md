# Saved garment editing validation — 2026-10-14

Follow-up to independently reviewed quantity repair `daabb09dbcf4d48ea783f9b694fceac5ccd7138c`. No production source changes were necessary.

Added one full-app mobile scenario to the existing synthetic fixture. It starts from the actual catalog and saves a design-request shirt and an uploaded-artwork hoodie at M=2. Through each review card's **Edit Garment** button, it changes the shirt to M=3 and hoodie to M=4, reloads configuration before **Save Garment Changes**, then reloads review and submits through the actual SDK request boundary.

Assertions verify exact quantities before/after configuration reload, rendered review sizes, saved draft quantities and size breakdowns, unchanged line IDs and artwork IDs after each edit, correct product IDs and modes, exactly two serialized lines, original design description, no artwork on the create line, one upload attached to the upload line, and aggregate order/quote quantity 7. The upload edit explicitly verifies **Choose Existing Artwork** remains selected with the original draft artwork ID. Pending Review, approval required, production_ready=false and operational_visible=false remain asserted. No duplicate line or upload is permitted.

## Evidence

- Command: `node node_modules/@playwright/test/cli.js test --config tests/customer-mock/mobile.config.js --grep 'edit saved' --workers=1 --retries=0`
- Result: **1 passed (6.3s)**, installed Edge, one worker, zero retries, loopback only and fail-closed service routing unchanged.
- Log: [full-app-mobile-edit-saved.txt](artwork-request-evidence/full-app-mobile-edit-saved.txt).
- Exact synthetic submitted payload: [submitted-edited.json](artwork-request-evidence/submitted-edited.json).
- Confirmation screenshot: [submitted-edited.png](artwork-request-evidence/submitted-edited.png).
- Initial authoring attempts failed on the test's ASCII `x` instead of the UI multiplication sign U+00D7; diagnostic card text identified the mismatch. Final assertions use exact visible text with U+00D7. No app validation or assertion expectation was weakened.
- The previous two mobile cases and three artwork cases passed at daabb09; this follow-up ran only the newly added case. No arbitrary additional suite, full local suite or hosted run was performed. Process checks found no existing test/server before each batch and none left afterward.
- `git diff --check` and Git Bash syntax-only check passed. Proposed artifact whitelist adds only `submitted-edited.json`, with maximum three payloads under 64KiB each; three screenshots under 1MiB each plus payloads remain below the prior 4MiB evidence budget. Log caps and three-day retention stay unchanged. Hosted collection is not yet executed.

## Consolidated release state

The commit containing this document is the new exact local release candidate head, on `fix/customer-artwork-request`; its parent is daabb09. This follow-up contains test coverage, bounded synthetic artifacts, the CI payload whitelist extension and this record only. The existing two baseline scenarios retain their original quantity-2 assertions; the new scenario asserts edited quantities separately. The hosted customer config discovers the new mobile case through its existing file match.

The push denial remains **denied**, not pending or uncertain; no push retry occurred. Automatic approval review previously did not accept delegated authorization. Remote head remains last known `58778f8ff862bbc0295508a424d2defe4baa008f`, whose hosted run 38617861642 failed. Supported resolution of that denial and new hosted validation are still required. No PR/preview is authorized or safe by assumption. Reverify current production/main source and deployment filters, classify remaining broad CI failures, review the exact candidate head and obtain separate release authorization before merge/deployment.

Synthetic sessions and mocked SDK responses do not validate real authentication, RLS, deployed schema constraints or backend persistence. Those external acceptance gaps remain. The recovery/payment checkout is untouched. No live orders, notifications, payments, database writes, credentials, deployment or paid resources were used.
