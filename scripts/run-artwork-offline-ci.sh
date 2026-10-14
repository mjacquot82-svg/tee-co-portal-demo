#!/usr/bin/env bash
# Called ONLY inside the workflow's new network namespace, after dropping root.
set -uo pipefail
cd "$(dirname "$0")/.."
if [[ "$(id -u)" == 0 ]] || [[ "$(ip -o link show | wc -l)" -ne 1 ]] || ! ip -o link show | grep -q ': lo:' || [[ -n "$(ip route show)" ]]; then
  echo 'Refusing CI: require unprivileged user, loopback-only network namespace and no external routes.' >&2
  exit 1
fi
mkdir -p ci-artifacts
failed=0
run_check() {
  local name="$1"
  shift
  echo "Running $name"
  "$@" 2>&1 | tail -c 2097152 > "ci-artifacts/$name.log"
  local result=${PIPESTATUS[0]}
  printf '%s exit=%s\n' "$name" "$result" | tee -a ci-artifacts/summary.txt
  if [[ "$result" -ne 0 ]]; then failed=1; fi
}
run_check build node node_modules/vite/bin/vite.js build --config tests/ci/vite.config.js
run_check vitest node node_modules/vitest/vitest.mjs run --config tests/ci/vitest.config.js --maxWorkers=1 --no-file-parallelism
run_check playwright node node_modules/@playwright/test/cli.js test --config tests/ci/playwright.config.js --workers=1 --retries=0
run_check artwork node node_modules/@playwright/test/cli.js test --config tests/ci/artwork.config.js --workers=1 --retries=0
run_check customer node node_modules/@playwright/test/cli.js test --config tests/ci/customer.config.js --workers=1 --retries=0
run_check customer-boundary node --test --test-concurrency=1 tests/customer-mock/requestBoundary.node-test.js
run_check image-atomic node --test scripts/test-product-image-migration.mjs
run_check thumbnails python -m unittest discover -s scripts -p test_prepare_product_thumbnails.py
# Three screenshots plus two payloads stay below the previous 4MiB image budget.
# Only synthetic evidence, never traces, profiles, env files or dist.
find test-results/artwork-browser-ci test-results/customer-mock-ci -type f -name '*.png' -size -1024k -print0 2>/dev/null | head -z -n 3 | while IFS= read -r -d '' file; do
  cp -- "$file" "ci-artifacts/$(basename "$file")"
done
find test-results/customer-mock-ci -type f \( -name 'submitted-no-file.json' -o -name 'submitted-mixed.json' \) -size -64k -print0 2>/dev/null | head -z -n 2 | while IFS= read -r -d '' file; do
  cp -- "$file" "ci-artifacts/$(basename "$file")"
done
exit "$failed"
