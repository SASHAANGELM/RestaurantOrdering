# Implementation plan

Build the agreed architecture in small runnable increments. The task checklist is in [tasks.md](tasks.md); API and recovery details are in [contracts.md](contracts.md). T01–T12 are complete; see the per-task verification reports linked from [tasks](tasks.md), including [menu/cart verification](t11-verification.md) and [review/recovery verification](t12-verification.md). T13–T16 remain unimplemented.

## 1. Milestones and sequencing

| Milestone | Tasks | Reviewable result |
| --- | --- | --- |
| M1 — Workspace and persistence | T01–T04, T09 | One repository starts both apps; strict types, shared contracts, migrated/seeded SQLite, app navigation and health endpoints. |
| M2 — Server behavior | T05–T08 | Menu edits, quote/confirm checkout, persistent retry safety, order transitions, and socket notifications work through API clients. |
| M3 — Complete user flows | T10–T13 | Two browsers demonstrate Setup → Menu updates, open-price/discount review and checkout, and manual live order statuses. |
| M4 — Deployable handoff | T14–T16 | Exactly two Compose services, persisted orders across restarts, verified critical flows, and complete README. |

Implementation is incremental within those milestones: write safety tests alongside checkout and synchronization, rather than postponing reliability work to M4. T15 closes integration gaps and provides the final verification report.

## 2. Suggested seven-day schedule

The assignment allows seven days. This is a focused prototype schedule for one developer, approximately 45–55 hours including verification, assuming no substantial dependency/tooling conflicts. It is a planning estimate, not a delivery guarantee.

| Day | Focus | End-of-day demonstration |
| --- | --- | --- |
| 1 | T01–T04 and basic T09 | Both apps launch; SQLite survives restart; shared schema is consumed on both sides; workspace checks run. Start a minimal Docker build early to catch native-addon issues. |
| 2 | T05, T06, start T07 | Setup API edits and archives menu data; quote calculations and invalid-cart responses have meaningful database-backed tests. |
| 3 | Finish T07, T08; finish T09 | Duplicate/retried confirmation creates one order; menu/status events reach two sockets; reconnect synchronization works through a basic shell. |
| 4 | T10, T11 | Working Setup and large-menu/cart pages; edits are visible in another tab; open-price and discount validation preserve input. |
| 5 | T12, T13 | Reviewed checkout handles a concurrent availability change and response loss; Orders supports live manual progression/cancellation. |
| 6 | T14, T15 | Containerized two-browser tests pass; restart and missed-event recovery are demonstrated; large-menu performance is measured. |
| 7 | Finish T15, T16; buffer | Fresh checkout run, all required checks, README, demo walkthrough, and meaningful commit history review. |

If time gets tight, reduce presentation polish, optional image support, extra filters, and abstraction work. Preserve idempotency, confirmation-time validation, reconnect recovery, strict typing, tests/lint/build, and Docker deployment. Do not introduce payments, SSR, Redis, stock counts, or authentication during this prototype.

## 3. Verification strategy

| Level | Meaningful coverage |
| --- | --- |
| Pure unit | Decimal-to-cent parsing, safe totals, discount bounds, open/fixed pricing rules, allowed status transitions. |
| Database/API integration | Real temporary SQLite with production migrations; availability/archive/mode changes; transaction rollback; immutable order snapshots; quote expiry; duplicate keys/quotes; optimistic concurrency; restart recovery. |
| Frontend component/store | Cart retained during errors; open-price validation; explicit changed-price review; stale quote invalidation; unresolved attempt persistence; out-of-order HTTP/event handling. |
| Socket integration | Two clients, post-commit broadcasts, disconnection/reconnection, duplicate announcements, lost notification followed by revision reconciliation. |
| E2E | Separate staff/customer browser contexts, live edits, large menu, changed availability during checkout, double submit, dropped response/retry, filtered order status changes, deep-link refresh. |
| Deployment | Clean Docker build/run, both health checks, HTTP polling and socket upgrade through Nginx, migration startup, named-volume persistence, backend restart, fresh-run instructions. |

For concurrent checkout tests send genuinely overlapping HTTP requests and inspect persisted rows; include independent DB connections where needed to exercise uniqueness/locking. Use a temporary file DB for restart/WAL tests, not only in-memory SQLite. Drop the HTTP response **after** commit for the unknown-outcome case; a pre-request offline toggle does not test it. Simulate missed events by suppressing broadcast and allowing a later sync check to repair state.

Use seeded data: a small predictable menu for E2E and a deterministic 5,000-item dataset for performance. Confirm pagination renders at most the requested page and search stays responsive. Measure a production build using a documented low-device CPU throttle and slow network profile. Initial targets: cart interaction feedback within 100 ms, no unbounded DOM growth, CLS under 0.1, and normal live changes visible within one second under local demo load. Record hardware/profile/results instead of presenting these as measured guarantees. Establish Angular bundle budgets on Day 1 and investigate regressions.

## 4. Expected developer commands

T01/T14 must implement these root scripts and document prerequisites:

```sh
pnpm dev          # migrate/seed local DB when needed; launch frontend and backend
pnpm lint
pnpm typecheck
pnpm test         # non-watch unit, component, and integration tests
pnpm build        # production builds for both apps
pnpm e2e          # starts isolated test apps and runs Playwright
pnpm check        # lint + typecheck + test + build
pnpm db:migrate
pnpm db:seed      # explicit, idempotent demo initialization
pnpm db:seed:large
```

Use local Nx tasks behind these scripts; cache deterministic build/lint/typecheck/unit tasks, but not migrations, seeds, dev servers, or stateful E2E runs. E2E owns its temporary DB and port configuration, never the developer's real database. Document any browser binary installation required for local E2E; CI installs it explicitly.

The root README must offer a one-command Docker path and a two-command local path. Docker defaults work without manual migration, seed, or `.env` setup. A CI workflow runs frozen install, lint, typecheck, tests, production builds, browser E2E, and the container smoke test. Keep test fixtures, build outputs, `.env`, and SQLite files out of Git.

## 5. Completion and handoff

Completion requires every required task's acceptance criteria, successful `pnpm check` and `pnpm e2e`, a fresh `docker compose up --build` run with exactly two services, and a persistence/reconnect demonstration. Document actual results and any remaining limitation honestly. A documentation-only review does not count as application validation.

Use meaningful commits per runnable change (workspace, persistence/contracts, menu API, safe checkout, realtime, each frontend flow, deployment, final checks). Initialize Git during T01 if still absent; do not create a single final dump commit. Publishing a remote repository or deploying to an external host is separate from producing the local runnable prototype.

The README must explain startup, version requirements, environment variables, schema/seed commands, key trade-offs, test commands, deliberate simplifications, and production follow-up. Include a short walkthrough that demonstrates the reliability requirements, not only the happy path.
