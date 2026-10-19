# Implementation tasks

Read this index first every time you need the next task or a list of all tasks.
Then open the relevant task file for its scope, acceptance criteria, completion
record, and verification results; read dependency files only as needed.

**27 complete.**

| ID | Task | Status | Depends on |
| --- | --- | --- | --- |
| T01 | [Scaffold Nx workspace and quality commands](t01-scaffold-nx-workspace-and-quality-commands.md) | Complete | — |
| T02 | [Define shared runtime contracts](t02-define-shared-runtime-contracts.md) | Complete | [T01](t01-scaffold-nx-workspace-and-quality-commands.md) |
| T03 | [Implement schema, migrations, and seeds](t03-implement-schema-migrations-and-seeds.md) | Complete | [T02](t02-define-shared-runtime-contracts.md) |
| T04 | [Implement Express lifecycle and common errors](t04-implement-express-lifecycle-and-common-errors.md) | Complete | [T03](t03-implement-schema-migrations-and-seeds.md) |
| T05 | [Implement menu configuration and query APIs](t05-implement-menu-configuration-and-query-apis.md) | Complete | [T04](t04-implement-express-lifecycle-and-common-errors.md) |
| T06 | [Implement authoritative checkout quotes](t06-implement-authoritative-checkout-quotes.md) | Complete | [T05](t05-implement-menu-configuration-and-query-apis.md) |
| T07 | [Implement idempotent orders and status transitions](t07-implement-idempotent-orders-and-status-transitions.md) | Complete | [T06](t06-implement-authoritative-checkout-quotes.md) |
| T08 | [Implement Socket.IO and revision synchronization](t08-implement-socket-io-and-revision-synchronization.md) | Complete | [T07](t07-implement-idempotent-orders-and-status-transitions.md) |
| T09 | [Implement Angular shell and client adapters](t09-implement-angular-shell-and-client-adapters.md) | Complete | [T02](t02-define-shared-runtime-contracts.md), [T04](t04-implement-express-lifecycle-and-common-errors.md) |
| T10 | [Implement Setup UI](t10-implement-setup-ui.md) | Complete | [T05](t05-implement-menu-configuration-and-query-apis.md), [T08](t08-implement-socket-io-and-revision-synchronization.md), [T09](t09-implement-angular-shell-and-client-adapters.md) |
| T11 | [Implement menu, cart, and large-menu behavior](t11-implement-menu-cart-and-large-menu-behavior.md) | Complete | [T05](t05-implement-menu-configuration-and-query-apis.md), [T08](t08-implement-socket-io-and-revision-synchronization.md), [T09](t09-implement-angular-shell-and-client-adapters.md) |
| T12 | [Implement review, confirmation, and recovery UI](t12-implement-review-confirmation-and-recovery-ui.md) | Complete | [T06](t06-implement-authoritative-checkout-quotes.md), [T07](t07-implement-idempotent-orders-and-status-transitions.md), [T11](t11-implement-menu-cart-and-large-menu-behavior.md) |
| T13 | [Implement Orders UI and manual statuses](t13-implement-orders-ui-and-manual-statuses.md) | Complete | [T07](t07-implement-idempotent-orders-and-status-transitions.md), [T08](t08-implement-socket-io-and-revision-synchronization.md), [T09](t09-implement-angular-shell-and-client-adapters.md) |
| T14 | [Implement two-service Docker deployment](t14-implement-two-service-docker-deployment.md) | Complete | [T08](t08-implement-socket-io-and-revision-synchronization.md), [T09](t09-implement-angular-shell-and-client-adapters.md) |
| T15 | [Complete reliability, performance, and CI verification](t15-complete-reliability-performance-and-ci-verification.md) | Complete | [T10](t10-implement-setup-ui.md), [T12](t12-implement-review-confirmation-and-recovery-ui.md), [T13](t13-implement-orders-ui-and-manual-statuses.md), [T14](t14-implement-two-service-docker-deployment.md) |
| T16 | [Complete README and handoff](t16-complete-readme-and-handoff.md) | Complete | [T15](t15-complete-reliability-performance-and-ci-verification.md) |
| T17 | [Refresh menu, cart, and catalog management](t17-refresh-menu-cart-and-catalog-management.md) | Complete | [T03](t03-implement-schema-migrations-and-seeds.md), [T10](t10-implement-setup-ui.md), [T11](t11-implement-menu-cart-and-large-menu-behavior.md), [T12](t12-implement-review-confirmation-and-recovery-ui.md) |
| T18 | [Improve ordering, media delivery, and connection feedback](t18-improve-ordering-media-delivery-and-connection-feedback.md) | Complete | [T17](t17-refresh-menu-cart-and-catalog-management.md) |
| T19 | [Refine ordering controls and order history](t19-refine-ordering-controls-and-order-history.md) | Complete | T18 |
| T20 | [Simplify local browsing and checkout](t20-simplify-local-browsing-and-checkout.md) | Complete | T19 |
| T21 | [Restore archived categories and items](t21-restore-archived-categories-and-items.md) | Complete | T05, T10, T20 |
| T22 | [Refine item lifecycle and add item details](t22-refine-item-lifecycle-and-add-item-details.md) | Complete | T13, T20, T21 |
| T23 | [Unify page controls and acknowledge cart price changes](t23-unify-page-controls-and-acknowledge-cart-price-changes.md) | Complete | T12, T13, T20, T22 |
| T24 | [Unify cart price and quantity layout](t24-unify-cart-price-and-quantity-layout.md) | Complete | T23 |
| T25 | [Refine cart feedback and add item image gallery](t25-refine-cart-feedback-and-add-item-image-gallery.md) | Complete | T24, T18 |
| T26 | [Share order rows and refine cart comments and quantities](t26-share-order-rows-and-refine-cart-comments-and-quantities.md) | Complete | T25, T23, T22 |
| T27 | [Make item order history read-only](t27-make-item-order-history-read-only.md) | Complete | T26 |

## Selecting work

Choose the first not-started task in table order whose dependencies are complete,
unless the user specifies another task.
T09 can follow T04 while server work continues sequentially; T14 can start once
both app builds exist and does not need visual polish. See the
[seven-day plan](../implementation-plan.md) for delivery grouping.

## Maintaining tasks

- Use **Not started**, **In progress**, **Blocked**, or **Complete** in both the
  table and each task file. Keep the table, task status, and summary counts in sync.
  Record a blocker and its resolution requirements in the task file when blocked.
- Keep one task per file named with its lowercase stable ID and title slug, for
  example `t06-implement-authoritative-checkout-quotes.md`. Use lowercase words
  separated by hyphens. Include scope, acceptance criteria, completion record,
  and a `Verification` section for demonstrated results. Do not create separate
  task verification files. Add every
  new task to this table with its status and dependencies.
- Keep feature tests with their implementation. Demonstrate acceptance criteria
  and record evidence in the task's `Verification` section, including commands,
  outcomes, acceptance evidence, and known limitations. Keep earlier dated results
  as historical evidence; do not present them as fresh validation.
- Mark a task **Complete** only after verification succeeds: run `pnpm check` with
  the repository-pinned Node and pnpm versions and confirm frontend and backend
  unit tests, shared contract tests, lint, strict typechecking, and both production
  builds pass. Run any additional checks required by that task. Update the task
  file and this index only after successful verification; report blockers explicitly.

See [project guidance](../../AGENTS.md). These are local backlog items; no external
tracker, recurring jobs, or implementation agents have been created.
