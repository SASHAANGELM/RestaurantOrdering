# Project guidance

Every time you need to select the next task or list all tasks, read
[`docs/tasks/README.md`](docs/tasks/README.md) first. It is the task index with
statuses and dependencies. Then read the relevant task files and any dependency
files needed for the work. Keep each task's scope, acceptance criteria, completion
record, and verification results together in its file in `docs/tasks/`; do not
create separate task verification files. Keep its status synchronized with the index.
Name task files with the lowercase stable ID and a title slug, for example
`t06-implement-authoritative-checkout-quotes.md`.

Before marking any implementation task complete, run `pnpm check` and confirm
that **both frontend and backend unit tests pass** and **both production builds
succeed**. The root check also runs lint, strict typechecking, and shared contract
tests. Do not treat an unrun or failing check as a completed task; report any
blocker explicitly. Use the Node and pnpm versions pinned in the repository.

Keep feature tests with their implementation. Database tests must use isolated
temporary databases and must never read, seed, reset, or modify development data.
Record demonstrated acceptance criteria and verification results in the relevant
task file under `docs/tasks/` and mark tasks complete in
their task files and `docs/tasks/README.md` only after verification succeeds.
