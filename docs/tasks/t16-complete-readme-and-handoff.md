# T16 — Complete README and handoff

Status: **Complete**

Depends on: [T15](t15-complete-reliability-performance-and-ci-verification.md)

[Task index](README.md)

## Scope

Write the root README with one-command Docker and two-command local startup, prerequisites/exact tool versions, optional settings, migrations/seeds, checks, architecture links, simplifications/trade-offs, volume reset semantics, and production follow-up. Include a reproducible two-browser demonstration and final validation results.

## Acceptance criteria

Someone starting from a fresh checkout can run the prototype using the README alone. All confirmed product choices match docs/code. The meaningful local commit sequence is preserved; publishing/pushing is handled only if requested. No unimplemented capability is presented as complete.

## Completion record

Completed 2026-10-18. Expanded the root README into the prototype handoff: one-command Docker and two-command local startup, exact toolchain and native build prerequisites, environment handling, schema/seed commands, volume/reset semantics, checks, architecture links, a reproducible two-browser demonstration, design trade-offs, deliberate simplifications, and production follow-up. Updated the documentation entry point, architecture layout/state ownership, stale implementation status references, and the plan's seed command to match the implemented scripts. Preserved historical verification as historical evidence. No application code, dependency, schema, or lockfile changes were needed.

## Verification

Verified on 2026-10-18 on macOS arm64 using repository-pinned **Node 24.22.0 / pnpm 12.14.0**, selected with `npm exec --yes --package=node@24.22.0 --package=pnpm@12.14.0 -- <command>`. The host default remains Node 26 with no global pnpm. Docker client/Engine **29.8.2**, Compose **5.6.0**.

- `pnpm install --frozen-lockfile` passed with the existing lockfile; `pnpm verify:native` passed with Node ABI 137, better-sqlite3 13.0.3, and SQLite 3.53.4.
- Uncached **`CI=true NX_DAEMON=false NX_SKIP_NX_CACHE=true NX_DEFAULT_OUTPUT_STYLE=stream pnpm check` passed**: lint and strict typechecking for all four projects, **119 frontend + 320 backend + 75 shared-contract tests (514 total)**, contracts declarations, and **both frontend and backend production builds**. The existing initial-bundle warning remains **568.68 kB / 550 kB**, below the unchanged 600 kB error budget; estimated transfer is 143.64 kB.
- **`CI=true NX_DAEMON=false pnpm e2e` passed 19/19 Chromium scenarios**. The generated HTML report's `report.json` confirms total/expected 19, unexpected/flaky/skipped 0. This freshly covers separate staff/customer contexts, live Setup/Menu and order status updates, quote invalidation, committed-response loss and recovery, editor conflicts, reconnect/periodic/focus repair, and bounded Orders paging.
- **`pnpm exec playwright test --config apps/frontend-e2e/playwright.large.config.ts` passed 2/2** against a separate isolated production 5,000-item fixture, including bounded DOM, search/category paging, feedback timing, and layout under the configured mobile CPU/network throttle. T15's README measurements remain explicitly attributed baseline samples rather than being relabelled as this run's results.
- Executed the documented **`pnpm dev`** command with only `DATABASE_PATH` redirected to a fresh OS temporary directory and `SEED_MODE=small`. Both apps started; `/menu` served the Angular shell; frontend-proxied `/api/health/ready` returned ready; `/api/menu/items` returned all 12 small-seed items; the temporary SQLite file was created automatically. The process group was stopped and the temporary directory removed. This verifies first database initialization in the current checkout; dependencies were already present, so it is not claimed as a clean-machine install.
- Reviewed the two-browser walkthrough against actual seeded names, form/action labels, checkout totals (10.00 estimate, then 12.00 authoritative total), invalidation rules, and same-key recovery behavior. The browser suites demonstrate the underlying acceptance flows; the exact prose walkthrough was not separately driven by hand.
- **`pnpm docker:smoke` passed 1/1** in fresh Compose project `restaurant-smoke-a58e3860`, with a random loopback port and disposable volume. Both production images built and both services became healthy without manual migrations/seeding. The deployment scenario verified proxies, non-root execution, order creation, graceful shutdown, recoverable UI, persisted order/key replay after restart and forced backend recreation, and absence of production fixture routes. Cleanup removed the project containers, network, volume, and both generated images.
- Local Markdown file-link validation for changed documents, task/index status agreement, and `git diff --check` passed.
- Reviewed `git log --oneline`: incremental commits remain intact through T15, including separate Setup, Menu/cart, checkout, Orders, Docker, and reliability changes. No commit history rewrite, remote push, publication, or external deployment was performed.

Browser tests use their own in-memory database; local startup used an OS temporary database; the deployment smoke uses its own named volume. No development database was read, seeded, reset, or modified. Hosted CI, physical phones, other browser engines, and Linux AMD64 remain undemonstrated; production follow-up and shared unauthenticated access are explicit in the README.
