# T19 — Refine ordering controls and order history

Status: **Complete**

Depends on: [T18](t18-improve-ordering-media-delivery-and-connection-feedback.md)

[Task index](README.md)

## Scope and acceptance criteria

- Shared large quantity stepper in item dialogs and cart; outline inputs and availability switches.
- Settings last in navigation; remove redundant copy/navigation; bottom backend-check timestamp and animated bottom-right connection dot.
- Images in item management, cart and order details; black top-right cart removal control.
- Adjacent cancel/primary dialog actions; destructive controls in danger content and confirmation before mutations.
- Automatic cart synchronization, red item errors and actionable checkout blockers; loading indicators on API actions.
- Persisted order lifetime timeline with honest legacy history.
- Feature tests and pinned-toolchain `pnpm check` pass, including frontend/backend tests and both builds.

## Completion record

Completed 2026-10-19. All requested UI and history changes are implemented. The uncached root check passes with 550 tests and both production builds; all 25 standard and two large-menu browser scenarios pass, with four additional order regression scenarios after the final confirmation guard.

## Verification

Used repository-pinned **Node 24.22.0** and **pnpm 12.14.0**, with no dependency or lockfile changes.

### Demonstrated acceptance criteria

- Shared `QuantityInput` provides 56px-high minus/plus buttons and a number input with 1–99 bounds, accessible labels, keyboard entry, disabled checkout state, retained invalid drafts and step recovery. Used in fixed/open item dialogs and cart lines. Material fields use outline appearance. Item availability uses switches in the list and editor, retaining authoritative state through failed writes and showing a spinner during saves.
- Settings is the final header link, page title and breadcrumb label. Existing `/setup` URLs remain compatible. Removed decorative eyebrow text, generic slogans, redundant catalog descriptions and direct Categories/Items cross-links. Navigation goes through Settings. Cart's Back to menu is on the left.
- Connection details opens from a 16px orange bottom-right dot with a subtle connected pulse, static red offline state and reduced-motion support. Timestamp/status is below page content and describes the last successful backend check or accepted menu data receipt, rather than entity modification time. Failed checks do not advance it. Footer spacing avoids the fixed cart summary, and summary controls leave room for the dot.
- Shared item images normalize legacy paths, reserve dimensions, lazy-load and recover to a local fallback. Items, cart lines and order details show images. Cart removal uses a black cross at the card's top right. New orders snapshot the current image URL so later menu edits do not change their order image.
- Editing dialogs put Cancel beside Save. Archive/remove controls are in red bordered content sections. Destructive confirmation actions and Cancel sit together inside the confirmation's danger section. Item removal, cart clearing, category/item archival and order cancellation require explicit confirmation. Pending checkout locks are checked again before cart removal/clearing. A cancellation confirmation captures both order ID and revision, so navigation or an intervening update cannot cancel a different order.
- Removed Refresh cart. Existing root realtime/reconnect/focus/15-second synchronization automatically resolves cart items, including off-page entries. A failed reconciliation retains intent and offers a retry through the error component. Browser coverage demonstrates automatic updates and failure recovery without the removed control.
- Invalid cart lines and reconciliation problems have translucent red backgrounds and red text. Review/confirmation shows an alert icon and the reason for a blocker, including invalid inputs, unavailable items, pending checks, recovery and pending checkout. Unavailable lines disable review until removed/replaced. API submit/retry/status/refresh buttons retain their labels under a loading spinner overlay and expose `aria-busy`.
- Added migration `0002_order_history`, an indexed order status event table and order-line image snapshots. Placement and successful transitions persist timestamps atomically with order state/stream revision. Replay, no-op and rejected writes do not add history; a failed history write rolls the entire status mutation back. Order details displays the chronological timeline and saved item images, survives reload and receives live progression.
- Legacy migration backfills placement and latest known status only, plus available menu image URLs. Gaps are labelled instead of inventing earlier transition times. Migration is idempotent and covered using isolated temporary SQLite files. History/image retention is verified after menu edits, archival, idempotent replay and restart.

### Checks

- **Passed:** `CI=true NX_DAEMON=false NX_SKIP_NX_CACHE=true NX_DEFAULT_OUTPUT_STYLE=stream pnpm check` — all four lint/typecheck targets, **133 frontend + 341 backend + 76 contract tests (550 total)**, frontend/backend production builds and shared declarations. Frontend initial bundle: **580.15 kB raw / 145.65 kB estimated transfer**, below the unchanged 600 kB error budget; the existing 550 kB warning remains.

- **Passed:** full standard Chromium suite: `E2E_BACKEND_PORT=3100 E2E_FRONTEND_PORT=4300 pnpm exec playwright test --config apps/frontend-e2e/playwright.config.ts` — **25/25** scenarios. Includes the new integrated control/error/loading/image/timeline scenario and updated live cart, Settings, archival, order cancellation and connection tests.
- **Passed:** final order-confirmation safeguard browser regression: the same command with `orders.spec.ts ui-refinements.spec.ts` — **4/4** scenarios. A frontend unit regression also covers route changes while a cancellation confirmation is open.
- **Passed:** `E2E_BACKEND_PORT=3100 E2E_FRONTEND_PORT=4300 pnpm exec playwright test --config apps/frontend-e2e/playwright.large.config.ts` — **2/2** scenarios using an independent 5,000-item seed. Under 4× CPU slowdown and 150ms latency at 375×812: initial ready **5,871ms**, search **846ms**, interaction feedback **51.4ms**, CLS **0.0893**, and five observed pages of exactly 50 cards. Existing limits remain unchanged.
- **Passed:** `pnpm db:check`; `git diff --check`.
- Inspected repository desktop cart and mobile order-timeline screenshots and the collaborative preview. Standard and large browser suites use independent in-memory databases on alternate ports **3100/4300**. Manual preview uses a separate small in-memory seed on **3200/4400**. Unit database tests use temporary files/in-memory databases. No verification reads, seeds, resets or modifies development data.

### Practical limits

- Earlier status timestamps cannot be recovered for orders placed before this migration. Legacy images use the menu image available at migration; new orders save their placement image URL. External image content remains controlled by its host.
- The frontend retains its existing initial-bundle warning, while staying below the unchanged production error budget. Docker smoke checks were not rerun for this UI/history task.
