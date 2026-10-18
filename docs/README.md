# Restaurant Ordering — implementation documentation

Architecture and implementation backlog, prepared on 2026-10-18. T01 workspace scaffolding, T02 shared runtime contracts, T03 SQLite persistence, T04 Express lifecycle/common errors, T05 menu configuration/query APIs, T06 authoritative checkout quotes, T07 idempotent orders/status transitions, T08 Socket.IO/revision synchronization, T09 Angular shell/client adapters, T10 Setup editing UI, T11 menu/cart UI, T12 review/confirmation/recovery UI, and T13 Orders/status UI are implemented. T14 adds the two-service Docker deployment; see the task index for current verification status. Start locally or with Docker using the [root README](../README.md); see [T01 verification](tasks/t01-scaffold-nx-workspace-and-quality-commands.md#verification), [T02 verification](tasks/t02-define-shared-runtime-contracts.md#verification), [T03 verification](tasks/t03-implement-schema-migrations-and-seeds.md#verification), [T04 verification](tasks/t04-implement-express-lifecycle-and-common-errors.md#verification), [T05 verification](tasks/t05-implement-menu-configuration-and-query-apis.md#verification), [T06 verification](tasks/t06-implement-authoritative-checkout-quotes.md#verification), [T07 verification](tasks/t07-implement-idempotent-orders-and-status-transitions.md#verification), [T08 verification](tasks/t08-implement-socket-io-and-revision-synchronization.md#verification), [T09 verification](tasks/t09-implement-angular-shell-and-client-adapters.md#verification), [T10 verification](tasks/t10-implement-setup-ui.md#verification), [T11 verification](tasks/t11-implement-menu-cart-and-large-menu-behavior.md#verification), [T12 verification](tasks/t12-implement-review-confirmation-and-recovery-ui.md#verification), [T13 verification](tasks/t13-implement-orders-ui-and-manual-statuses.md#verification), and [T14 verification](tasks/t14-implement-two-service-docker-deployment.md#verification) for demonstrated results.

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
| Frontend | Latest stable Angular, Angular Material/CDK, NgRx SignalStore. |
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

Setup supports creating, editing, and archiving categories/items. Archiving retains order history. Fixed discounts cannot exceed the subtotal; zero-total orders are permitted. The cart survives a page reload within its tab. The deployment targets one Docker host with persistent local storage; public hosting requires access control and TLS as a later step.

T01 resolved and pinned compatible stable dependency versions against published compatibility guidance and peer metadata. T02 added framework-neutral Zod schemas and inferred DTOs, safe money helpers, typed error details, and Socket.IO event maps. T03 added Drizzle schema/migrations, repeatable seeds, database initialization, and real-file persistence tests. T04 added a testable Express app, configuration/request validation, health endpoints, correlated errors, and bounded HTTP/socket/SQLite shutdown. T05 added revision-checked menu mutations, archive eligibility reads, bounded item queries, cart resolution, and committed notification data for T08. T06 added transactional, authoritative five-minute quote snapshots, visible review differences, and line-specific cart validation. T07 added serialized quote confirmation, key-based replay/recovery, consistent paginated order reads, immutable order lines, and revision-checked manual statuses. T08 added one typed Socket.IO server, post-commit notifications, persisted sync reads, finite optional connection recovery, and real-client/browser proxy tests. T09 added lazy Material routes, validated HTTP adapters, one root socket/sync service, route-owned SignalStores, stale-response guards, visible recovery, and keyboard/focus browser coverage. T10 added category/item forms, paginated Setup lists and filters, archive confirmations, retained drafts, explicit revision-conflict recovery, and two-browser acceptance tests. T11 added bounded Menu browsing, debounced search/category filters, quantity/open-price cart editing, discounts and live estimates, validated per-tab persistence, and off-page price/eligibility reconciliation. T12 added explicit authoritative quote review, edit/menu/expiry invalidation, frozen persisted confirmation attempts, same-key retry and reload recovery, and real committed-response-loss browser tests. T13 added filtered/paginated Orders, immutable details, manual status controls, and revision-safe staff recovery. T14 adds non-root frontend/backend Docker images, a persistent SQLite volume, Nginx proxying, and isolated production deployment acceptance coverage.

## Historical documentation maintenance verification

Verified on 2026-10-18 with repository-pinned Node **24.22.0** and pnpm
**12.14.0** through the existing isolated npm-exec toolchain.

### Demonstrated acceptance

- All 16 task definitions moved from `docs/tasks.md` into individual files under
  `docs/tasks/`, named with their stable ID and title slug, such as
  `t06-implement-authoritative-checkout-quotes.md`. A content comparison confirmed
  that scopes, acceptance criteria, and historical completion records were
  preserved, allowing only formatting, capitalization, and relative-link changes.
- Every task has an explicit status and dependency links. T01–T12 remain
  **Complete**; T13–T16 remain **Not started**. All statuses match the index.
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
