# Garment Model Colors Seeding

This utility seeds `public.garment_model_colors` from existing `products.colors`
data.

It is intentionally manual. It does not run during app startup, build, deploy,
or any storefront workflow.

## Safety Model

- Default mode is read-only dry-run.
- Execute mode requires `SUPABASE_SERVICE_ROLE_KEY`.
- Existing `products.colors` values are never modified.
- Existing `garment_model_colors` rows are skipped rather than updated.
- Duplicate colors within a product or already-present table rows are reported
  and skipped.

## Environment

Required for dry-run:

```sh
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Required for execute:

```sh
VITE_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

The script reads `.env` automatically when those variables are not already set.

## Dry Run

```sh
npm run seed:garment-model-colors -- --dry-run
```

Dry-run reports:

- garment models processed
- candidate rows derived from `products.colors`
- rows already present in `garment_model_colors`
- source duplicates detected
- failures

## Execute

```sh
npm run seed:garment-model-colors -- --execute --batch-size 100
```

Execute mode inserts missing rows only:

- `garment_model_id` from `products.garment_model_lookup_id`
- `color_name` from `products.colors`
- `display_order` from the array position
- `hex_value` as `null`
- `active` as `true`

## Verification Report

The utility prints a verification summary with:

- garment models processed
- rows inserted
- rows skipped
- duplicates detected
- failures

This is a seeding utility only. It does not change storefront behavior and does
not import PDF data.
