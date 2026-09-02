# QLCD TASK 27 — Temporary Quick Tunnel Staging Report

Date: 2026-09-02
Status: **PARTIAL**

## Outcome

The temporary Quick Tunnel staging transport is implemented. It runs the existing Express/SQLite application in an isolated Docker Compose configuration, publishes the application only on loopback, and uses an outbound `cloudflared` Quick Tunnel. The command lifecycle validates isolated staging paths and secrets, reports a temporary URL, checks local and remote readiness, and writes non-secret evidence.

This is not a production deployment. A Quick Tunnel URL is ephemeral, changes after restart, has no SLA, and must not be used for production traffic, DNS, a named tunnel, or high availability.

## Operator workflow

1. Create Git-ignored `.env.staging.local` from `.env.example` with a unique >=32-character `QLCD_STAGING_SECRET`, an existing staging database, and distinct staging upload/backup paths. Never use production database, data, secret, upload, or backup paths.
2. Start with `npm run staging:tunnel:start`; record the printed `https://<label>.trycloudflare.com` URL and `quick-tunnel-output/evidence.json`.
3. Check the current URL/readiness with `npm run staging:tunnel:status`. Re-acquire the URL after any restart.
4. Stop with `npm run staging:tunnel:stop`. The command uses `down --remove-orphans` and deliberately never uses `down -v`, preserving staging data and evidence.

## Verification

- PASS — Quick Tunnel contract/lifecycle test: `node test/test-quick-tunnel-staging.js`.
- PASS — Full regression: `npm test`.
- PASS — Static quality gates: `npm run lint`, `npm run typecheck`, `npm run build`.
- PASS — Patch whitespace: `git diff --check`.
- Live Quick Tunnel smoke: **SKIPPED/BLOCKED** in this environment because Docker Engine is unavailable and local Docker configuration access is denied. Docker CLI/Compose presence alone is not a smoke-test pass. No live tunnel URL or evidence was claimed.

## Task mapping and remaining gates

| Item | State |
|---|---|
| Temporary Quick Tunnel staging transport | Complete |
| TASK 27 production deployment | **PARTIAL** |
| UAT business sign-off (PX, CĐVT, system administration) | **PENDING** |
| Production domain/HTTPS, named tunnel/HA | Not complete |
| Production secrets, database/storage and approved rollout | Not complete |
| TASK 28 controlled go-live | Not opened |

Quick Tunnel changes no schema, migration, storage model, business rule, RBAC rule, or canonical ledger. Anonymous denial and authenticated role/data-scope enforcement remain in Express.

## Next recommended task

Complete TASK 26 with approved, anonymized real-data UAT and sign-off from PX, CĐVT, and system administration. Then complete the production portion of TASK 27 (production domain/HTTPS, named tunnel/HA, production secrets/storage, and an approved rollout). Do not open TASK 28.
