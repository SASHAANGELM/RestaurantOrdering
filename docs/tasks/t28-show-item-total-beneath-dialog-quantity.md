# T28 — Show item total beneath dialog quantity

Status: **Complete**

Depends on: T26

[Task index](README.md)

## Scope and acceptance criteria

- Show the item total directly beneath Quantity in the Add/Edit cart dialog, aligned to the right.
- Multiply fixed or entered unit price by the current quantity, formatted as USD; 4.50 × 3 displays $13.50.
- Update when inputs or selected cart lines change. Invalid drafts show a dash; zero quantity displays zero for the existing remove workflow.
- Run pinned `pnpm check`, including frontend/backend/contracts tests and both production builds.

## Completion record

Completed 2026-10-20. Added a USD total directly below Quantity in the shared Add/Edit cart dialog. Reactive price/quantity values recalculate the amount using integer cents and existing input validation. Existing cart entries use their stored item price; selecting another line updates the total. A polite live output announces changes.

## Verification

Verified on 2026-10-20 with repository-pinned **Node 24.22.0** and **pnpm 12.14.0**.

- **Passed:** `CI=true NX_DAEMON=false NX_DEFAULT_OUTPUT_STYLE=stream pnpm check` — lint, strict typechecking, **158 frontend + 353 backend + 77 shared-contract tests (588 total)** and both production builds. Unchanged backend/contracts results were reused from Nx cache.
- Added component coverage checks the total directly follows the quantity component, starts at $9.00 for two $4.50 items and becomes $13.50 through a quantity input event. Empty quantity shows a dash; zero shows $0.00. Open-price coverage checks changing prices, exact-cent multiplication ($0.10 × 3 = $0.30), invalid decimal precision, zero price and out-of-range quantity.
- The initial verification caught that plain FormControl value reads did not notify OnPush rendering after programmatic changes. Converted value changes to signals and reran the full check successfully.
- **Passed:** `git diff --check`.

No database, dependencies or schema changes. Existing database tests retain their isolated temporary database setup. Browser checks were not run for this small UI addition. The frontend initial bundle is **591.01 kB**, below the existing 600 kB error limit, with the existing warning above 550 kB.

## Alignment follow-up

2026-10-20: Right-aligned the total beneath Quantity using `.item-total { text-align: right; }`. Re-ran `CI=true NX_DAEMON=false NX_DEFAULT_OUTPUT_STYLE=stream pnpm check` with pinned Node 24.22.0 and pnpm 12.14.0: lint, strict typechecking, 158 frontend + 353 backend + 77 shared-contract tests and both production builds passed. Unchanged backend/contracts Nx results were cached. `git diff --check` passed. The existing frontend bundle warning remains below the error limit.
