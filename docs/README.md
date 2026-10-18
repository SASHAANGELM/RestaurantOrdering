# Restaurant Ordering — implementation documentation

Architecture and implementation backlog, prepared on 2026-10-18. T01 workspace scaffolding is implemented; feature workflows, Dockerfiles, and Compose configuration remain in the backlog. Start locally using the [root README](../README.md); see [T01 verification](t01-verification.md) for demonstrated results.

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

T01 resolved and pinned compatible stable dependency versions against published compatibility guidance and peer metadata. T02 is the next task.
