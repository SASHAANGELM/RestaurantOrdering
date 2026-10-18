# Restaurant Ordering — implementation documentation

Architecture and implementation backlog, prepared on 2026-10-18. T01 workspace scaffolding, T02 shared runtime contracts, T03 SQLite persistence, T04 Express lifecycle/common errors, T05 menu configuration/query APIs, T06 authoritative checkout quotes, T07 idempotent orders/status transitions, and T08 Socket.IO/revision synchronization are implemented; frontend workflows, Dockerfiles, and Compose configuration remain in the backlog. Start locally using the [root README](../README.md); see [T01 verification](t01-verification.md), [T02 verification](t02-verification.md), [T03 verification](t03-verification.md), [T04 verification](t04-verification.md), [T05 verification](t05-verification.md), [T06 verification](t06-verification.md), [T07 verification](t07-verification.md), and [T08 verification](t08-verification.md) for demonstrated results.

Read in this order:

1. [Architecture](architecture.md): boundaries, technology decisions, data model, frontend design, and deployment.
2. [HTTP and realtime contracts](contracts.md): endpoints, checkout safety, Socket.IO synchronization, and error behavior.
3. [Implementation plan](implementation-plan.md): milestones, seven-day schedule, verification, and scope limits.
4. [Implementation tasks](tasks.md): dependency-ordered checklist with acceptance criteria.
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

T01 resolved and pinned compatible stable dependency versions against published compatibility guidance and peer metadata. T02 added framework-neutral Zod schemas and inferred DTOs, safe money helpers, typed error details, and Socket.IO event maps. T03 added Drizzle schema/migrations, repeatable seeds, database initialization, and real-file persistence tests. T04 added a testable Express app, configuration/request validation, health endpoints, correlated errors, and bounded HTTP/socket/SQLite shutdown. T05 added revision-checked menu mutations, archive eligibility reads, bounded item queries, cart resolution, and committed notification data for T08. T06 added transactional, authoritative five-minute quote snapshots, visible review differences, and line-specific cart validation. T07 added serialized quote confirmation, key-based replay/recovery, consistent paginated order reads, immutable order lines, and revision-checked manual statuses. T08 added one typed Socket.IO server, post-commit notifications, persisted sync reads, finite optional connection recovery, and real-client/browser proxy tests. T09's Angular shell and client adapters are next.
