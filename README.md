# Restaurant Ordering

Integrated Nx workspace for an Angular frontend, Express backend, framework-neutral contracts library, and Playwright E2E project. The frontend provides a lazy Material shell, validated HTTP adapters, NgRx SignalStores, one shared socket, visible synchronization/recovery, Setup forms with archive/conflict recovery, and a paged Menu with a persistent per-tab cart, open prices, discounts, live estimates, and explicit quote review/confirmation with persisted checkout recovery. The backend provides SQLite persistence, health/lifecycle handling, menu APIs, authoritative quotes, idempotent orders/recovery, manual statuses, and persisted revision synchronization. See the [task index](docs/tasks/README.md) for implementation and verification status.

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

Use **Node.js 24.22.0** (`.nvmrc` / `.node-version`) and **pnpm 12.14.0**. With a Node version manager, select the repository version first (`nvm install && nvm use` for nvm). Install pnpm if needed with `npm install --global pnpm@12.14.0`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://127.0.0.1:4200>. The backend listens on <http://127.0.0.1:3000/api> and responds with `{"name":"Restaurant Ordering API"}`. Angular proxies relative `/api` and `/api/**` requests to that backend. `/socket.io` and `/socket.io/**` proxy HTTP polling and WebSocket upgrades to the same backend listener. Stop both apps with Ctrl+C. No environment file is needed. Before listening, the backend creates `data/restaurant.sqlite`, applies checked-in migrations, and seeds a small demo menu only if the database is empty and has never been initialized.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Watch and serve frontend and backend together. |
| `pnpm lint` | ESLint, Angular template accessibility, and Nx import boundaries. |
| `pnpm typecheck` | Strict TypeScript for all four projects, plus Angular template checking. |
| `pnpm test` | Contract/money boundaries, browser/server contract consumers, isolated persistence, menu/checkout/order API/service, realtime/sync, and HTTP/lifecycle tests. |
| `pnpm build` | Production frontend/backend builds and contracts declarations in `dist/`. |
| `pnpm check` | Lint, typecheck, test, and build sequentially. |
| `pnpm e2e` | Chromium Menu/cart/checkout recovery, Setup forms, Orders filters/statuses/conflicts/pagination, shell/API, keyboard/focus, live-store/offline recovery, deep-link, and two-context realtime proxy tests using their own frontend/backend servers. Stop `pnpm dev` first and run after builds finish. |
| `pnpm exec playwright test --config apps/frontend-e2e/playwright.large.config.ts` | Production 5,000-item menu paging/search plus 4× CPU, 150 ms latency, 1.6 Mbps download / 750 Kbps upload mobile performance checks. |
| `pnpm docker:smoke` | Build and verify the production Compose deployment in an isolated project and disposable database volume; requires Docker and Playwright Chromium. |
| `pnpm verify:native` | Exercise better-sqlite3 in memory and print runtime/driver compatibility. |
| `pnpm db:generate` | Generate a reviewed SQL migration after changing the Drizzle schema. |
| `pnpm db:check` | Check the migration history for collisions. |
| `pnpm db:migrate` | Build the backend and apply pending migrations without seeding. |
| `pnpm db:seed:small` | Migrate and seed 4 categories / 12 items in a fresh database. |
| `pnpm db:seed:large` | Migrate and seed 50 categories / 5,000 items in a fresh database. |

Every implementation task must pass **both app unit-test targets and both production builds** before completion. This requirement is recorded in [AGENTS.md](AGENTS.md); `pnpm check` runs those checks along with lint, strict typechecking, and shared contract tests.

