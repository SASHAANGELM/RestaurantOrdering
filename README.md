# Restaurant Ordering

Integrated Nx workspace for an Angular frontend, Express backend, framework-neutral contracts library, and Playwright E2E project. **T01–T03 are implemented.** The apps currently serve workspace placeholders; the backend now initializes SQLite persistence. Ordering workflows, realtime behavior, and Docker deployment are later [tasks](docs/tasks.md).

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
| `pnpm test` | Contract/money boundaries, browser/server contract consumers, and isolated real-file persistence tests. |
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

The persistence helpers include expiry cleanup that retains quotes referenced by orders. Quote snapshot validation, eligibility checks, HTTP APIs, status rules, and post-commit notifications are implemented in later tasks; the schema supplies their constraints and storage. See [T03 verification](docs/t03-verification.md) for demonstrated persistence behavior.

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
