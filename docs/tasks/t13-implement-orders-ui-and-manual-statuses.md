# T13 — Implement Orders UI and manual statuses

Status: **Not started**

Depends on: [T07](t07-implement-idempotent-orders-and-status-transitions.md), [T08](t08-implement-socket-io-and-revision-synchronization.md), [T09](t09-implement-angular-shell-and-client-adapters.md)

[Task index](README.md)

## Scope

Add paginated all-order list, optional status filter, line/total detail, staff progression controls, and cancellation from placed/preparing. Refresh list membership/counts as well as visible statuses on realtime changes.

## Acceptance criteria

Orders created elsewhere appear live; another browser sees manual status changes. Invalid/terminal transitions have no controls and are rejected server-side too. Filtered lists remove/add orders correctly after status events. Reconnect catches up without duplicate rows; stale staff actions preserve context and offer refresh.
