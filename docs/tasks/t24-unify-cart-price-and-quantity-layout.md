# T24 — Unify cart price and quantity layout

Status: **Complete**

Depends on: T23

[Task index](README.md)

## Scope and acceptance criteria

- Cart rows and Add/Edit in cart dialogs always show two columns: unit price on the left, quantity on the right, including narrow screens.
- Open prices retain their editable stepper. Fixed prices use a small Unit price label and a large two-decimal value with USD in the same position. Remove duplicate unit price text beneath cart item names.
- Decimal commas entered in either price input immediately become periods, preserving exact-cent validation and invalid drafts for correction.
- Add/Edit in cart dialogs show the item image using the existing image/fallback component.
- Feature coverage and pinned `pnpm check` pass, including frontend/backend/contracts tests, lint/typechecks and both production builds. Browser checks use isolated test databases.

## Completion record

Completed 2026-10-19. Implemented a shared UnitPriceField for fixed and open prices in both cart rows and cart dialogs, with a consistent two-column layout and item images in dialogs. The pinned root check passes with 581 tests and both production builds; the full standard Chromium suite passes 36/36.

## Verification

Verified on 2026-10-19 with repository-pinned **Node 24.22.0** and **pnpm 12.14.0**.

### Demonstrated acceptance criteria

- Both views always place unit price before quantity in equal-width columns. Fixed prices show a small Unit price caption and large two-decimal USD value; open prices retain their existing stepper. Removed unit-price text beneath cart item titles. Shared captions and 56px control/value rows align vertically.
- Shared PriceInput normalizes commas immediately in both its DOM value and emitted draft, including when the normalized value matches the existing model. Invalid fractional precision remains available for correction rather than being rounded. Unit coverage verifies `1,00` and `1.00` both emit/display `1.00`, while `1,234` remains an invalid `1.234` draft.
- Dialogs reuse ItemImage with its existing fallback and descriptive alternative text. Existing fixed-price dialog coverage asserts the read-only price and item image while retaining quantity editing and removal behavior.
- Browser coverage enters comma prices in both views, verifies exact totals and persistence after reload, and checks fixed/open column positions and absence of horizontal document overflow at **1440px and 375px**. The fixed-price screenshot waits for the dialog's opening animation to finish.
- Browser verification exposed an older restore scenario's assumption that its category was on the first page after fixture growth. Both category restore scenarios now wait for the archived toggle's complete dataset, follow the category paginator and wait for each page change to locate their record; production category behavior is unchanged.

### Checks

- **Passed:** uncached `CI=true NX_DAEMON=false NX_SKIP_NX_CACHE=true NX_DEFAULT_OUTPUT_STYLE=stream pnpm check` after the caption alignment correction — all lint/typecheck targets, **151 frontend + 353 backend + 77 shared-contract tests (581 total)**, both production app builds and shared declarations. The final normal root check also passes after browser-test stabilization, reusing valid Nx results where applicable.
- **Passed:** full standard Chromium suite, using `CI=true NX_DAEMON=false E2E_BACKEND_PORT=3100 E2E_FRONTEND_PORT=4300 pnpm exec playwright test --config apps/frontend-e2e/playwright.config.ts` — **36/36**, including both category restore flows with the expanded suite dataset.
- Initial browser run caught the fixed-price dialog caption offset; normalizing the quantity caption fixed it. The next run passed the new layout/decimal scenarios and exposed the restore pagination assumption described above.
- Inspected desktop/mobile cart screenshots and fixed/open price dialog screenshots, confirming aligned columns, large fixed values, item images and no duplicate price text.
- **Passed:** `git diff --check` including final task documentation.

Unit database tests use isolated temporary SQLite databases; browser servers use independent in-memory databases on **3100/4300**. Development data, schema, migrations, dependencies and lockfiles are unchanged.

### Practical limits

Initial frontend bundle is **585.82 kB**, below the unchanged 600 kB error limit, with the existing warning over 550 kB. Container smoke and large-menu performance suites are outside this layout/input task.
