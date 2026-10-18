# T01 — Scaffold Nx workspace and quality commands

Status: **Complete**

Depends on: None

[Task index](README.md)

## Scope

Create integrated Nx apps `frontend` and `backend`, framework-neutral `contracts`, and `frontend-e2e`; use pnpm with one lockfile. Resolve the latest stable Angular against Nx/NgRx/Material/TypeScript/Node peers; record exact versions. Configure strict TypeScript/template checking, ESLint import boundaries, Vitest integration, Playwright, local proxy paths, and root scripts. Initialize Git if absent and add ignores.

## Acceptance criteria

A frozen install succeeds without peer bypasses; both placeholder apps start with `pnpm dev`; `pnpm lint`, `typecheck`, `test`, and `build` run successfully. Client code cannot import backend/DB code. Record a baseline production bundle budget and native-driver compatibility. Do not add placeholder tests solely to make targets green.

## Completion record

Completed 2026-10-18. See [verification results](#verification) and the [local startup README](../../README.md).

## Verification

Verified on 2026-10-18, macOS arm64, using Node **24.22.0** and pnpm **12.14.0**. The machine's default Node was 26.12.0 and pnpm was absent; verification used an isolated npm-exec toolchain without changing system installations. Repository engine pins and version files select the intended Node 24 runtime.

### Dependency resolution

Resolved npm registry stable release tags and package peer metadata during implementation. Angular **22.2.3** was the latest stable framework release; no prereleases, peer bypasses, peer overrides, or Angular downgrades were used.

| Group | Exact versions |
| --- | --- |
| Runtime / package manager | Node 24.22.0; pnpm 12.14.0 |
| Angular framework / compiler / CLI / build / devkit / Material / CDK | 22.2.3 |
| Nx and all installed `@nx/*` packages | 23.3.0 |
| NgRx Signals / RxJS | 22.0.1 / 7.8.2 |
| TypeScript | 6.0.3 |
| Express / better-sqlite3 | 5.3.0 / 13.0.3 |
| ESLint / typescript-eslint / angular-eslint | 10.13.0 / 8.71.2 / 22.6.0 |
| Vitest / Vite / jsdom | 5.0.5 / 8.3.4 / 30.1.3 |
| Playwright | 1.64.1 |

Angular 22 requires TypeScript 6.0.x and supports the chosen Node 24 line. The published `@nx/angular@23.3.0` peers accept Angular build/devkit/schematics `>=20 <23`; `@ngrx/signals@22.0.1` accepts Angular `^22`; Material 22.2.3 accepts Angular 22. TypeScript 7 is newer but outside Angular's supported range. All Nx packages are aligned. The documentation matrix lists Angular through 22.1; the package peers and successful 22.2.3 compilation provide the concrete compatibility evidence for this patch selection.

Sources checked: [Angular compatibility](https://angular.dev/reference/versions), [Angular release policy](https://angular.dev/reference/releases), [Nx/Angular compatibility](https://nx.dev/docs/kb/angular-nx-version-matrix), [Nx plugin alignment](https://nx.dev/docs/technologies/angular/introduction), [Node release status](https://nodejs.org/en/about/previous-releases). Exact package metadata can be reproduced with `npm view <package>@<version> peerDependencies engines --json`; the complete resolved graph is in `pnpm-lock.yaml`.

### Demonstrated acceptance criteria

- `pnpm install --frozen-lockfile`: passed with strict peers and engine checks; no resolution changes.
- `pnpm dev`: started frontend at `127.0.0.1:4200` and backend at `127.0.0.1:3000`. Direct and frontend-proxied `/api` requests returned the backend's JSON; Ctrl+C stopped both servers.
- `pnpm check`: lint, typecheck, test, and production build passed. Lint/typecheck cover all four projects; build covers both apps and contracts.
- `pnpm e2e`: one Chromium integration test passed, checking browser rendering and same-origin API proxying. Tests start their own servers, refuse reuse of an existing development server, and are not cached.
- Temporary in-memory ESLint probes rejected frontend → backend imports, browser SQLite/Node imports, and Angular/Node imports in contracts. Both apps were allowed to import the contracts alias. The probes did not create source files.
- A temporary frontend spec demonstrated the Angular TestBed/Vitest environment via the normal frontend test command. A temporary backend spec demonstrated Vitest resolution of `@restaurant-ordering/contracts`. Both toolchain probes were removed; they are not permanent placeholder tests.
- Git initialized on `main`; dependencies, build output, caches, test artifacts, local env files, and SQLite files/sidecars are ignored.

`pnpm test` currently reports no domain unit tests. This is intentional for the scaffold; unit/component coverage arrives with the features. The retained E2E test verifies actual workspace integration.

### Production budget baseline

Angular production output: main JS **93.53 kB**, global CSS **129 bytes**, initial total **93.65 kB raw / 28.34 kB estimated transfer**. Initial warning/error budgets are **350/500 kB**; individual component styles warn/error at **4/8 kB**. The placeholder does not import Material into its bundle yet. This measurement is a starting point, not the completed product's performance result.

### Native-driver compatibility

`pnpm verify:native` loaded better-sqlite3 **13.0.3**, created an in-memory STRICT table, wrote/read an integer, and closed the database successfully. Observed runtime: Node **24.22.0**, ABI **137**, **darwin arm64**, SQLite **3.53.4**. No development database was created or touched.

This driver version ships native prebuilds and uses Node-API; the selected local prebuild worked without a source compilation. Linux container installation/permissions and persistence checks remain in T14. Application DB connections, migrations, and seeds remain in T03/T04; Socket.IO proxy paths are configured but no socket server exists until T08.
