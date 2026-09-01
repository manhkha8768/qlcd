# TASK 1 - Foundation Stabilization Report

## Delivered

- Fixed P0 permission bypass on Dashboard and Warehouse APIs.
- Consolidated authorization, dynamic RBAC compatibility and data scope in `middleware/quyen.js`.
- Added effective-dated user-to-multiple-unit assignments with soft deactivation and admin APIs.
- Added Project master and Unit-to-Project assignment foundation.
- Added migration journal with SHA-256 checksum and repeat-run protection.
- Added migration 14 without deleting or rewriting existing business data.
- Added PWA manifest, app icon, service worker and registration; responsive shell remains the existing canonical UI.
- Added reproducible CI plus JavaScript syntax/type/build gates for the CommonJS baseline.
- Added integration tests for deny override, dashboard/warehouse 403, migration idempotency, multi-unit scope and PWA assets.

## Compatibility

Legacy uppercase permission codes and dynamic lowercase codes remain readable through one service during migration. Existing imports from `quyen-ma.js` continue to work through a compatibility facade. No Cloudflare branch code was merged.

## Deferred intentionally

- Asset/Device separation and asset ledger belong to Task 2-4.
- Object storage migration belongs to Task 9.
- Cloudflare D1/R2 migration remains behind a parity and rollback decision gate.
- Route-by-route conversion from legacy single-unit query helpers to true multi-unit SQL continues as each module is modernized; shared scope APIs already return all effective assignments.
