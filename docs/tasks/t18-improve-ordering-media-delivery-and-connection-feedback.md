# T18 — Improve ordering, media delivery, and connection feedback

Status: **Complete**

Depends on: [T17](t17-refresh-menu-cart-and-catalog-management.md)

[Task index](README.md)

## Scope

Move food assets to a confined backend image endpoint. Use page scrolling for Menu, full-width item actions and a shared fixed/open-price quantity editor that restores cart quantities and removes entries. Add confirmed Clear cart actions on Menu footer and Cart. Show search-aware available counts by category, fade/sort unavailable dishes last, move main navigation into the header, add Tabler icons, place a 16px connection indicator bottom left, and replace generic connection text with menu-update timestamps and honest waiting/offline feedback. Split Cart into item and summary columns, hide empty totals/discount, add order status colors and Setup breadcrumbs.

## Acceptance criteria

- Backend serves only regular image files within its configured directory; traversal, encoded separators, symlinks and nonimage requests cannot leak files. Assets ship in backend production builds/containers and old image paths remain usable through normalization.
- Menu has one page scrollbar with bounded server pagination, available-before-unavailable ordering, semitransparent unavailable cards, full-width icon actions, and available category counts reflecting submitted/debounced search across the full catalog.
- Every dish opens a quantity dialog; fixed dishes cannot edit price, open dishes can. Existing cart lines restore quantity/price and can be updated/removed without silently duplicating them; distinct open-price lines remain supported.
- Confirmed clearing works from footer and Cart, resets discount, hides an empty footer and empty summary fields, and cannot alter a pending checkout. Cart has two desktop columns and a usable mobile layout.
- Header contains top-level navigation with labelled decorative Tabler icons. Compact connection control sits bottom left. Actual offline signals and failed sync requests change feedback promptly; timestamps describe accepted menu data, and waiting/offline states are explicit. Orders have distinct status colors and text. Categories/Items have parent Setup breadcrumbs.
- Feature/security tests, browser scenarios, pinned-toolchain pnpm check, frontend/backend unit suites and both production builds pass.

## Completion record

Completed 2026-10-18. Implemented all requested ordering, image delivery, navigation and connection-feedback changes. The uncached root check passed with 544 unit/contract tests and both production builds; all 24 standard and two large-menu Chromium scenarios passed.

## Verification

Verified with repository-pinned **Node 24.22.0** and **pnpm 12.14.0**. Dependencies and lockfile are unchanged.

### Demonstrated acceptance criteria

- Moved all 12 stock photographs and credits into `apps/backend/src/assets/images`. Backend builds copy them to `dist/apps/backend/assets/images`, which is included by the existing container copy. `GET`/`HEAD /api/images/:filename` accepts only flat allowlisted JPG/PNG/WebP names, resolves the configured image root, opens without following symlinks, verifies a regular file, and reads that same descriptor. Invalid paths return a generic error without filesystem details. Legacy `/images/` values are normalized in API responses and saved cart rendering. `IMAGE_DIRECTORY` can select a different backend folder.
- Security tests use temporary directories and a temporary SQLite database. Exact-byte and HEAD responses pass; traversal, encoded/double-encoded separators, backslashes, dotfiles, unsupported extensions, directories, missing files, null bytes and symlinks cannot expose outside files. Production asset output contains all 12 photos and their credits.
- Menu now scrolls with the document. Server pagination still limits rendered cards to 50. Available dishes precede faded unavailable dishes. Category counters count available items across the entire catalog and reflect debounced searches, including results beyond the current page. Full-width card actions open the shared quantity dialog for every dish.
- Fixed-price dialogs expose quantity only; open-price dialogs expose price and quantity. Reopening restores the existing line, supports update/removal, and explicitly selects separate open-price entries or a new price. Unit/browser coverage demonstrates restored quantity, removal, distinct prices, safe merging and retained input through live refresh.
- Menu footer and Cart share Clear cart confirmation. Cancel preserves the cart; confirmation removes lines and discount, hides the footer, and leaves empty Cart without discount, zero totals or an order button. Pending checkout locks are rechecked before mutations. Desktop Cart renders items left and summary/discount/checkout right; mobile stacks without horizontal overflow.
- Main navigation is in the header; Tabler 3.44.0 icons use one pinned CDN stylesheet and decorative icons have accessible labels alongside them. Categories/Items have Setup breadcrumbs. Order rows and badges distinguish each status with both text and color.
- The connection button measures **16×16px** at the bottom left. Browser offline signals immediately disconnect it; late socket events and failed sync cannot falsely restore Connected. Online recovery, reconnect checks and accepted server metadata drive the status. Menu timestamps come from actual catalog modification times. Outstanding menu requests keep the waiting message visible until every request settles, including when category metadata arrives before delayed items. Tests cover offline/online recovery, stale metadata and that delayed-response case.

### Checks

- **Passed:** `CI=true NX_DAEMON=false NX_SKIP_NX_CACHE=true NX_DEFAULT_OUTPUT_STYLE=stream pnpm check`: all four lint/typecheck targets, **130 frontend + 338 backend + 76 shared-contract tests (544 total)**, frontend/backend production builds and shared declarations.
- **Passed:** `E2E_BACKEND_PORT=3100 E2E_FRONTEND_PORT=4300 pnpm e2e --output-style=static`: **24/24 Chromium scenarios**. This includes checkout/recovery, live multi-browser updates, setup conflicts, cart persistence, navigation, quantity dialogs, confirmed clearing, counts, page scrolling, mobile layout, breadcrumbs, actual timestamps and offline recovery.
- **Passed:** six focused ordering/shell browser scenarios, followed by the complete suite above.
- **Passed:** `E2E_BACKEND_PORT=3100 E2E_FRONTEND_PORT=4300 pnpm exec playwright test --config apps/frontend-e2e/playwright.large.config.ts`: **2/2 scenarios**, using the real 5,000-item seed and unchanged rendering/performance limits. Both ordinary page scrolling and shorter filtered results avoid an inner scrollbar.
- On Chromium 156 / Apple M4 at **375×812**, **4× CPU slowdown**, **150ms network latency**, 200,000 B/s down and 93,750 B/s up: initial 50-card ready **5,852ms**, debounced search **852ms**, quantity-dialog feedback **56ms** (limit 100ms), **CLS 0.0788** (limit 0.1). Five observed pages each render exactly 50 cards. Timing JSON and screenshots remain in ignored test-results directories.
- **Passed:** `git diff --check`. Inspected desktop/mobile repository browser screenshots and the collaborative preview, including header icons, category counts, item actions and the quantity dialog.

All database/security fixtures use isolated temporary files/directories or independent in-memory databases. Browser verification uses alternate ports **3100/4300**; manual preview used an independent small seed on **3200/4400**. No verification reads, seeds, resets or modifies development data.

### Practical limits

- Frontend initial bundle is **579.32 kB raw / 145.32 kB estimated transfer**. Both production builds pass; frontend reports **29.32 kB** over the existing 550 kB warning threshold and stays under the unchanged 600 kB error budget. No budget was increased.
- Tabler icons require the CDN on a cold load. Offline feedback preserves already loaded content and cart intent; this task does not add a service worker or offline checkout.
- Container smoke verification was not rerun. Backend production output and the existing Docker copy configuration were checked for image inclusion.
