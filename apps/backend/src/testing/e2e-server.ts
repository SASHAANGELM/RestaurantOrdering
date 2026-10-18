import { resolve } from 'node:path';
import { startServer } from '../server';

/** Test entry point only; never imported by either production entry point. */
async function main() {
  const seedMode = process.argv.includes('--large') ? 'large' : process.argv.includes('--small') ? 'small' : 'none';
  const omittedMenu = new Set<string>();
  const omittedOrders = new Set<string>();
  const suppressed: { stream: 'menu' | 'orders'; id: string }[] = [];
  const runtime = await startServer({
    host: '127.0.0.1', port: Number(process.env['E2E_BACKEND_PORT'] ?? 3000), databasePath: ':memory:', seedMode,
    jsonBodyLimitBytes: 65_536, shutdownTimeoutMs: 10_000, socketRecoveryMs: 120_000
  }, {
    migrationsFolder: resolve('apps/backend/drizzle'),
    imagesDirectory: resolve('apps/backend/src/assets/images'),
    registerRoutes: (app) => {
      app.post('/api/__e2e/omit', (request, response) => {
        const body = request.body as { menuId?: string; orderId?: string };
        if (body.menuId) omittedMenu.add(body.menuId);
        if (body.orderId) omittedOrders.add(body.orderId);
        response.sendStatus(204);
      });
      app.get('/api/__e2e/omitted', (_request, response) => response.json(suppressed));
    }
  });
  const menuChanged = runtime.realtime.menuChanged.bind(runtime.realtime);
  const ordersChanged = runtime.realtime.ordersChanged.bind(runtime.realtime);
  runtime.realtime.menuChanged = (event) => {
    if (omittedMenu.has(event.entityId)) suppressed.push({ stream: 'menu', id: event.entityId });
    else menuChanged(event);
  };
  runtime.realtime.ordersChanged = (event) => {
    if (omittedOrders.has(event.orderId)) suppressed.push({ stream: 'orders', id: event.orderId });
    else ordersChanged(event);
  };
  const shutdown = () => { void runtime.shutdown().catch((error: unknown) => { console.error(error); process.exitCode = 1; }); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
