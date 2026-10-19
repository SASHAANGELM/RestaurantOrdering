# T20 — Simplify local browsing and checkout

Status: **Complete**

Depends on: [T19](t19-refine-ordering-controls-and-order-history.md)

[Task index](README.md)

## Scope and acceptance criteria

- Load complete categories/items snapshots; local search, category filtering and pagination make no API calls.
- Search suffix clear preserves category; full-grid empty state; category divider and mobile horizontal categories.
- Icon refresh/clear actions with tooltips, image/name cart footer, mobile overlay navigation.
- Plain destructive confirmations, danger zones only alongside edit actions; zero quantity removes/no-ops in item dialog.
- Editable kitchen comments survive cart storage, checkout, immutable orders and reload.
- Improved cart layout, expandable discount and one-click authoritative checkout with existing idempotent recovery.
- Pinned-toolchain pnpm check and meaningful browser/feature regression coverage pass.

## Completion record

Completed 2026-10-19. All requested menu/mobile/dialog/cart/comment/checkout changes are implemented. The uncached root check passes with 551 tests and both production builds. All 27 standard and two large-menu browser scenarios pass.

## Verification

Used repository-pinned **Node 24.22.0** and **pnpm 12.14.0**. No dependencies or lockfiles changed.

### Demonstrated acceptance criteria

- Added `GET /api/menu/catalog`, returning all active categories and all nonarchived items under active categories from one read transaction. Unavailable items remain included. Gzip with `Vary: Accept-Encoding` keeps complete snapshots practical over slow connections; identity responses remain supported. HTTP tests demonstrate more than the old 100-item page limit, empty categories, archival eligibility, coherent revision metadata and equal gzip/identity content.
- MenuStore keeps the complete snapshot and derives item-name search, category filtering, counts and bounded rendered pages locally. Local actions do not change the remote resource query or send requests. All categories remain visible, with availability counts independent of search. Explicit refresh and revision/reconnect/focus repair replace the full snapshot and retain local filters. Stale/cancelled responses remain guarded. Settings and Orders keep their existing server-side management pagination.
- Replaced Clear filters with a tooltip-labelled search suffix cross, shown for any nonempty draft; clearing preserves the category. Added a full-width icon/message/clear-search empty state, an All categories separator and horizontal mobile category buttons immediately below Menu. Removed the redundant page-level View cart link. Refresh is an unbordered icon beside the heading. Kept loading feedback only for real snapshot reads, including initial skeletons to stabilize layout.
- Footer shows up to three circular dish images, quantity, estimate and dish names. Up to three names are listed; longer lists use two names plus `and N items more`. Clear cart is an icon without an outline, with a tooltip. Mobile footer preserves photos and uses two rows to keep controls usable.
- Mobile header shows a navigation button, logo and cart icon. A native modal dialog forms a left sidebar with app branding, a close control and four full-width vertical links; a translucent black backdrop covers the page. Native modal focus handling, Escape, close control, backdrop dismissal and link dismissal are supported. Icon actions have Material or native tooltips plus accessible labels.
- Destructive confirmations use ordinary dialog content/footer actions and a red primary action. A danger section remains in category/item editing alongside Save. Removed the item editor's separate removal section: quantity allows zero, which confirms removal of an existing line or closes without adding a new one. Checkout locks are rechecked before mutations.
- Added optional kitchen comments (up to 500 characters) to cart intent, persisted cart data, quote snapshots and order lines via migration `0003_kitchen_comments`. Comments are entered in the quantity dialog and edited from Cart through a simple textarea dialog. Save updates cart state before closing, preserving immediate reloads. Cart merging considers comments, and submitted order comments are immutable. API/service tests cover separate comments, replay and restart; browser coverage proves cart editing/reload and confirmed order retention without edit actions.
- Cart rows now group the title, unit price and comment beside the image, with quantity/line totals on the right where space permits. Discount input and explanation are inside an expandable section. Confirm order performs the authoritative quote check and idempotent placement from one click, with one loading action and inline blockers/errors. Cart/menu changes during checking stop submission. Lost responses retain the same recovery key/payload, support lookup and explicit same-request retry, and cannot create a second order.

### Checks

- **Passed:** `CI=true NX_DAEMON=false NX_SKIP_NX_CACHE=true NX_DEFAULT_OUTPUT_STYLE=stream pnpm check` — all lint/strict typecheck targets, **132 frontend + 343 backend + 76 shared-contract tests (551 total)**, frontend/backend production builds and shared declarations. Initial frontend bundle: **584.62 kB raw / 146.39 kB estimated transfer**; budgets unchanged.
- **Passed:** `E2E_BACKEND_PORT=3100 E2E_FRONTEND_PORT=4300 pnpm exec playwright test --config apps/frontend-e2e/playwright.config.ts` — **27/27** Chromium scenarios. Includes two new local-browsing/mobile/comment scenarios, one-click authoritative checkout and late-change rejection, same-key lost-response recovery, live updates and management workflows. Dialog cancellation waits for closing before reopening to avoid an animation race in the browser test.

- **Passed:** complete large-menu suite: `E2E_BACKEND_PORT=3100 E2E_FRONTEND_PORT=4300 pnpm exec playwright test --config apps/frontend-e2e/playwright.large.config.ts` — **2/2** scenarios. All **5,000 items and 50 categories** are available; searching the last item, filtering and paging add no catalog calls. Five observed rendered pages contain exactly 50 cards.
- On Chromium 156 / Apple M4 at **375×812**, **4× CPU slowdown**, **150ms latency**, **200,000 B/s down / 93,750 B/s up**: initial ready **6,756ms**, local search **75ms**, quantity-dialog feedback **67.2ms**, CLS **0.0591**. Existing feedback and layout limits are unchanged.
- **Passed:** `pnpm db:check`; `git diff --check`.
- Inspected production desktop cart/comments and mobile sidebar screenshots, plus the collaborative preview. Browser verification uses independent in-memory databases on **3100/4300**; manual preview uses a separate small in-memory seed on **3200/4400**. Database tests use isolated temporary files. No verification reads, seeds, resets or modifies development data.

### Practical limits

- Full snapshots deliberately trade a larger initial transfer for local browsing. Only one local page renders at a time; data refresh still occurs after actual menu changes and connection recovery. Background `/api/sync` checks continue independently of search and pagination.
- Kitchen comments apply per cart/order line. Existing orders without comments retain their original data.
- The initial bundle retains the existing 550 kB warning and stays below the unchanged 600 kB error budget. Container smoke checks were not rerun for this UI/catalog/comment task.
