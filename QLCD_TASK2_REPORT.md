# TASK 2 - Master Asset / TSCĐ / CCDC Report

## Delivered

- Added canonical `assets` table separated from technical device records.
- Added `asset_legacy_map` and deterministic backfill from `thiet_bi`.
- Preserved all legacy records; no table/row deletion and no database reset.
- Added unique Asset code, TSCĐ/CCDC validation, accounting values, owner unit/location, status, soft archive and optimistic version.
- Added scoped Asset Master API: CRUD, search, filters and server pagination.
- Added atomic Excel import with row validation, duplicate detection and unit scope enforcement.
- Added filtered Excel export and import template.
- Added responsive Asset Master screen distinct from Device screen.
- Added six Asset permissions with default role grants.
- Added integration coverage for backfill, mapping, CRUD, duplicate code, stale update, forbidden direct transfer, cross-unit access and Excel.

## Safety decisions

- `thiet_bi` remains operational for legacy modules.
- New Asset records are not copied into `thiet_bi`; Device linkage belongs to Task 3.
- Owner-unit changes are rejected by normal update; Asset Ledger/Transfer will own this mutation in Task 4–5.
- No Cloudflare code or database migration was introduced.

## Next

TASK 3 creates Device Master and explicit `device_asset_links`, then migrates technical fields while preserving every legacy Device ID reference.
