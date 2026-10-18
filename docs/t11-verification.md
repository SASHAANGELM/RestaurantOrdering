# T11 — Menu, cart, and large-menu verification

Verified on 2026-10-18 using repository-pinned **Node 24.22.0** and **pnpm 12.14.0** from the existing isolated npm-exec toolchain. Dependencies, lockfile, backend behavior, and bundle budgets are unchanged.

## Implemented behavior

- Menu uses server pagination at 10/25/50/100 items (default 50), a 250 ms debounced name search, and immediate category filtering. Filters reset to page one. Superseded queries retain the existing cancellation/revision guards. An empty later page offers a return to page one. No full item catalogue is downloaded or rendered.
- Menu rows track item IDs, preserve quantity drafts/focus during realtime refresh, and disable adding unavailable items. Initial loading uses 50 skeleton rows with the same 160 px minimum height as loaded desktop rows; descriptions occupy at most two lines. Existing content stays visible during refresh/failure. The cart has direct navigation links so narrow screens do not require scrolling through a whole menu page to reach it.
- Fixed-price additions accept whole quantities from 1 to 99. A labelled Material dialog collects open unit prices with exact decimal parsing, allowing 0.00–10,000.00. Invalid input stays visible for correction. Cancel/Escape and successful addition restore trigger focus. Equal item/mode/price additions merge quantities within the limit; different open prices remain distinct lines with stable cart line IDs. The cart is bounded to 100 lines.
- Cart quantity and open-price editing retains incomplete/invalid drafts and displays line errors. A fixed USD discount uses the shared exact-cent parser. Invalid, negative, excessive, exponential, or overprecision amounts never produce a misleading total. A discount equal to subtotal yields zero. Estimates update immediately with valid local edits.
- Estimates deliberately retain the fixed unit price observed when adding the line. Reconciliation shows explicit old/current prices, renamed items, pricing-mode changes, unavailable/missing items, and item/category archival. It preserves original item snapshots, quantities, open-price drafts, and discount. Authoritative quote review remains T12; an estimate never creates a quote or order.
- A root-lifetime SignalStore keeps the cart across lazy route changes. A strict, versioned `sessionStorage` envelope validates snapshots, UUIDs, unique line IDs, bounded drafts, and line count. Invalid drafts are valid persisted UI state and are validated again before calculation. Corrupt/unsupported data starts an empty cart with a recovery notice. Access, read, and quota/write failures leave in-memory editing usable and explain reload limitations. Tabs have independent carts.
- Cart reconciliation uses `/api/menu/resolve` for deduplicated IDs, independent of visible menu search/page. Menu revisions refresh all cart items, including off-page lines. Resolver failures retain the last snapshot and cart, show retry, and recover after manual refresh or a successful sync check. Quantity/discount edits do not cause unnecessary resolver requests. No empty resolver request is sent. Reconnect/sync never submits checkout.

## Demonstrated acceptance

Added **33 frontend tests** beside the feature: 28 cart/store tests, two open-price dialog component tests, and three deterministic filter-timing tests. They cover money/quantity boundaries, same/different open-price merging, exact discounts and zero totals, retained invalid drafts, persisted/restored state, corrupt/unsupported and unavailable storage, off-page price/availability/archive/mode changes, failed reconciliation/retry, cancellation/revision guards, cart/quantity limits, debouncing, page resets, and route teardown. Existing frontend revision/socket/editor tests remain passing.

Added three browser scenarios to the normal Chromium suite:

1. Add fixed/open-price items with different open prices, correct invalid dialog input, inspect totals/discounts, retain an invalid quantity through navigation and reload, and demonstrate an independent cart in another tab of the **same browser context**. A realtime edit outside the search results shows old/current price and unavailability without clearing intent; category archival marks all retained lines. A failed resolver refresh retains the cart, and an excessive discount retains its input. Desktop and **375×812** screenshots were inspected; mobile has no horizontal document overflow.
2. Browse bounded 10-row pages, filter category/search, reset page one after search, and suppress intermediate search values. Realtime refresh preserves a focused row quantity draft. Concurrent unrelated menu revisions may refresh the final query; assertions allow those valid refreshes.
3. Corrupt and inaccessible session storage display recovery notices while new cart additions and editing continue in memory.

The separate `playwright.large.config.ts` starts a new in-memory backend with the real **5,000-item seed**. Its Chromium test holds the initial item response to verify 50 skeletons and matching loaded-row height, renders exactly 50 rows, pages forward, searches item 5000, and filters a 100-item category into bounded 50-row pages. All captured item responses contain at most their requested page size (never above 100). An unavailable seeded item has a disabled Add button. The fixture never touches development data.

The existing realtime E2E test now identifies its own committed category event and asserts monotonic revisions. Its previous exact global counts/revisions raced with other feature tests sharing the isolated server. Both independent clients must still receive the same committed event through polling/upgrade.

## Verification and limits

- Uncached `NX_SKIP_NX_CACHE=true pnpm check` **passed**, including all lint/strict TypeScript/template checks, **76 frontend + 320 backend + 75 contract tests (471 total)**, contracts declarations, and **both frontend and backend production builds**. `NX_DEFAULT_OUTPUT_STYLE=stream` exposes individual target results.
- `pnpm e2e --output-style=stream` **passed: 11/11 Chromium tests**.
- `pnpm exec playwright test --config apps/frontend-e2e/playwright.large.config.ts` **passed: 1/1** with a separate seeded in-memory database. Run this after the standard suite; both own ports 3000/4200 and refuse an existing server.
- Production initial bundle: **560.30 kB raw / 141.33 kB estimated transfer**. The existing 550 kB warning threshold is exceeded by **10.30 kB**; the build remains below the unchanged 600 kB error limit. T10 was 559.86/141.19 kB. The Menu route is lazy-loaded.
- `git diff --check` **passed**. Production builds and browser suites ran sequentially to avoid sharing backend build output.

No development database was read, seeded, reset, or modified. There are no new services, external writes, commits, or deployments. CPU/network-throttled production timings and CLS measurements remain T15; bounded rows and matching skeleton dimensions are demonstrated here, not a claim that those broader performance targets have been measured. Quote review/confirmation/recovery and manual staff status controls remain T12/T13.
