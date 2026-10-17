# Branch-only CI safety review and proposal

Reviewed starting HEAD: `2ea67dbe8fd691e4e058d862933feebaba137957` on `fix/customer-artwork-request`. Checkout was clean before this work; no active local Node test process was found. Recovery checkout was not touched. This follow-up changes only CI configuration, a CI execution script, and this documentation. Nothing has been pushed, dispatched, built, deployed, or run as a full local suite during this follow-up.

## Existing triggers at the reviewed SHA

There are exactly two tracked workflows:

| Workflow | Triggers | Effect of this feature-branch-only push |
| --- | --- | --- |
| `.github/workflows/playwright.yml` | Push to main/master; PR targeting main/master | No run without a PR |
| `.github/workflows/product-image-migration.yml` | PR labeled, base main; jobs additionally require PR 67, its exact old image branch, and specific labels | No run |

The general workflow contains standard dependency installs, catalog/image tests, storefront tests, the broad three-browser Playwright suite, and focused artwork Vitest tests. It has no full Vitest or application build step. Its default Playwright config loads `.env.playwright`, starts Vite, and the default Vite config proxies `/.netlify/functions` to production. It must not simply be enabled for this branch and assumed isolated.

The protected image workflow explicitly accesses production Supabase using a named repository/environment secret, can execute migration writes for pilot/batch labels, and has a separate live production browser check. None of its trigger/job predicates match this branch. Its source was read; no secret values were read.

Package scripts have no install/postinstall/deploy hooks. `build` is `vite build`, which only creates local dist output. Named migration/seeding scripts and standalone operational-user/order migration scripts can contact Supabase when explicitly invoked; the proposed workflow does not invoke them. The atomic-image test uses PGlite and fake clients. Repository searches found no Netlify build-hook calls, Netlify CLI deployment/build calls, workflow_dispatch, repository_dispatch, workflow_run, or pull_request_target in the inspected workflow/script/function/config paths at this SHA. `netlify.toml` contains the existing per-minute SMS function schedule; running Vite build does not deploy or invoke that function.

## Hosting evidence and push limitation

The parent supplied authenticated dashboard findings: production site uses main; staging site uses staging; both builds are active; branch deploys are disabled; PRs targeting those branches create previews. Production previews share live database values and privileged provider variable names. **Do not create or exercise a preview.** No variable values were fetched or copied here.

A read-only GitHub query returned no open PR for head `mjacquot82-svg:fix/customer-artwork-request` during this inspection. Recheck immediately before any later push: updating a branch with an existing PR could trigger preview behavior even if no new PR is created. Netlify settings may change. This review does not enumerate unknown third-party repository hooks or organization-level integrations.

Thus a branch-only push of the starting SHA provides **no hosted validation**. Given the dashboard evidence and absent PR, it is not expected to deploy, but it is not authorized or executed here.

## Prepared CI-only workflow

`.github/workflows/artwork-branch-validation.yml` runs only on push to the exact branch `fix/customer-artwork-request`, and only in repository `mjacquot82-svg/tee-co-portal-demo`. No PR/manual/reusable trigger, secrets, environment, deployment permission, Netlify command, hook call, or repository write is present. Checkout does not persist Git credentials. Permissions are contents:read. One standard ubuntu-latest job has a 60-minute ceiling; newer pushes cancel superseded runs.

Dependency preparation is the only intended external network use: GitHub Actions checkout/runtime/artifact services, locked npm package downloads without lifecycle scripts, Playwright browser/OS dependencies, and Pillow. It does not contact application, database, payment, or notification services. No setup ran in this follow-up.

All build/test commands run sequentially inside a fresh Linux network namespace with only loopback brought up, after dropping to the runner UID/GID and clearing inherited environment using env -i. Application Supabase variables are explicitly empty. There is no route or interface to external services; children and browsers inherit the namespace. The script fails closed if it is root, sees more than loopback, or sees an external route. Failure to create the namespace is a blocking job failure, never a reason to fall back to network-enabled tests. No host network settings are changed.

Dedicated configs avoid `.env` and `.env.playwright`; the full application test server has an empty proxy. The artwork fixture already mocks customer/catalog/order/upload services and blocks non-local requests. The hosted artwork config selects installed Playwright Chromium rather than the Windows-only Edge channel.

Prepared commands, all inside isolation:

```sh
node node_modules/vite/bin/vite.js build --config tests/ci/vite.config.js
node node_modules/vitest/vitest.mjs run --config tests/ci/vitest.config.js --maxWorkers=1 --no-file-parallelism
node node_modules/@playwright/test/cli.js test --config tests/ci/playwright.config.js --workers=1 --retries=0
node node_modules/@playwright/test/cli.js test --config tests/ci/artwork.config.js --workers=1 --retries=0
node --test scripts/test-product-image-migration.mjs
python -m unittest discover -s scripts -p test_prepare_product_thumbnails.py
```

Every command result is recorded; any nonzero result makes the job fail. Later checks still run for diagnostic value. The broad Playwright run includes Chromium, Firefox and WebKit; the actual isolated artwork cases run separately. No arbitrary test exclusions or failure suppression were added.

Important scope: broad-suite tests that require real staff PIN/account/customer data (`getOperationalConfig`) will fail without those credentials; the two public example tests will fail offline; the specialized Storage-image test retains its existing env-dependent skip. Therefore this is a safe **full-suite diagnostic attempt**, not a promise of a green complete acceptance run. Do not add live credentials, enable egress, or silently skip failures to make CI green. Any required conversion of those legacy tests to synthetic fixtures needs a separate reviewed follow-up. Existing coverage gaps will be explicit in results.

Artifacts: six logs, each capped at 2 MiB, a tiny exit-code summary, and at most four synthetic artwork PNGs under 1 MiB each; retention three days. No traces, browser profiles, env files, dist, database dumps, or full repository upload. Failed/cancelled jobs may have incomplete logs and must not be called successful.

## Local verification actually performed

- YAML parsed with js-yaml. Assertions verified the sole exact-branch push trigger, read-only permissions, standard runner, timeout, no secret/environment/deployment trigger, disabled credential persistence, network namespace and clean environment, and three-day artifact retention.
- Node syntax checks passed for four new JS configs.
- Imported config assertions passed: one worker, zero retries, three broad browser projects, Chromium-only artwork config, empty proxy, separate env directory.
- `bash -n scripts/run-artwork-offline-ci.sh` passed. Initial sandbox MSYS startup failed with NtCreateDirectoryObject access denied; escalated **syntax-only** validation succeeded. The script itself was not run.
- `git diff --check` passed.
- No full local suite, build, workflow dispatch, or hosted run occurred. Linux namespace/runtime behavior and actual hosted results remain unverified until an authorized hosted run.

## Proposed next action — pending authorization

Before pushing: review this exact new commit; confirm Actions allowance and standard runner availability; recheck no PR for this head and unchanged Netlify branch-deploy settings. Do not create a PR. Only after authorization, from the isolated checkout:

```sh
git status --porcelain
git rev-parse HEAD
git push origin HEAD:refs/heads/fix/customer-artwork-request
```

Push only this ref, no tags, main, staging, or recovery references. The expected new check is `Isolated artwork branch validation / offline-validation`. Existing repository workflows should not run for that push. Inspect hosted logs/results and the resolved commit before proposing any further action. Opening a PR remains blocked by unsafe preview variable sharing; a branch-only CI result does not resolve deployment or live-schema isolation.

References for the mechanism: [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [Linux network namespace isolation](https://man7.org/linux/man-pages/man7/network_namespaces.7.html).
