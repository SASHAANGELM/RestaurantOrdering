# T06 — Authoritative checkout quotes verification

Verified on 2026-10-18, macOS arm64, with pinned Node **24.22.0** and pnpm **12.14.0** from the existing isolated npm-exec toolchain. Dependencies, shared contracts, schema, and migrations are unchanged.

## Implemented behavior

- `POST /api/checkout/quotes` validates the shared cart-intent schema and returns **201** with a server-generated quote and `Cache-Control: no-store`. HTTP prices and discounts are integer USD cents; decimal strings, fractional cents, unsafe integers, unknown fields, invalid IDs, and out-of-bounds quantities/prices/line counts receive correlated `400 VALIDATION_ERROR` responses with input paths.
- The checkout service uses one short synchronous `BEGIN IMMEDIATE` transaction to load current joined item/category eligibility, read the matching menu revision, calculate totals, validate the complete snapshot, and persist the quote. Setup writes cannot interleave with those reads and persistence. The service returns only after commit.
- Fixed prices come from the database. Open prices are required only for open items; fixed items reject any open-price override, including zero. Lines retain request order, quantities, and separate entered prices for the same open item. Observed values are used only for explicit old/new price, revision, and name differences, never as authoritative prices.
- Missing, archived, unavailable, and archived-category items receive `422 CART_INVALID` with original line indexes and item IDs. Every invalid line contributes one issue using the existing eligibility precedence; valid lines do not cause a partial quote to be saved. Pricing-mode switches require corrected price intent before quoting.
- Safe-integer money helpers check multiplication and summation. Discounts above the authoritative subtotal return `422 DISCOUNT_EXCEEDS_SUBTOTAL` with the actual subtotal and requested discount; they are never clamped. Free fixed/open items and full-subtotal discounts allow a zero total.
- Persisted snapshots include IDs/names for items and categories, item revisions, pricing modes, quantities, unit/line prices, totals, USD currency, the menu revision, and server timestamps exactly five minutes apart. The persisted snapshot excludes response-only `changes`, survives connection reopening, and retains its original values after Setup edits.
- Quoting leaves menu entities, availability, entity/stream revisions, orders, and order lines untouched. Repeated valid reviews create independent quote IDs. Quote creation reserves no inventory. Confirmation, expiry enforcement during confirmation, and order creation remain T07.

## Demonstrated acceptance and checks

Added **44 feature tests** beside the implementation in `apps/backend/src/modules/checkout/checkout.spec.ts`, all using isolated temporary real SQLite files:

- Exact persisted snapshot/metadata and five-minute lifetime across database reopening; changed fixed prices/names/category names and line-indexed review differences; untrusted client observations and matching/omitted observations.
- Separate prices for one open item; missing/archived/unavailable items and archived categories with precedence; both pricing-mode switches and corrected intent; a 100-line invalid cart with bounded line-specific issues.
- Free fixed and open items, a fully discounted cart, excessive and maximum-safe discounts, invalid decimal/string/fractional/unsafe input boundaries, invalid quantities, malformed carts, and unknown totals/prices.
- The maximum permitted 100-line cart at quantity 99 and unit price 1,000,000 calculates exactly **9,900,000,000 cents**, protecting against 32-bit overflow. Unsafe values are rejected before multiplication; shared contract tests also verify unsafe-sum rejection.
- Quotes leave availability and order state untouched; later menu edits preserve snapshots. An insert trigger forces a persistence failure and verifies rollback plus generic error mapping. A second SQLite writer demonstrates retryable `503 SERVICE_UNAVAILABLE` with recovery after release. An attempted Setup write between quote reads is blocked, proving matching snapshot/revision persistence.

`NX_SKIP_NX_CACHE=true pnpm check` **passed** after the final implementation/test changes: all four lint and strict typecheck targets, frontend and backend unit-test targets, shared contract tests, and both frontend/backend production builds plus contracts declarations succeeded with cache reads disabled. `git diff --check` passed.

No development database was read, seeded, reset, or modified. Temporary database directories are removed after each test. No browser checkout workflow, order confirmation, or realtime behavior is claimed by this task.
