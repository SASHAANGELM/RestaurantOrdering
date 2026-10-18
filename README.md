# Restaurant Ordering

Integrated Nx workspace for an Angular frontend, Express backend, framework-neutral contracts library, and Playwright E2E project. **T01–T06 are implemented.** The frontend currently serves a workspace placeholder; the backend provides SQLite persistence, validated configuration, health checks, common errors, graceful shutdown, menu configuration/query APIs, and authoritative checkout quotes. Order confirmation, ordering, realtime behavior, and Docker deployment are later [tasks](docs/tasks.md).

## Local development

Use **Node.js 24.22.0** (`.nvmrc` / `.node-version`) and **pnpm 12.14.0**. With a Node version manager, select the repository version first (`nvm install && nvm use` for nvm). Install pnpm if needed with `npm install --global pnpm@12.14.0`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://127.0.0.1:4200>. The backend listens on <http://127.0.0.1:3000/api> and responds with `{"name":"Restaurant Ordering API"}`. Angular proxies relative `/api` and `/api/**` requests to that backend. `/socket.io` and `/socket.io/**` also have HTTP/WebSocket proxy configuration ready for T08. Stop both apps with Ctrl+C. No environment file is needed. Before listening, the backend creates `data/restaurant.sqlite`, applies checked-in migrations, and seeds a small demo menu only if the database is empty and has never been initialized.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Watch and serve frontend and backend together. |
| `pnpm lint` | ESLint, Angular template accessibility, and Nx import boundaries. |
| `pnpm typecheck` | Strict TypeScript for all four projects, plus Angular template checking. |
| `pnpm test` | Contract/money boundaries, browser/server contract consumers, isolated persistence, menu API/service, and HTTP/lifecycle tests. |
| `pnpm build` | Production frontend/backend builds and contracts declarations in `dist/`. |
| `pnpm check` | Lint, typecheck, test, and build sequentially. |
| `pnpm e2e` | Chromium smoke test using its own frontend/backend servers. Stop `pnpm dev` first. |
| `pnpm verify:native` | Exercise better-sqlite3 in memory and print runtime/driver compatibility. |
| `pnpm db:generate` | Generate a reviewed SQL migration after changing the Drizzle schema. |
| `pnpm db:check` | Check the migration history for collisions. |
| `pnpm db:migrate` | Build the backend and apply pending migrations without seeding. |
| `pnpm db:seed:small` | Migrate and seed 4 categories / 12 items in a fresh database. |
| `pnpm db:seed:large` | Migrate and seed 50 categories / 5,000 items in a fresh database. |

Every implementation task must pass **both app unit-test targets and both production builds** before completion. This requirement is recorded in [AGENTS.md](AGENTS.md); `pnpm check` runs those checks along with lint, strict typechecking, and shared contract tests.

Before the first E2E run, download Chromium with `pnpm exec playwright install chromium` (Linux CI may need `--with-deps`). E2E verifies that Angular renders in a real browser and that `/api` reaches Express through the frontend origin. Its backend uses an isolated in-memory database with seeding disabled. Reports go to ignored `playwright-report/` and `test-results/` directories.

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

The persistence helpers include expiry cleanup that retains quotes referenced by orders. T05 implements menu HTTP APIs and shared item/category eligibility reads; T06 implements persisted quote preparation. Quote confirmation, order APIs, status rules, and realtime broadcasts remain later tasks; the schema supplies their constraints and storage. See [T03 verification](docs/t03-verification.md) for demonstrated persistence behavior.

## Menu configuration and queries

Use `GET /api/menu/categories`, `GET /api/menu/items`, and `POST /api/menu/resolve` for browsing and cart refresh. Item queries support `categoryId`, literal name `search`, `page`, and `pageSize` (default 50, maximum 100). Resolution accepts `{ "itemIds": ["<UUID>"] }` for up to 100 distinct items, including off-page, unavailable, archived, and missing entries.

Setup exposes category/item list and creation at `/api/setup/categories` and `/api/setup/items`; edit/archive with `PATCH /api/setup/categories/:id` or `/api/setup/items/:id`, including `expectedRevision`. Lists hide archived entities by default; `includeArchived=true` includes them. Setup retains items under archived categories for management, while Menu excludes them from ordering eligibility. An archive sends `archived: true`; unarchiving is outside scope.

