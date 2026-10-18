# T14 — Implement two-service Docker deployment

Status: **Not started**

Depends on: [T08](t08-implement-socket-io-and-revision-synchronization.md), [T09](t09-implement-angular-shell-and-client-adapters.md)

[Task index](README.md)

## Scope

Add root `compose.yaml`, multi-stage frontend/backend Dockerfiles, `.dockerignore`, Nginx config, health checks, optional `.env.example`, and named SQLite volume. Compile native SQLite dependencies inside Linux images; ensure non-root volume permissions. Proxy HTTP/polling/Upgrade traffic and deep frontend routes correctly.

## Acceptance criteria

`docker compose config --services` lists exactly `frontend` and `backend`. A clean `docker compose up --build` starts a seeded app without extra commands. Deep links, `/api`, Socket.IO polling/upgrade, health readiness, and backend shutdown work. Restart/recreate preserves orders; a failed backend produces a recoverable UI state. Defaults do not require editing `.env` or embedding a host-specific API URL.
