# T02 — Define shared runtime contracts

Status: **Complete**

Depends on: [T01](t01-scaffold-nx-workspace-and-quality-commands.md)

[Task index](README.md)

## Scope

Create Zod schemas and inferred DTOs for menu/setup, cart intent, persisted quote snapshot, order, status updates, pagination, revisions, errors, and Socket.IO event maps. Include money/quantity/string limits and concrete error-detail schemas from [contracts](../contracts.md).

## Acceptance criteria

Both apps import the library without framework/server dependencies leaking across boundaries; representative malformed prices, quantities, enums, and unknown request fields are rejected. Decimal parsing and monetary arithmetic have focused boundary tests.

## Completion record

Completed 2026-10-18. See [verification results](#verification) and the [implemented contract reference](../contracts.md). All 77 unit tests, root quality checks, frozen install, and existing browser smoke test pass.

## Verification

Verified on 2026-10-18, macOS arm64, using the pinned Node **24.22.0** and pnpm **12.14.0** through the same isolated npm-exec toolchain used in T01. Zod **4.6.7** is an exact direct runtime dependency with a frozen lockfile; no peer or engine bypass was used.

### Delivered contracts

`libs/contracts/src/index.ts` exports strict Zod schemas and inferred DTOs for menu/setup, cart intent, persisted quote snapshots and review changes, historical orders, pagination, optimistic and stream revisions, error details, and socket event callbacks. Money helpers parse decimal strings exactly, bound unit prices and quantities, validate discounts, and reject unsafe totals. Status helpers encode the agreed manual transition graph.

The [contract reference](../contracts.md) records concrete error codes/details and HTTP mappings, response shapes, pricing-edit rules, and optional observed names for explicit quote differences. Backend services must still validate current database state; the shared schemas do not implement APIs, persistence, quote expiry enforcement, idempotency, or socket transport.

### Demonstrated acceptance criteria

- `pnpm install --frozen-lockfile`: passed with strict engine/peer settings.
- `pnpm check`: passed lint/typecheck across all four projects, tests across three projects, and production builds for both apps and contracts declarations.
- **77 unit tests passed**: 75 shared contract/money cases in two spec files, one frontend consumer case through Angular's Vitest builder, and one backend consumer case through backend Vitest. Backend/contracts suites now fail if empty.
- `pnpm e2e`: the existing one-test Chromium smoke suite passed, verifying the rendered Angular placeholder and the same-origin Express proxy. Feature workflows remain later tasks.
- `git diff --check`: passed.

Boundary coverage includes malformed/fractional/negative/unsafe prices and quantities, unknown top-level and nested request fields, invalid enums/UUIDs/revisions/timestamps, string limits, fixed/open pricing combinations, pagination coercion traps, maximum cart size, distinct open-price lines, mismatched snapshot arithmetic, zero totals, changed-line references, every detailed error variant, all 25 possible status pairs, and socket event payloads/type maps.

Money coverage includes the `1.15` floating-point trap, the 1,000,000-cent unit-price limit, 99-unit lines, a 100-line cart totaling **9,900,000,000 cents**, discounts equal to and above subtotal, `Number.MAX_SAFE_INTEGER`, the first unsafe decimal cent, unsafe addition, signs/exponents/separators, excess precision, and invalid or oversized strings.

Both app test targets import runtime values and inferred types through `@restaurant-ordering/contracts`. Their first real shared imports exposed TypeScript 6's app-local inferred source roots; app configs now explicitly use the workspace root so shared source imports typecheck. Nx/ESLint still enforce project/import boundaries. Contracts source imports only Zod and sibling contract modules; the frontend test builder successfully bundles and executes the consumer without server/framework dependencies in the library.

The application remains the T01 placeholder. Production frontend output remains **93.65 kB raw / 28.34 kB estimated transfer**, within the existing budgets. Schemas are exercised by app tests; feature adapters will consume them in subsequent tasks. No development database was created or touched.
