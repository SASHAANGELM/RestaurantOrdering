# T23 — Unify page controls and acknowledge cart price changes

Status: **Complete**

Depends on: T12, T13, T20, T22

[Task index](README.md)

## Scope and acceptance criteria

- Plain-text breadcrumbs on child pages only; root Menu, Orders and Settings omit them. Item details use Settings > Items > item name; Cart uses Menu > Cart. Refresh icons immediately follow titles consistently on all data pages.
- Item details expose Edit using the existing update dialog and show colored/icon status labels for Available, Unavailable and Archived.
- Cart dialog titles/actions consistently say Add to cart or Edit in cart. Existing lines expose Delete from cart; it shares removal behavior with zero quantity. Comments start collapsed behind Add/Edit comment and can be removed/hidden. Open-price controls use a shared price stepper beside quantity, in that order, both in dialogs and cart rows.
- Orders list shows up to three overlapping snapshot item images using a reusable stack shared with the menu footer. Inline status dropdowns allow only valid revision-checked transitions and preserve cancellation, pending protection and explicit conflict/uncertain-response recovery. Show only the first eight ID characters in order links/details. Order lines place linked titles beside images and prefix comments with Comment:.
- Cart eligibility/input errors remain red; price or pricing-type changes show orange warnings with explicit OK acknowledgment and block checkout until accepted. Name/image changes apply silently. Open→fixed adopts the fixed price on acknowledgment; fixed→open lets the user review/enter an open price before acknowledgment. Quantity/comments and pending checkout recovery remain intact; warnings survive reload. Quote-discovered monetary changes must not bypass acknowledgment.
- Order summary shows nonzero discount between estimated subtotal/total. Relevant feature/browser coverage and repository-pinned `pnpm check` (all lint/typechecks, frontend/backend/contracts tests, both production builds) pass before completion. Database tests use isolated temporary databases.

## Completion record

Completed 2026-10-19. Implemented shared navigation/title controls, item editing/status badges, cart dialog/price/comment controls, order image stacks and inline statuses, short order IDs and explicit cart price acknowledgment. The final uncached pinned check passes with 580 tests and both production builds; all 35 standard Chromium scenarios pass, and the final focused three-scenario rerun passes after aligning menu/dialog labels.

## Verification

Verified on 2026-10-19 using repository-pinned **Node 24.22.0** and **pnpm 12.14.0**. Dependencies, lockfiles, database schema and migrations are unchanged.

### Demonstrated acceptance criteria

