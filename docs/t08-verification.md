# T08 — Socket.IO and revision synchronization verification

Verified on 2026-10-18, macOS arm64, with pinned Node **24.22.0** and pnpm **12.14.0** from the existing isolated npm-exec toolchain. Socket.IO server and client are both pinned to **4.8.4**, with the lockfile updated. Shared event contracts, schema, and migrations are unchanged.

## Implemented behavior

- One typed Socket.IO server attaches to the Express HTTP listener after database initialization and before listening. Server/client event maps come from the framework-neutral contracts library. The path is `/socket.io`; HTTP polling and WebSocket upgrades remain available. Browser clients use the frontend origin through the existing Angular proxy. No cross-origin grants or socket domain-write handlers are added.
- Every connection, including a recovered session, receives `sync.state` from SQLite. `GET /api/sync` returns the same validated `{ menuRevision, ordersRevision }` in a single SELECT, so both revisions share one SQLite snapshot. The endpoint disables caching, rejects unknown query fields, and uses common request IDs/errors.
- HTTP menu/order routes publish notification results only after their synchronous service transactions return successfully. All connected clients receive changes, including the client initiating the HTTP mutation. No-op menu/status writes, idempotent order replays, rejected requests, and failed transactions emit nothing. A failure at COMMIT itself also emits nothing.
- Connection-state recovery uses the built-in in-memory adapter for at most two minutes by default, with middleware checks enabled on recovered connections. `SOCKET_RECOVERY_MS` accepts integers from 0 through 120,000; 0 disables recovery. A failed/expired recovery or backend restart still exposes persisted stream revisions for HTTP reconciliation. Recovery is an optimization, not a durable event log. See the official [connection recovery guidance](https://socket.io/docs/v4/connection-state-recovery/).
- Shutdown stops new HTTP/socket intake, closes polling/WebSocket clients and recovery resources, drains active HTTP work, and closes SQLite. The existing bounded shutdown, startup-error cleanup, and forced transport cleanup remain covered. Socket.IO also closes its attached HTTP server; lifecycle cleanup tolerates an already-stopped listener, as described by its [close API](https://socket.io/docs/v4/server-api/#serverclosecallback).

## Demonstrated acceptance

Added **18 realtime feature tests** beside the implementation in `apps/backend/src/modules/realtime/realtime.spec.ts`, each with its own OS temporary real SQLite database:

- Independent polling-only and WebSocket-only clients receive initial persisted revisions and every committed category/item creation, edit, and archive. Both receive identical valid notification payloads with unique event IDs and increasing stream revisions. Separate SQLite connections observe each commit before publication, with no writer transaction still open.
- Both clients receive order creation and manual status changes with matching entity/stream revisions. Independently opened database connections can already read the committed statuses. Authoritative HTTP details retain immutable lines.
- Validation failures, stale revisions, invalid status transitions, menu/item/status no-ops, and same-key order replay leave notifications and stream revisions unchanged. Ordered barrier events make negative notification assertions without arbitrary sleeps.
- Injected menu/order/status stream-update failures roll back entity changes, order lines, orders, and revisions, with no broadcast. A deferred foreign-key violation makes the transaction body finish successfully but COMMIT fail, demonstrating that no prepared notification escapes that boundary.
- A connected client's menu and order broadcasts are deliberately omitted after real HTTP commits. `/api/sync` detects both newer persisted revisions, and authoritative menu/order reads repair the missed changes, including status-filter membership/counts.
- A minimal test consumer receives duplicate and older order notifications over a real socket, tracks the highest revision, and reconciles through HTTP to exactly one current order. This demonstrates the wire protocol; the production Angular stores and their revision/request tracking remain T09.
- Stop/recreate the server, reopen the same temporary database on the same port, commit changes while a retained client is offline, then reconnect that same client. Packet recovery fails across restart as expected, while a fresh `sync.state` and HTTP reads reveal persisted menu/order changes and immutable order lines.
- A short unexpected transport loss recovers its session and missed packet, followed by fresh persisted sync state. Disabled recovery and an expired tiny recovery window fall back to fresh state successfully.
- Default polling upgrades to WebSocket; polling-only operation works; attempts to send custom socket mutations create no domain data. Active polling/WebSocket clients close during idempotent shutdown, with the listener and SQLite closed afterward.

Four additional configuration cases reject negative, excessive, infinite, and fractional recovery windows; existing default/override tests cover the enabled default and disabled setting.

Added `apps/frontend-e2e/src/realtime.spec.ts`: two isolated Chromium browser contexts load the pinned browser client, connect through the Angular same-origin proxy using polling-only and polling-to-WebSocket transports, perform an HTTP write in the initiating browser, and both receive the same committed event and sync revisions. The E2E backend uses a separate in-memory database with seeding disabled.

## Checks

- `NX_SKIP_NX_CACHE=true pnpm check` **passed** with cache reads disabled: all lint and strict typecheck targets, **frontend and backend unit tests**, shared contract tests, **both frontend/backend production builds**, and contracts declarations succeeded.
- Focused realtime suite: **18/18 passed**.
- `pnpm e2e` **passed**; the static-output run explicitly reported **2/2 Chromium tests passed**, including the existing app/API smoke test and the new two-context realtime proxy test.
- `pnpm install --frozen-lockfile` **passed** with pinned tools and strict dependency/engine settings.
- `git diff --check` **passed**.

No development database was read, seeded, reset, or modified. Feature tests remove their temporary databases. The frontend singleton socket service, feature stores, listener teardown, highest-revision tracking, visible connection indicators, and focus/reconnect/15-second reconciliation schedule remain T09 and later frontend tasks. Docker proxy verification remains T14/T15.
