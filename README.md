# Restaurant Ordering

A restaurant ordering prototype with three live views: **Settings** manages categories, prices, and availability; **Menu** builds a cart and reviews server-calculated totals before confirmation; **Orders** shows immutable order details and manual kitchen statuses. Separate browsers see committed changes without reloading.

Angular Material/CDK and NgRx SignalStore run in an Nx workspace alongside Express, Socket.IO, SQLite/Drizzle, and framework-neutral Zod contracts. This is a shared demonstration: every visitor can edit the menu, see every order, and change statuses. Use a controlled environment until access control is added.

Start with either path below from the repository root. No payments, accounts, or inventory reservations are implemented. See [architecture](docs/architecture.md), [HTTP/realtime contracts](docs/contracts.md), and the [task index](docs/tasks/README.md) for design and verification evidence.

## Docker

With Docker Engine/Desktop running and Docker Compose v2.20 or newer:

```sh
docker compose up --build
```

Open <http://localhost:8080>. Exactly two services run: Nginx `frontend` and Node `backend`. Startup applies migrations and seeds a small demo menu in the fresh `restaurant-data` named volume before frontend readiness. No Node installation, `.env` setup, or separate database command is needed. Both images run as non-root users; native SQLite dependencies compile inside the Linux build image. The backend is reachable through the frontend's relative `/api` and `/socket.io` proxies and has no published host port.

`docker compose down` preserves the database. `docker compose up --build` reuses it, including orders and menu edits. **`docker compose down -v` deletes this stack's database volume.** Stop/restart only the backend with `docker compose stop backend` and `docker compose up -d backend` to see cached content, a visible disconnection, and automatic reconnection. Nginx also resolves the replacement backend after `docker compose up -d --force-recreate backend`.

Optional settings are in [.env.example](.env.example): `FRONTEND_PORT` defaults to `8080`; `SEED_MODE` defaults to `small` and affects only a fresh, empty database. No host-specific API URL is compiled into the frontend. `docker compose ps` reports health; `/health` checks Nginx and `/api/health/ready` checks backend/database readiness. Compose waits for backend health at startup; a later backend outage leaves frontend pages accessible with recoverable errors. SIGTERM drains the backend within its 10-second deadline; Compose allows 15 seconds before killing it.

With the local toolchain and Playwright Chromium installed, `pnpm docker:smoke` builds and starts a unique disposable Compose project on a random loopback port. It checks health, non-root execution, fresh seeding, static caching/deep links, API errors, polling/WebSocket upgrades, order creation, clean shutdown, UI recovery, and persistence/idempotency through restart and recreation. It removes only its own containers/network/volume and generated images afterward and never touches the default stack or development database. Failure traces go to `test-results/docker/`.

## Local development

Use **Node.js 24.22.0** (`.nvmrc` / `.node-version`) and **pnpm 12.14.0**. With a Node version manager, select the repository version first (`nvm install && nvm use` for nvm). Install pnpm if needed with `npm install --global pnpm@12.14.0`. Confirm `node --version` and `pnpm --version` match the pins before installing. Native SQLite installation may need Python 3 and a C/C++ build toolchain (Xcode Command Line Tools on macOS; Python 3, make, and g++ on Linux). Ports 3000 and 4200 must be free.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://127.0.0.1:4200>. The backend listens on <http://127.0.0.1:3000/api> and responds with `{"name":"Restaurant Ordering API"}`. Angular proxies relative `/api` and `/api/**` requests to that backend. `/socket.io` and `/socket.io/**` proxy HTTP polling and WebSocket upgrades to the same backend listener. Stop both apps with Ctrl+C. No environment file is needed; local Node commands read exported environment variables, and do not automatically load `.env`. Compose reads `.env` for its documented substitutions. Before listening, the backend creates `data/restaurant.sqlite`, applies checked-in migrations, and seeds a small demo menu only if the database is empty and has never been initialized.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Watch and serve frontend and backend together. |
| `pnpm lint` | ESLint, Angular template accessibility, and Nx import boundaries. |
| `pnpm typecheck` | Strict TypeScript for all four projects, plus Angular template checking. |
| `pnpm test` | Contract/money boundaries, browser/server contract consumers, isolated persistence, menu/checkout/order API/service, realtime/sync, and HTTP/lifecycle tests. |
| `pnpm build` | Production frontend/backend builds and contracts declarations in `dist/`. |
| `pnpm check` | Lint, typecheck, test, and build sequentially. |
| `pnpm e2e` | Chromium Menu/cart/checkout recovery, Settings forms, Orders filters/statuses/conflicts/pagination, shell/API, keyboard/focus, live-store/offline recovery, deep-link, and two-context realtime proxy tests using their own frontend/backend servers. Stop `pnpm dev` first and run after builds finish. |
| `pnpm exec playwright test --config apps/frontend-e2e/playwright.large.config.ts` | Production 5,000-item menu paging/search plus 4× CPU, 150 ms latency, 1.6 Mbps download / 750 Kbps upload mobile performance checks. |
| `pnpm docker:smoke` | Build and verify the production Compose deployment in an isolated project and disposable database volume; requires Docker and Playwright Chromium. |
| `pnpm verify:native` | Exercise better-sqlite3 in memory and print runtime/driver compatibility. |
| `pnpm db:generate` | Generate a reviewed SQL migration after changing the Drizzle schema. |
| `pnpm db:check` | Check the migration history for collisions. |
| `pnpm db:migrate` | Build the backend and apply pending migrations without seeding. |
| `pnpm db:seed:small` | Migrate and seed 6 categories / 36 items in a fresh database. |
| `pnpm db:seed:large` | Migrate and seed 50 categories / 5,000 items in a fresh database. |

