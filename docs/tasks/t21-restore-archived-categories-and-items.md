# T21 — Restore archived categories and items

Status: **Complete**

Depends on: [T05](t05-implement-menu-configuration-and-query-apis.md), [T10](t10-implement-setup-ui.md), [T20](t20-simplify-local-browsing-and-checkout.md)

[Task index](README.md)

## Scope

Add unarchiving through the existing revision-checked category/item update APIs and Restore actions in Settings when archived records are shown. Clear the existing nullable `archivedAt` field; no database migration is required. Reuse menu revision notifications so other browser views and cart eligibility refresh.

## Acceptance criteria

- Both update APIs accept `archived: false`, preserve other fields, and clear `archivedAt` transactionally. Real changes increment entity/menu revisions once; repeated restores at the current revision are no-ops, and stale revisions are rejected.
- Restoring a category restores eligibility only for its nonarchived, available items. Individually archived items stay archived. Restoring an item preserves its availability; an archived parent category continues to prevent ordering.
- Archived category/item rows expose labelled Restore actions with confirmation, cancellation, pending protection, explicit error retry and revision-conflict recovery. Archive confirmation explains restoration instead of claiming archival is permanent.
- Restore results persist and appear in menu/setup/resolve reads, authoritative checkout and other browser views through existing synchronization. Existing order snapshots remain unchanged.
- Feature tests use isolated temporary databases. Repository-pinned `pnpm check` passes, including frontend/backend/shared tests, lint, strict typechecking and both production builds. Relevant browser regressions pass.

## Completion record

Completed 2026-10-19. Both category/item APIs and Settings support revision-checked restoration without a database migration. Required `pnpm check` passes with 560 tests and both production builds; all 29 standard Chromium scenarios pass. Acceptance evidence and verification results are recorded below.

## Verification

Verified on 2026-10-19 with repository-pinned **Node 24.22.0** and **pnpm 12.14.0**. Dependencies, lockfiles, database schema and migrations are unchanged.

### Demonstrated acceptance criteria

- Category/item update contracts accept boolean `archived`; malformed strings/numbers/null still fail validation. `false` clears `archivedAt`, while omitted values preserve it. Backend tests exercise both HTTP endpoints, unchanged fields, Setup/Menu/catalog/resolve reads and persistence through reopening an isolated real SQLite file.
- Restoration uses the existing immediate write transaction, revision check and post-commit result. Tests prove stale restore rejection before and after another restore, current-revision no-ops preserving timestamps/revisions without events, trigger-induced rollback of both entity and menu revisions, and committed state visible from a second connection. Real polling/WebSocket clients receive the existing `updated` notifications for both restored entity types.
- Category restoration does not rewrite child items: individually archived children retain their full archived record and revision; other children retain their availability. Item restoration under an archived category succeeds without enabling ordering or changing availability. Shared eligibility reads continue to enforce item/category/availability precedence.
- **Show archived records** exposes named **Restore category/item** actions. Confirmations explain the category/item effects and preserved order history; item dialogs show archived-parent/unavailable restrictions. Archive text now explains how to restore. Confirmation submits only `expectedRevision` and `archived: false`, ignores form drafts, prevents duplicate writes and dismissal while pending, retains network errors for explicit retry and reuses authoritative revision-conflict recovery. A reload showing an already restored record disables further restoration.
- Added four backend restoration tests and five frontend restoration cases; extended contract validation and real-client notification coverage. Two new Chromium scenarios demonstrate category/item Restore controls, Cancel/Escape and focus return, exact request bodies, network failure/retry, conflict reload after another restore, mobile overflow, live Menu/cart eligibility repair in an independent browser, archived-sibling preservation, authoritative quote success/blocking and unchanged historical order snapshots. Inspected the mobile restoration/error screenshot from the repository Playwright workflow.
- Updated README/API/architecture documentation; the original T10 verification remains historical with a link to this follow-up.

### Checks

- **Passed:** `CI=true NX_DAEMON=false NX_SKIP_NX_CACHE=true NX_DEFAULT_OUTPUT_STYLE=stream pnpm check` — all four lint and strict typecheck targets, **137 frontend + 347 backend + 76 shared-contract tests (560 total)**, both production builds and shared declarations.
- **Passed:** `CI=true NX_DAEMON=false E2E_BACKEND_PORT=3100 E2E_FRONTEND_PORT=4300 pnpm exec playwright test --config apps/frontend-e2e/playwright.config.ts unarchive.spec.ts` — **2/2** Chromium scenarios.
- **Passed:** `pnpm db:check`; `git diff --check`.
- **Passed:** `CI=true NX_DAEMON=false E2E_BACKEND_PORT=3100 E2E_FRONTEND_PORT=4300 pnpm exec playwright test --config apps/frontend-e2e/playwright.config.ts` — **29/29** standard Chromium scenarios, including both new restoration scenarios and existing management, menu/cart/checkout, realtime, order and recovery workflows.

Database tests use isolated OS temporary files; browser fixtures use independent in-memory databases on **3100/4300**. No verification reads, seeds, resets or modifies development data.

### Practical limits

- Restoring an item preserves its availability and does not restore an archived parent. Its category must be restored and availability enabled before ordering.
- The frontend initial bundle is **584.63 kB**, below the unchanged 600 kB error budget, with the existing warning above 550 kB. Container and large-menu performance suites are not required for this change and were not rerun.