- Added reusable plain-text Breadcrumbs and PageHeading components. Child categories/items/cart/item/order pages expose linked ancestors and the current page, without breadcrumb icons. Root Menu/Orders/Settings have none. Item details use Settings > Items > current item name; Cart uses Menu > Cart. Every data page uses a tooltip-labelled refresh icon immediately after its H1, including Cart. Item details opens the existing revision-safe item editor for active records; archived records retain the existing restore-before-edit guard. Item state badges use distinct green/amber/purple colors and check/pause/archive icons.
- Dialog titles and submit buttons use Add to cart / Edit in cart consistently with Menu. Existing lines expose Delete from cart; deletion and zero quantity share the existing removal confirmation. A new line with zero quantity closes without adding. Comments start collapsed, preserve existing comment text in a preview, expand through Add/Edit comment, and can be cleared/hidden using a small remove button. Cancelling the dialog preserves original cart data.
- Added a shared PriceInput with exact-cent dollar steps, bounds, labelled buttons and retained invalid drafts. Price and quantity controls share the same 56px visual style and sit on one row, price first, in both the cart dialog and open-price cart rows. Browser bounding boxes demonstrate horizontal ordering/equal vertical position at 375px without document overflow. Nonzero discount appears between estimated subtotal/total and disappears at zero.
- Orders list and menu footer share ItemImageStack, deduplicating and showing up to three overlapping circles. Order list summaries now include bounded immutable item image/name previews from order lines; one batch line read in the list transaction avoids per-order requests. Tests prove unique first-three snapshots survive later item name/image changes. All order links/detail IDs display eight characters while retaining complete IDs in API/navigation data. Ordered item names link to item details, titles sit beside images, and comments display the explicit Comment: prefix.
- Inline native order-status dropdowns show the current and permitted next statuses only; terminal states are disabled. Writes send the displayed entity revision, prevent duplicate submissions and retain errors after conflicts or uncertain responses. Explicit Refresh status reads authoritative state before retry; a background update cannot silently clear this recovery guard. Cancellation retains confirmation. Unit/browser tests cover conflict recovery, recovered revisions, late responses losing to newer live data, successful progression and terminal controls. Visual review caught a native select value/option update-order issue that could blank live status labels; keeping the current option selected fixes it, with explicit selected-value assertions covering external updates.
- Cart entries distinguish eligibility/input errors (red) from price/pricing-type warnings (orange). Current name/image metadata applies and persists silently while accepted pricing is retained until OK; this retains warnings through reload. Acknowledgment adopts current fixed pricing or validates the proposed open price, preserving quantity/comments. Open→fixed and fixed→open transitions both have explicit messages and tests. Stale/failed resolution and pending checkout locks prevent acknowledgment. Invalid inputs retain red error priority until corrected.
- Both UI and checkout store block monetary warnings. A quote discovering a missed fixed-price change refreshes resolution and requires OK instead of silently placing at the new price. Pricing/eligibility quote rejection also refreshes resolution. Frozen pending checkout intent is not rewritten by metadata synchronization; existing same-key lookup/retry and immutable order recovery scenarios remain covered. No automatic order submission occurs on acknowledgment or synchronization.
- Added nine frontend tests (cart acknowledgment/metadata/frozen intent, quote-discovered price changes, dialog comments/deletion, exact price input and inline order transitions) and one isolated backend preview test. Added three full browser scenarios and adapted existing scenarios to breadcrumbs, short IDs, dialog names/comment expansion and explicit price acknowledgment. Tooltip regression now checks Material's visible overlay surface, matching its actual DOM rather than an absent role/static attribute.

### Checks

- **Passed:** final uncached `CI=true NX_DAEMON=false NX_SKIP_NX_CACHE=true NX_DEFAULT_OUTPUT_STYLE=stream pnpm check` — all four lint and strict typecheck targets, **150 frontend + 353 backend + 77 shared-contract tests (580 total)**, both app production builds and shared declarations.
- **Passed:** `CI=true NX_DAEMON=false E2E_BACKEND_PORT=3100 E2E_FRONTEND_PORT=4300 pnpm exec playwright test --config apps/frontend-e2e/playwright.config.ts page-and-cart-refinements.spec.ts` — **3/3** Chromium scenarios, including the final rerun after menu/dialog label alignment. Focused `local-ordering.spec.ts` also passed **2/2** after updating the tooltip assertion.
- **Passed:** `pnpm db:check`; `git diff --check`.
- **Passed:** `CI=true NX_DAEMON=false E2E_BACKEND_PORT=3100 E2E_FRONTEND_PORT=4300 pnpm exec playwright test --config apps/frontend-e2e/playwright.config.ts` — **35/35** standard Chromium scenarios, including selected status labels through live updates, all three new flows and existing checkout/recovery, management, realtime and order workflows.
- Inspected mobile cart-dialog controls/comments, desktop orange cart warnings, overlapping order image stacks and inline statuses, linked order item titles/comments, and item status screenshots from the repository Playwright workflow. Live cancelled/completed dropdown labels remain visible after the native select fix.

Database tests use isolated temporary SQLite files; browser servers use independent in-memory databases on **3100/4300**. No test reads, seeds, resets or changes development data.

### Practical limits

- Pending checkout recovery stays frozen until resolved. Price acknowledgment is disabled while resolution is stale/loading/failed or checkout is locked.
- Initial frontend bundle is **585.43 kB**, below the unchanged 600 kB error limit, with the existing warning over 550 kB. Container smoke and large-menu performance suites were not rerun for this task.
