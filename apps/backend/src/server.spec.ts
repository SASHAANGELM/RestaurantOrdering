import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig, type BackendConfig } from './config/config';
import { openDatabase } from './db/connection';
import { startServer } from './server';

describe('backend startup and shutdown on isolated databases', () => {
  let directory: string;
  let config: BackendConfig;
  const runtimes: Awaited<ReturnType<typeof startServer>>[] = [];

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'restaurant-server-'));
    config = { ...loadConfig({ DATABASE_PATH: join(directory, 'test.sqlite'), SEED_MODE: 'none' }), port: 0 };
  });

  afterEach(async () => {
    await Promise.allSettled(runtimes.splice(0).map((runtime) => runtime.shutdown()));
    rmSync(directory, { recursive: true, force: true });
  });

  function url(runtime: Awaited<ReturnType<typeof startServer>>) {
    const address = runtime.server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test listener.');
    return `http://127.0.0.1:${address.port}`;
  }

  async function start(options: Parameters<typeof startServer>[1] = {}, overrides: Partial<BackendConfig> = {}) {
    const runtime = await startServer({ ...config, ...overrides }, options);
    runtimes.push(runtime);
    return runtime;
  }

  it('migrates and seeds before attaching transports or accepting HTTP', async () => {
    const attachSockets = vi.fn((server) => {
      expect(server.listening).toBe(false);
      const inspection = openDatabase(config.databasePath);
      try {
        expect(inspection.sqlite.prepare('SELECT count(*) AS count FROM menu_items').get()).toEqual({ count: 36 });
        expect(inspection.sqlite.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get()).toEqual({ count: 2 });
      } finally { inspection.close(); }
      return { close: async () => undefined, forceClose: () => undefined };
    });
    const runtime = await start({ attachSockets }, { seedMode: 'small' });
    expect(attachSockets).toHaveBeenCalledOnce();
    expect((await fetch(`${url(runtime)}/api/health/ready`)).status).toBe(200);
    await runtime.shutdown();
    const reopened = await start({}, { seedMode: 'small' });
    expect(reopened.connection.sqlite.prepare('SELECT count(*) AS count FROM menu_items').get()).toEqual({ count: 36 });
  });

  it.each(['missing', 'invalid'] as const)('fails startup clearly for %s migrations before attaching a transport', async (mode) => {
    const migrationsFolder = join(directory, 'migrations');
    if (mode === 'invalid') {
      mkdirSync(join(migrationsFolder, 'meta'), { recursive: true });
      writeFileSync(join(migrationsFolder, 'meta', '_journal.json'), JSON.stringify({
        version: '7', dialect: 'sqlite', entries: [{ idx: 0, version: '6', when: 1, tag: '0000_broken', breakpoints: true }]
      }));
      writeFileSync(join(migrationsFolder, '0000_broken.sql'), 'CREATE TABLE partial (id INTEGER);\n--> statement-breakpoint\nINVALID SQL;');
    }
    const attachSockets = vi.fn();
    await expect(start({ migrationsFolder, attachSockets })).rejects.toThrow('database initialization failed; HTTP listener was not started');
    expect(attachSockets).not.toHaveBeenCalled();
    const inspection = openDatabase(config.databasePath);
    try {
      expect(inspection.sqlite.prepare("SELECT name FROM sqlite_master WHERE name IN ('partial', 'menu_items')").all()).toEqual([]);
    } finally { inspection.close(); }
    const recovered = await start();
    expect((await fetch(`${url(recovered)}/api/health/ready`)).status).toBe(200);
  });

  it('reports an inaccessible database path before binding', async () => {
    mkdirSync(config.databasePath);
    await expect(start()).rejects.toThrow('database initialization failed');
  });

  it('closes the migrated database if app construction fails', async () => {
    await expect(start({ registerRoutes: () => { throw new Error('broken router'); } })).rejects.toThrow('app construction failed');
    const recovered = await start();
    expect(recovered.connection.sqlite.open).toBe(true);
  });

  it('closes attached transports and database after a listener bind failure', async () => {
    const first = await start();
    const address = first.server.address();
    if (!address || typeof address === 'string') throw new Error('Missing listener.');
    const close = vi.fn(async () => undefined);
    await expect(start({ attachSockets: () => ({ close, forceClose: () => undefined }) }, {
      databasePath: join(directory, 'second.sqlite'), port: address.port
    })).rejects.toThrow('Backend HTTP startup failed');
    expect(close).toHaveBeenCalledOnce();
    expect((await fetch(`${url(first)}/api/health/ready`)).status).toBe(200);
  });

  it('drains an active request and awaits socket cleanup before closing SQLite; shutdown is idempotent', async () => {
    let finishRequest!: () => void;
    let requestStarted!: () => void;
    let finishSockets!: () => void;
    const started = new Promise<void>((resolve) => { requestStarted = resolve; });
    const socketCleanup = new Promise<void>((resolve) => { finishSockets = resolve; });
    const close = vi.fn(() => socketCleanup);
    const runtime = await start({
      registerRoutes: (app) => app.get('/slow', (_request, response) => {
        finishRequest = () => { response.json(runtime.connection.sqlite.prepare('SELECT menu_revision FROM app_state').get()); };
        requestStarted();
      }),
      attachSockets: () => ({ close, forceClose: vi.fn() })
    });
    const pending = fetch(`${url(runtime)}/slow`);
    await started;
    const shutdown = runtime.shutdown();
    expect(runtime.isShuttingDown()).toBe(true);
    expect(runtime.shutdown()).toBe(shutdown);
    expect(runtime.connection.sqlite.open).toBe(true);
    finishRequest();
    expect(await (await pending).json()).toEqual({ menu_revision: 0 });
    expect(runtime.connection.sqlite.open).toBe(true);
    finishSockets();
    await shutdown;
    expect(close).toHaveBeenCalledOnce();
    expect(runtime.server.listening).toBe(false);
    expect(runtime.connection.sqlite.open).toBe(false);
    await runtime.shutdown();
  });

  it('forces stalled HTTP and upgraded connections closed at the shutdown deadline', async () => {
    let requestStarted!: () => void;
    const started = new Promise<void>((resolve) => { requestStarted = resolve; });
    const forceClose = vi.fn();
    const runtime = await start({
      registerRoutes: (app) => app.get('/stalled', () => { requestStarted(); }),
      attachSockets: () => ({ close: () => new Promise<void>(() => undefined), forceClose })
    }, { shutdownTimeoutMs: 100 });
    const address = runtime.server.address();
    if (!address || typeof address === 'string') throw new Error('Missing listener.');
    const upgraded = createConnection({ host: '127.0.0.1', port: address.port });
    const upgradedClosed = new Promise<void>((resolve) => upgraded.once('close', () => resolve()));
    const upgradeAccepted = new Promise<void>((resolve) => {
      runtime.server.once('upgrade', (_request, socket) => {
        socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n');
        resolve();
      });
    });
    upgraded.on('data', () => undefined);
    upgraded.write('GET /upgrade HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n');
    await upgradeAccepted;
    const pending = fetch(`${url(runtime)}/stalled`).catch((error: unknown) => error);
    await started;
    await expect(runtime.shutdown()).rejects.toThrow('exceeded SHUTDOWN_TIMEOUT_MS');
    await upgradedClosed;
    expect(await pending).toBeInstanceOf(Error);
    expect(forceClose).toHaveBeenCalledOnce();
    expect(runtime.connection.sqlite.open).toBe(false);
    expect(runtime.server.listening).toBe(false);
  });

  it('closes the database and HTTP listener even when socket cleanup rejects', async () => {
    const forceClose = vi.fn();
    const runtime = await start({ attachSockets: () => ({
      close: async () => { throw new Error('socket cleanup failed'); }, forceClose
    }) });
    await expect(runtime.shutdown()).rejects.toThrow('socket cleanup failed');
    expect(forceClose).toHaveBeenCalledOnce();
    expect(runtime.connection.sqlite.open).toBe(false);
    expect(runtime.server.listening).toBe(false);
  });
});
