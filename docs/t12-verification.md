# T12 — Review, confirmation, and recovery verification

Verified on 2026-10-18 using repository-pinned **Node 24.22.0** and **pnpm 12.14.0** from the existing isolated npm-exec toolchain. Dependencies, backend contracts, database schema, and bundle budgets are unchanged.

## Implemented behavior

- The cart offers **Review order**, followed by a separate **Confirm order** action. Review sends exact integer-cent intent, quantities, open prices, observed item revisions/names/prices, and discount. The labelled review shows every authoritative snapshot line, quantity, unit price, line total, discount, final total, expiry, and explicit old/current changes. Its heading receives keyboard focus when review appears.
- Local edits invalidate the review immediately, including an edit reverted before Angular effects run. Menu revision changes and expiry also invalidate it. Responses arriving after a local/menu change cannot publish a usable quote. A one-second expiry clock is supplemented by an exact confirmation-time check. Failed quotes retain editable cart input and display line-specific cart issues. No new review ever submits an order automatically.
- Confirmation creates one UUID key and exact `{ quoteId }` payload, stores a strict versioned recovery envelope **before POST**, and freezes the attempt. The envelope also retains the reviewed quote and original cart snapshot. Synchronous guards prevent double confirmation/review/retry while a request is active. Cart controls and Add buttons are disabled during pending checkout; store methods enforce the same lock. The root-lifetime checkout coordinator survives route changes.
- A transport error, timeout, invalid success response, 5xx, or key conflict keeps the original attempt pending. The UI displays its recovery key and offers **Check order outcome** and **Retry same checkout**. A 404 key lookup never releases the attempt or creates another key/quote. Retry sends the original key and payload, even after menu changes or quote expiry. Sync/reconnect code does not submit checkout mutations.
- Reloading Menu restores a validated pending attempt and makes only a read by key. A successful lookup opens the original order. A missing result leaves explicit same-key retry available. `QUOTE_USED` saves the existing order ID, reads that order, and opens it; failed reads retain recovery state and can be retried without another confirmation POST. Recovered responses must match the original quote.
- A definitive invalid/stale/expired confirmation rejection retains the cart, discards the review/attempt, and requires another explicit review. If its recovery record cannot be removed, checkout remains frozen with a storage recovery message. Success records the known order ID, synchronously saves the cleared original cart before removing recovery data, and navigates to order details. A cart that differs from the original saved attempt is preserved during recovery.
- Failed attempt writes retain the same key in memory and clearly explain that reload/closing may lose safe recovery. Corrupt/unsupported recovery records are preserved and block replacement checkout. If storage cannot be read at all, cart editing remains usable in memory and checkout explains that storage must be restored before any previous attempt can be recovered safely. This preserves T11's in-memory cart behavior without guessing whether an unreadable attempt committed.

## Demonstrated acceptance

Added **29 frontend tests**, beside the checkout implementation, covering observed/open-price payloads, separate price lines, exact discounts, before-send persistence, duplicate clicks, frozen cart methods, local/menu/expiry invalidation, reverted edits, background-tab expiry at click time, obsolete quote responses, unknown outcomes, 404 lookup, same-key retry, reload lookup/retry, committed-order recovery, definite rejections, line-specific quote failures, `QUOTE_USED` read failure/recovery, synchronization guards, write/read/remove failures, and corrupt recovery records. Existing frontend, backend, and shared-contract tests remain passing.

Added four real Chromium acceptance scenarios using the existing isolated in-memory backend:

1. Review an observed-to-current fixed-price change and final discount total. Edit the discount to invalidate review, toggle availability live, and retain cart input after quote rejection. Change the server price after the browser sends confirmation; the backend rejects it without placement. A new explicit review shows the new total before a separate successful confirmation. The labelled review heading receives focus; a **375×812** screenshot was inspected and has no horizontal document overflow.
2. Send two synchronous Confirm clicks, commit the resulting single request in the real backend, and drop its HTTP response before delivery. Verify persisted key/payload and frozen cart, reload, return 404 for key lookup, and retain the same key without an automatic POST. Explicit same-key retry opens the original order. Read the real order list and verify exactly one order for that quote.
3. Commit and drop the response, then reload with normal key lookup. Recovery opens the original order with only the initial confirmation POST.
4. Fail recovery-record writes and verify the visible reload limitation. Consume the exact quote with another key, forward the original confirmation, and resolve its real `QUOTE_USED` response by opening the existing order.

The complete browser suite also exercises inaccessible session storage with continued cart additions/editing, existing Setup conflict/pagination/mobile behavior, independent live clients, route/socket lifetime, deep links, and offline recovery. The inaccessible-storage regression found during verification was fixed and covered by a new unit test.

## Verification and limits

- Uncached `NX_SKIP_NX_CACHE=true NX_DEFAULT_OUTPUT_STYLE=stream pnpm check` **passed**, including lint, strict TypeScript/template checks, **105 frontend + 320 backend + 75 contract tests (500 total)**, shared declarations, and **both frontend and backend production builds**.
- `pnpm e2e --output-style=stream --workers=1` **passed: 15/15 Chromium tests**. The complete suite was rerun after the storage fix, with no source edits during the run.
- `pnpm exec playwright test --config apps/frontend-e2e/playwright.large.config.ts` **passed: 1/1**, verifying the separate real 5,000-item in-memory fixture still uses bounded pages, matching skeleton dimensions, search, and category filters.
- `git diff --check` **passed**. Production checks and browser suites ran sequentially.
- Production initial bundle: **560.37 kB raw / 141.38 kB estimated transfer**, with a **10.37 kB warning** above the unchanged 550 kB warning threshold. The build remains below the unchanged 600 kB error limit. Review/recovery UI is loaded with the lazy Menu route.
- Browser fixtures use `DATABASE_PATH=:memory:` and `SEED_MODE=none`; backend unit tests retain their isolated temporary databases. No development database was read, seeded, reset, or modified.

Recovery storage is per tab. Clearing browser data or closing a tab after a failed recovery write can lose its key, as the UI explains. Checkout does not automatically abandon ambiguous attempts. Manual staff status controls, deployment, and broader performance/reliability measurements remain T13–T15.
