# Implementation tasks

All tasks are required for the agreed prototype. Status: **T01–T08 complete; T09–T16 not started**. Check a task only after its acceptance criteria are demonstrated and `pnpm check` passes, including **frontend and backend unit tests and both production builds** (see [project guidance](../AGENTS.md)). These are local backlog items; no external tracker, recurring jobs, or implementation agents have been created.

| ID | Task | Depends on |
| --- | --- | --- |
| T01 | Scaffold Nx workspace and quality commands | — |
| T02 | Define shared runtime contracts | T01 |
| T03 | Implement schema, migrations, and seeds | T02 |
| T04 | Implement Express lifecycle and common errors | T03 |
| T05 | Implement menu configuration and query APIs | T04 |
| T06 | Implement authoritative checkout quotes | T05 |
| T07 | Implement idempotent orders and status transitions | T06 |
| T08 | Implement Socket.IO and revision synchronization | T07 |
| T09 | Implement Angular shell and client adapters | T02, T04 |
| T10 | Implement Setup UI | T05, T08, T09 |
| T11 | Implement menu, cart, and large-menu behavior | T05, T08, T09 |
| T12 | Implement review, confirmation, and recovery UI | T06, T07, T11 |
| T13 | Implement Orders UI and manual statuses | T07, T08, T09 |
| T14 | Implement two-service Docker deployment | T08, T09 |
| T15 | Complete reliability, performance, and CI verification | T10, T12, T13, T14 |
| T16 | Complete README and handoff | T15 |

T09 can follow T04 while server work continues sequentially; T14 can start once both app builds exist and does not need visual polish. Tests for a feature belong in that feature's task. See the [seven-day plan](implementation-plan.md) for delivery grouping.

## Foundation

- [x] **T01 — Scaffold Nx workspace and quality commands**

  Create integrated Nx apps `frontend` and `backend`, framework-neutral `contracts`, and `frontend-e2e`; use pnpm with one lockfile. Resolve the latest stable Angular against Nx/NgRx/Material/TypeScript/Node peers; record exact versions. Configure strict TypeScript/template checking, ESLint import boundaries, Vitest integration, Playwright, local proxy paths, and root scripts. Initialize Git if absent and add ignores.

  Acceptance: a frozen install succeeds without peer bypasses; both placeholder apps start with `pnpm dev`; `pnpm lint`, `typecheck`, `test`, and `build` run successfully. Client code cannot import backend/DB code. Record a baseline production bundle budget and native-driver compatibility. Do not add placeholder tests solely to make targets green.

  Completed 2026-10-18. See [verification results](t01-verification.md) and the [local startup README](../README.md).

- [x] **T02 — Define shared runtime contracts**

  Create Zod schemas and inferred DTOs for menu/setup, cart intent, persisted quote snapshot, order, status updates, pagination, revisions, errors, and Socket.IO event maps. Include money/quantity/string limits and concrete error-detail schemas from [contracts](contracts.md).

  Acceptance: both apps import the library without framework/server dependencies leaking across boundaries; representative malformed prices, quantities, enums, and unknown request fields are rejected. Decimal parsing and monetary arithmetic have focused boundary tests.

  Completed 2026-10-18. See [verification results](t02-verification.md) and the [implemented contract reference](contracts.md). All 77 unit tests, root quality checks, frozen install, and existing browser smoke test pass.