Writes persist entity/menu revisions atomically and reject stale edits with `409 REVISION_CONFLICT`. No-op writes preserve revisions. Fixed pricing writes include `pricingMode: "fixed"` and integer `priceMinor`; open pricing writes send `pricingMode: "open"` with no price. See [contracts](docs/contracts.md#2-http-surface) for request details and [T05 verification](docs/t05-verification.md) for demonstrated behavior.

`POST /api/checkout/quotes` accepts cart lines and an integer-cent discount, recalculates prices from the current menu, and returns 201 with a persisted five-minute review snapshot and visible observed-value changes. Invalid carts receive line-specific issues; quoting creates no order or inventory reservation. See [T06 verification](docs/t06-verification.md). Order confirmation and realtime delivery remain later tasks.

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

`GET /api/health/live` returns `200 {"status":"live"}` while the process serves HTTP. `GET /api/health/ready` returns `200 {"status":"ready"}` after migration/initialization and a successful database probe, or a retryable `503` when the database is inaccessible, initialization records are missing, or shutdown has begun. Health responses disable caching. Configuration, migration, and listener failures log their startup stage and exit unsuccessfully.

Every Express response includes a generated UUID `X-Request-Id`; client-supplied IDs are ignored. Errors use the shared error envelope with that same ID. Unknown endpoints return JSON `404`; malformed/oversized JSON and schema validation failures return `400 VALIDATION_ERROR`. JSON compression is disabled. SQLite busy/locked errors, including wrapped driver errors, return `503 SERVICE_UNAVAILABLE`, `Retry-After: 1`, and `retryAfterMs: 1000`. Unexpected errors return a generic `500`; correlated internal diagnostics stay in server logs. No cross-origin grants are enabled; browsers use the frontend proxy.

SIGINT/SIGTERM stop HTTP intake, reject new work on remaining connections, wait for active HTTP requests and registered socket cleanup, then close SQLite. The shutdown deadline forces remaining HTTP/upgraded connections closed and reports failure. The Socket.IO lifecycle attachment is ready for T08; no realtime server runs yet. See [T04 verification](docs/t04-verification.md) for test evidence.

## Workspace and toolchain

| Project | Location | Allowed workspace imports |
| --- | --- | --- |
| `frontend` | `apps/frontend` | `contracts` |
| `backend` | `apps/backend` | `contracts` |
| `contracts` | `libs/contracts` | Other shared code; runtime dependencies limited to Zod/tslib. |
| `frontend-e2e` | `apps/frontend-e2e` | Frontend/shared code. |

Import shared code through `@restaurant-ordering/contracts`. Nx tags enforce project boundaries; ESLint also rejects Node builtins, backend paths, and database packages in browser/shared source. Contracts export Zod **4.6.7** schemas, inferred DTOs, exact decimal parsing and safe integer money helpers, order status rules, concrete errors, and typed socket event maps. See the [contract reference](docs/contracts.md) and [T02 verification](docs/t02-verification.md). App TypeScript source roots include the shared source library; Vitest resolves the same alias.

Exact direct dependency versions live in `package.json`; `pnpm-lock.yaml` pins transitive dependencies. The resolved toolchain is Angular/CLI/Material/CDK **22.2.3**, Nx and all `@nx/*` packages **23.3.0**, NgRx Signals **22.0.1**, TypeScript **6.0.3**, RxJS **7.8.2**, Express **5.3.0**, Vitest **5.0.5**, Playwright **1.64.1**, ESLint **10.13.0**, and better-sqlite3 **13.0.3**. Installation enforces engines and strict peers. `pnpm-workspace.yaml` explicitly allows only the required dependency build scripts.

The placeholder production frontend totals **93.65 kB raw / 28.34 kB estimated transfer**. Angular enforces initial bundle warning/error limits of **350/500 kB** and per-component stylesheet limits of **4/8 kB**. These are a foundation baseline; measure again when Material and feature routes are implemented.

See [T01 verification](docs/t01-verification.md) for compatibility sources, actual checks, and native-driver results. [Architecture and backlog](docs/README.md) describe the remaining work. Docker startup becomes available in T14.
