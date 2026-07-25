# Product Image Storage Migration

This utility migrates existing `products.image` base64 data URI images into the
public Supabase Storage `product-images` bucket.

It is intentionally manual. It is not called by app startup, build, deploy, or
Netlify Functions.

## Safety Model

- Default mode is read-only dry-run.
- Execute mode requires `SUPABASE_SERVICE_ROLE_KEY`.
- Products already using Storage URLs are skipped.
- Products whose `image` no longer matches the value read at the start of the
  batch are skipped to avoid overwriting concurrent edits.
- A rollback JSONL record is written before each product row is updated.
- A manifest JSONL record is written for migrated, skipped, and failed rows.
- Batches can be resumed with the same output directory.

## Environment

Required for dry-run:

```sh
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Required for execute and rollback:

```sh
VITE_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

The script reads `.env` automatically when those variables are not already set.

## Dry Run

```sh
npm run migrate:product-images -- --dry-run
```

This reports eligible base64 products and validates the first batch without
writing products or Storage objects.

## Execute A Batch

```sh
npm run migrate:product-images -- --execute --batch-size 10
```

The script creates:

```text
migration-output/product-image-storage-migration-<timestamp>/rollback.jsonl
migration-output/product-image-storage-migration-<timestamp>/manifest.jsonl
```

## Resume

```sh
npm run migrate:product-images -- --execute --batch-size 10 --resume-dir migration-output/product-image-storage-migration-<timestamp>
```

Resume mode skips product IDs already recorded as `migrated` in the manifest.

## Rollback

```sh
npm run migrate:product-images -- --rollback --rollback-file migration-output/product-image-storage-migration-<timestamp>/rollback.jsonl
```

To also remove migrated Storage objects recorded in the rollback file:

```sh
npm run migrate:product-images -- --rollback --rollback-file migration-output/product-image-storage-migration-<timestamp>/rollback.jsonl --rollback-remove-storage
```

Rollback restores:

- `products.image`
- `image_storage_path`
- `image_content_type`
- `image_file_size`
- `image_updated_at`

## Verification

For each migrated product, execute mode verifies:

- the generated public Storage URL returns an HTTP success response
- `products.image` equals the public URL
- `image_storage_path` equals the uploaded object path
- `image_content_type` is populated
- `image_file_size` matches the decoded image byte length
- `image_updated_at` is populated

Storefront rendering should be verified after each batch by opening a few
migrated product pages and confirming the image loads from Supabase Storage.
