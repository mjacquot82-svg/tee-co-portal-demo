# Product image migration (PR #66)

## Status and access

No production images have been migrated. The 70 inline images total 50,615,542 encoded bytes.
The connected Supabase tools can run SQL and deploy Edge Functions, but do not expose a Storage object-upload operation or secret-store provisioning. SQL must not be used to fabricate Storage objects; it only stores object metadata. A new privileged public endpoint is unnecessary.

Use a GitHub Actions **environment secret**, never a frontend VITE variable or a chat message. Create environment `tee-co-image-migration` in this repository and add secret `TEE_CO_MIGRATION_SERVICE_ROLE_KEY`, containing a production Supabase secret/server key. The workflow maps this into `SUPABASE_SERVICE_ROLE_KEY` only for the export/migration steps. The key is not included in the build, logs or backup artifacts. Remove/revoke the migration-only secret after the work is finished. GitHub account/repository administrators retain their normal ability to manage secrets and workflows.

The label-triggered workflow has no ordinary push/PR execution path. It runs only for this repository's PR #66 and uses a fixed, tested code commit. `tee-image-prepare` exports originals and generates WebP thumbnails with **no remote writes**. `tee-image-pilot` additionally attempts a maximum of three eligible products, after all checks below. Do not apply either label until the secret has been configured. Do not re-run an interrupted pilot blindly; first inspect its backup and journal.

## Atomic database safeguard

Apply `supabase/migrations/20261011152424_atomic_product_image_swap.sql` through the connected migration tool before execution. `compare_and_swap_product_images` is SECURITY INVOKER with an empty search path; only `service_role` can execute it. Anonymous/authenticated users cannot call it. It locks the product row, compares all six typed image fields, then updates only those fields in the same RPC transaction. A concurrent image or image-metadata edit returns `conflict` and changes nothing. An identical repeated request returns `already-applied`. Missing rows return `missing`.

Rollback uses the same RPC in reverse. It restores the old image fields only while the row still matches the exact post-migration state. Subsequent staff edits cause rollback to skip the row. Legacy journals without the expected post-migration state, incomplete records, and original hash mismatches fail closed. Original and thumbnail objects are never deleted.

## Required verification and rollout order

1. Run SQL, JavaScript migration, generator and storefront tests. Check the current PR's focused GitHub Actions browser job.
2. Run read-only preparation and save the original bytes **and complete image-metadata backup** as GitHub artifacts before any row update.
3. Deploy/verify the Storage reader from the performance-only PR before production image changes. The previous live reader selects Storage paths but does not resolve them, so changing rows first could hide images. Execute mode checks the live `tee-co-storage-image-reader` version-2 HTML marker and refuses to continue without it. This marker is a necessary preflight, not a substitute for browser verification.
4. Upload unique immutable original and WebP object paths without overwriting. Verify public response, exact SHA-256 bytes, correct MIME type, and cache max-age >= one day for **both objects before the atomic database swap**.
5. Write and fsync the version-2 rollback journal before upload/update. Verify the resulting row including both paths, MIME, size and timestamp after the swap. Stop the batch at the first uncertain/failing operation. Never automatically replay an uncertain database request.
6. Verify each of the three pilot products through homepage/category/detail and ordering on desktop/mobile before remaining batches. Preserve attribution/product details. No order submission/payment.
7. For remaining batches, review pilot evidence first; use the same thumbnail manifest and output directory. Preserve backups and journals for rollback.

## Local commands (server-only environment)

Required URL: `SUPABASE_URL=https://iwbajhxrgyjferbkibkl.supabase.co`. Execute/rollback refuse any other project URL. Dry-run/export can use the publishable key; execute/rollback use a protected `SUPABASE_SERVICE_ROLE_KEY`.

```sh
node --test scripts/test-product-image-migration.mjs
python -m unittest discover -s scripts -p test_prepare_product_thumbnails.py
npm run migrate:product-images -- --dry-run
npm run migrate:product-images -- --export --output-dir migration-output/originals
python scripts/prepare-product-thumbnails.py --manifest migration-output/originals/originals.json --output-dir migration-output/thumbnails
npm run migrate:product-images -- --execute --thumbnail-manifest migration-output/thumbnails/thumbnail-manifest.json --batch-size 3 --output-dir migration-output/pilot
```

After pilot verification, another bounded batch:

```sh
npm run migrate:product-images -- --execute --thumbnail-manifest migration-output/thumbnails/thumbnail-manifest.json --batch-size 10 --resume-dir migration-output/pilot
```

Guarded rollback (select up to the requested number of journal records; never delete objects):

```sh
npm run migrate:product-images -- --rollback --rollback-file migration-output/pilot/rollback.jsonl --batch-size 70
```

`--no-verify` and `--rollback-remove-storage` are rejected. Output and secrets are git-ignored; backups/journals have restricted local permissions. The prepared runner uploads backups before a pilot and its journal even if execution fails. Download and retain these artifacts before their retention expires. Any staff-edited row skipped during rollback needs individual review.

## Validation recorded October 11

- 9 migration tests pass in embedded PostgreSQL/Node, including RPC role restrictions, competing attempts, rollback conflict/idempotency, journal-before-write and public-verification-before-swap.
- The actual connected PostgreSQL engine passes atomic swap, rollback, conflict and idempotency tests on temporary test objects inside a rolled-back transaction; no production row changes.
- 3 Pillow generator safety tests and 11 focused catalogue/Storage tests pass; production build passes.
- GitHub Actions run 38150404974 successfully installs Chromium and passes storefront-smoke for code commit 1224c2021f156a8db6529778485016743a5da1b0. Latest changes require their own CI result.
- Cloud browser confirms preview Tshirt collection images, garment image/detail, configuration, and quantity-price update (S x2 -> $50). No submission or payment. Cloud browser does not expose a supported mobile viewport setter; mobile emulation belongs in the GitHub Actions browser suite.
