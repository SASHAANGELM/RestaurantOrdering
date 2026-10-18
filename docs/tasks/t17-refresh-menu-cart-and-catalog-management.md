# T17 — Refresh menu, cart, and catalog management

Status: **Complete**

Depends on: T03, T10, T11, T12

[Task index](README.md)

## Scope

Apply primary color #2c6c93. Show menu categories on the left and image cards in a responsive three/four-column desktop grid on the right. Move cart editing and checkout to /cart, with an approximately 80px menu footer showing item quantity, estimated price, and problems only when nonempty. Split Setup into a landing page linking to Categories and Items. Move archive into edit dialogs and put availability before Edit. Source at least ten stock food images and expand the demo to six categories with 4–12 items each. Generate random UUID v4 IDs, including seeds, and safely handle previous predictable demo IDs.

## Acceptance criteria

- Primary controls use the requested color; desktop menu has left category navigation and a three/four-column image grid, with usable narrow-screen layouts.
- A nonempty cart shows quantity, estimate, and availability/validation/sync problems in the menu footer; empty carts hide it. Cart edits, persistence, reconciliation, and checkout work on /cart.
- Setup links to independently addressable category and item pages. Archive is reachable only from edit dialogs, with explicit confirmation. Availability appears before Edit.
- Demo has at least six categories and 4–12 items per category with locally served, sourced stock images. Newly created and seeded IDs are random UUID v4; legacy upgrades preserve references and user edits.
- Appropriate feature and browser regression coverage passes. Full pnpm check passes with pinned Node/pnpm, including frontend/backend/contract tests and both production builds.

## Completion record

Completed 2026-10-18. All requested menu/cart/catalog changes are implemented. Uncached pnpm check passed with 523 unit/contract tests and both production builds; all 21 standard and two large-menu Chromium scenarios passed. See the acceptance evidence and practical limits below.

## Verification

Verified with repository-pinned **Node 24.22.0** and **pnpm 12.14.0**. Dependencies and lockfile are unchanged.

### Implemented acceptance criteria

- Material primary tokens, navigation, brand mark and selected category use **#2c6c93**. Menu has category navigation on the left and an image grid on the right: four columns at 1440px, three at 1200px, two on tablets, and one on narrow phones. Narrow screens use a labelled category selector. Stable card/skeleton dimensions, bounded server pages, debounced searches and retained quantity focus remain.
- Cart editing, discounts and authoritative checkout have their own **/cart** page and main navigation entry. Menu only shows an approximately **80px** fixed summary when nonempty, including summed quantities, estimated total, eligibility/validation/reconciliation/storage warnings and a View cart link. Empty carts hide the summary. Pending checkout recovery is initialized on Menu as well as Cart, so reloading Menu cannot bypass the cart lock or submit a fresh attempt.
- **/setup** is a hub linking to **/setup/categories** and **/setup/items**. Each page has its own list and pagination. Item availability appears before Edit and uses revision-checked writes; failures show an error and retain the server value. Archive appears in existing-record edit dialogs, opens an explicit confirmation step, and retains the previous revision/conflict handling. No list-row archive actions remain.
- A schema migration adds optional item images across persistence, shared contracts, create/update/list/resolve APIs and the item editor. Local menu paths and HTTPS URLs are validated; clearing removes the image. Images are lazy-loaded with fixed dimensions and a local fallback, which recovers when an image URL is corrected live.
- Small seed now has **six categories × six dishes (36)** with descriptions, fixed/open pricing and an unavailable example. **12 Pexels stock images** total approximately **624 KiB** and are served locally; sources and licensing are in [image credits](../../apps/backend/src/assets/images/README.md). Large seed remains 50 categories/5,000 dishes with reproducible names/prices and independent random IDs.
- Entity creation already used random UUIDs; the seed's synthetic predictable IDs caused the reported values. Seeds now use Node crypto.randomUUID and shared ID validation requires v4. The idempotent startup/migration upgrade replaces legacy category/item IDs transactionally, preserving staff edits, archival, foreign keys, quote references, order totals and recovery keys. Existing small demos expand once. Isolated-file tests demonstrate reference integrity, edited/archived records, balanced new seeds and distinct IDs in independent databases.

### Checks

- **Passed:** `CI=true NX_DAEMON=false NX_SKIP_NX_CACHE=true NX_DEFAULT_OUTPUT_STYLE=stream pnpm check`: all four lint and strict typecheck targets; **123 frontend + 324 backend + 76 shared-contract tests (523 total)**; both frontend/backend production builds and contracts declarations.
- **Passed:** `pnpm db:check`; `git diff --check`.
- **Passed:** focused catalog browser scenarios, including desktop column counts, stock image loading/fallback/live repair, exact primary color, footer quantity/price/eligibility/validation/empty visibility, mobile overflow, separate cart, Setup links, availability failure/retry, and edit-dialog archival.
- **Passed:** `E2E_BACKEND_PORT=3100 E2E_FRONTEND_PORT=4300 pnpm e2e --output-style=static`: **21/21 Chromium scenarios**, including the existing checkout, realtime, concurrency, persistence and staff workflows.
- **Passed:** `E2E_BACKEND_PORT=3100 E2E_FRONTEND_PORT=4300 pnpm exec playwright test --config apps/frontend-e2e/playwright.large.config.ts`: **2/2 Chromium scenarios** using the real 5,000-item seed. Keyboard scrolling waits for its native scroll-end event before paging, and cancelled superseded responses are excluded from completed-response measurements. Paging resets the result scroll to zero. The original rendering/performance limits are unchanged.
- On Chromium 156 / Apple M4 at **375×812**, **4× CPU slowdown**, **150ms network latency**, 200,000 B/s down and 93,750 B/s up: initial 50-card ready **2,770ms**, debounced search **842ms**, Add feedback **53.4ms** (limit 100ms), **CLS 0.0691** (limit 0.1). Five observed pages each render exactly 50 cards; no horizontal document overflow. Timing JSON and screenshots are in ignored test-results directories.

All database tests use isolated temporary files; standard/large browser servers hardcode independent in-memory databases. Alternate ports **3100/4300** avoid existing development servers. The manually inspected sample also uses an independent in-memory small seed on **3200/4400**. Inspected desktop/mobile screenshots from the repository Playwright workflow and the collaborative preview. No test reads or changes development data.

### Practical limits

- Old session carts retain original user intent but old demo IDs resolve as removed; those dishes must be re-added after the one-time ID upgrade. Pending checkout keys remain recoverable.
- Frontend production initial bundle is **575.16 kB raw / 144.33 kB estimated transfer**. It passes the unchanged 600 kB error budget and reports a **25.16 kB warning** over the unchanged 550 kB warning threshold. No budget was raised.
- Container smoke verification was not rerun for this UI/catalog task. Existing deployment fixture expectations were updated from 12 to 36 seeded items.

