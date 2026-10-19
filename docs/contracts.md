# HTTP, checkout, and realtime contracts

Runtime schemas, inferred DTOs, money helpers, and event maps are implemented in `libs/contracts` (T02). T04 implements the health endpoints and common HTTP validation/error boundary. T05 implements the menu/Setup endpoints, T06 implements checkout quotes, and T07 implements order confirmation, recovery, reads, and status updates below. Sync and the Socket.IO server remain T08. The backend remains authoritative.

## 1. Common rules

Prefix HTTP endpoints with `/api`. UUID IDs; UTC ISO timestamps; integer revisions; integer USD cents. Reject unknown request fields, invalid enums, fractional quantities, and unsafe numeric values. Trim names; require 1–120 characters, descriptions at most 2,000 characters. Page sizes default to 50 and cannot exceed 100. Use deterministic sorting with ID as a tiebreaker.

Prototype limits: 1–100 cart lines, quantity 1–99 per line, unit price 0–1,000,000 cents, discount 0–subtotal. Keep all derived totals within the safe integer range. Decimal input accepts at most two places and converts using decimal string parsing; never multiply a floating-point amount and trust rounding. Currency is always `USD`. No taxes, tips, shipping, payments, or percentage discounts.

Fixed items use the server's configured price. Open items require a user-entered `openPriceMinor`; a fixed item must not accept that override. Merge cart entries only when item ID and, for open items, entered price match. Different open prices create separate lines. Archiving an item/category, setting an item unavailable, or changing pricing mode requires explicit cart correction/review.

Errors follow:

```ts
type ApiError = {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown; // Overview only; the library exports a strict code/detail union.
  };
};
```

Use 400 for malformed requests, 404 for missing resources, 409 for revision/checkout conflicts, 422 for business validation, and 503 for transient database/server unavailability. Map unexpected exceptions to 500 without exposing internals. HTTP clients show actionable messages and preserve drafts/cart state. Retry GET requests with bounded backoff; do not blindly retry non-idempotent writes.

### Implemented shared library

