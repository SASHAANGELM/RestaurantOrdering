# T15 — Complete reliability, performance, and CI verification

Status: **Not started**

Depends on: [T10](t10-implement-setup-ui.md), [T12](t12-implement-review-confirmation-and-recovery-ui.md), [T13](t13-implement-orders-ui-and-manual-statuses.md), [T14](t14-implement-two-service-docker-deployment.md)

[Task index](README.md)

## Scope

Finish the matrix in [implementation-plan](../implementation-plan.md): multi-context E2E, race/retry/restart tests, large-menu measurements, and container smoke tests. Add CI for frozen install, lint/typecheck/tests/build, isolated E2E, and the two-service smoke test. Fix discovered failures and record actual results.

## Acceptance criteria

Root `pnpm check` and `pnpm e2e` pass; CI executes the equivalent checks; no real development DB is touched. Record throttled-device/network configuration, bounded list size, interaction/layout results, and live/missed-event recovery timing. Tests cover a commit followed by dropped response and a commit followed by omitted broadcast, not merely offline-before-submit behavior.