Before the first E2E run, download Chromium with `pnpm exec playwright install chromium` (Linux CI may need `--with-deps`). E2E verifies that Angular renders in a real browser, `/api` reaches Express through the frontend origin, and two independent browser contexts receive committed notifications through polling and WebSocket upgrade proxies. Both browser suites serve the optimized production Angular build through a test-only Vite preview proxy. Their test backend hardcodes an isolated in-memory database, ignores development database settings, and never reuses an existing server. Standard E2E disables seeding; `pnpm exec playwright test --config apps/frontend-e2e/playwright.large.config.ts` seeds a separate 5,000-item database. One worker and zero retries make shared-fixture mutations deterministic. Run suites sequentially with ports 3000/4200 free. The Menu results panel keeps a stable height during loading/filtering and supports keyboard scrolling alongside server pagination. Reports and JSON timing measurements go to ignored `playwright-report/` and `test-results/` directories. The omitted-broadcast fixture entry point is excluded from the production backend bundle; the container smoke test verifies its control routes return 404. See [T15 verification](docs/tasks/t15-complete-reliability-performance-and-ci-verification.md#verification) for actual results.

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

The persistence helpers include expiry cleanup that retains quotes referenced by orders. T05 implements menu HTTP APIs and shared item/category eligibility reads; T06 implements persisted quote preparation; T07 implements quote confirmation, order APIs, and status rules using the schema's unique key/quote constraints. T08 broadcasts committed changes and exposes persisted revisions for recovery. See [T03 verification](docs/tasks/t03-implement-schema-migrations-and-seeds.md#verification) for demonstrated persistence behavior.

## Menu configuration and queries

The Menu page browses bounded server pages with 250 ms debounced search and category filters. Add quantities or choose an open unit price, edit cart lines, and apply a fixed USD discount. Cart drafts survive navigation/reload in their tab, while corrupt or unavailable session storage produces a recovery notice. Menu changes resolve all cart items, including off-page lines, and visibly mark changed prices or ordering eligibility without deleting intent. Estimates retain the prices originally added. Review order retrieves the authoritative snapshot and visible changes; Confirm order is a separate action. Cart/menu changes and expiry require review again. Pending checkout freezes edits and saves its key/payload before submission. After an uncertain result or reload, check by key or explicitly retry the same checkout; a 404 lookup never starts another attempt. Storage limitations are visible. See [T11 verification](docs/tasks/t11-implement-menu-cart-and-large-menu-behavior.md#verification) and [T12 verification](docs/tasks/t12-implement-review-confirmation-and-recovery-ui.md#verification).

Use `GET /api/menu/categories`, `GET /api/menu/items`, and `POST /api/menu/resolve` for browsing and cart refresh. Item queries support `categoryId`, literal name `search`, `page`, and `pageSize` (default 50, maximum 100). Resolution accepts `{ "itemIds": ["<UUID>"] }` for up to 100 distinct items, including off-page, unavailable, archived, and missing entries.

Setup exposes category/item list and creation at `/api/setup/categories` and `/api/setup/items`; edit/archive with `PATCH /api/setup/categories/:id` or `/api/setup/items/:id`, including `expectedRevision`. Lists hide archived entities by default; `includeArchived=true` includes them. Setup retains items under archived categories for management, while Menu excludes them from ordering eligibility. An archive sends `archived: true`; unarchiving is outside scope.

Writes persist entity/menu revisions atomically and reject stale edits with `409 REVISION_CONFLICT`. No-op writes preserve revisions. Fixed pricing writes include `pricingMode: "fixed"` and integer `priceMinor`; open pricing writes send `pricingMode: "open"` with no price. See [contracts](docs/contracts.md#2-http-surface) for request details and [T05 verification](docs/tasks/t05-implement-menu-configuration-and-query-apis.md#verification) for demonstrated behavior.

`POST /api/checkout/quotes` accepts cart lines and an integer-cent discount, recalculates prices from the current menu, and returns 201 with a persisted five-minute review snapshot and visible observed-value changes. Invalid carts receive line-specific issues; quoting creates no order or inventory reservation. See [T06 verification](docs/tasks/t06-implement-authoritative-checkout-quotes.md#verification).

## Orders and recovery

Confirm a reviewed quote with `POST /api/orders`, JSON `{ "quoteId": "<UUID>" }`, and a UUID `Idempotency-Key` header. First creation returns 201; retries of the same key/payload return 200 with the same order and its current status. A different payload with that key returns `409 IDEMPOTENCY_CONFLICT`; another key for an already consumed quote returns `409 QUOTE_USED` with the existing order ID. Any menu revision change or quote expiry requires review again for an uncommitted attempt. Committed attempts remain replayable after expiry, menu edits, and restart.

Recover a committed result using `GET /api/orders/by-request/:idempotencyKey`. A 404 means no committed result was found in that read; an in-flight attempt may still commit, so retain the original key and payload for retries. List orders with `GET /api/orders?status=&page=&pageSize=` (newest first, default 50, maximum 100), and read immutable line/price snapshots with `GET /api/orders/:id`. Order responses include the matching persisted `ordersRevision` and disable caching.

Use `PATCH /api/orders/:id/status` with `{ "status": "preparing", "expectedRevision": 1 }`. The graph is placed → preparing → ready → completed; cancellation is allowed only from placed or preparing. Stale revisions and invalid transitions return 409 without changing state. Current-status requests at the current revision are no-ops. Creation/status changes update the order stream atomically and broadcast committed notification data. The Orders page provides status filters and bounded pagination. Open an order for its immutable line prices, quantities, subtotal, discount, and total, then use the permitted kitchen actions. Failed or stale staff actions retain order details and offer a fresh read before another write; mutations are never automatically retried. Realtime changes refresh list membership/counts and details, with reconnect/focus reconciliation. See [T07 verification](docs/tasks/t07-implement-idempotent-orders-and-status-transitions.md#verification) and [T13 verification](docs/tasks/t13-implement-orders-ui-and-manual-statuses.md#verification).

## Realtime and synchronization

Socket.IO server and client are both pinned to **4.8.4**, using the same-origin `/socket.io` path. One server shares the Express HTTP listener, supporting HTTP polling and WebSocket upgrades. Register listeners before connecting. Every connection, including recovered sessions, receives `sync.state` with persisted `{ menuRevision, ordersRevision }`. Committed Setup writes broadcast `menu.changed`; committed order creation/status changes broadcast `orders.changed` to all connected clients. Failures, no-op writes, and idempotent replays emit nothing. Socket events never accept domain writes.

`GET /api/sync` returns both persisted revisions in one SQLite read and disables caching. Clients compare stream revisions and refetch authoritative HTTP snapshots to repair missed or duplicate notifications. In-memory connection recovery defaults to two minutes; `SOCKET_RECOVERY_MS=0` disables it. Recovery cannot survive a backend restart, while SQLite revisions do. The Angular singleton socket service tracks highest revisions, checks on reconnect/focus/every 15 seconds, and invalidates active feature stores. Cancelled or obsolete HTTP responses cannot replace newer query/revision state; failed refreshes retain displayed content and provide retry controls. The connection indicator opens a keyboard-accessible details dialog. Setup forms retain drafts through validation, network failures, and revision conflicts. Conflict recovery explicitly reloads the latest record for review before resubmission; live list updates never change an open editor’s expected revision. Archive dialogs explain removal from Menu and ordering eligibility. See [T10 verification](docs/tasks/t10-implement-setup-ui.md#verification). See [T09 verification](docs/tasks/t09-implement-angular-shell-and-client-adapters.md#verification). See [T08 verification](docs/tasks/t08-implement-socket-io-and-revision-synchronization.md#verification) for real-client, rollback, restart, event-loss, and browser proxy evidence.

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

The T12 production frontend initial bundle totals **560.37 kB raw / 141.38 kB estimated transfer**, with lazy feature routes and connection dialog. This build succeeds with a **10.37 kB warning** over the existing 550 kB warning threshold; the 600 kB error limit is unchanged. See [T12 verification](docs/tasks/t12-implement-review-confirmation-and-recovery-ui.md#verification). The earlier T09 baseline was **520.72 kB raw / 132.31 kB estimated transfer**. Angular enforces initial bundle warning/error limits of **550/600 kB** and per-component stylesheet limits of **4/8 kB**. [T09 verification](docs/tasks/t09-implement-angular-shell-and-client-adapters.md#production-bundle-investigation) records the baseline, removal of unused Zod exports/locales, and the change from T01’s placeholder budgets.

See [T01 verification](docs/tasks/t01-scaffold-nx-workspace-and-quality-commands.md#verification) for compatibility sources, actual checks, and native-driver results. [Architecture and backlog](docs/README.md) describe the remaining work. [T14 verification](docs/tasks/t14-implement-two-service-docker-deployment.md#verification) records deployment checks.
