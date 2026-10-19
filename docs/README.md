# Restaurant Ordering — implementation documentation

Architecture and implementation documentation, prepared on 2026-10-18. The application, two-service deployment, reliability/performance checks, and CI configuration are implemented. Start with the [root README](../README.md) for startup, the two-browser demonstration, trade-offs, and production follow-up. The [task index](tasks/README.md) records current status; [T15](tasks/t15-complete-reliability-performance-and-ci-verification.md#verification) records application validation, and [T16](tasks/t16-complete-readme-and-handoff.md) records the final handoff.

For the next task or the full task list, always read the
[task index](tasks/README.md) first. Open individual task files as needed. Each
task keeps its status, dependencies, scope, acceptance criteria, completion record,
and verification results together in one file.

For architecture and product context, read in this order:

1. [Architecture](architecture.md): boundaries, technology decisions, data model, frontend design, and deployment.
2. [HTTP and realtime contracts](contracts.md): endpoints, checkout safety, Socket.IO synchronization, and error behavior.
3. [Implementation plan](implementation-plan.md): milestones, seven-day schedule, verification, and scope limits.
4. [Implementation tasks](tasks/README.md): task table with statuses and links to individual task files.
5. [Original assignment](assignment.md): preserved requirements.

[Architecture overview](architecture-overview.html) is a self-contained visual companion.

## Confirmed decisions

| Decision | Agreed behavior |
| --- | --- |
| Workspace | Everything in one repository; Nx with pnpm workspaces. |
| Frontend | Pinned Angular 22.2.3, Angular Material/CDK, NgRx SignalStore. |
| Backend | Express + strict TypeScript. |
| Database | SQLite + Drizzle, stored by the backend. |
| Realtime | Socket.IO server and socket.io-client. |
| Deployment | Exactly two Compose services: frontend and backend. |
| Access | No authentication; shared demonstration environment. |
| Order visibility | The Orders page shows all orders. |
| Order lifecycle | Staff manually advance placed → preparing → ready → completed. Cancellation is allowed from placed or preparing. |
| Money | USD, two decimal places; integer cents in storage and transport. |

## Architecture choices made for the prototype

One restaurant, boolean item availability, one persistent backend process, client-rendered Angular, and HTTP writes with Socket.IO notifications. Checkout uses server-generated quotes and persistent idempotency. There are no payments, customer accounts, delivery details, inventory quantities, taxes, or automatic status progression. These choices follow the assignment's allowance to decide unspecified behavior.

Settings supports creating, editing, and archiving categories/items. Archiving retains order history. Fixed discounts cannot exceed the subtotal; zero-total orders are permitted. The cart survives a page reload within its tab. The deployment targets one Docker host with persistent local storage; public hosting requires access control and TLS as a later step.

T01 resolved and pinned compatible stable dependency versions against published compatibility guidance and peer metadata. T02 added framework-neutral Zod schemas and inferred DTOs, safe money helpers, typed error details, and Socket.IO event maps. T03 added Drizzle schema/migrations, repeatable seeds, database initialization, and real-file persistence tests. T04 added a testable Express app, configuration/request validation, health endpoints, correlated errors, and bounded HTTP/socket/SQLite shutdown. T05 added revision-checked menu mutations, archive eligibility reads, bounded item queries, cart resolution, and committed notification data for T08. T06 added transactional, authoritative five-minute quote snapshots, visible review differences, and line-specific cart validation. T07 added serialized quote confirmation, key-based replay/recovery, consistent paginated order reads, immutable order lines, and revision-checked manual statuses. T08 added one typed Socket.IO server, post-commit notifications, persisted sync reads, finite optional connection recovery, and real-client/browser proxy tests. T09 added lazy Material routes, validated HTTP adapters, one root socket/sync service, route-owned SignalStores, stale-response guards, visible recovery, and keyboard/focus browser coverage. T10 added category/item forms, paginated Setup lists and filters, archive confirmations, retained drafts, explicit revision-conflict recovery, and two-browser acceptance tests. T11 added bounded Menu browsing, debounced search/category filters, quantity/open-price cart editing, discounts and live estimates, validated per-tab persistence, and off-page price/eligibility reconciliation. T12 added explicit authoritative quote review, edit/menu/expiry invalidation, frozen persisted confirmation attempts, same-key retry and reload recovery, and real committed-response-loss browser tests. T13 added filtered/paginated Orders, immutable details, manual status controls, and revision-safe staff recovery. T14 added non-root frontend/backend Docker images, a persistent SQLite volume, Nginx proxying, and isolated production deployment acceptance coverage. T15 added CI, production-browser reliability checks, and throttled large-menu measurements.

## Historical documentation maintenance verification

Verified on 2026-10-18 with repository-pinned Node **24.22.0** and pnpm
**12.14.0** through the existing isolated npm-exec toolchain.

### Demonstrated acceptance

- All 16 task definitions moved from `docs/tasks.md` into individual files under
  `docs/tasks/`, named with their stable ID and title slug, such as
  `t06-implement-authoritative-checkout-quotes.md`. A content comparison confirmed
  that scopes, acceptance criteria, and historical completion records were
  preserved, allowing only formatting, capitalization, and relative-link changes.
- Every task has an explicit status and dependency links. At that historical checkpoint, T01–T12 were
  **Complete** and T13–T16 were **Not started**, matching the index at the time.
- [The task index](tasks/README.md) contains one table covering all tasks, their
  statuses, dependencies, and links to individual task files. It defines status
  maintenance and dependency-aware task selection.
- [Project guidance](../AGENTS.md), the documentation entry point, and the index
  require agents to read the index first whenever selecting the next task or
  listing all tasks, then open relevant task files as needed. Verification evidence
  belongs in each task file; separate task verification files must not be created.
- Documentation links point to the new index. Existing per-task verification
  reports are now merged into each task's `Verification` section, with incoming
  links and existing section anchors preserved. All 12 report bodies were compared
  with their originals before removing the standalone files.

### Validation

- Uncached `NX_SKIP_NX_CACHE=true NX_DEFAULT_OUTPUT_STYLE=stream pnpm check`
  **passed**: lint, strict typechecking, **105 frontend + 320 backend + 75 shared
  contract tests (500 total)**, and **both frontend and backend production builds**.
- Local Markdown file links, index/file status agreement, all 16 migrated task
  bodies, and `git diff --check` **passed**. All 16 filenames include their task
  title; index, dependency, and verification links use the descriptive filenames.
- The existing frontend initial-bundle warning remains: **560.37 kB** against a
  **550 kB** warning threshold, below the unchanged **600 kB** error limit.

Application code and dependencies are unchanged. No development database was
read, seeded, reset, or modified. Browser tests were not rerun for this
documentation-only change.