Every implementation task must pass **both app unit-test targets and both production builds** before completion. This requirement is recorded in [AGENTS.md](AGENTS.md); `pnpm check` runs those checks along with lint, strict typechecking, and shared contract tests.

Before the first E2E run, download Chromium with `pnpm exec playwright install chromium` (Linux CI may need `--with-deps`). E2E verifies that Angular renders in a real browser, `/api` reaches Express through the frontend origin, and two independent browser contexts receive committed notifications through polling and WebSocket upgrade proxies. Both browser suites serve the optimized production Angular build through a test-only Vite preview proxy. Their test backend hardcodes an isolated in-memory database, ignores development database settings, and never reuses an existing server. Standard E2E disables seeding; `pnpm exec playwright test --config apps/frontend-e2e/playwright.large.config.ts` seeds a separate 5,000-item database. One worker and zero retries make shared-fixture mutations deterministic. Run suites sequentially with ports 3000/4200 free, or set `E2E_BACKEND_PORT` and `E2E_FRONTEND_PORT` to use separate test ports. Menu cards use stable image/skeleton dimensions, bounded local pagination over the complete catalog, and ordinary document scrolling. Reports and JSON timing measurements go to ignored `playwright-report/` and `test-results/` directories. The omitted-broadcast fixture entry point is excluded from the production backend bundle; the container smoke test verifies its control routes return 404. See [T15 verification](docs/tasks/t15-complete-reliability-performance-and-ci-verification.md#verification) for actual results.

[CI](.github/workflows/verify.yml) uses the pinned Node/pnpm versions, a frozen install, the native SQLite probe, Chromium installation, uncached `pnpm check`, both browser suites, and the isolated two-service container smoke test. It retains browser reports and timing JSON for seven days.

Contract tests cover malformed requests, pricing modes, safe money arithmetic, snapshot totals, error details, status rules, and event payloads. Both app test targets import the contracts alias: Angular's Vitest builder verifies the browser consumer, and backend Vitest verifies request/recovery payload serialization. Backend/contracts test targets fail on empty suites. Additional feature tests belong with their implementation tasks.

## Database

The backend uses Drizzle ORM **0.45.4**, Drizzle Kit **0.31.11**, and better-sqlite3 **13.0.3**. Each connection enables foreign keys, WAL for real files, and a 5-second busy timeout. The schema and generated migration journal live in `apps/backend/src/db/schema.ts` and `apps/backend/drizzle/`; the backend build copies migration assets beside both executable entry points. Startup applies migrations before opening the HTTP listener. Never use schema push for deployment.

`DATABASE_PATH` overrides the local file path (relative paths resolve from the working directory). `SEED_MODE` accepts `none`, `small` (startup default), or `large`. A seed is one immediate transaction and records its mode and initial menu revision. Repeating either seed command or restarting preserves edits, archives, orders, quotes, and stream revisions. Seeds skip any nonempty or previously initialized database, including when another size is requested; they do not reset or expand an existing menu.

To work with a separate large fixture:

```sh
DATABASE_PATH=data/large.sqlite pnpm db:seed:large
DATABASE_PATH=data/large.sqlite SEED_MODE=large pnpm dev
```

Use a new path for a fresh fixture. Deleting a local database and its SQLite sidecars permanently removes that file's orders and configuration; stop the backend before any intentional reset. `data/`, SQLite files, and sidecars are ignored by Git. Tests create and remove their own OS temporary files.

The persistence helpers include expiry cleanup that retains quotes referenced by orders; no scheduled cleanup job is configured. Menu reads, persisted quotes, unique order key/quote constraints, and persisted stream revisions share this database. See [T03 verification](docs/tasks/t03-implement-schema-migrations-and-seeds.md#verification) for demonstrated persistence behavior.

## Menu configuration and queries

Main navigation is in the header. The compact bottom-right connection dot opens details; browser offline events and failed sync reads immediately change its state. The dot pulses orange when connected and stays still when offline. The status line at the bottom shows when data was last loaded or successfully checked with the backend, outstanding menu reads, and offline/waiting states. Settings list pages have breadcrumbs; orders use distinct status colors plus text. Decorative icons use the [official Tabler webfont](https://github.com/tabler/tabler-icons/tree/main/packages/icons-webfont), pinned to 3.44.0 through one CDN stylesheet link. Text labels remain available if the CDN cannot load.

The small demo contains six categories with six dishes each and twelve [locally served Pexels images](apps/backend/src/assets/images/README.md). Food images live in `apps/backend/src/assets/images/` and are served by `GET /api/images/:filename`. Set `IMAGE_DIRECTORY` to an alternate trusted directory. The endpoint accepts flat lowercase JPG/PNG/WebP filenames, rejects traversal and encoded separators, and opens files without following symlinks. Production backend builds and containers include these assets. Item editors accept `/api/images/` paths or HTTPS image URLs; existing `/images/` values are normalized in API responses. All generated entity IDs use random UUID v4. On startup/migration, previous predictable demo IDs are replaced transactionally, including foreign keys and quote references; staff edits and order totals are preserved. The legacy small demo is expanded once, without resetting staff changes. Old saved carts retain their entries and flag old IDs as removed so customers can re-add those dishes; pending checkout recovery keys are retained.

Menu loads the complete active catalog from `GET /api/menu/catalog` in one consistent snapshot. Search, category selection and pagination run locally and make no API calls. Categories always remain visible, with full-catalog availability counts. Desktop has a category sidebar and photo grid; mobile has a horizontal category strip below the title. The search cross clears only the search, and empty results show a full-width message with a clear-search action. All data pages use the same title/refresh component, with the tooltip-labelled icon immediately after the title. Child pages use plain-text breadcrumbs; Menu, Orders and Settings omit breadcrumbs. Live menu events and reconnect/focus checks refresh the snapshot while preserving local filters.

Every dish opens an **Add to cart** or **Edit in cart** dialog. Open-price dishes have matching price/quantity steppers on one row, price first. Kitchen comments (up to 500 characters) start behind Add/Edit comment and can be removed/hidden. Existing lines expose **Delete from cart**; deletion and zero quantity use the same confirmation. Zero on a new line closes without adding it. The cart footer shows up to three circular images, dish names, total quantity, estimate and problems, plus View cart and icon-only Clear cart. On mobile, the header offers a menu button, logo and cart icon; the left overlay drawer contains all four navigation links.

Cart lines place the dish title beside its image and quantity controls on the right where space permits. Comments can be added/edited in a simple dialog and survive tab reloads; confirmed orders retain immutable comments. Discounts live in an expandable section, and a nonzero discount appears between estimated subtotal/total. Availability/archive/input errors are red; price and pricing-type changes are orange and block checkout until **OK**. Name/image changes apply silently. Acknowledging open→fixed uses the new fixed price; fixed→open exposes a unit price to review before OK. Accepted prices persist separately from current metadata so unacknowledged warnings survive reload. **Confirm order** checks authoritative prices/availability and places the order in one click. It still uses the persisted five-minute quote and original idempotency key internally. Cart/menu changes during checking stop placement; uncertain placement retains the key for lookup or explicit same-request retry. A 404 lookup never starts a new attempt. Pending placement freezes cart edits. Storage limitations remain visible.

Settings links to Categories and Items. Editing dialogs keep a red archive section separate from Save. Destructive confirmation dialogs use normal content with a red primary action. Cart items show images, a black top-right remove icon, red error backgrounds and checkout blocker messages. API actions show loading feedback, while local menu search/pagination do not. Cart reconciliation uses `POST /api/menu/resolve` for up to 100 distinct IDs, including unavailable, archived and missing items.

Settings loads all categories and items in one coherent `GET /api/setup/catalog` snapshot. Item search, category filtering and pagination run locally without API calls. Available and Unavailable sections start expanded; Archived starts collapsed. Categories retain a local **Show archived records** checkbox. Icon refresh buttons sit beside both page titles. Create/edit uses the existing Setup endpoints and `expectedRevision`.

Items follow **Available ↔ Unavailable ↔ Archived**. Save an item as unavailable before archiving it; a combined disable/archive request is rejected. Expand **Archived items**, select **Restore**, and confirm to restore an item as **Unavailable**, then enable availability separately. Categories use **Show archived records → Restore**; restoring a category leaves individually archived items archived. An archived category still blocks ordering. Archive uses `archived: true`; restore uses `archived: false`. No database migration is needed, and existing orders retain their snapshots.

Item names on Menu, Cart, Items and order lines link to `/items/:id`, showing current details even for archived items. Item breadcrumbs use Settings > Items > current name; colored/icon state badges distinguish Available, Unavailable and Archived, and Edit opens the existing update dialog for active records. Related orders use `GET /api/orders?itemId=:id&page=&pageSize=`, match the item ID independently of later names/prices, and update live. `GET /api/items/:id` returns the item/category and matching menu revision. Menu and management browsing use the complete catalog snapshots.

Writes persist entity/menu revisions atomically and reject stale edits with `409 REVISION_CONFLICT`. No-op writes preserve revisions. Fixed pricing writes include `pricingMode: "fixed"` and integer `priceMinor`; open pricing writes send `pricingMode: "open"` with no price. See [contracts](docs/contracts.md#2-http-surface) for request details and [T05 verification](docs/tasks/t05-implement-menu-configuration-and-query-apis.md#verification) for demonstrated behavior.

`POST /api/checkout/quotes` accepts cart lines and an integer-cent discount, recalculates prices from the current menu, and returns 201 with a persisted five-minute review snapshot and visible observed-value changes. Invalid carts receive line-specific issues; quoting creates no order or inventory reservation. See [T06 verification](docs/tasks/t06-implement-authoritative-checkout-quotes.md#verification).

## Orders and recovery

Confirm a reviewed quote with `POST /api/orders`, JSON `{ "quoteId": "<UUID>" }`, and a UUID `Idempotency-Key` header. First creation returns 201; retries of the same key/payload return 200 with the same order and its current status. A different payload with that key returns `409 IDEMPOTENCY_CONFLICT`; another key for an already consumed quote returns `409 QUOTE_USED` with the existing order ID. Any menu revision change or quote expiry requires review again for an uncommitted attempt. Committed attempts remain replayable after expiry, menu edits, and restart.

Recover a committed result using `GET /api/orders/by-request/:idempotencyKey`. A 404 means no committed result was found in that read; an in-flight attempt may still commit, so retain the original key and payload for retries. List orders with `GET /api/orders?status=&page=&pageSize=` (newest first, default 50, maximum 100), and read immutable line/price snapshots with `GET /api/orders/:id`. Order responses include the matching persisted `ordersRevision` and disable caching.

Use `PATCH /api/orders/:id/status` with `{ "status": "preparing", "expectedRevision": 1 }`. The graph is placed → preparing → ready → completed; cancellation is allowed only from placed or preparing. Stale revisions and invalid transitions return 409 without changing state. Current-status requests at the current revision are no-ops. Creation/status changes update the order stream atomically and broadcast committed notification data. The Orders page provides status filters, bounded pagination, up to three overlapping immutable item image snapshots, and revision-checked inline status dropdowns. Order links/details display the first eight ID characters. The same reusable image stack renders the menu cart footer. Order item titles sit beside images and comments use the Comment: prefix. Open an order for its item images, immutable line prices, quantities, totals, and timestamped lifetime timeline, then use the permitted kitchen actions. Cancellation requires confirmation. Order creation and each successful status change persist a history entry in the same transaction. Older orders show only known placement/latest timestamps and flag missing history. New order lines retain the image URL at placement; older lines receive the available menu image during migration. Failed or stale staff actions retain order details and offer a fresh read before another write; mutations are never automatically retried. Realtime changes refresh list membership/counts and details, with reconnect/focus reconciliation. See [T07 verification](docs/tasks/t07-implement-idempotent-orders-and-status-transitions.md#verification) and [T13 verification](docs/tasks/t13-implement-orders-ui-and-manual-statuses.md#verification).

## Realtime and synchronization

Socket.IO server and client are both pinned to **4.8.4**, using the same-origin `/socket.io` path. One server shares the Express HTTP listener, supporting HTTP polling and WebSocket upgrades. Register listeners before connecting. Every connection, including recovered sessions, receives `sync.state` with persisted `{ menuRevision, ordersRevision }`. Committed Settings writes broadcast `menu.changed`; committed order creation/status changes broadcast `orders.changed` to all connected clients. Failures, no-op writes, and idempotent replays emit nothing. Socket events never accept domain writes.

`GET /api/sync` returns both persisted revisions in one SQLite read and disables caching. Clients compare stream revisions and refetch authoritative HTTP snapshots to repair missed or duplicate notifications. In-memory connection recovery defaults to two minutes; `SOCKET_RECOVERY_MS=0` disables it. Recovery cannot survive a backend restart, while SQLite revisions do. The Angular singleton socket service tracks highest revisions, checks on reconnect/focus/every 15 seconds, and invalidates active feature stores. Cancelled or obsolete HTTP responses cannot replace newer query/revision state; failed refreshes retain displayed content and provide retry controls. The connection indicator opens a keyboard-accessible details dialog. Settings forms retain drafts through validation, network failures, and revision conflicts. Conflict recovery explicitly reloads the latest record for review before resubmission; live list updates never change an open editor’s expected revision. Archive dialogs explain removal from Menu and ordering eligibility. See [T10 verification](docs/tasks/t10-implement-setup-ui.md#verification). See [T09 verification](docs/tasks/t09-implement-angular-shell-and-client-adapters.md#verification). See [T08 verification](docs/tasks/t08-implement-socket-io-and-revision-synchronization.md#verification) for real-client, rollback, restart, event-loss, and browser proxy evidence.

## Backend lifecycle and health

The backend validates settings before opening SQLite or binding HTTP. All settings are optional:

| Setting | Default | Accepted values |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | IP address or hostname; use `0.0.0.0` for a container. |
| `PORT` | `3000` | Integer 1–65,535. |
| `DATABASE_PATH` | `data/restaurant.sqlite` | Nonempty file path or `:memory:`. |
| `SEED_MODE` | `small` | `none`, `small`, or `large`. |
| `JSON_BODY_LIMIT_BYTES` | `65536` | Integer 1–1,048,576. |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Integer 1–60,000. |
| `SOCKET_RECOVERY_MS` | `120000` | Integer 0–120,000 milliseconds; 0 disables in-memory connection recovery. |

`GET /api/health/live` returns `200 {"status":"live"}` while the process serves HTTP. `GET /api/health/ready` returns `200 {"status":"ready"}` after migration/initialization and a successful database probe, or a retryable `503` when the database is inaccessible, initialization records are missing, or shutdown has begun. Health responses disable caching. Configuration, migration, and listener failures log their startup stage and exit unsuccessfully.

Every Express response includes a generated UUID `X-Request-Id`; client-supplied IDs are ignored. Errors use the shared error envelope with that same ID. Unknown endpoints return JSON `404`; malformed/oversized JSON and schema validation failures return `400 VALIDATION_ERROR`. JSON compression is disabled. SQLite busy/locked errors, including wrapped driver errors, return `503 SERVICE_UNAVAILABLE`, `Retry-After: 1`, and `retryAfterMs: 1000`. Unexpected errors return a generic `500`; correlated internal diagnostics stay in server logs. No cross-origin grants are enabled; browsers use the frontend proxy.

SIGINT/SIGTERM stop HTTP/socket intake, reject new work on remaining connections, drain active HTTP requests, close Socket.IO clients and recovery resources, then close SQLite. The shutdown deadline forces remaining HTTP/upgraded connections closed and reports failure. See [T04 verification](docs/tasks/t04-implement-express-lifecycle-and-common-errors.md#verification) and [T08 verification](docs/tasks/t08-implement-socket-io-and-revision-synchronization.md#verification) for test evidence.

## Workspace and toolchain

| Project | Location | Allowed workspace imports |
| --- | --- | --- |
| `frontend` | `apps/frontend` | `contracts` |
| `backend` | `apps/backend` | `contracts` |
| `contracts` | `libs/contracts` | Other shared code; runtime dependencies limited to Zod/tslib. |
| `frontend-e2e` | `apps/frontend-e2e` | Frontend/shared code. |

Import shared code through `@restaurant-ordering/contracts`. Nx tags enforce project boundaries; ESLint also rejects Node builtins, backend paths, and database packages in browser/shared source. Contracts export Zod **4.6.7** schemas, inferred DTOs, exact decimal parsing and safe integer money helpers, order status rules, concrete errors, and typed socket event maps. See the [contract reference](docs/contracts.md) and [T02 verification](docs/tasks/t02-define-shared-runtime-contracts.md#verification). App TypeScript source roots include the shared source library; Vitest resolves the same alias.

Exact direct dependency versions live in `package.json`; `pnpm-lock.yaml` pins transitive dependencies. The resolved toolchain is Angular/CLI/Material/CDK **22.2.3**, Nx and all `@nx/*` packages **23.3.0**, NgRx Signals **22.0.1**, TypeScript **6.0.3**, RxJS **7.8.2**, Express **5.3.0**, Vitest **5.0.5**, Playwright **1.64.1**, ESLint **10.13.0**, and better-sqlite3 **13.0.3**. Installation enforces engines and strict peers. `pnpm-workspace.yaml` explicitly allows only the required dependency build scripts.

The verified production frontend initial bundle is **568.68 kB raw / 143.64 kB estimated transfer**, with lazy feature routes. It exceeds the 550 kB warning budget by **18.68 kB** and stays below the unchanged 600 kB error budget. Per-component stylesheet warning/error limits are 4/8 kB. See [T15 measurements](docs/tasks/t15-complete-reliability-performance-and-ci-verification.md#production-large-menu-measurements) for the production performance profile and limits.

## Two-browser demonstration

Use the default small seed on a fresh database, or create the named items below in Settings if using an existing database. Open two independent browser profiles/windows at the same frontend origin: staff **A** at `/setup`, customer **B** at `/menu`. Keep B open throughout; do not duplicate its tab to create another cart.

1. In A, edit **Soup** to fixed price **3.00**, available; keep **Seasonal special** open-price and available. Use the local Search items field to locate each item in Settings. In B, search for Soup, add quantity **2**, then search for Seasonal special and add quantity **1** at **5.00**. Open Add a discount and enter **1.00**. The cart estimate is **10.00 USD**.
2. In A, change Soup to **4.00** and save. B's Menu updates live; the cart retains intent and flags the change. No order exists until B selects Confirm order; its internal backend check will calculate **12.00 USD** (8.00 + 5.00 − 1.00).
3. Before confirming, turn off **Available for ordering** for Soup in A and save. Unavailable Soup disables Confirm order and explains why. Restore availability in A, then check the current cart lines and continue.
4. Select **Confirm order** once, and the app opens the confirmed order. Reload that detail URL: the same order remains. In A, open Orders, locate that ID, open it, and use **Start preparing**, **Mark ready**, then **Complete order**. B sees each status live. Orders retain their original names/prices if Settings changes later. Cancellation is available only while placed or preparing.
5. For connection recovery with Docker, return B to Menu and add Soup to a new cart. Run `docker compose stop backend`. The connection indicator reports disconnection; cached content and cart remain. Run `docker compose up -d backend`: the indicator reconnects and HTTP reads reconcile. The previous order remains in Orders. `docker compose up -d --force-recreate backend` also preserves it. For local development, stop with Ctrl+C and restart `pnpm dev` using the same database path.
6. Optional editor conflict: open the same item's edit dialog in both A and B before either saves. Save a change in A, then save a different draft in B. B retains its input and reports a revision conflict. **Reload latest values** explicitly replaces the draft; review before saving again.

A real commit followed by a lost HTTP response requires controlled fault injection. The [checkout E2E](apps/frontend-e2e/src/checkout.spec.ts) commits before aborting the response, reloads the pending checkout, and verifies same-key recovery creates one order. If the UI shows **Pending checkout**, use **Check order outcome** or **Retry same checkout**; keep its recovery key and frozen payload. A missing lookup does not prove the original request cannot still commit. The [reliability E2E](apps/frontend-e2e/src/reliability.spec.ts) demonstrates committed changes with deliberately omitted broadcasts, repaired by normal periodic/focus synchronization. These test controls are excluded from production.

## Decisions and deliberate simplifications

- **Single backend and local SQLite:** short synchronous transactions and unique key/quote constraints make confirmation atomic and persistent without another service. One writer and local disk suit this prototype; horizontal replicas and shared network filesystems need a different persistence/deployment design.
- **HTTP writes and Socket.IO hints:** clients always recover authoritative snapshots using persisted revisions. This keeps reconnect/restart behavior explicit without a durable broker/outbox. Lost notifications can delay freshness by the 15-second sync interval plus request time.
- **Conservative checkout:** every menu revision change invalidates outstanding uncommitted quotes, even for unrelated items. Quotes expire after five minutes and reserve no stock. Persistent idempotency protects retries of the same attempt; a deliberately new quote/key can create another order.
- **Integer USD cents:** fixed/open prices and fixed discounts use exact validation and safe arithmetic. Zero totals are allowed; taxes, tips, currency conversion, payments/refunds, and inventory counts are outside scope.
- **Per-tab cart:** validated session storage preserves drafts and unresolved attempts across reloads. It does not provide accounts, cross-device carts, or recovery after the tab/storage is lost. Staff statuses are manual; no kitchen automation is included.
- **Bounded client rendering:** server pagination (50 by default, 100 maximum), debounced search, lazy routes, and page scrolling keep a 5,000-item menu usable. Images are lazy-loaded backend stock photos; uploads, SSR and virtual scrolling are deferred. NgRx SignalStore keeps feature state compact; Nx adds tooling in exchange for enforced boundaries and shared checks.
- **Shared demonstration access:** no authentication, authorization, customer ownership, delivery details, or tenant isolation. Archives retain historical data; category/item restoration is available in Settings.

## Production follow-up

Before public use, add staff roles and customer order ownership, TLS and protected network ingress, abuse/rate limits, secret management, and security review. Define payment, stock reservation, cancellation/refund, tax, and privacy/retention policies before extending checkout.

Add monitored backups with demonstrated restores, migration rollback/recovery procedures, storage capacity alerts, structured metrics/tracing and operational alerts, and a durable notification/outbox strategy if delivery guarantees require it. Load-test expected traffic and contention before choosing database scaling or multiple replicas. Address the bundle warning and validate accessibility, physical low-end phones, other browser engines, and Linux AMD64. CI is configured, but a hosted run and external deployment have not been demonstrated.

## Validation and handoff

[T15](docs/tasks/t15-complete-reliability-performance-and-ci-verification.md#verification) records the 2026-10-18 application baseline: **119 frontend + 320 backend + 75 contract tests**, both production builds, **19 Chromium E2E scenarios**, **2 large-menu scenarios**, and the isolated two-service Docker smoke test passed. Its emulated mobile profile measured 54.6 ms Add feedback, CLS 0.0789, and 50 rendered rows; normal local live changes appeared within 31 ms and omitted broadcasts recovered in about 15 seconds. These are lab samples, not field guarantees. [T16](docs/tasks/t16-complete-readme-and-handoff.md#verification) records fresh handoff validation separately.

The repository preserves incremental local commits for contracts/persistence, APIs, safe checkout, realtime, frontend flows, deployment, and verification (`git log --oneline`). Publication, pushing, and external deployment are separate actions and have not been performed for this handoff. [Documentation](docs/README.md) links the original assignment, implementation plan, architecture, contracts, and task evidence.
