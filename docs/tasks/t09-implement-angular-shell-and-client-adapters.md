# T09 — Implement Angular shell and client adapters

Status: **Complete**

Depends on: [T02](t02-define-shared-runtime-contracts.md), [T04](t04-implement-express-lifecycle-and-common-errors.md)

[Task index](README.md)

## Scope

Add lazy Menu/Setup/Orders/detail routes, Material theme/navigation, HttpClient API adapters, singleton socket service, and feature SignalStores. Implement connection indicators, request cancellation, error handling, highest-revision tracking, reconnect/focus/15-second sync checks, and listener teardown.

## Acceptance criteria

One socket exists across route changes; no event listener leaks; a late response cannot replace newer query/revision state. Cached content survives disconnects; synchronization is visible. Material dialogs/forms have labels, keyboard support, and correct focus handling. No auth controls are added.

## Completion record

Completed 2026-10-18. See [verification results](#verification). Added the lazy Material shell, validated same-origin HTTP adapters, one root socket/sync service, route-owned SignalStores, cancellation/revision guards, visible recovery states, and an accessible connection dialog. All 25 frontend, 320 backend, and 75 contract tests passed with uncached `pnpm check`, including both production builds. All five Chromium tests passed, including one socket across navigation, keyboard/focus behavior, real two-context store updates, offline recovery, and deep links. Recorded and optimized the production bundle baseline; editing/cart/checkout/status UI remain T10–T13.

## Verification

Verified on 2026-10-18, macOS arm64, with pinned Node **24.22.0** and pnpm **12.14.0** from the existing isolated npm-exec toolchain. Dependencies and the lockfile are unchanged.

### Implemented behavior

- The Angular shell provides a Material theme, responsive Menu/Setup/Orders navigation, active-page semantics, page titles, a skip link, and heading focus after navigation. `/menu` (default), `/setup`, `/orders`, and `/orders/:id` load their standalone page components lazily. Unknown routes return to Menu. No authentication controls are added.
- Basic read views exercise the real Menu, Setup, Orders, and detail APIs. Their NgRx SignalStores own query state and route-lifetime remote resources; components do not create sockets or subscribe directly to socket events. Items/orders remain server-paged at the contract's default 50 rows. Editing, cart/search/pagination controls, checkout UI, and manual status controls remain T10–T13.
- `ApiClient` covers menu/setup reads and writes, off-page item resolution, quote creation, frozen-key confirmation, key-based recovery, order reads/status writes, and synchronization. Requests use relative `/api` paths, validate outgoing fields/IDs and incoming DTOs against shared contracts, preserve typed server errors/details/request references, and display safe fallback messages for malformed responses/network failures. Unsubscribing cancels HTTP; hanging requests time out after ten seconds. Mutations are never automatically retried.
- One root `RealtimeSync` service owns a typed same-origin Socket.IO client on `/socket.io`, with polling and WebSocket upgrade available. It registers listeners before connecting and retains the maximum observed menu/order stream revisions from validated socket events, sync reads, and accepted feature HTTP snapshots. Duplicate/older notifications cannot regress state or cause redundant feature reads.
- Sync reads run at startup, on connection/reconnection, window focus, and every 15 seconds. Overlapping sync requests coalesce. Successful checks also retry failed active feature reads when the revision is unchanged. Connection, checking, failed-check, loading, error, and stale-content states are visible. Background browser timers can be throttled; focus/reconnect checks repair that gap.
- Query changes, refreshes, and newer stream revisions cancel superseded HTTP subscriptions. A generation/query/revision guard rejects obsolete responses even in the interval before Angular's effect can cancel them. Accepted snapshots advance the shared watermark and invalidate older resources. Cached view content remains available through disconnects and failed refreshes, with retry controls. Route resources are destroyed on navigation; this is an in-memory view cache, not offline persistence.
- The connection details dialog loads on demand, has an accessible title, labelled buttons, keyboard focus trapping, Escape dismissal, and focus restoration. Repeated activation opens one dialog. A failed dialog chunk load gives a visible retry message. No feature editing forms are introduced in this task; their validation and focus behavior belong with T10–T12.
- Application destruction unregisters all six owned socket callbacks, removes the focus listener and timer, cancels sync HTTP, and disconnects the socket. Destroying a feature cancels only its HTTP/effects and leaves the root socket intact.

### Demonstrated acceptance

Added **24 frontend tests** beside the client implementation, bringing the frontend target to **25 tests**:

- Seven HTTP-boundary tests cover bounded/encoded queries, invalid DTOs, typed revision conflicts, exact confirmation payload/key with no automatic retry after a lost response, unsubscribe cancellation, ten-second timeout, malformed request rejection before HTTP, and safe error text.
- Five realtime tests cover singleton creation/listener accounting, monotonic revisions and malformed events, reconnect/focus/exact 15-second scheduling, overlapping sync coalescing, failure recovery, and complete listener/timer/HTTP teardown.
- Twelve integration-style frontend tests combine real SignalStores, HttpClient's testing backend, and the root revision service. They demonstrate superseded-query cancellation, old-result rejection before effect execution, event/HTTP races, revision invalidation, duplicate/unrelated event tolerance, HTTP watermark propagation, cached content on disconnect/error, same-revision retry after focus sync, omitted-broadcast repair, route teardown, Setup archived queries, order-filter invalidation, and detail-ID cancellation/validation.

Added three Chromium scenarios in `apps/frontend-e2e/src/shell.spec.ts`, and updated the original shell smoke test:

- Repeated lazy route navigation creates exactly one Socket.IO polling handshake, retains active-link semantics, moves focus to each heading, and has no browser exceptions. The labelled Material dialog traps Tab/Shift+Tab, closes on Escape, and restores focus. Setup deep-link reload succeeds.
- Two independent browser contexts display the real Angular Menu store. A committed API edit appears in both without reload. An offline refresh retains the old content and exposes an error; reconnect/focus reconciliation shows the latest committed name and clears the error.
- A real quote/order created through isolated HTTP fixtures opens through its detail deep link, survives reload, and is reachable from Orders. Invalid/missing IDs display recoverable errors and permit navigation back.

Existing browser coverage still verifies the same-origin API and polling/WebSocket proxy with independent raw socket clients. Manual Playwright screenshots at **1280×900** and **375×812** with the small in-memory seed showed readable navigation, connection state, and menu rows without horizontal clipping. The T3 preview opened/navigated, but its snapshot operation timed out twice; screenshot inspection used the installed repository Playwright tooling instead.

### Production bundle investigation

The first production build correctly failed the T01 placeholder budget: **933.31 kB raw / 201.22 kB estimated transfer**. Bundle statistics showed unused Zod exports/locales retained through the nested `import { z }` binding. Direct namespace imports (`import * as z`) in the shared schema files preserve the same contracts and allow the browser bundler to discard those exports, removing roughly **334 kB**. Deferring the connection dialog removed another **79 kB** from initial loading. Material buttons/toolbar use standalone imports.

The verified production initial bundle is **520.72 kB raw / 132.31 kB estimated transfer**. All four pages and the connection dialog have separate lazy chunks. The initial warning/error budgets are now **550/600 kB**, replacing the **350/500 kB** placeholder limits with modest headroom for the implemented router, HTTP, Material, socket, and runtime-validation foundation. Component stylesheet limits remain **4/8 kB**. This is a measured bundle baseline, not a throttled-device performance result; large-menu and interaction measurements remain T11/T15.

### Checks

- `NX_SKIP_NX_CACHE=true pnpm check` **passed**, including all lint targets, strict TypeScript/Angular template checks, **25 frontend + 320 backend + 75 shared contract tests (420 total)**, **both frontend and backend production builds**, and contracts declarations.
- `pnpm e2e --output-style=static` **passed: 5/5 Chromium tests** after the final code changes. Run E2E after builds finish: an intermediate attempt overlapped the root production build and E2E's backend watch build, which share `dist/apps/backend`, causing a missing-entry startup failure. Sequential verification passed; this was a verification-process collision, not an application startup defect.
- `git diff --check` **passed**.

No development database was read, seeded, reset, or modified. Unit/API tests use their existing isolated databases; E2E owns an in-memory backend with seeding disabled. Manual screenshot verification used a separate in-memory backend with the small seed. No external services, commits, or deployments were created.
