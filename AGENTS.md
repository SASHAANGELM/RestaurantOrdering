# Project guidance

Before marking any implementation task complete, run `pnpm check` and confirm
that **both frontend and backend unit tests pass** and **both production builds
succeed**. The root check also runs lint, strict typechecking, and shared contract
tests. Do not treat an unrun or failing check as a completed task; report any
blocker explicitly. Use the Node and pnpm versions pinned in the repository.

Keep feature tests with their implementation. Database tests must use isolated
temporary databases and must never read, seed, reset, or modify development data.
Record demonstrated acceptance criteria in `docs/` and update `docs/tasks.md`
only after verification succeeds.
