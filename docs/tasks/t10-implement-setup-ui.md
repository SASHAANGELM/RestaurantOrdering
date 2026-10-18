# T10 — Implement Setup UI

Status: **Complete**

Depends on: [T05](t05-implement-menu-configuration-and-query-apis.md), [T08](t08-implement-socket-io-and-revision-synchronization.md), [T09](t09-implement-angular-shell-and-client-adapters.md)

[Task index](README.md)

## Scope

Build category/item forms and paginated lists for name/category, fixed/open pricing, availability, and archive. Retain invalid form input and show server/optimistic-revision conflicts. Confirm archival with its effect on active menu items.

## Acceptance criteria

An edit in Setup is visible in another browser's Menu without reloading; archival removes ordering eligibility. Editing open pricing never sends a fixed price. Concurrent edits produce an actionable conflict rather than silently overwriting another edit. Form submission errors retain input.

## Completion record

Completed 2026-10-18. See [verification results](#verification). Added category/item forms, bounded item pagination/search/category filters, category pagination, explicit archive confirmations, retained error drafts, and revision-conflict reload/review. Added 18 frontend tests and three Chromium scenarios proving two-browser live editing, open-price payloads, archive eligibility, concurrent conflicts, manual retry, pagination, and mobile/focus behavior. Uncached `pnpm check` passed with 43 frontend, 320 backend, and 75 contract tests and both production builds; all eight Chromium tests passed. The frontend build succeeds with a 9.86 kB initial-bundle warning above the existing 550 kB warning threshold; the 600 kB error budget is unchanged.

## Verification

Verified on 2026-10-18 with the repository-pinned **Node 24.22.0** and **pnpm 12.14.0**, selected through an isolated npm-exec toolchain. Dependencies and the lockfile are unchanged.

### Implemented behavior

- Setup creates and edits categories (name and sort order) and items (name, category, description, fixed/open pricing, and availability) through labelled Material dialogs. Fixed prices use the shared exact decimal parser with a 0.00–10,000.00 range. Open-price create/update requests omit `priceMinor`, including when switching from fixed pricing with a retained price draft.
- Items have server pagination at 10/25/50/100 rows, submitted name search, and category filtering. Filter/page-size changes reset to page one; an empty later page offers a return-to-first-page action. Categories use a separate 10/25/50-row client paginator over the existing category-list API; this does not introduce server category pagination. Archived records can be included explicitly. Archived categories and items remain visible for inspection; items in archived categories are marked as unorderable.
- Archive dialogs identify the record and explain removal from Menu and ordering eligibility, including existing carts. Category archival explicitly affects all active children. Existing order snapshots remain intact, and the dialog explains that this prototype cannot undo archival. Cancel/Escape performs no mutation. Archived records have no edit/archive actions.
- Each editor retains the entity revision captured when opened. Background realtime refreshes update the lists without replacing an open draft or its revision. Conflicts retain input, show the old/current revisions and request reference, and disable further submission until the user explicitly reloads latest values. The recovery action warns that it replaces the draft; the user can review the authoritative values and edit before submitting with the new revision. If the record was archived meanwhile, saving remains disabled.
- Local validation, server validation, network failures, and failed conflict-recovery reads retain input. Server field errors and request references are visible. Refreshing categories after a create-time category-archive rejection retains the new item draft. Mutations are not automatically retried. Pending submissions disable the form, duplicate submission, and dialog dismissal; subscriptions end with the dialog lifecycle.
- Successful writes advance the existing shared menu-revision watermark and refresh Setup. Other browsers' Menu views refetch through the existing singleton realtime service. The HTTP adapter now omits undefined optional query parameters: E2E caught a cleared category filter being serialized as the string `undefined`, which caused rejected refreshes and stale rows. A dedicated adapter regression test covers this correction.

### Demonstrated acceptance

Added **17 editor component tests** beside the implementation and **one HTTP-adapter regression test**, bringing the frontend suite to **43 tests**. Coverage includes exact fixed cents, nonnegative decimal boundaries, malformed/overflow prices, open-price create/update payloads, duplicate-submit protection, opening revisions, retained validation/network-error drafts, explicit retries, category and item conflicts, failed recovery cancellation, concurrently archived records, archive payload/effects, category validation, create-time category archival, and destruction cancellation.

Added three Chromium scenarios in `apps/frontend-e2e/src/setup.spec.ts`:

1. Create category/item through Setup; reject an invalid decimal without losing input; show creation and fixed price/availability edits in another browser's Menu without reload; switch fixed → open and inspect the actual request for absence of `priceMinor`. Cancel archival with Escape and verify focus restoration, then archive the item and verify Menu removal and `ITEM_ARCHIVED` quote rejection. Rename/archive its category, verify a separate active child disappears from Menu, and demonstrate `CATEGORY_ARCHIVED` quote rejection.
2. Open the same item in two independent browser contexts. Save one editor while retaining the other's draft; demonstrate its revision conflict, explicit reload/review/resubmission with revision 2, and retained input after a failed HTTP submission followed by successful manual retry. The other Setup view updates live.
3. Create 12 matching items and enough categories to page both lists. Demonstrate bounded 10-row server item requests with category/search filters, a two-row second page, search resetting to page one, and independent category pagination. Exercise the labelled page-size control by keyboard (Material overlays the select with a larger clickable touch target). At **375×812**, assert no horizontal document overflow and verify item-dialog initial focus, Escape dismissal, and restored trigger focus. Inspected desktop **1280×720** full-page and mobile dialog screenshots from the repository Playwright workflow; controls and content remain readable.

### Production bundle

The frontend initial bundle is **559.86 kB raw / 141.19 kB estimated transfer**, compared with the T09 baseline of 520.72/132.31 kB. Setup remains lazy-loaded. The build succeeds under the unchanged 600 kB error budget but reports a **9.86 kB warning** above the existing 550 kB warning threshold. No budget was increased; broader bundle/performance work remains T11/T15.

### Checks

- Final uncached `NX_SKIP_NX_CACHE=true pnpm check` **passed**: all lint targets, strict TypeScript/Angular templates, **43 frontend + 320 backend + 75 contract tests (438 total)**, and **both frontend and backend production builds**, plus contracts declarations.
- `pnpm e2e --output-style=static` **passed: 8/8 Chromium tests**, including all five existing shell/realtime scenarios. Builds and E2E were run sequentially to avoid sharing backend build output concurrently.
- `git diff --check` **passed**.

No development database was read, seeded, reset, or modified. Browser fixtures use the existing E2E-owned in-memory database with startup seeding disabled; backend unit tests retain their isolated databases. No external services, commits, or deployments were created. Cart/menu browsing controls, checkout, and staff status controls remain T11–T13.
