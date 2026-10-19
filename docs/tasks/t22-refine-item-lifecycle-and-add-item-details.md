# T22 — Refine item lifecycle and add item details

Status: **Complete**

Depends on: [T13](t13-implement-orders-ui-and-manual-statuses.md), [T20](t20-simplify-local-browsing-and-checkout.md), [T21](t21-restore-archived-categories-and-items.md)

[Task index](README.md)

## Scope and acceptance criteria

- Enforce Available ↔ Unavailable ↔ Archived in the backend and UI. Available items must be made unavailable in a separate successful write before archival. Restoring an item always makes it unavailable, including legacy archives with `available: true`; archived items cannot be made available directly. Category archive/restore behavior remains independent.
- Items load a complete coherent management snapshot. Search, category filtering and pagination are local and make no extra API requests. Show expandable Available, Unavailable and Archived sections in that order, first two expanded and Archived collapsed by default, with bounded local pages and accurate counts.
- Align the availability switch and Edit action vertically. Place an icon refresh button immediately after the Categories/Items page title, matching Menu.
- Make item names links on Menu, Cart and Items. Add a deep-linkable item details page showing current image, name, description, category, pricing, state and category ordering restrictions, plus paginated related orders containing that item's ID. Orders preserve their original snapshots. Details/orders refresh through existing revision synchronization and handle missing/invalid IDs, errors, route changes and empty history.
- Keep relevant regression coverage with implementation, use isolated temporary test databases, run pinned `pnpm check` (frontend/backend/contracts tests, lint, strict typechecks, both production builds) and relevant browser scenarios before marking complete.

## Completion record

Completed 2026-10-19. Implemented the requested item lifecycle, grouped local management browsing, aligned actions and title refresh controls, linked item details and related order history. This task supersedes T21's original availability-preserving item restoration behavior. Uncached pinned `pnpm check` passes with 570 tests and both production builds; all 32 standard Chromium scenarios pass.

## Verification

Verified on 2026-10-19 using pinned **Node 24.22.0** and **pnpm 12.14.0**. No dependencies, lockfiles, database schema or migrations changed.

### Demonstrated acceptance criteria

- Backend item writes enforce persisted Available → Unavailable → Archived and the reverse sequence. Both a direct archive and a combined disable/archive request fail while the item is available, without changing entity/menu revisions. An archived item cannot be enabled directly or in the restore request. Restore clears `archivedAt` and sets `available: false`, including legacy archives carrying `available: true`; enabling availability requires a subsequent revision-checked write. Existing no-op, conflict, transaction rollback and notification guarantees remain covered. Category lifecycle remains independent, and its archive state still blocks ordering.
- `GET /api/setup/catalog` returns all categories/items, including archives and children of archived categories, with coherent menu revision/timestamp metadata from one read transaction and gzip support. Browse parameters are rejected on this endpoint. Backend tests demonstrate more than 100 records; frontend tests page/search all 120 available fixture items locally. Legacy bounded list endpoints remain available to existing API consumers, as with Menu; the management UI uses only the complete snapshot.
- Settings derives search/category filtering, archive visibility and bounded group pages in memory. Available, Unavailable and Archived sections appear in that order, with independent local pagination; the first two start expanded and Archived collapsed. Native details/summary controls support keyboard expand/collapse, preserve the user's expansion choices during filtering/refresh, and show counts even when collapsed. Live filtering and the search suffix clear do not fetch; page changes likewise make no API calls. Categories use local archived visibility/pagination. Explicit refresh and revision/reconnect repair replace snapshots while retaining filters.
- Categories and Items have an icon refresh control immediately after the H1, with tooltips/accessible names matching Menu's pattern. Item action containers and the switch wrapper align their contents centrally. Browser bounding-box assertions demonstrate the switch and Edit centers differ by less than two CSS pixels; desktop and mobile screenshots were inspected and show no horizontal document overflow.
- Item names on Menu, Cart and Items link to `/items/:id`. The lazy item page displays image/fallback, current name/description, category, fixed/open pricing, state, updated time and archived-category restrictions. Archived records remain readable. `GET /api/items/:id` returns the current item/category and coherent menu metadata. Invalid/missing IDs show errors; route changes cancel old requests and hide old content. A regression test found and fixed stale detail display after a definitive 404; network refresh failures retain cached details with an error/retry action.
- Related order history uses `GET /api/orders?itemId=...` with existing status/page filters and the indexed `order_lines.item_id`. Orders appear once even with multiple matching lines; counts/pages and ordersRevision share one read transaction. Tests demonstrate stable identity after renaming/archival, preserved original names/prices, correct combined status filtering, pagination and invalid-ID rejection. Item details and related history refresh independently on menu/orders revisions; route/page tags prevent history from another item/page appearing during pending reads. Empty history and out-of-range pages have clear recovery UI. Browser coverage demonstrates all three entry links, 11 related orders across two pages, live new history, renaming/archival/reload, order links, missing/invalid IDs and immutable historical orders.
- Updated existing archive/restore tests to follow the new lifecycle instead of preserving obsolete behavior. README/API/architecture documents reflect the current flow; T21 verification remains historical with a link to this follow-up.

### Checks

- **Passed:** `CI=true NX_DAEMON=false NX_SKIP_NX_CACHE=true NX_DEFAULT_OUTPUT_STYLE=stream pnpm check` — all four lint and strict typecheck targets, **141 frontend + 352 backend + 77 shared-contract tests (570 total)**, frontend/backend production builds and shared declarations.
- **Passed:** `CI=true NX_DAEMON=false E2E_BACKEND_PORT=3100 E2E_FRONTEND_PORT=4300 pnpm exec playwright test --config apps/frontend-e2e/playwright.config.ts item-details.spec.ts setup.spec.ts unarchive.spec.ts catalog-refresh.spec.ts ui-refinements.spec.ts` — **11/11** focused Chromium scenarios.
- **Passed:** `pnpm db:check`; `git diff --check`.
- **Passed:** `CI=true NX_DAEMON=false E2E_BACKEND_PORT=3100 E2E_FRONTEND_PORT=4300 pnpm exec playwright test --config apps/frontend-e2e/playwright.config.ts` — **32/32** standard Chromium scenarios, including all three new item management/details scenarios and existing ordering, checkout recovery, settings, realtime and order workflows.
- Inspected desktop Items, mobile Items and mobile archived item/history screenshots from the repository Playwright workflow, including action alignment, responsive wrapping, local pages and collapsed sections.

All database feature tests use isolated OS temporary files, removed after use. Browser servers use independent in-memory databases on **3100/4300**; no verification reads, seeds, resets or modifies development data.

### Practical limits

- Complete management snapshots trade a larger initial transfer for local browsing; at most one bounded page per section renders. A category archive can block an item whose own state is Available, and the row/detail page explicitly explains that restriction.
- The initial frontend bundle is **585.12 kB**, below the unchanged 600 kB error budget, with the existing warning above 550 kB. Container smoke and large-menu performance suites were not rerun for this task.
