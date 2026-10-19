# T26 — Share order rows and refine cart comments and quantities

Status: **Complete**

Depends on: T25, T23, T22

[Task index](README.md)

## Scope and acceptance criteria

- Orders and item-detail related orders use the same reusable row, including snapshot image stack, short linked ID, placement time, status control and total. Retain pagination, live refresh and revision-safe status updates.
- Cart Add/Edit comment buttons have visible padding.
- The Menu cart-item dialog's Remove comment button has a Material tooltip, retaining its accessible label.
- Menu footer dish names prefix quantities greater than one, for example 2x Burger, 4x Ice cream. Aggregate quantities across distinct lines for the same item; keep single quantities unprefixed and handle invalid drafts without crashing.
- Relevant feature/browser coverage and pinned pnpm check pass, including frontend/backend/contracts tests, lint, strict typechecking and both production builds. Database verification remains isolated from development data.

## Completion record

Follow-up [T27](t27-make-item-order-history-read-only.md) makes item history status read-only while keeping status editing on Orders. The results below describe the original T26 implementation.

Completed 2026-10-19. Both order lists now share OrderRow with snapshot images and status editing. Added comment-button padding, a remove-comment tooltip and aggregated quantity prefixes in the Menu footer. The pinned check passes with 586 unit/contract tests and both production builds; all 40 standard Chromium scenarios pass.

## Verification

Verified on 2026-10-19 with repository-pinned **Node 24.22.0** and **pnpm 12.14.0**.

### Demonstrated acceptance criteria

- Extracted OrderRow as a component on the existing list-item element, preserving list semantics, row status colors and layout. Orders and item history both render snapshot image stacks, short linked IDs, placement dates, currency totals and the existing revision-safe OrderStatusControl. Each parent refreshes its own order query after an update. Pagination, cancellation confirmations, conflict recovery and live synchronization retain their existing implementations.
- Cart comment actions use .5rem vertical and .75rem horizontal padding. Remove comment in the Menu cart-item dialog uses a Material tooltip while retaining its accessible label.
- Footer dish labels sum valid quantities by item ID across separate cart lines, prefix totals greater than one with Nx, and retain unprefixed single-item names. Existing long-list truncation and quantity/error handling remain. Added unit coverage for multiple dishes, repeated item IDs, single quantities, invalid drafts and the visible/title labels.
- Added browser scenarios for quantity labels at 1440px/375px, the displayed Remove comment tooltip, padding on both Add/Edit comment, and identical historical images/metadata in item history and Orders after a current photo changes. The shared row's status update is checked for expectedRevision and subsequent display on Orders, alongside item-page responsiveness and order navigation.

### Checks

- **Passed:** uncached `CI=true NX_DAEMON=false NX_SKIP_NX_CACHE=true NX_DEFAULT_OUTPUT_STYLE=stream pnpm check` — all lint/typecheck targets, **156 frontend + 353 backend + 77 shared-contract tests (586 total)** and both production builds. Final normal `pnpm check` also passes after updating the existing icon assertion.
- The initial full Chromium run passed **39/40**; its one failure expected the old available-item icon instead of the existing working-tree eye icon. Updated that regression assertion without changing the icon. **Passed:** final `CI=true NX_DAEMON=false E2E_BACKEND_PORT=3100 E2E_FRONTEND_PORT=4300 pnpm exec playwright test --config apps/frontend-e2e/playwright.config.ts` — **40/40**, using isolated in-memory backend/frontend ports **3100/4300**.
- **Passed:** `git diff --check`. Inspected desktop/mobile related-order screenshots and mobile Add/Edit comment actions; image stacks, status colors, controls and padded buttons render without horizontal overflow.

No dependencies, lockfiles, database schema or migrations changed. Database tests use isolated temporary databases; browser verification uses an independent in-memory database and does not read or modify development data. Earlier worktree changes are preserved.

### Practical limits

The frontend initial bundle is **590.57 kB**, below the unchanged 600 kB error limit, with the existing warning above 550 kB. Container smoke and large-menu performance checks are outside this UI refinement.
