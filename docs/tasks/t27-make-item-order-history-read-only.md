# T27 — Make item order history read-only

Status: **Complete**

Depends on: T26

[Task index](README.md)

## Scope and acceptance criteria

- Keep the reusable order row on both pages. Item-related orders show a colored status label with no selector or status-editing actions, while Orders retains revision-safe status editing.
- Retain images, links, totals, pagination and live status refresh on item history.
- Relevant browser coverage and pinned pnpm check pass, including frontend/backend/contracts unit tests, lint, strict typechecking and both production builds. Verification uses isolated databases.

## Completion record

Completed 2026-10-19. OrderRow defaults to a static colored status badge; Orders explicitly enables the existing editor. Item history retains the shared layout and live refresh. This supersedes T26's status-editing behavior on item history.

## Verification

Verified on 2026-10-19 with pinned **Node 24.22.0** and **pnpm 12.14.0**.

- **Passed:** `CI=true NX_DAEMON=false NX_DEFAULT_OUTPUT_STYLE=stream pnpm check` — lint, strict typechecking, **156 frontend + 353 backend + 77 contracts tests (586 total)**, both production builds and shared declarations. Valid backend/contracts Nx results were reused.
- **Passed:** `CI=true NX_DAEMON=false E2E_BACKEND_PORT=3100 E2E_FRONTEND_PORT=4300 pnpm exec playwright test --config apps/frontend-e2e/playwright.config.ts ordering-followups.spec.ts item-details.spec.ts orders.spec.ts page-and-cart-refinements.spec.ts` — **12/12** Chromium scenarios.
- Updated shared-row browser coverage proves item history contains neither a combobox nor OrderStatusControl, shows Placed then Preparing after a live external update, retains snapshot images and has no horizontal overflow at 1440px/375px. Orders still exposes its selector, submits the expected revision and successfully changes Preparing to Ready. Existing status/conflict/recovery and item-history navigation/pagination scenarios pass.
- Inspected the mobile related-order screenshot: static Preparing label, images and total remain visible with no dropdown. **Passed:** final `git diff --check`.

Database tests use isolated temporary databases; browser servers use independent in-memory databases on **3100/4300**. Development data, schema, dependencies and earlier working-tree changes are preserved. The initial frontend bundle remains **590.57 kB**, below the existing 600 kB error limit, with the existing warning above 550 kB.
