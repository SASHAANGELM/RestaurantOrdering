import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiErrorSchema, createCategorySchema, idSchema, paginationQuerySchema } from '@restaurant-ordering/contracts';
import { createApp } from './app';
import { openDatabase, type DatabaseConnection } from './db/connection';
import { initializeDatabase } from './db/initialize';
import { HttpError } from './middleware/errors';
import { validateRequest } from './middleware/validation';

describe('Express HTTP boundary with isolated SQLite files', () => {
  let directory: string;
  let connection: DatabaseConnection;
  let server: Server;
  let baseUrl: string;
  let stopping: boolean;
  const reportError = vi.fn();

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'restaurant-http-'));
    connection = initializeDatabase({ filename: join(directory, 'test.sqlite') });
    stopping = false;
    reportError.mockClear();
    const app = createApp({
      connection, jsonBodyLimitBytes: 256, reportError, isShuttingDown: () => stopping,
      registerRoutes: (app) => {
        app.post('/test/body', (request, response) => {
          response.json(validateRequest(createCategorySchema, request.body, 'body'));
        });
        app.get('/test/query', (request, response) => {
          response.json(validateRequest(paginationQuerySchema, request.query, 'query'));
        });
        app.get('/test/params/:id', (request, response) => {
          response.json(validateRequest(z.strictObject({ id: idSchema }), request.params, 'params'));
        });
        app.get('/test/headers', (request, response) => {
          response.json({ key: validateRequest(idSchema, request.get('Idempotency-Key'), 'headers') });
        });
        app.get('/test/sync-error', () => { throw new Error('secret SQL and internal pathname'); });
        app.get('/test/async-error', async () => { await Promise.resolve(); throw new Error('secret async details'); });
        app.get('/test/conflict', () => {
          throw new HttpError({ code: 'IDEMPOTENCY_CONFLICT', message: 'Use the original request.',
            details: { idempotencyKey: '11111111-1111-4111-8111-111111111111' } });
        });
        app.post('/test/locked', () => {
          // Exercise a real driver error wrapped the way Drizzle wraps query failures.
          try { connection.sqlite.prepare('UPDATE app_state SET menu_revision = menu_revision + 1 WHERE id = 1').run(); }
          catch (error) { throw new Error('Query failed: private SQL', { cause: error }); }
        });
        app.get('/test/extended-lock', () => {
          throw Object.assign(new Error('private lock details'), { code: 'SQLITE_LOCKED_SHAREDCACHE' });
        });
        app.get('/test/constraint', () => {
          connection.sqlite.prepare('UPDATE app_state SET menu_revision = -1').run();
        });
      }
    });
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test listener.');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (connection.sqlite.open) connection.close();
    rmSync(directory, { recursive: true, force: true });
  });

  async function expectError(response: Response, status: number, code: string) {
    expect(response.status).toBe(status);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe(code);
    expect(body.error.requestId).toBe(response.headers.get('x-request-id'));
    expect(idSchema.safeParse(body.error.requestId).success).toBe(true);
    return body.error;
  }

  it('serves the existing API with fresh request IDs and no cross-origin grants', async () => {
    const first = await fetch(`${baseUrl}/api`, { headers: { 'X-Request-Id': 'untrusted', Origin: 'https://example.com' } });
    expect(await first.json()).toEqual({ name: 'Restaurant Ordering API' });
    expect(idSchema.safeParse(first.headers.get('x-request-id')).success).toBe(true);
    expect(first.headers.get('access-control-allow-origin')).toBeNull();
    expect(first.headers.get('x-powered-by')).toBeNull();
    const second = await fetch(`${baseUrl}/api`);
    expect(second.headers.get('x-request-id')).not.toBe(first.headers.get('x-request-id'));
    await second.body?.cancel();
  });

  it('reports live and ready after migration', async () => {
    expect(await (await fetch(`${baseUrl}/api/health/live`)).json()).toEqual({ status: 'live' });
    const ready = await fetch(`${baseUrl}/api/health/ready`);
    expect(ready.headers.get('cache-control')).toBe('no-store');
    expect(await ready.json()).toEqual({ status: 'ready' });
  });

  it.each(['closed', 'unmigrated', 'missing-state', 'missing-journal'] as const)('remains live but not ready with %s database', async (condition) => {
    if (condition === 'closed') connection.close();
    else if (condition === 'unmigrated') {
      connection.close();
      const raw = openDatabase(join(directory, 'unmigrated.sqlite'));
      Object.assign(connection, raw);
    } else if (condition === 'missing-state') connection.sqlite.prepare('DELETE FROM app_state').run();
    else connection.sqlite.prepare('DELETE FROM __drizzle_migrations').run();
    await expectError(await fetch(`${baseUrl}/api/health/ready`), 503, 'SERVICE_UNAVAILABLE');
    expect((await fetch(`${baseUrl}/api/health/live`)).status).toBe(200);
  });

  it('rejects readiness and new work while draining but remains live', async () => {
    stopping = true;
    const response = await fetch(`${baseUrl}/api/health/ready`);
    expect(response.headers.get('retry-after')).toBe('1');
    await expectError(response, 503, 'SERVICE_UNAVAILABLE');
    await expectError(await fetch(`${baseUrl}/api`), 503, 'SERVICE_UNAVAILABLE');
    expect((await fetch(`${baseUrl}/api/health/live`)).status).toBe(200);
  });

  it('returns parsed/trimmed values and query defaults', async () => {
    const response = await fetch(`${baseUrl}/test/body`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '  Drinks  ' })
    });
    expect(await response.json()).toEqual({ name: 'Drinks', sortOrder: 0 });
    expect(await (await fetch(`${baseUrl}/test/query`)).json()).toEqual({ page: 1, pageSize: 50 });
    expect(await (await fetch(`${baseUrl}/test/query?page=2&pageSize=10`)).json()).toEqual({ page: 2, pageSize: 10 });
    const id = randomUUID();
    expect(await (await fetch(`${baseUrl}/test/params/${id}`)).json()).toEqual({ id });
    expect(await (await fetch(`${baseUrl}/test/headers`, { headers: { 'Idempotency-Key': id } })).json()).toEqual({ key: id });
  });

  it.each([{ name: '' }, { name: 'Drinks', extra: true }, { name: 'Drinks', sortOrder: 1.5 }])('rejects invalid body %j', async (body) => {
    const response = await fetch(`${baseUrl}/test/body`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const error = await expectError(response, 400, 'VALIDATION_ERROR');
    if (error.code === 'VALIDATION_ERROR') expect(error.details.issues[0]?.path[0]).toBe('body');
  });

  it.each(['page=0', 'pageSize=101', 'page=1&page=2', 'unknown=true', 'page=1e2'])('rejects malformed query %s', async (query) => {
    await expectError(await fetch(`${baseUrl}/test/query?${query}`), 400, 'VALIDATION_ERROR');
  });

  it('validates path parameters and required headers', async () => {
    await expectError(await fetch(`${baseUrl}/test/params/not-a-uuid`), 400, 'VALIDATION_ERROR');
    await expectError(await fetch(`${baseUrl}/test/params/%E0%A4%A`), 400, 'VALIDATION_ERROR');
    await expectError(await fetch(`${baseUrl}/test/headers`), 400, 'VALIDATION_ERROR');
  });

  it.each(['{"secret":', 'null', '42', '"text"', JSON.stringify({ name: 'a'.repeat(300) })])('rejects invalid or oversized JSON without reflecting input', async (body) => {
    const error = await expectError(await fetch(`${baseUrl}/test/body`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body
    }), 400, 'VALIDATION_ERROR');
    expect(JSON.stringify(error)).not.toContain('secret');
  });

  it('rejects compressed JSON and non-JSON bodies through the common boundary', async () => {
    await expectError(await fetch(`${baseUrl}/test/body`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }, body: 'invalid' }), 400, 'VALIDATION_ERROR');
    await expectError(await fetch(`${baseUrl}/test/body`, { method: 'POST', body: 'name=Drinks' }), 400, 'VALIDATION_ERROR');
  });

  it.each(['sync-error', 'async-error', 'constraint'])('hides unexpected %s details and logs the correlated failure', async (route) => {
    const error = await expectError(await fetch(`${baseUrl}/test/${route}`), 500, 'INTERNAL_ERROR');
    expect(error).not.toHaveProperty('details');
    expect(JSON.stringify(error)).not.toMatch(/secret|SQL|pathname|stack|constraint/i);
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ event: 'request.failed', requestId: error.requestId }));
  });

  it('maps domain conflicts using the shared status and detail contract', async () => {
    await expectError(await fetch(`${baseUrl}/test/conflict`), 409, 'IDEMPOTENCY_CONFLICT');
    expect(reportError).not.toHaveBeenCalled();
  });

  it('maps real SQLite writer contention to a retryable response and recovers', async () => {
    connection.sqlite.pragma('busy_timeout = 1');
    const blocker = openDatabase(join(directory, 'test.sqlite'));
    try {
      blocker.sqlite.exec('BEGIN IMMEDIATE');
      const response = await fetch(`${baseUrl}/test/locked`, { method: 'POST' });
      expect(response.headers.get('retry-after')).toBe('1');
      const error = await expectError(response, 503, 'SERVICE_UNAVAILABLE');
      if (error.code === 'SERVICE_UNAVAILABLE') expect(error.details.retryAfterMs).toBe(1000);
      expect(connection.sqlite.prepare('SELECT menu_revision FROM app_state').get()).toEqual({ menu_revision: 0 });
    } finally { blocker.sqlite.exec('ROLLBACK'); blocker.close(); }
    expect((await fetch(`${baseUrl}/api/health/ready`)).status).toBe(200);
  });

  it('maps extended SQLite lock codes', async () => {
    await expectError(await fetch(`${baseUrl}/test/extended-lock`), 503, 'SERVICE_UNAVAILABLE');
  });

  it('returns contract-shaped 404 JSON for unknown endpoints', async () => {
    const error = await expectError(await fetch(`${baseUrl}/api/not-implemented`), 404, 'NOT_FOUND');
    if (error.code === 'NOT_FOUND') expect(error.details).toEqual({ resourceType: 'request', resourceId: error.requestId });
  });
});
