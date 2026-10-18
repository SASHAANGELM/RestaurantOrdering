# T15 — Complete reliability, performance, and CI verification

Status: **Complete**

Depends on: [T10](t10-implement-setup-ui.md), [T12](t12-implement-review-confirmation-and-recovery-ui.md), [T13](t13-implement-orders-ui-and-manual-statuses.md), [T14](t14-implement-two-service-docker-deployment.md)

[Task index](README.md)

## Scope

Finish the matrix in [implementation-plan](../implementation-plan.md): multi-context E2E, race/retry/restart tests, large-menu measurements, and container smoke tests. Add CI for frozen install, lint/typecheck/tests/build, isolated E2E, and the two-service smoke test. Fix discovered failures and record actual results.

## Acceptance criteria

Root `pnpm check` and `pnpm e2e` pass; CI executes the equivalent checks; no real development DB is touched. Record throttled-device/network configuration, bounded list size, interaction/layout results, and live/missed-event recovery timing. Tests cover a commit followed by dropped response and a commit followed by omitted broadcast, not merely offline-before-submit behavior.

## Completion record

Completed 2026-10-18. Added push/PR CI, production-build browser fixtures, a two-context committed-but-omitted-broadcast scenario, and a throttled 5,000-item performance scenario. Fixed measured Menu layout instability with a stable, keyboard-scrollable results panel and reserved loading space. Browser scenarios now run with one worker and zero retries; the Orders fixture no longer retries around other scenarios' menu mutations. Container smoke cleanup also removes its uniquely named images. Final uncached `pnpm check`, all 19 standard Chromium scenarios, both large-menu scenarios, and the production container smoke test passed. The task index is synchronized. The existing initial-bundle warning remains within the unchanged production error budget.

## Verification

Verified on 2026-10-18 with repository-pinned **Node 24.22.0 / pnpm 12.14.0**, selected through the existing isolated npm-exec toolchain. Dependencies and the lockfile are unchanged. Host: **Apple M4, 10 logical CPUs, macOS arm64**. Browser: **Chromium 156.0.8078.4**. Containers: **Docker client/Engine 29.8.2, Compose 5.6.0, Linux arm64**.

### Isolation and CI

- Standard E2E and the separate large-menu suite build and serve the optimized Angular production output with a same-origin Vite preview HTTP/WebSocket proxy. Each suite starts its own backend and refuses existing servers on ports 3000/4200. Each scenario owns fresh browser contexts; one worker serializes mutations to the suite-owned database. Retries are disabled locally and in CI, including fixture order creation.
- The test-only backend entry point in `apps/backend/src/testing/e2e-server.ts` hardcodes `DATABASE_PATH=:memory:` behavior and explicit none/large seed selection; inherited development database/seed settings cannot redirect it. It uses production migrations, services, HTTP routers, and sockets. Backend unit/integration tests continue to use isolated in-memory or temporary file databases, including independent connections and restart/WAL tests. No development database was read, seeded, reset, or modified.
- Notification omission is implemented only in that test entry point by wrapping real post-commit callbacks for selected IDs. It records suppressed callbacks while leaving connected sockets intact. Neither production entry point imports the fixture. The built production backend contains no fixture route names, and the container smoke test demonstrates **404 for both GET `/api/__e2e/omitted` and POST `/api/__e2e/omit`**.
- `.github/workflows/verify.yml` runs on pushes and pull requests with read-only repository permissions, a 30-minute job bound, and cancellation of superseded branch runs. It selects Node from `.node-version` and pnpm from `packageManager`, performs a frozen install and native SQLite probe, installs Chromium/system dependencies, then runs uncached `pnpm check`, standard E2E, the separate large-menu suite, and `pnpm docker:smoke`. Browser reports, failure traces, screenshots, and timing JSON are uploaded even after failure, retained for seven days. The YAML parses successfully. These commands passed locally with `CI=true`; no hosted GitHub run was dispatched in this task.

### Reliability matrix and measured recovery

The complete **19/19 standard Chromium scenarios** passed against the production frontend. Existing Setup/Menu/checkout/Orders/shell scenarios continue to cover separate staff/customer contexts, conflicts, keyboard/focus, deep-link reloads, filtered order membership, offline retained content, and reconnection.

The new `apps/frontend-e2e/src/reliability.spec.ts` demonstrates:

- A real menu price commit appears in the customer context in **31 ms**; a real order status commit appears in the independent staff context in **7 ms**, both below the local one-second target. Measurements include the mutation request and assertion overhead.
- Debounced search and revision-triggered reads settle before fault injection, preventing an unrelated in-flight read from falsely demonstrating periodic recovery. The backend then commits another price and status change but deliberately omits both broadcasts. The test verifies the recorded suppressions, initially stale UI, and continued Connected state. Without focus, reload, or manual refresh, the normal 15-second sync repairs Menu in **14,950 ms** and order details in **14,951 ms** from the start of the mutations.
- A further pair of commits also omits notifications. Dispatching browser focus repairs both views in **18 ms**. Browser contexts issue **zero mutation requests** throughout reconciliation. The original order's immutable unit-price snapshot remains 400 cents while Menu reaches 700 cents. Timing JSON is saved in the scenario output and attached to the report.

Fresh verification also reran the existing real failure/race/restart coverage:

