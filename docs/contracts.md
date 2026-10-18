# HTTP, checkout, and realtime contracts

This is the target contract for implementation, not an existing API. Schemas and event maps will live in `libs/contracts`; the backend remains authoritative.

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
    details?: unknown; // Each documented code gets a concrete Zod schema.
  };
};
```

Use 400 for malformed requests, 404 for missing resources, 409 for revision/checkout conflicts, 422 for business validation, and 503 for transient database/server unavailability. Map unexpected exceptions to 500 without exposing internals. HTTP clients show actionable messages and preserve drafts/cart state. Retry GET requests with bounded backoff; do not blindly retry non-idempotent writes.

## 2. HTTP surface

| Method/path | Purpose and important fields |
| --- | --- |
| `GET /api/health/live` | Process liveness. |
| `GET /api/health/ready` | Database/migration readiness. |
| `GET /api/sync` | Persisted `{ menuRevision, ordersRevision }` for missed-event detection. |
| `GET /api/menu/categories` | Active categories and `menuRevision`. |
| `GET /api/menu/items?categoryId=&search=&page=&pageSize=` | Active categories' nonarchived items, including unavailable items marked visibly; `{ items, total, page, pageSize, menuRevision }`. |
| `POST /api/menu/resolve` | Resolve up to 100 specific cart item IDs independent of visible page; return current values or unavailable/archived/missing flags and `menuRevision`. Read-only, no mutation. |
| `GET /api/setup/categories` | Configuration category list with entity revisions. |
| `GET /api/setup/items?...` | Paginated configuration view including unavailable items; hide archived records by default. |
| `POST /api/setup/categories` | Create a category from name/sort order; 201. |
| `PATCH /api/setup/categories/:id` | Edit or archive with `{ expectedRevision, ...changes }`. |
| `POST /api/setup/items` | Create with category, name, pricing mode/price, availability; 201. |
| `PATCH /api/setup/items/:id` | Edit price/mode/availability/category/name or archive, with `expectedRevision`. |
| `POST /api/checkout/quotes` | Validate cart and discount; return authoritative review snapshot or actionable problems. |
| `POST /api/orders` | Confirm `{ quoteId }` with `Idempotency-Key` header; 201 first creation, 200 replay of the same request. |
| `GET /api/orders/by-request/:idempotencyKey` | Recover committed result by opaque UUID key; 200 existing order or 404 not found yet. Register route before `/:id`. |
| `GET /api/orders?status=&page=&pageSize=` | All orders, paginated newest first by creation timestamp/ID; includes `ordersRevision`. |
| `GET /api/orders/:id` | Order and immutable line/price snapshots, current status and revision; includes `ordersRevision`. |
| `PATCH /api/orders/:id/status` | `{ status, expectedRevision }`; validate transition atomically and return updated order. |

All menu configuration writes increment the changed entity revision and the global menu revision in the same transaction. Failed/no-op writes do not advance revisions. Concurrent Setup edits return `409 REVISION_CONFLICT`; retain the user's form and offer reload/reapply. Reject items assigned to archived categories. Category archival immediately makes its children unorderable without rewriting historical orders.

Read each list/snapshot and its associated stream revision in one short database read transaction. This prevents a revision from describing newer state than the returned data. Cross-endpoint category/item snapshots may differ; if revisions differ, re-fetch to converge rather than accepting an older page over a newer revision.

## 3. Review and confirmation protocol

The cart is an intent; a quote is the exact server result the user reviews. An order is created only from a still-valid quote.

1. **Prepare review.** Send cart lines `{ itemId, quantity, openPriceMinor?, observedRevision, observedUnitPriceMinor? }` and `discountMinor` to `POST /checkout/quotes`. Observed fields describe the UI's last known state, not trusted prices.
2. **Validate and persist.** In a short transaction, load current items/categories and menu revision. Validate availability, pricing mode, quantities, discount, and all arithmetic. An unavailable/archived/missing item or incompatible open-price mode returns `422 CART_INVALID` with per-line issues and no quote. Return field validation for an excessive discount; never silently clamp it.
3. **Return review.** For a valid cart, save a quote with a five-minute server-side expiry, menu revision, and immutable line/total snapshot. Return `{ quoteId, expiresAt, menuRevision, lines, subtotalMinor, discountMinor, totalMinor, currency, changes }`. `changes` explicitly identifies observed-to-current price/name/revision differences. Fixed prices are always recalculated. Quote generation does not place an order.
4. **Explicit confirmation.** Show all lines, changed values, discount, and final total. The user clicks Confirm after seeing that result. Any local cart edit discards the quote. A received menu-change event disables confirmation and requests a new review. Never auto-confirm when a fresh quote arrives.
5. **Persist the attempt before sending.** Generate a UUID idempotency key, persist it with the exact `{ quoteId }` payload in sessionStorage, and freeze that checkout attempt. Double-clicks and retries reuse both values. If persistence is unavailable, keep the key in memory and explain that reloading could lose recovery state.
6. **Commit atomically.** The server performs the transaction below, checking the database again even if the socket and UI report everything is current.
7. **Resolve the result.** Success clears the cart/pending attempt and opens the order. `409 QUOTE_USED` identifies an already committed order for that exact quote: fetch/open it and resolve the attempt instead of reviewing again. A definitive stale/expired quote or invalid-cart rejection retains the cart, discards the quote, and requires another explicit review. A transport timeout/5xx leaves the outcome unknown: retain the key and exact payload; query by key and/or retry the same POST. Do not create a new quote/key until that attempt resolves. A 404 lookup is not proof that an in-flight request cannot still commit; keep using the same key.

Order creation transaction (synchronous, with an immediate write lock):

```text
BEGIN IMMEDIATE
  find order by idempotency key
  if found:
    matching canonical request hash -> return that order (replay)
    different hash -> 409 IDEMPOTENCY_CONFLICT
  load quote
  reject missing/expired quote
  reject quote already used by another key (409 QUOTE_USED, existing order ID)
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

Socket.IO connection-state recovery may be enabled for a bounded interval (e.g. two minutes), but always perform snapshot reconciliation on reconnect, including after a server restart. Revisions survive restarts in SQLite.

While the app is visible, call lightweight `GET /api/sync` every 15 seconds. Also check on tab focus, browser online events, and relevant route activation. Compare those revisions to active views and cart/quote validity. This repairs a lost post-commit event without a durable event log; do not download the entire menu each interval. A DB commit followed immediately by a process crash may omit its event, but later sync/reconnect observes its persisted revision.

Show connecting, connected, synchronizing, and disconnected states accessibly. Preserve rendered content/cart during failures. Allow a fresh HTTP quote when Socket.IO alone is unavailable, but display that live updates are degraded; final server revalidation is always mandatory. When HTTP is unavailable, disable confirmation and provide a manual retry. Do not queue order submissions for automatic delivery after reconnect.

Normal connected updates target under one second at demo load; missed-event recovery takes up to 15 seconds plus network time while visible. Background tabs catch up on focus; this is an explicit prototype consistency bound.
