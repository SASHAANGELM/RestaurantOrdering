# T03 — Implement schema, migrations, and seeds

Status: **Complete**

Depends on: [T02](t02-define-shared-runtime-contracts.md)

[Task index](README.md)

## Scope

Add Drizzle schema/migrations for categories/items, quotes, orders/lines, and persisted stream revisions. Enable foreign keys, WAL, busy timeout, checks, indexes, unique request keys, and unique quote consumption. Add explicit small/large seed modes; a 5,000-item dataset; ignored local DB paths; startup-safe demo initialization.

## Acceptance criteria

A fresh DB migrates and seeds; a second migration/seed/restart does not duplicate/overwrite data. Constraints reject invalid money and duplicate key/quote consumption. Real-file tests verify order lines survive menu archival and that data/revisions survive reopening. Quote cleanup never removes referenced records.

## Completion record

Completed 2026-10-18. See [verification results](#verification) and [database commands](../../README.md#database). Added 51 real-file persistence tests; all 128 unit tests, uncached frontend/backend builds, root quality checks, frozen install, migration checks, compiled startup/restart smoke, and existing Chromium E2E test pass.

## Verification

Verified on 2026-10-18, macOS arm64, using pinned Node **24.22.0** and pnpm **12.14.0** through the isolated npm-exec toolchain used for T01/T02. Added exact dependencies Drizzle ORM **0.45.4** and Drizzle Kit **0.31.11** with strict engine/peer settings and the existing better-sqlite3 **13.0.3** driver.

### Delivered persistence

The backend owns six Drizzle tables: categories, menu items, checkout quotes, orders, order lines, and singleton app state. The generated SQL, schema snapshot, and migration journal are committed under `apps/backend/drizzle/`. Every real-file connection enables foreign keys, WAL, and a 5-second busy timeout. Checks enforce integer safe ranges, pricing pairs, booleans, enum values, quantities, currency, revisions, and money arithmetic. Unique indexes independently protect order idempotency keys, quote consumption, and line positions. Historical line fields include category/item IDs, name snapshots, item revision, pricing mode, quantity, and price.

The connection, migration, initialization, seed, and cleanup helpers are in `apps/backend/src/db/`. Startup migrates before listening and defaults to a small demo seed; `DATABASE_PATH` and `SEED_MODE` control the database and initialization. Initialization closes the connection if migration or seeding fails. The backend build packages migration assets beside `main.cjs` and `database-cli.cjs`; startup and CLI resolve assets from their executable directory.

Small mode creates **4 categories / 12 items**; large mode creates **50 categories / 5,000 items**. IDs, names, prices, and fixture timestamps are deterministic. Both datasets include fixed/open pricing and unavailable items. Seeding uses one synchronous immediate transaction, checks for existing data/revisions, and persists a seed marker. Reruns, different requested sizes, archived menus, and intentionally emptied seeded databases are preserved without insertion or overwrite. A failure rolls back seed rows, marker, and revision together. The initial seed increments the menu stream revision to 1; ordinary app writes and notifications remain later tasks.

Quote cleanup deletes expired unreferenced quotes in one SQL statement and retains all quotes consumed by orders. Restrictive foreign keys also prevent deleting referenced quotes, menu records, and orders with lines. Quote creation/validation, order services, HTTP APIs, and automatic cleanup scheduling are outside T03. Full Express lifecycle, readiness endpoints, configuration validation, and graceful shutdown remain T04.

### Demonstrated acceptance criteria

- `pnpm install --frozen-lockfile`: passed with strict peers/engines.
- `pnpm db:check`: migration history passed; `pnpm db:generate` reported no schema changes after generating the initial migration.
- `NX_SKIP_NX_CACHE=true pnpm check`: passed lint/typecheck across all four projects, unit tests across three projects, and production builds for frontend, backend, and contracts. Both app tests and both production builds executed with caching disabled.
- **128 unit tests passed**: 75 shared contract/money cases, 1 frontend consumer case, and 52 backend cases (the existing consumer plus **51 new real-file persistence cases**).
- `pnpm db:migrate`, `pnpm db:seed:small`, and `pnpm db:seed:large`: passed on isolated temporary paths using the actual root scripts and compiled CLI. Migration alone created no menu data; rerunning each seed retained exactly 12 or 5,000 items.
- Compiled-backend smoke: launched `main.cjs` from a separate temporary working directory, verified `/api`, edited persisted menu data and both stream revisions, terminated/restarted, and verified the edits and row counts survived. This also exercised packaged migration path resolution independently of repository cwd.
- `pnpm e2e`: existing one-test Chromium smoke passed, verifying Angular rendering and the same-origin API proxy. Its backend now explicitly uses an in-memory database and disables seeding.
- `git diff --check`: passed.

Real-file cases cover fresh and repeat migration, a failed migration rolled back without partial tables or journal advancement, missing migration assets, every-connection pragmas, small/large seeding and seed rollback, no seeding over existing data, safe integer and monetary limits, zero totals, values beyond signed 32-bit, unique keys/quote use, historical snapshots after edits/archival/reopening, transactional rollback of order/lines/revisions, quote expiry boundary cleanup, foreign keys, indexes, and integrity checks. Separate lines for one item with different open prices are supported.

All persistence tests and CLI/startup smoke checks used temporary OS directories that were removed afterward; E2E used memory. No development database was created or modified. The frontend remains the workspace placeholder; its production bundle stays within the existing budgets.

The task completion rule now lives in root [AGENTS.md](../../AGENTS.md), the [README](../../README.md#commands), and the [task index](README.md): both frontend/backend unit tests and both production builds must pass before completing an implementation task. `pnpm check` includes these plus lint, typechecking, and contract tests.

Implementation references: [Drizzle generated migrations](https://orm.drizzle.team/docs/drizzle-kit-generate) and [Drizzle constraints/indexes](https://orm.drizzle.team/docs/indexes-constraints). SQLite CHECK bounds are rendered as SQL literals in generated DDL, with runtime query values still bound normally.
