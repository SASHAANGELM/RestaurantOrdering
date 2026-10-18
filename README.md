# Restaurant Ordering

Integrated Nx workspace for an Angular frontend, Express backend, framework-neutral contracts library, and Playwright E2E project. **T01 is implemented.** The apps currently serve workspace placeholders; ordering workflows, database setup, realtime behavior, and Docker deployment are later [tasks](docs/tasks.md).

## Local development

Use **Node.js 24.22.0** (`.nvmrc` / `.node-version`) and **pnpm 12.14.0**. With a Node version manager, select the repository version first (`nvm install && nvm use` for nvm). Install pnpm if needed with `npm install --global pnpm@12.14.0`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://127.0.0.1:4200>. The backend listens on <http://127.0.0.1:3000/api> and responds with `{"name":"Restaurant Ordering API"}`. Angular proxies relative `/api` and `/api/**` requests to that backend. `/socket.io` and `/socket.io/**` also have HTTP/WebSocket proxy configuration ready for T08. Stop both apps with Ctrl+C. No environment file or database is needed for T01.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Watch and serve frontend and backend together. |
| `pnpm lint` | ESLint, Angular template accessibility, and Nx import boundaries. |
| `pnpm typecheck` | Strict TypeScript for all four projects, plus Angular template checking. |
| `pnpm test` | Vitest targets; reports empty feature suites explicitly. |
| `pnpm build` | Production frontend/backend builds and contracts declarations in `dist/`. |
| `pnpm check` | Lint, typecheck, test, and build sequentially. |
| `pnpm e2e` | Chromium smoke test using its own frontend/backend servers. Stop `pnpm dev` first. |
| `pnpm verify:native` | Exercise better-sqlite3 in memory and print runtime/driver compatibility. |

Before the first E2E run, download Chromium with `pnpm exec playwright install chromium` (Linux CI may need `--with-deps`). E2E verifies that Angular renders in a real browser and that `/api` reaches Express through the frontend origin. Reports go to ignored `playwright-report/` and `test-results/` directories.

No domain unit tests exist yet. Backend/contracts Vitest configurations allow empty suites. Angular's builder rejects an empty suite, so the frontend test command reports the empty state and automatically invokes `frontend:test-angular` once `src/**/*.spec.ts` or `src/**/*.test.ts` exists. Feature tests belong with their implementation tasks.

## Workspace and toolchain

| Project | Location | Allowed workspace imports |
| --- | --- | --- |
| `frontend` | `apps/frontend` | `contracts` |
| `backend` | `apps/backend` | `contracts` |
| `contracts` | `libs/contracts` | Other shared code; runtime dependencies limited to Zod/tslib. |
| `frontend-e2e` | `apps/frontend-e2e` | Frontend/shared code. |

Import shared code through `@restaurant-ordering/contracts`. Nx tags enforce project boundaries; ESLint also rejects Node builtins, backend paths, and database packages in browser/shared source. Contracts currently export an empty module; runtime schemas start in T02. Vitest uses TypeScript path resolution for future contracts imports.

Exact direct dependency versions live in `package.json`; `pnpm-lock.yaml` pins transitive dependencies. The resolved toolchain is Angular/CLI/Material/CDK **22.2.3**, Nx and all `@nx/*` packages **23.3.0**, NgRx Signals **22.0.1**, TypeScript **6.0.3**, RxJS **7.8.2**, Express **5.3.0**, Vitest **5.0.5**, Playwright **1.64.1**, ESLint **10.13.0**, and better-sqlite3 **13.0.3**. Installation enforces engines and strict peers. `pnpm-workspace.yaml` explicitly allows only the required dependency build scripts.

The placeholder production frontend totals **93.65 kB raw / 28.34 kB estimated transfer**. Angular enforces initial bundle warning/error limits of **350/500 kB** and per-component stylesheet limits of **4/8 kB**. These are a foundation baseline; measure again when Material and feature routes are implemented.

See [T01 verification](docs/t01-verification.md) for compatibility sources, actual checks, and native-driver results. [Architecture and backlog](docs/README.md) describe the remaining work. Docker startup becomes available in T14.