Import from `@restaurant-ordering/contracts`. Public schemas use camelCase names ending in `Schema`; DTOs are inferred from them with Zod, for example `createItemSchema` / `CreateItem`, `quoteSnapshotSchema` / `QuoteSnapshot`, and `orderSchema` / `Order`. The library's only runtime dependency besides tslib is Zod **4.6.7**. It contains no Angular, Express, database, Node, or Socket.IO implementation imports. Zod's [strict objects and discriminated unions](https://zod.dev/api) provide unknown-field rejection and code-specific type narrowing.

- `common.ts`: UUIDs, UTC timestamps, USD, money/quantity/name limits, pagination, and sync revisions. Stream revisions start at zero; entity and expected revisions start at one. Query pagination accepts positive integers or digit-only strings, defaults to page 1 / size 50, and rejects sizes above 100. `includeArchived` accepts booleans or the exact query strings `true` / `false`, defaulting to false.
- `menu.ts`: category/item DTOs; create, edit, archive, list, mutation response, and cart resolution schemas. Setup lists reuse the category/item response schemas. Open-item writes omit `priceMinor`; open-item responses carry `priceMinor: null`. An edit of fixed pricing sends both `pricingMode: 'fixed'` and `priceMinor`; switching to open sends only `pricingMode: 'open'`. Other edits omit both. Updates must include at least one change. Clear an item description by sending `description: null`.
- `checkout.ts`: optional kitchen comments (up to 500 characters) on intent and immutable snapshot lines, cart intent, snapshot lines, persisted quotes, review changes, and confirmation. `observedName` is optional alongside the other observed values, enabling an explicit old/new name difference. Persisted snapshots include `quoteId`, `createdAt`, and `expiresAt`; quote responses add `changes`. Snapshot lines capture item/category IDs and names, item revision, pricing mode, quantity, unit price, and line total. Quote change records contain `lineIndex`, `itemId`, `field` (`unitPriceMinor`, `revision`, or `name`), and typed `observed` / `current` values. Indexes are zero-based. Confirmation accepts only `{ quoteId }`; the idempotency key is a UUID header value.
- `orders.ts`: immutable lines (snapshot fields plus line `id`), complete orders, list summaries without lines, detail/list responses, filters, and status updates. Responses wrap `{ order, ordersRevision }` or `{ orders, total, page, pageSize, ordersRevision }`. `canTransitionOrderStatus` implements only the five permitted transitions; a current-status no-op is handled separately by the service after checking revision.
- `realtime.ts`: runtime `serverEventSchemas` and derived `ServerToClientEvents` callbacks for the three events below; `ClientToServerEvents` is empty. These types can parameterize Socket.IO later without importing it here.
- `money.ts`: `parseDecimalMinor` parses a trimmed nonnegative decimal string with one or two optional fractional digits, with no floating-point multiplication. It rejects signs, exponents, separators, blank input, extra decimal places, unsafe amounts, and strings over 32 characters. `parseUnitPriceMinor` additionally enforces the unit-price limit. `calculateLineTotal` and `calculateTotals` validate inputs, reject unsafe sums/excessive discounts, and allow zero totals. Quote/order schemas independently check multiplication, sum, discount, and final-total consistency. Schema validation cannot certify current database prices or availability; those checks remain server responsibilities.

### Concrete error details

`apiErrorSchema` parses `{ error: ApiErrorBody }` as a strict discriminated union. All errors require a message and UUID `requestId`. Every code below except `INTERNAL_ERROR` requires its listed `details`; unknown detail fields are rejected. `ApiErrorDetails<'QUOTE_USED'>`, for example, infers `{ quoteId, orderId }`. `API_ERROR_STATUS` exports the HTTP mapping.

| Code | HTTP | Required details |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | `{ issues: [{ path: (string or nonnegative integer)[], code, message }] }`, nonempty |
| `NOT_FOUND` | 404 | `{ resourceType, resourceId }`; type is category/item/quote/order/request |
| `REVISION_CONFLICT` | 409 | `{ entityType, entityId, expectedRevision, currentRevision }`; type is category/item/order |
| `CART_INVALID` | 422 | `{ issues: [{ lineIndex, itemId, code, message }] }`, 1–100 issues |
| `DISCOUNT_EXCEEDS_SUBTOTAL` | 422 | `{ subtotalMinor, discountMinor }` |
| `QUOTE_EXPIRED` | 409 | `{ quoteId, expiresAt }` |
| `QUOTE_USED` | 409 | `{ quoteId, orderId }` |
| `MENU_CHANGED` | 409 | `{ quoteId, quotedMenuRevision, currentMenuRevision }` |
| `IDEMPOTENCY_CONFLICT` | 409 | `{ idempotencyKey }` |
| `INVALID_STATUS_TRANSITION` | 409 | `{ orderId, currentStatus, requestedStatus, allowedStatuses }` |
| `CATEGORY_ARCHIVED` | 422 | `{ categoryId }` |
| `SERVICE_UNAVAILABLE` | 503 | `{ retryAfterMs }` |
| `INTERNAL_ERROR` | 500 | No details field; internal exceptions are never public DTOs. |

Cart issue codes are `ITEM_MISSING`, `ITEM_ARCHIVED`, `CATEGORY_ARCHIVED`, `ITEM_UNAVAILABLE`, `OPEN_PRICE_REQUIRED`, and `FIXED_PRICE_OVERRIDE`. Quote preparation uses them to identify lines requiring correction; changed fixed prices/revisions/names instead appear as visible review changes for valid carts. Excessive discounts use the separate discount error. T04 implements the common error mapper; these domain conditions are emitted by services in later tasks.

T04's HTTP boundary generates a UUID `X-Request-Id` for each request and repeats it in errors. `validateRequest(schema, value, source)` returns parsed values without mutating Express request objects; validation issue paths begin with `body`, `query`, `params`, or `headers`. The JSON limit defaults to 65,536 bytes; malformed, oversized, or compressed JSON uses `400 VALIDATION_ERROR` to preserve the shared status mapping. Unknown endpoints use `404 NOT_FOUND` with `{ resourceType: 'request', resourceId: requestId }`. SQLite lock contention returns retryable `503 SERVICE_UNAVAILABLE` with `Retry-After: 1` and `{ retryAfterMs: 1000 }`. Unexpected errors expose only `INTERNAL_ERROR`, a generic message, and the request ID.

Both health endpoints disable caching. Liveness returns `{ status: 'live' }` without a database query. Readiness returns `{ status: 'ready' }` only when not shutting down and both the singleton app state and migration journal are accessible and populated. Otherwise it uses the common retryable 503 envelope. Startup completes migrations and optional seeding before binding HTTP.

## 2. HTTP surface

| Method/path | Purpose and important fields |
| --- | --- |
| `GET /api/health/live` | Process liveness. |
| `GET /api/health/ready` | Database/migration readiness. |
| `GET /api/sync` | Persisted `{ menuRevision, ordersRevision }` for missed-event detection. |
| `GET /api/menu/catalog` | Complete active categories/items and menu revision from one read transaction, without search or pagination. Menu filters and pages this snapshot locally. |
| `GET /api/menu/categories` | Active categories and `menuRevision`. |
| `GET /api/menu/items?categoryId=&search=&page=&pageSize=` | Active categories' nonarchived items, including unavailable items marked visibly; `{ items, total, page, pageSize, menuRevision }`. |
| `POST /api/menu/resolve` | Resolve up to 100 specific cart item IDs independent of visible page; return current values or unavailable/archived/missing flags and `menuRevision`. Read-only, no mutation. |
| `GET /api/setup/catalog` | Complete coherent management snapshot including archived categories/items, with `menuRevision`/`menuUpdatedAt`; no search/filter/page parameters; gzip supported. |
| `GET /api/items/:id` | Current item and category including archives, with matching `menuRevision`/`menuUpdatedAt`; 404 for a missing item. |
| `GET /api/setup/categories?includeArchived=` | Configuration category list with entity revisions; hide archived categories by default. |
| `GET /api/setup/items?...` | Paginated configuration view including unavailable items; hide archived records by default. |
| `POST /api/setup/categories` | Create a category from name/sort order; 201. |
| `PATCH /api/setup/categories/:id` | Edit, archive (`archived: true`) or restore (`archived: false`) with `{ expectedRevision, ...changes }`. |
| `POST /api/setup/items` | Create with category, name, pricing mode/price, availability; 201. |
| `PATCH /api/setup/items/:id` | Edit price/mode/availability/category/name, archive (`archived: true`) or restore (`archived: false`), with `expectedRevision`. |
| `POST /api/checkout/quotes` | Validate cart and discount; 201 with authoritative review snapshot or actionable problems. |
| `POST /api/orders` | Confirm `{ quoteId }` with `Idempotency-Key` header; 201 first creation, 200 replay of the same request. |
| `GET /api/orders/by-request/:idempotencyKey` | Recover committed result by opaque UUID key; 200 existing order or 404 not found yet. Register route before `/:id`. |
| `GET /api/orders?status=&itemId=&page=&pageSize=` | Orders filtered optionally by status and exact item ID, paginated newest first by creation timestamp/ID; each order appears once even with multiple matching lines; includes `ordersRevision` and up to three unique `itemImages` snapshots (`id`, `name`, optional `imageUrl`) from its order lines. |
| `GET /api/orders/:id` | Order and immutable line/price/image snapshots, current status and revision, and `history` entries (`status`, `changedAt`); includes `ordersRevision`. |
| `PATCH /api/orders/:id/status` | `{ status, expectedRevision }`; validate transition atomically and return updated order. |

All menu configuration writes increment the changed entity revision and the global menu revision in the same transaction. Failed/no-op writes do not advance revisions. Concurrent Setup edits return `409 REVISION_CONFLICT`; retain the user's form and offer reload/reapply. Reject items assigned to archived categories. Category archival immediately makes its children unorderable without rewriting historical orders.

T21 added restoration by clearing the existing nullable `archivedAt` field. Omitted `archived` preserves archive state; only boolean values are accepted. Category restoration does not change its children or their revisions. T22 enforces **Available ↔ Unavailable ↔ Archived** for items: archive requires the persisted item to already be unavailable; even combined disable/archive requests fail with `409 INVALID_ITEM_TRANSITION` and `{ itemId, currentState, requestedState }`. Restoring an archived item always sets `available: false`, including legacy archives with `available: true`. Enabling availability while archived or in the restore request is rejected. A separate subsequent availability update is required. An archived parent still blocks ordering. Repeated current-revision restores are no-ops; stale revisions conflict. Actual restores emit `menu.changed` with `change: 'updated'` after commit. No migration or new event type is required; historical orders are unchanged.

The Settings UI uses the complete management snapshot and computes search/category filters and bounded per-state pages locally. User browsing and expand/collapse actions do not fetch snapshots; explicit refresh, mutations and revision/reconnection repair do. The legacy paginated item endpoints listed above remain available for existing API consumers. Related order queries use the existing indexed `order_lines.item_id` to match identity regardless of later edits and retain coherent counts/pages/revisions.

Read each list/snapshot and its associated stream revision in one short database read transaction. This prevents a revision from describing newer state than the returned data. Cross-endpoint category/item snapshots may differ; if revisions differ, re-fetch to converge rather than accepting an older page over a newer revision.

T05 implements item sorting by name/ID and category sorting by sort order/ID. Item search is a literal name substring using SQLite's built-in ASCII case folding; `%` and `_` are ordinary characters. Item pagination defaults to page 1 / 50 and caps page size at 100; pages beyond the result set return an empty list. Category responses retain the unpaged shared contract. Setup item lists include children of archived categories for management; `includeArchived=true` additionally includes individually archived items. Public Menu item lists exclude both archived items and archived categories' children but include unavailable items. Resolution preserves requested ID order with states missing, archived, category-archived, unavailable, or available (in that precedence). T06 reuses this joined eligibility read inside its quote write transaction. See [T05 verification](tasks/t05-implement-menu-configuration-and-query-apis.md#verification) and [T06 verification](tasks/t06-implement-authoritative-checkout-quotes.md#verification).

## 3. Review and confirmation protocol

The cart is an intent; a quote is the exact server result the user reviews. An order is created only from a still-valid quote.

1. **Prepare review.** Send cart lines `{ itemId, quantity, openPriceMinor?, observedRevision, observedUnitPriceMinor?, observedName? }` and `discountMinor` to `POST /checkout/quotes`. Observed fields describe the UI's last known state, not trusted prices.
2. **Validate and persist.** In a short transaction, load current items/categories and menu revision. Validate availability, pricing mode, quantities, discount, and all arithmetic. An unavailable/archived/missing item or incompatible open-price mode returns `422 CART_INVALID` with per-line issues and no quote. Return field validation for an excessive discount; never silently clamp it.
3. **Return review.** For a valid cart, save a quote with a five-minute server-side expiry, menu revision, and immutable line/total snapshot. Return `{ quoteId, createdAt, expiresAt, menuRevision, lines, subtotalMinor, discountMinor, totalMinor, currency, changes }`. `changes` explicitly identifies observed-to-current price/name/revision differences when their observed fields were supplied. Fixed prices are always recalculated. Quote generation does not place an order.
4. **Explicit confirmation.** Show all lines, changed values, discount, and final total. The user clicks Confirm after seeing that result. Any local cart edit discards the quote. A received menu-change event disables confirmation and requests a new review. Never auto-confirm when a fresh quote arrives.
5. **Persist the attempt before sending.** Generate a UUID idempotency key, persist it with the exact `{ quoteId }` payload in sessionStorage, and freeze that checkout attempt. Double-clicks and retries reuse both values. If persistence is unavailable, keep the key in memory and explain that reloading could lose recovery state.
6. **Commit atomically.** The server performs the transaction below, checking the database again even if the socket and UI report everything is current.
7. **Resolve the result.** Success clears the cart/pending attempt and opens the order. `409 QUOTE_USED` identifies an already committed order for that exact quote: fetch/open it and resolve the attempt instead of reviewing again. A definitive stale/expired quote or invalid-cart rejection retains the cart, discards the quote, and requires another explicit review. A transport timeout/5xx leaves the outcome unknown: retain the key and exact payload; query by key and/or retry the same POST. Do not create a new quote/key until that attempt resolves. A 404 lookup is not proof that an in-flight request cannot still commit; keep using the same key.

T12 implements this browser workflow with explicit review, before-send per-tab attempt persistence, locked pending intent, manual same-key retries, and read-only reload recovery. See [T12 verification](tasks/t12-implement-review-confirmation-and-recovery-ui.md#verification) for acceptance evidence and storage limitations.

Order creation transaction (synchronous, with an immediate write lock):

```text
BEGIN IMMEDIATE
  find order by idempotency key
  if found:
    matching canonical request hash -> return that order (replay)
    different hash -> 409 IDEMPOTENCY_CONFLICT
  load quote
  reject missing quote
  reject quote already used by another key (409 QUOTE_USED, existing order ID)
  reject expired unused quote
  compare quote menu revision to current persisted menu revision
  recheck item/category eligibility, pricing mode, and authoritative totals
  if changed -> 409 MENU_CHANGED; do not create anything
  insert order with UNIQUE idempotency key and UNIQUE quote ID
  insert immutable order lines
  increment orders stream revision
COMMIT
emit orders.changed after commit
return committed order
```

Hash a canonical versioned request representation containing `quoteId`; no client-supplied totals enter the commit endpoint. Check replay **before** quote expiry/menu checks so a committed order remains recoverable later. Unique violations from overlapping requests must resolve to the existing committed order or a documented conflict. A crash after commit but before HTTP response still leaves the key/order mapping recoverable. A crash before commit leaves no partial order. Retain keys as long as orders exist.

T07 implements a SHA-256 hash of `JSON.stringify({ version: 1, quoteId })` after strict request validation. An immediate transaction acquires the SQLite writer lock before looking up the key, serializing independent writers so the later request observes the committed order or documented conflict. Lock timeouts use the common retryable 503 response. Key/hash fields never appear in order DTOs. Replays and recovery return the order's current status with its original immutable lines. A consumed quote returns `QUOTE_USED` even after expiry, allowing another retained attempt key to resolve to that order. Order list/count, detail/lines, recovery, and their persisted stream revisions share short read transactions. Services expose notification data only after commit; replays and status no-ops return no notification. See [T07 verification](tasks/t07-implement-idempotent-orders-and-status-transitions.md#verification).

The uniqueness guarantee applies to one checkout intent/key and one quote. Separate independently reviewed quotes may legitimately create separate orders with identical contents. There is no heuristic deduplication of equal carts, and order submission does not reserve or consume a stock count.

Any menu revision change invalidates a quote, even an unrelated category edit. This intentionally conservative prototype rule avoids missing an availability change that toggled away and back. A conflict always returns the user to review; it never accepts a new price or changed availability on their behalf.

## 4. Order status rules

```text
placed -> preparing -> ready -> completed
   |          |
   +----------+-> cancelled
```

Only those transitions are permitted. `completed` and `cancelled` are terminal. Cancellation is unavailable once ready. Status changes require the current order revision; a stale staff screen receives `409 REVISION_CONFLICT` and refreshes. Success increments the entity revision and orders stream revision atomically, then broadcasts. A repeated write with a stale revision changes nothing. A no-op request at the current revision returns current state without a new event.

No simulator/background progression is included. The Orders page supplies the manual staff controls because this is a shared demo without roles.

## 5. Socket.IO contract

One server attaches to the same HTTP server as Express. One browser client uses the same origin and `/socket.io` path. Keep polling fallback and WebSocket upgrade enabled. There are no order-submission socket events.

T08 implements the server with Socket.IO server/client **4.8.4**, post-commit HTTP-route notifications, and uncached `GET /api/sync`. Validation failures, transaction failures (including COMMIT failure), current-state no-ops, and idempotent replays do not broadcast. Every new/recovered connection receives persisted `sync.state`. The Angular socket service/stores and client synchronization schedule below remain T09. See [verification](tasks/t08-implement-socket-io-and-revision-synchronization.md#verification).

| Server → client event | Payload | Client behavior |
| --- | --- | --- |
| `sync.state` | `{ menuRevision, ordersRevision }` | Sent after connection; compare with applied snapshots and synchronize. |
| `menu.changed` | `{ eventId, menuRevision, entityType, entityId, change }` | Invalidate relevant menu/setup pages, cart resolution, and active quote. `change`: created/updated/archived. |
| `orders.changed` | `{ eventId, ordersRevision, orderId, orderRevision, change }` | Refresh active list/detail; creation can change list membership/count. `change`: created/status-changed. |

Client → server has no custom domain mutations. Socket.IO transport handles connect/disconnect/reconnect. Server event IDs are UUIDs; stream revisions, not event arrival order or IDs, determine whether data is stale. Runtime-validate received events at the client boundary too.

Broadcast after the database commit to all connected demo clients, including the initiating client. HTTP responses may arrive before or after corresponding events. Stores ignore revisions already applied, coalesce invalidations (~100 ms), and reconcile through HTTP. Do not insert duplicate orders from both transports. Status-filtered lists must refresh when membership changes, not only patch the displayed badge.

## 6. Synchronization and disconnections

For first connection/reconnection:

1. Register socket listeners before connecting. Track the highest announced revision per stream.
2. Once connected, fetch active menu/categories/cart and order snapshots. Mark the app synchronizing and disable stale checkout confirmation.
3. During reads, retain the highest revision seen from events/`sync.state`. Never let a late lower-revision response overwrite newer state; also track query request IDs when filters change.
4. If any announced revision exceeds its snapshot, refetch affected state. If both streams/active views are reconciled, show connected/current. A page revision never certifies freshness of independent cached pages.

Socket.IO connection-state recovery is enabled for two minutes by default. `SOCKET_RECOVERY_MS` accepts 0–120,000 milliseconds; 0 disables recovery. Middleware checks run on recovered sessions too. Always perform snapshot reconciliation on reconnect, including after a server restart. Revisions survive restarts in SQLite; in-memory packet recovery does not.

While the app is visible, call lightweight `GET /api/sync` every 15 seconds. Also check on tab focus, browser online events, and relevant route activation. Compare those revisions to active views and cart/quote validity. This repairs a lost post-commit event without a durable event log; do not download the entire menu each interval. A DB commit followed immediately by a process crash may omit its event, but later sync/reconnect observes its persisted revision.

Show connecting, connected, synchronizing, and disconnected states accessibly. Preserve rendered content/cart during failures. Allow a fresh HTTP quote when Socket.IO alone is unavailable, but display that live updates are degraded; final server revalidation is always mandatory. When HTTP is unavailable, disable confirmation and provide a manual retry. Do not queue order submissions for automatic delivery after reconnect.

Normal connected updates target under one second at demo load; missed-event recovery takes up to 15 seconds plus network time while visible. Background tabs catch up on focus; this is an explicit prototype consistency bound.

## Cart price acknowledgment (T23)

Cart storage keeps the accepted item pricing mode/fixed price and user-entered open price. Resolver metadata updates names/images and eligibility silently, retaining accepted pricing until explicit OK. A fixed-price or pricing-mode mismatch produces an orange warning and blocks both quote/placement actions. Open→fixed acceptance uses the current fixed price; fixed→open validates the proposed open price. Accepted prices and drafts survive reload, while unresolved checkout attempts remain frozen. An authoritative quote that discovers different monetary values triggers resolver refresh and acknowledgment instead of automatic placement; pricing/eligibility quote rejection also refreshes resolution. Order summary image previews use one batch line read inside the existing list read transaction, preserving count/page/revision coherence without per-order HTTP requests.