- [x] **T03 — Implement schema, migrations, and seeds**

  Add Drizzle schema/migrations for categories/items, quotes, orders/lines, and persisted stream revisions. Enable foreign keys, WAL, busy timeout, checks, indexes, unique request keys, and unique quote consumption. Add explicit small/large seed modes; a 5,000-item dataset; ignored local DB paths; startup-safe demo initialization.

  Acceptance: a fresh DB migrates and seeds; a second migration/seed/restart does not duplicate/overwrite data. Constraints reject invalid money and duplicate key/quote consumption. Real-file tests verify order lines survive menu archival and that data/revisions survive reopening. Quote cleanup never removes referenced records.

  Completed 2026-10-18. See [verification results](t03-verification.md) and [database commands](../README.md#database). Added 51 real-file persistence tests; all 128 unit tests, uncached frontend/backend builds, root quality checks, frozen install, migration checks, compiled startup/restart smoke, and existing Chromium E2E test pass.

- [x] **T04 — Implement Express lifecycle and common errors**

  Separate testable app construction from startup. Add config validation, bounded JSON bodies, runtime request validation, request IDs, structured error mapping, health endpoints, and graceful HTTP/socket/DB shutdown. Migrate before readiness; no broad cross-origin access is needed with the dev/reverse proxies.

  Acceptance: configuration/migration failures fail startup clearly; ready/live endpoints behave as designed; unexpected exceptions do not expose internals; SQLite lock errors become retryable responses. Integration tests use isolated databases and no real development data.

  Completed 2026-10-18. See [verification results](t04-verification.md) and [backend lifecycle/settings](../README.md#backend-lifecycle-and-health). Added 57 backend tests; all 185 unit tests, uncached root quality checks and frontend/backend production builds, compiled configuration/migration/signal/restart smoke checks, and the existing Chromium E2E test pass. Socket.IO transport implementation remains T08; its lifecycle attachment and forced upgraded-connection cleanup are covered here.

## Backend workflows

- [x] **T05 — Implement menu configuration and query APIs**

  Create/edit/archive categories and items; manage fixed/open pricing and availability. Add expected-revision conflict checks, transactional menu revision increments, bounded query/search/category pagination, and cart item resolution independent of the current page. Archived categories make their children unorderable.

  Acceptance: valid mutations persist; invalid category/pricing requests and stale edits are rejected; archive semantics are consistent across menu and checkout reads. Snapshot rows and stream revisions are read consistently. Small and large fixtures return bounded deterministic pages. Service results expose post-commit notification data for T08.

  Completed 2026-10-18. See [verification results](t05-verification.md) and [menu configuration/query behavior](contracts.md#2-http-surface). Added 57 isolated real-file menu API/service tests covering mutations, conflicts, archive eligibility, rollback, concurrent snapshot reads, post-commit notification data, and bounded small/5,000-item fixture pages. Uncached `pnpm check` passed, including both app unit-test targets and production builds. Shared eligibility reads are ready for T06/T07; checkout endpoints and Socket.IO remain later tasks.

- [x] **T06 — Implement authoritative checkout quotes**

  Recalculate prices/totals from DB; accept open prices only for open items; validate discount and item/category availability. Persist five-minute quotes with exact snapshots/menu revision, and return visible differences from the client's observed values.

  Acceptance: tests cover changed fixed prices, removed/archived/unavailable items/categories, pricing-mode switches, multiple open prices for one item, zero-total orders, excessive discounts, invalid decimals at input boundaries, and overflow protection. Invalid carts receive line-specific issues; no quote reserves inventory or creates an order.

  Completed 2026-10-18. See [verification results](t06-verification.md). Added the transactional quote endpoint and 44 isolated real-file checkout tests covering authoritative snapshots, five-minute expiry metadata, visible differences, line-specific cart issues, pricing switches, safe money boundaries, rollback, and writer serialization. Uncached `pnpm check` passed, including frontend/backend unit tests and both production builds. Order confirmation remains T07.

- [x] **T07 — Implement idempotent orders and status transitions**

  Add quote confirmation, key-based recovery, order list/detail, and manual status updates. Use short immediate transactions, canonical request hashes, unique key/quote constraints, immutable line snapshots, and persisted stream revisions. Implement exactly the agreed transition graph.

  Acceptance: overlapping same-key requests create one order; the same key with another payload conflicts; another key cannot consume the same quote. Replay succeeds after quote expiry/menu edits and a backend restart. Changed availability between review and commit prevents placement. A failed transaction leaves no order lines/orphaned state. Lost-response recovery returns the original order. Invalid/stale status transitions change nothing; historical prices remain unchanged after Setup edits.

  Completed 2026-10-18. See [verification results](t07-verification.md). Added quote confirmation, key-based replay/recovery, consistent paginated order reads, immutable snapshots, manual status transitions, and committed notification data for T08. Added 88 isolated real-file tests, including independent SQLite writer races, a committed request with a dropped HTTP response, expiry/edit/restart recovery, rollback, and all 25 status pairs. Uncached `pnpm check` passed, including frontend/backend unit tests and both production builds. Realtime delivery and frontend workflows remain later tasks.

- [x] **T08 — Implement Socket.IO and revision synchronization**

  Attach one typed Socket.IO server to the Express HTTP server. Emit `sync.state` on connection and menu/order notifications only after commits. Add `/api/sync`, finite optional connection recovery, and shutdown handling; no domain writes through sockets.

  Acceptance: two independent clients see committed menu and status changes; failed transactions emit nothing. Clients can reconnect after restart using persisted revisions. Tests demonstrate duplicate notification tolerance and missed-broadcast repair through sync. Socket.IO server and client versions/paths are compatible and HTTP polling remains available.

  Completed 2026-10-18. See [verification results](t08-verification.md). Added one typed Socket.IO server, committed menu/order broadcasts, uncached `/api/sync`, finite optional connection recovery, and lifecycle cleanup. All 18 isolated real-file realtime tests passed, including COMMIT failure, duplicate events, omitted-broadcast repair, restart recovery, polling/upgrade, and active-client shutdown. Uncached `pnpm check` passed, including frontend/backend unit tests and both production builds; frozen install and both Chromium E2E tests passed, including two independent browser contexts through the Angular proxy. Angular client adapters/stores remain T09.

## Frontend workflows

- [ ] **T09 — Implement Angular shell and client adapters**

  Add lazy Menu/Setup/Orders/detail routes, Material theme/navigation, HttpClient API adapters, singleton socket service, and feature SignalStores. Implement connection indicators, request cancellation, error handling, highest-revision tracking, reconnect/focus/15-second sync checks, and listener teardown.

  Acceptance: one socket exists across route changes; no event listener leaks; a late response cannot replace newer query/revision state. Cached content survives disconnects; synchronization is visible. Material dialogs/forms have labels, keyboard support, and correct focus handling. No auth controls are added.

- [ ] **T10 — Implement Setup UI**

  Build category/item forms and paginated lists for name/category, fixed/open pricing, availability, and archive. Retain invalid form input and show server/optimistic-revision conflicts. Confirm archival with its effect on active menu items.

  Acceptance: an edit in Setup is visible in another browser's Menu without reloading; archival removes ordering eligibility. Editing open pricing never sends a fixed price. Concurrent edits produce an actionable conflict rather than silently overwriting another edit. Form submission errors retain input.

- [ ] **T11 — Implement menu, cart, and large-menu behavior**

  Build server-paged browsing, debounced search/category filtering, item availability, quantity entry, open-price dialog, cart line editing, fixed discount input, and live estimated totals. Store validated/versioned per-tab cart data in sessionStorage. Resolve cart items outside the visible page when menu changes.

  Acceptance: 5,000 seeded items do not cause a full-menu fetch/render; rows use stable IDs/skeleton dimensions. Different open prices remain separate cart lines. Unavailable/archived items and changed prices are visibly marked without deleting user intent. Cart survives route changes/reload; corrupt/unavailable storage does not crash. Unit/component tests cover money input, discounts, and retained state on errors.

- [ ] **T12 — Implement review, confirmation, and recovery UI**

  Implement the explicit quote review and confirm workflow. Invalidate a quote on local edits/menu changes/expiry. Persist a frozen attempt key and exact quote payload before sending. Keep unknown outcomes pending and recover by key or same-key retry, including on page reload.

  Acceptance: a late availability/price change triggers review again and never silently places an order. Double-clicking sends one checkout intent. A response lost after commit, followed by reload/retry, opens the same order with no duplicate. A 404 lookup does not lead to a new key while the old attempt is unresolved; `QUOTE_USED` resolves to the existing order. Definite validation rejection restores an editable cart; no automatic order is submitted on reconnect. Storage failure has a clear recovery limitation.

- [ ] **T13 — Implement Orders UI and manual statuses**

  Add paginated all-order list, optional status filter, line/total detail, staff progression controls, and cancellation from placed/preparing. Refresh list membership/counts as well as visible statuses on realtime changes.

  Acceptance: orders created elsewhere appear live; another browser sees manual status changes. Invalid/terminal transitions have no controls and are rejected server-side too. Filtered lists remove/add orders correctly after status events. Reconnect catches up without duplicate rows; stale staff actions preserve context and offer refresh.

## Deployment and delivery

- [ ] **T14 — Implement two-service Docker deployment**

  Add root `compose.yaml`, multi-stage frontend/backend Dockerfiles, `.dockerignore`, Nginx config, health checks, optional `.env.example`, and named SQLite volume. Compile native SQLite dependencies inside Linux images; ensure non-root volume permissions. Proxy HTTP/polling/Upgrade traffic and deep frontend routes correctly.

  Acceptance: `docker compose config --services` lists exactly `frontend` and `backend`. A clean `docker compose up --build` starts a seeded app without extra commands. Deep links, `/api`, Socket.IO polling/upgrade, health readiness, and backend shutdown work. Restart/recreate preserves orders; a failed backend produces a recoverable UI state. Defaults do not require editing `.env` or embedding a host-specific API URL.

- [ ] **T15 — Complete reliability, performance, and CI verification**

  Finish the matrix in [implementation-plan](implementation-plan.md): multi-context E2E, race/retry/restart tests, large-menu measurements, and container smoke tests. Add CI for frozen install, lint/typecheck/tests/build, isolated E2E, and the two-service smoke test. Fix discovered failures and record actual results.

  Acceptance: root `pnpm check` and `pnpm e2e` pass; CI executes the equivalent checks; no real development DB is touched. Record throttled-device/network configuration, bounded list size, interaction/layout results, and live/missed-event recovery timing. Tests cover a commit followed by dropped response and a commit followed by omitted broadcast, not merely offline-before-submit behavior.

- [ ] **T16 — Complete README and handoff**

  Write the root README with one-command Docker and two-command local startup, prerequisites/exact tool versions, optional settings, migrations/seeds, checks, architecture links, simplifications/trade-offs, volume reset semantics, and production follow-up. Include a reproducible two-browser demonstration and final validation results.

  Acceptance: someone starting from a fresh checkout can run the prototype using the README alone. All confirmed product choices match docs/code. The meaningful local commit sequence is preserved; publishing/pushing is handled only if requested. No unimplemented capability is presented as complete.
