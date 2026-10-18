# T14 — Implement two-service Docker deployment

Status: **Complete**

Depends on: [T08](t08-implement-socket-io-and-revision-synchronization.md), [T09](t09-implement-angular-shell-and-client-adapters.md)

[Task index](README.md)

## Scope

Add root `compose.yaml`, multi-stage frontend/backend Dockerfiles, `.dockerignore`, Nginx config, health checks, optional `.env.example`, and named SQLite volume. Compile native SQLite dependencies inside Linux images; ensure non-root volume permissions. Proxy HTTP/polling/Upgrade traffic and deep frontend routes correctly.

## Acceptance criteria

`docker compose config --services` lists exactly `frontend` and `backend`. A clean `docker compose up --build` starts a seeded app without extra commands. Deep links, `/api`, Socket.IO polling/upgrade, health readiness, and backend shutdown work. Restart/recreate preserves orders; a failed backend produces a recoverable UI state. Defaults do not require editing `.env` or embedding a host-specific API URL.

## Completion record

Completed 2026-10-18. Added root Compose configuration, multi-stage frontend/backend Dockerfiles, Nginx routing/cache/proxy configuration, health checks, build-context exclusions, optional environment examples, and a named SQLite volume. Both containers run as non-root users. Added `pnpm docker:smoke` with isolated production browser acceptance coverage and updated deployment instructions. Uncached `pnpm check` passed, including both app unit-test targets and both production builds. The production container smoke test passed, and the existing Chromium suite passed 18/18 with one worker.

## Verification

Verified on 2026-10-18 using repository-pinned **Node 24.22.0** and **pnpm 12.14.0** through the existing isolated npm-exec toolchain. Docker client/Engine **29.8.2**, Compose **5.6.0**, and Docker Desktop Linux **arm64** containers were used on macOS arm64. Images use `node:24.22.0-bookworm-slim` and `nginx:1.30.0-alpine`.

### Implemented behavior

- Compose defines exactly `frontend` and `backend`. Only the frontend publishes a host port, defaulting to 8080. The backend listens on the internal network at port 3000 and stores SQLite at `/data/restaurant.sqlite` in the project-scoped `restaurant-data` volume. The image owns `/data` as the non-root Node user before Docker populates an empty volume; no root entrypoint or manual permission command is needed.
- Both app builds consume the repository lockfile/contracts from a root build context with pinned tools and frozen installs. Build tools stay in build stages; backend runtime dependencies are pruned to production dependencies. `npm_config_build_from_source=true` compiles native dependencies inside Linux. The build's in-memory native probe passed with better-sqlite3 **13.0.3**, Node ABI **137**, and SQLite **3.53.4** on Linux arm64. Host dependencies, build outputs, environment files, and SQLite files are excluded by `.dockerignore`.
- Backend startup uses the existing migration/seed lifecycle before listening. Compose waits for its database readiness health check before starting the frontend, following [Docker's dependency-health behavior](https://docs.docker.com/compose/how-tos/startup-order/). Both images define independent health checks. Backend SIGTERM uses the existing bounded shutdown; Compose grants 15 seconds against the application's default 10-second deadline.
- Nginx preserves `/api` and `/socket.io` paths and queries, forwards polling and WebSocket Upgrade traffic, disables proxy buffering, and sets 75-second read/send timeouts. Upgrade forwarding follows the [Nginx WebSocket guidance](https://nginx.org/en/docs/http/websocket.html). Docker DNS is re-resolved every five seconds so backend recreation does not require a frontend restart. Failed API/socket requests never fall back to the SPA, and writes are not retried by Nginx.
- Deep frontend routes fall back to revalidated `index.html`. Hashed assets, including Angular hashes containing `_` and `-`, receive immutable one-year caching; absent assets return 404. `/health` tests Nginx independently of backend readiness. Frontend requests remain relative to the browser origin. `.env.example` is optional and documents host port/first-run seed settings.

### Demonstrated acceptance

`pnpm docker:smoke` creates a unique Compose project, random loopback port, network, and disposable named volume. Its Playwright configuration and deployment test live in `apps/frontend-e2e/`; its lifecycle runner is `tools/docker-smoke.cjs`. The final fresh-volume run **passed 1/1 Chromium scenario** and removed its containers, network, and volume afterward:

- `docker compose config --services` returned exactly `backend` and `frontend`. `up --build --detach --wait` built both images and reached healthy state without separate migration, seed, or environment-file setup. The fresh menu contained 12 seeded items. Both live container UIDs were nonzero; successful initialization demonstrated writable volume ownership.
- Nginx health, backend liveness/readiness, `/api`, JSON API 404s, Socket.IO transport errors, missing assets, deep Setup/detail routes, and detail reloads behaved correctly. The main bundle and every browser-requested script/stylesheet across detail, Setup, and Menu navigation received immutable caching; route HTML remained revalidated.
- Independent polling-only and polling-to-WebSocket clients connected through Nginx. The latter upgraded successfully. Both received the same committed order notification after an authoritative quote and confirmed order were created through the frontend origin.
- SIGTERM stopped the backend with polling/upgraded/browser clients active: container exit code **0**, no OOM kill. Nginx remained healthy. The browser showed Offline/disconnected state, retained its menu, and displayed a retryable failed-refresh error. Backend startup restored readiness, automatic browser connection, and successful refresh without a page reload; the error cleared.
- Restart and forced recreation preserved the exact order snapshot and request-key recovery result. Replaying the original confirmation/key returned the same order. Menu seeding did not duplicate items. The replacement backend had a different container ID while the frontend retained its original ID; proxying and browser reconnection recovered without recreating Nginx.

### Checks and limits

- Final `NX_SKIP_NX_CACHE=true pnpm check` **passed** after implementation changes: all four lint and strict typecheck targets, **frontend and backend unit tests**, shared contract tests, **both production app builds**, and contracts declarations. Cache reads were disabled.
- Final `pnpm docker:smoke` **passed: 1/1**, including explicit failed-refresh recovery and cleanup of its isolated database volume.
- `pnpm e2e --output-style=stream --workers=1` **passed: 18/18 Chromium tests**, run after production checks finished. An earlier default parallel run passed 17/18: another test's menu mutation invalidated the checkout test's review before confirmation. This suite shares one in-memory backend; the README now documents the same single-worker invocation used for T12/T13 verification. Broader test isolation remains reliability work.
- An early smoke harness used a synchronous Docker stop call in the worker owning a WebSocket client, preventing it from answering close frames and provoking the backend's shutdown deadline. Asynchronous Docker calls fixed the harness; application lifecycle code is unchanged. Outage assertions accept both Nginx 502 and 504 responses, depending on whether the unavailable upstream refuses or times out.
- `git diff --check` **passed**. The existing frontend initial-bundle warning remains (**568.68 kB** versus 550 kB warning / 600 kB error limits); builds succeed. No AMD64 container run or remote/public deployment was performed.

No development database or pre-existing application volume was read, seeded, reset, or modified. All deployment writes used task-owned temporary projects/volumes; browser regression tests used their existing isolated in-memory backend. Docker Desktop was started for verification. No commits or external deployments were created.
