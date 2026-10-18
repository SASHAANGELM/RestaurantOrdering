# T04 — Express lifecycle and common errors verification

Verified on 2026-10-18, macOS arm64, with pinned Node **24.22.0** and pnpm **12.14.0** through the isolated npm-exec toolchain used for T01–T03. No dependency or lockfile changes were needed. HTTP integration tests use Node's native HTTP server and fetch against ephemeral loopback ports.

## Implemented behavior

- `apps/backend/src/app.ts` constructs Express without binding a port, installing process handlers, or opening a database. Routers register before the shared JSON 404/error handlers. Existing `GET /api` behavior remains compatible with the Angular proxy.
- `config/config.ts` validates host, port, database path, seed mode, JSON limit, and shutdown deadline before database initialization. Defaults preserve local startup. Invalid settings report setting names and rules without echoing values.
- Requests receive a generated UUID `X-Request-Id`; error envelopes contain the same ID. Client-supplied IDs are ignored. The server disables `x-powered-by` and supplies no broad cross-origin grants.
- The JSON parser defaults to 65,536 bytes with decompression disabled. Malformed, oversized, compressed, and primitive JSON return contract-shaped `400 VALIDATION_ERROR`. `validateRequest` parses shared body/query/path/header schemas, preserves transformations/defaults, rejects unknown fields, and prefixes issue paths with their source. Malformed path encoding also returns 400.
- `HttpError` preserves the shared code/detail/status mapping. Unknown endpoints return `404 NOT_FOUND` with request correlation in the required resource details. Unexpected synchronous and asynchronous exceptions and SQLite constraint failures return generic `500 INTERNAL_ERROR` without internal messages, SQL, paths, or stacks. Server-side error reports retain the request ID and original exception.
- SQLite busy/locked failures, including extended codes and wrapped causes, return `503 SERVICE_UNAVAILABLE`, `Retry-After: 1`, and `{ retryAfterMs: 1000 }`. Real writer contention leaves revisions unchanged and readiness recovers after the lock is released.
- Liveness returns `200 { status: 'live' }` without reading SQLite. Readiness returns `200 { status: 'ready' }` only when not shutting down and database probes find initialized app state and a migration journal entry. A closed/unmigrated database or missing initialization records returns the common retryable 503 envelope while liveness remains 200. Both endpoints disable caching.
- `server.ts` migrates and optionally seeds before attaching transports or binding HTTP. Initialization, app-construction, and listener failures have explicit startup-stage errors and clean up acquired resources. `main.ts` logs startup failure and exits unsuccessfully.
- SIGINT/SIGTERM initiate idempotent shutdown: reject new work, stop accepting HTTP, drain active requests and await registered socket cleanup, then close SQLite. A finite deadline forces stalled HTTP and upgraded connections closed, invokes socket force cleanup, closes SQLite, and reports failure. Socket cleanup rejection also closes HTTP/SQLite. The attachment interface supports T08; the Socket.IO server itself remains unimplemented.

## Demonstrated acceptance and checks

- Added **57 backend tests** alongside configuration, app, and lifecycle implementation. Backend now has **109 passing tests**, including the existing persistence and contract-consumer suites.
- `NX_SKIP_NX_CACHE=true pnpm check`: passed. Lint and strict typechecking passed for all four projects. Unit tests passed: **frontend 1**, **backend 109**, **contracts 75**, totaling **185**. Both frontend/backend production builds and contracts declarations succeeded with cache reads disabled.
- Compiled `dist/apps/backend/main.cjs` smoke: invalid port configuration exited **1** before creating a database; an executable without its migration assets exited **1** with a clear initialization error. The normal executable migrated/seeded before reporting ready; live/ready returned 200. SIGTERM and SIGINT each exited **0**. Reopening/restarting retained exactly 12 seeded items and manually changed stream revisions; SQLite integrity checking returned `ok`.
- Lifecycle integration tests demonstrated migration failure and recovery, database path failure, app-construction failure, occupied-port failure with transport cleanup, request draining before DB closure, idempotent shutdown, forced closure of an actual upgraded TCP connection, and socket cleanup failure handling.
- `pnpm e2e`: the existing **one-test Chromium smoke** passed, verifying Angular rendering and same-origin API proxying after the startup refactor.
- `git diff --check`: passed.

Every database integration test and compiled startup smoke used isolated OS temporary directories, removed afterward. E2E used its configured in-memory database with seeding disabled. No development database was read, seeded, reset, or modified.