- `src/checkout.spec.ts` commits through the actual backend and aborts the HTTP response **after** `route.fetch()` succeeds. Reload plus a deliberately missing key lookup retains the frozen key; explicit same-key retry opens the original order and verifies one order for the quote. Normal reload recovery makes no extra confirmation POST. Double confirmation, late menu changes, storage limitations, and real `QUOTE_USED` resolution pass. Orders E2E similarly commits a status update before dropping its response and resolves it by read rather than resubmission.
- Backend order tests send overlapping HTTP attempts and launch independently connected SQLite writer workers behind a shared barrier. Same-key, different-payload, and different-key/one-quote races create exactly one order. The file-database restart test preserves request-key recovery, immutable lines, status, and stream revisions even after expiry/menu edits. Writer contention, transaction rollback, all 25 status pairs, and overlapping staff updates pass.
- Backend socket tests suppress real committed callbacks, reconcile persisted revisions while connected, handle duplicate/out-of-order events, and reconnect the same client after a server/file-database restart without packet recovery. These complement the new full Angular periodic/focus test.

### Production large-menu measurements

`pnpm exec playwright test --config apps/frontend-e2e/playwright.large.config.ts` passed **2/2** scenarios against a fresh real **5,000-item / 50-category** seed. Performance instrumentation uses Chromium CDP with **4× CPU slowdown**, **150 ms network latency**, **200,000 bytes/s download (1.6 Mbps)**, **93,750 bytes/s upload (750 Kbps)**, and a **375×812 viewport**. This is an emulated lab profile on the host above, not a physical low-end phone benchmark.

- Navigation to a rendered 50-row initial page: **2,714 ms**. Searching for item 5000: **842 ms**, including the intentional 250 ms debounce, network time, and assertion overhead.
- First fixed-item Add feedback: **54.6 ms**, under the 100 ms target. The observer timestamps the trusted click handler, waits for the visible Added feedback mutation, then allows two animation frames. This is one local feedback sample, excluding Playwright actionability overhead; it is not an INP percentile or field-performance guarantee.
- Exactly **50 menu rows** exist on each of five successive pages; the narrowed search renders one. Requests remain bounded by the configured server page size, at most 100. The original scenario also verifies unavailable-item controls, category filtering, and matching skeleton/result row heights. The focused results list scrolls with PageDown; changing pages resets its scroll position to the start. Filters also reset that position; background refresh retains it.
- Session-window **CLS = 0.0789016**, below the 0.1 target, across initial load, Add, pagination, and delayed search. The observer excludes recent-input entries and implements one-second gaps/five-second session bounds. No horizontal document overflow is present. The results panel has the same height before and after narrowing to one item. Desktop and mobile screenshots were inspected; controls and cart remain readable.
- The initial experiment measured **CLS 0.7773**: loading messages moved the list, and a delayed search shrank a full page, pulling the paginator/cart into view. The Menu now reserves a flow-contained loading slot and uses a focusable, labelled, scrollable results panel at `clamp(20rem, 70svh, 40rem)`. Server pagination and bounded row counts remain in place. The final test exercises the original workflow and passes without relaxing its layout or interaction limits.

Hardware, Chromium version, throttle settings, viewport, row counts, timings, and layout-shift sources are saved in ignored `test-results/large-menu/**/production-performance.json` and attached to the run. Fresh reports replace earlier lab samples; the values above are the final run.

### Container smoke and final checks

- Frozen `pnpm install --frozen-lockfile` and host `pnpm verify:native` passed. The Linux image's native probe also passed with Node ABI **137**, better-sqlite3 **13.0.3**, and SQLite **3.53.4**.
- Final **`CI=true NX_DAEMON=false NX_SKIP_NX_CACHE=true NX_DEFAULT_OUTPUT_STYLE=stream pnpm check` passed**: all four lint/typecheck targets, **119 frontend + 320 backend + 75 shared-contract tests (514 total)**, contracts declarations, and **both frontend and backend production builds**. Cache reads were disabled.
- Final **`pnpm e2e` passed 19/19**, with its default single worker and zero retries. The separate production large-menu suite passed **2/2**. Final checks and browser suites ran sequentially with no source edits during the runs.
- Final **`pnpm docker:smoke` passed 1/1** in fresh project `restaurant-smoke-59560688`, using a random loopback port and its own disposable volume. It built both Linux images, started exactly frontend/backend healthy without manual initialization, confirmed non-root execution and 12 seeded items, tested Nginx deep links/assets/API errors/polling/WebSocket upgrades, delivered order notifications, shut down the backend cleanly with active clients, demonstrated recoverable UI during outage, and preserved the exact order/key replay through restart and forced recreation. Its final cleanup removed its containers, network, volume, **and both generated images**.
- `git diff --check` passed. No remote publication or external deployment was created.

An intermediate run exhausted host disk space: Playwright reported `ENOSPC` while saving traces, and Docker's VM storage became read-only before the smoke containers started. With no running containers, Docker Desktop was restarted. Cleanup removed only that failed smoke project's resources and eight exact cache entries created by its build (about 1.1 GB); unrelated stacks/data were retained. The final uncached checks, browser suites, and fresh-volume smoke all passed after recovery. The smoke runner now removes its own uniquely named images as well as containers/network/volume to avoid accumulating disposable images. No environment blocker remains for this task.

The production initial bundle is **568.68 kB raw / 143.64 kB estimated transfer**. Its existing **18.68 kB warning** above 550 kB remains; the 600 kB error limit is unchanged and the production build passes. All four feature routes remain lazy; this task changes Menu's lazy view and adds no production dependency. Measurements cover Chromium on the recorded host/profile and Linux arm64 containers; physical phones, other browser engines, Linux AMD64, and a hosted CI run were not demonstrated.
