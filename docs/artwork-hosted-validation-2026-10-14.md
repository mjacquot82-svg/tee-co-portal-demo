# Hosted artwork validation and focused repair

Authorized branch-only push succeeded at 18:45 UTC on 2026-10-14. GitHub verified `fix/customer-artwork-request` at `58778f8ff862bbc0295508a424d2defe4baa008f`. No PR was created. No main/staging push, preview execution, deployment, credentials, or settings change was performed.

[Run 38617861642](https://github.com/mjacquot82-svg/tee-co-portal-demo/actions/runs/38617861642) completed with **failure** in approximately 7m42s. The Linux namespace guard allowed the checks to run with loopback only after dropping root and clearing inherited environment. No fallback or isolation weakening occurred.

| Check | Result |
| --- | --- |
| Production build | Passed |
| Full Vitest | 24 files, 92 tests passed |
| Full three-browser Playwright | 1,437 passed, 90 failed, 15 skipped |
| Isolated artwork Chromium | 2 passed, 1 failed |
| Image atomic | 9 passed |
| Thumbnail Python | 3 passed |

## Evidence

[Artifact 11921295267](https://github.com/mjacquot82-svg/tee-co-portal-demo/actions/runs/38617861642/artifacts/11921295267) contains all six bounded check logs, exit summary, and three synthetic screenshots. Size 609,988 bytes; expires 2026-10-17 18:53 UTC. Downloaded and SHA-256 verified as `1bc7b237f3ea6ee499e9ae1d35d050509eb2cc8d6a60deaaa609e0f7b8ae243b`.

Local archive: `C:\Users\mjacq\Documents\Codex\2026-10-14\task\artwork-ci-38617861642.zip`. Extracted logs and a generated failure index are in the sibling `artwork-ci-38617861642` directory. These preserve the original failures and are not overwritten by the local repair checks.

## Artwork failures and concrete repair

The isolated mixed-order case failed at acceptance.spec.js:56: after clicking Edit Garment, the next checkbox locator still resolved against both review-page garments. This is a navigation synchronization failure, not evidence that a submitted artwork request was lost. Wait explicitly for Save Garment Changes and one checkbox before interaction. Also synchronize the later history Back/Forward transitions with their destination buttons. No sleeps, retries, skipped assertions, or production-code changes were introduced.

The broad customer-artwork-handoff source assertion failed in all three browsers because it required the old upload-only Artwork label expression. Update it to require the design-request description followed by the existing uploaded-artwork name and missing-artwork fallback. Existing persistence/association assertions remain intact.

Focused sequential local checks after the repair:

- Installed Edge, isolated mocked fixture, one worker, zero retries, traces off: all 3 acceptance cases passed (4.9s).
- Only customer-artwork-handoff.spec.js, one worker, zero retries, temporary config without web server or environment loading: all 10 checks passed (598ms). Temporary config removed.
- `git diff --check` passed. No full local suite ran.

## Remaining broad failures

Each browser reported the same 30 failing cases: 19 require missing live operational credentials (57 total), 2 require public internet (6 total), 1 is the artwork source assertion repaired above (3 total), and 8 other cases (24 total) require separate triage. Those eight cover customer hydration/profile rendering, an orders.filter type error, a stale financial source expectation, a pickup payment-button timeout, notification expectations, and a payment next-action expectation. Do not label all remaining failures expected or claim they are baseline-proven: no same-isolation baseline run has been performed.

No credentials were supplied, network access enabled, tests excluded, or failures suppressed to make the suite pass. The focused repair is local and awaits review before any further push or hosted run. The prior hosted run remains failed; no green full-suite or deployed claim is justified.
