# T13 — Implement Orders UI and manual statuses

Status: **Complete**

Depends on: [T07](t07-implement-idempotent-orders-and-status-transitions.md), [T08](t08-implement-socket-io-and-revision-synchronization.md), [T09](t09-implement-angular-shell-and-client-adapters.md)

[Task index](README.md)

## Scope

Add paginated all-order list, optional status filter, line/total detail, staff progression controls, and cancellation from placed/preparing. Refresh list membership/counts as well as visible statuses on realtime changes.

## Acceptance criteria

Orders created elsewhere appear live; another browser sees manual status changes. Invalid/terminal transitions have no controls and are rejected server-side too. Filtered lists remove/add orders correctly after status events. Reconnect catches up without duplicate rows; stale staff actions preserve context and offer refresh.

## Completion record

Completed 2026-10-18. Implemented status-filtered pagination, immutable line/totals detail, permitted staff progression/cancellation, and revision-safe recovery. Added 14 frontend feature tests and three browser acceptance scenarios. Uncached `pnpm check` passed, including both app unit-test targets and both production builds; the complete Chromium suite passed 18/18. See [verification](#verification).

### Implemented behavior

The Orders list now has an optional status filter, server pagination with 10/25/50/100-row sizes, placed timestamps, totals, and recovery from an empty page after live removals. Filter changes return to page one. Shared revision synchronization refetches full list snapshots so counts and membership change together.

Order details show immutable category/item names, fixed/open pricing, quantities, unit prices, line totals, subtotal, discount, currency, and final total. Staff controls use the shared transition graph: placed → preparing → ready → completed, with cancellation only from placed/preparing. Terminal orders have no transition controls.

Status writes send the displayed entity revision and block duplicate clicks. A late mutation response cannot overwrite a newer HTTP detail snapshot. Successful writes advance the shared revision watermark and request authoritative detail. Failed writes retain order context, attempted status, and request reference; staff must explicitly refresh successfully before another action. An independently completing realtime read cannot release that recovery guard. Route-ID changes hide the previous order and cancel pending writes; store destruction cancels owned requests.

## Verification

Verified on 2026-10-18 with repository-pinned **Node 24.22.0** and **pnpm 12.14.0** from the existing isolated npm-exec toolchain. Dependencies, backend APIs/contracts, database schema, and bundle budgets are unchanged.

Added **14 frontend feature tests** in `apps/frontend/src/app/features/orders/orders.spec.ts`, using real SignalStores, the real HTTP adapter with Angular's testing backend, and the singleton realtime service with a socket fake:

- Render the permitted controls for all five statuses and full immutable line/totals details. Invalid client actions send no request; duplicate clicks send one exact expected-revision write.
- Require a fresh read after successful writes, preserve stale/failed action context through a failed refresh, and recover an uncertain committed write without automatic retries.
- Keep recovery explicit when a realtime read completes after a revision-conflict response. This regression was found and fixed during browser verification.
- Preserve a newer terminal snapshot when an older mutation response arrives late.
- Add/remove filtered membership and counts after order events; ignore duplicate events; repair an omitted event on reconnect with one row per order.
- Retain filters across server pagination, reset pagination on filter changes, hide previous order details on ID changes, and cancel pending writes on selection changes/destruction.

The existing backend order suite also passes, including all **25 status pairs**, stale revisions, terminal transitions, and concurrent staff actions. Frontend controls and server enforcement use the same shared transition graph.

`NX_SKIP_NX_CACHE=true NX_DEFAULT_OUTPUT_STYLE=stream pnpm check` **passed** after the recovery fix: lint and strict TypeScript/Angular template checks for all projects, **119 frontend + 320 backend + 75 shared-contract tests (514 total)**, shared declarations, and **both frontend/backend production builds**.

The production initial bundle is **568.68 kB raw / 143.59 kB estimated transfer**. It passes the unchanged 600 kB error limit and retains the existing 550 kB warning, now exceeded by 18.68 kB. Orders/detail routes remain lazy.

Added three Chromium acceptance scenarios in `apps/frontend-e2e/src/orders.spec.ts`:

1. Two independent browser contexts receive an externally created order live. Preparing/ready filters add and remove its membership as staff progress it. Both browsers show the same status, terminal actions disappear, an offline failed refresh retains line details, and reconnect/focus reconciliation catches up to completion without duplicate rows.
2. A real concurrent staff write makes a cancellation request stale. The UI preserves attempted status and details, blocks further writes, and offers an explicit refresh. A second real cancellation commits but loses its HTTP response; refresh reveals the cancelled result without automatic resubmission. Cancellation also succeeds directly from placed.
3. Eleven orders exercise bounded 10-row server pages with the status filter retained. Moving this scenario's orders out of the filter empties page two and exposes return-to-first-page recovery. Status filtering and page-size selection work with the keyboard. **375×812** screenshots of Orders and detail were inspected; both have readable content and no horizontal document overflow.

`pnpm e2e --output-style=stream --workers=1` **passed: 18/18 Chromium tests** after the final implementation/test changes. This includes existing Menu/cart/checkout, Setup, shell, deep-link, and realtime proxy coverage. Production checks and browser suites ran sequentially.

`git diff --check` **passed**. All browser fixtures use the suite-owned in-memory backend with seeding disabled; backend unit tests use isolated temporary databases. No development database was read, seeded, reset, or modified.

The bundle warning above remains a measured limitation for T15's broader performance verification. No deployment or external service was created.
