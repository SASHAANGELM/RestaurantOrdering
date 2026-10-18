# T05 — Menu configuration and query APIs verification

Verified on 2026-10-18, macOS arm64, using pinned Node **24.22.0** and pnpm **12.14.0** from the existing isolated npm-exec toolchain. Dependencies, lockfile, schema, and migrations are unchanged.

## Implemented behavior

- Registered all nine menu/Setup routes in the Express app. Shared schemas validate bodies, query parameters, and UUID path parameters; malformed or unknown fields receive the existing correlated error envelope. Responses disable caching.
- Setup creates, edits, and archives categories/items, manages availability, moves items between active categories, and switches fixed/open pricing. Names/descriptions are trimmed; `description: null` clears a description. Fixed prices include zero and must fit the shared integer-cent limits; open writes omit `priceMinor`, and open responses return it as null.
- Mutations use short synchronous immediate transactions. An actual change increments the entity revision and persisted menu stream revision together. Stale expected revisions return `409 REVISION_CONFLICT`, including stale requests that would otherwise be no-ops. Semantic no-ops, including repeated archival at the current revision, preserve revisions and timestamps. Failed writes roll back all entity and stream changes.
- Missing items/categories return `404 NOT_FOUND`. Creating or explicitly reassigning an item to an archived category returns `422 CATEGORY_ARCHIVED`. Category archival does not rewrite its children, delete records, or change historical data.
- Menu categories hide archived categories; Menu items hide archived items and children of archived categories while retaining visibly unavailable items. Setup item lists retain children of archived categories for management and hide individually archived items by default. Both Setup lists support `includeArchived=true`; the category query schema is now exported from the contracts library.
- Item lists default to page 1 / 50 items and accept at most 100 items per page, category filtering, and literal substring search of item names. SQLite's built-in `lower()` supplies ASCII case folding; `%`, `_`, and SQL-looking input have no special search meaning. Items sort by name then UUID; categories sort by sort order then UUID. Far-out valid pages return an empty page without overflowing the offset calculation. The existing category response contract returns the category list without pagination.
- Cart resolution accepts 1–100 distinct UUIDs independently of the visible page and returns entries in requested order. Eligibility precedence is missing, item archived, category archived, unavailable, available. Known entries include current item and category DTOs. `readResolvedItems` exposes this same joined eligibility read for T06/T07 to use inside their own authoritative transactions; checkout endpoints remain T06/T07.
- Category, item, and resolution snapshots each read their data/counts and `menuRevision` inside one SQLite read transaction. Mutation service results are `{ response, notification }`; successful methods return after commit, with a contract-shaped `menu.changed` payload or null for a no-op. T08 can broadcast the notification; no Socket.IO server is introduced here.

## Demonstrated acceptance and checks

Added **57 feature tests** beside the implementation in `apps/backend/src/modules/menu/menu.spec.ts`:

- HTTP create/edit/archive, pricing switches, zero/maximum fixed prices, description clearing, availability, and persistence observed through a reopened file connection.
- Invalid pricing/category/unknown-field/UUID/query/resolution inputs, stale edits, overlapping expected-revision requests, and archived-category assignment errors.
- Item/category archive semantics across public Menu, Setup, resolution, and the shared eligibility read intended for checkout. Moving a child back to an active category restores eligibility.
- No-op revision/timestamp preservation, valid unique notification payloads and committed state visible to a separate connection, trigger-induced rollback of all four mutation methods, and retryable real SQLite writer contention with recovery.
- Literal search, category filtering, deterministic name/sort-order ties, empty/far-out pages, and bounded pages for isolated small (12-item) and large (5,000-item) fixtures. Both fixtures are also served through HTTP to verify default limits, page 2, and off-page cart resolution.
- A second WAL connection commits category archival between snapshot row reads and revision reads. Category lists, item lists/counts, and cart resolution each retain the old matching revision/state; subsequent reads observe the newly committed state.
- Menu operations leave the orders revision unchanged and create no quotes/orders/lines.

`NX_SKIP_NX_CACHE=true pnpm check` **passed** after the final implementation/test changes, using the pinned toolchain. All four lint and strict typecheck targets, frontend and backend unit-test targets, shared contract tests, and both frontend/backend production builds plus contracts declarations succeeded with cache reads disabled. The focused menu suite also passed independently. `git diff --check` passed.

All database tests use newly created OS temporary directories and real SQLite files, removed afterward. No development database was read, seeded, reset, or modified. No browser workflow or realtime/checkout behavior is claimed by this task.
