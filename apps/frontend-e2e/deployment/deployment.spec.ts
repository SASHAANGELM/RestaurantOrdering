import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import { itemsResponseSchema, orderResponseSchema, quoteResponseSchema, type ServerToClientEvents, type ClientToServerEvents } from '@restaurant-ordering/contracts';

const exec = promisify(execFile);
async function docker(args: string[]) {
  // Keep this worker's event loop free so live socket clients can answer close
  // frames while Docker waits for graceful backend shutdown.
  const result = await exec('docker', args, { encoding: 'utf8', timeout: 60_000 });
  return result.stdout.trim();
}
function compose(args: string[]) {
  if (!/^restaurant-smoke-[a-f0-9]{8}$/.test(process.env['DOCKER_SMOKE_PROJECT'] ?? '')) {
    throw new Error('Run pnpm docker:smoke; this test requires its own disposable Compose project.');
  }
  return docker(['compose', '--project-name', process.env['DOCKER_SMOKE_PROJECT']!, '--file', 'compose.yaml', ...args]);
}
function socket(baseURL: string, transports: string[]) {
  const client: Socket<ServerToClientEvents, ClientToServerEvents> = io(baseURL, {
    transports, autoConnect: false, reconnection: false, timeout: 10_000
  });
  const ready = new Promise<void>((resolve, reject) => {
    client.once('sync.state', () => resolve());
    client.once('connect_error', reject);
  });
  client.connect();
  return { client, ready };
}

test('production containers proxy, persist, shut down cleanly, and recover after backend recreation', async ({ page, request, baseURL }) => {
  const staticResponses: { url: string; cache: string | undefined }[] = [];
  page.on('response', (response) => {
    if (['script', 'stylesheet'].includes(response.request().resourceType())) {
      staticResponses.push({ url: response.url(), cache: response.headers()['cache-control'] });
    }
  });
  expect((await compose(['config', '--services'])).split(/\s+/).sort()).toEqual(['backend', 'frontend']);
  const backendId = await compose(['ps', '--quiet', 'backend']);
  const frontendId = await compose(['ps', '--quiet', 'frontend']);
  for (const id of [backendId, frontendId]) {
    expect(await docker(['inspect', '--format', '{{.State.Health.Status}}', id])).toBe('healthy');
    expect(await docker(['exec', id, 'id', '-u'])).not.toBe('0');
  }
  expect((await request.get('/api')).ok()).toBe(true);
  expect(await (await request.get('/api/health/live')).json()).toEqual({ status: 'live' });
  expect(await (await request.get('/api/health/ready')).json()).toEqual({ status: 'ready' });
  expect(await (await request.get('/health')).text()).toBe('healthy\n');
  const missing = await request.get('/api/not-an-endpoint');
  expect(missing.status()).toBe(404);
  expect(missing.headers()['content-type']).toContain('application/json');
  expect((await request.get('/api/__e2e/omitted')).status()).toBe(404);
  expect((await request.post('/api/__e2e/omit', { data: { menuId: randomUUID() } })).status()).toBe(404);
  expect((await request.get('/socket.io/?EIO=4&transport=invalid')).status()).toBe(400);
  expect((await request.get('/missing.js')).status()).toBe(404);
  const html = await request.get('/setup');
  expect(html.headers()['cache-control']).toBe('no-cache');
  const script = (await html.text()).match(/src="([^"]+\.js)"/)!;
  const asset = await request.get(`/${script[1]}`);
  expect(asset.ok()).toBe(true);
  expect(asset.headers()['cache-control']).toContain('immutable');

  const menu = itemsResponseSchema.parse(await (await request.get('/api/menu/items')).json());
  expect(menu.total).toBe(36);
  const item = menu.items.find((entry) => entry.pricingMode === 'fixed' && entry.available)!;
  expect(item).toBeTruthy();
  const polling = socket(baseURL!, ['polling']);
  const upgrade = socket(baseURL!, ['polling', 'websocket']);
  try {
    await Promise.all([polling.ready, upgrade.ready]);
    await expect.poll(() => upgrade.client.io.engine.transport.name).toBe('websocket');
    expect(polling.client.io.engine.transport.name).toBe('polling');
    const notifications = [polling.client, upgrade.client].map((client) => new Promise<string>((resolve) => {
      client.once('orders.changed', (event) => resolve(event.orderId));
    }));
    const quoteResponse = await request.post('/api/checkout/quotes', { data: {
      lines: [{ itemId: item.id, quantity: 1, observedRevision: item.revision }], discountMinor: 0
    } });
    expect(quoteResponse.ok()).toBe(true);
    const quote = quoteResponseSchema.parse(await quoteResponse.json());
    const key = randomUUID();
    const confirmation = await request.post('/api/orders', {
      headers: { 'Idempotency-Key': key }, data: { quoteId: quote.quoteId }
    });
    expect(confirmation.status()).toBe(201);
    const original = orderResponseSchema.parse(await confirmation.json());
    expect(await Promise.all(notifications)).toEqual([original.order.id, original.order.id]);

    await page.goto(`/orders/${original.order.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Order');
    await expect(page.getByRole('button', { name: 'Connection details' })).toContainText('Connected');
    await page.reload(); // A deep detail link must serve the SPA and read the saved order.
    await expect(page.getByRole('main')).toContainText(item.name);
    await page.goto('/setup');
    await expect(page.getByRole('heading', { name: 'Setup', exact: true })).toBeVisible();
    await page.goto('/menu');
    await expect(page.getByRole('main')).toContainText(item.name);
    await expect(page.getByRole('button', { name: 'Connection details' })).toContainText('Connected');
    expect(staticResponses.length).toBeGreaterThan(3);
    for (const response of staticResponses) expect(response.cache, response.url).toContain('immutable');

    await compose(['stop', 'backend']); // Exercise SIGTERM with active polling and upgraded clients.
    expect(await docker(['inspect', '--format', '{{.State.ExitCode}}', backendId])).toBe('0');
    expect(await docker(['inspect', '--format', '{{.State.OOMKilled}}', backendId])).toBe('false');
    await expect(page.getByRole('button', { name: 'Connection details' })).toContainText('Offline');
    await expect(page.getByRole('main')).toContainText(item.name);
    expect([502, 504]).toContain((await request.get('/api/health/ready')).status());
    expect((await request.get('/health')).ok()).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('status').first()).toContainText('disconnected');
    await page.getByRole('button', { name: 'Refresh menu', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
    await expect(page.getByRole('main')).toContainText(item.name);

    await compose(['up', '--detach', '--wait', '--wait-timeout', '60', 'backend']);
    await expect.poll(async () => (await request.get('/api/health/ready')).status()).toBe(200);
    await expect(page.getByRole('button', { name: 'Connection details' })).toContainText('Connected');
    await expect(page.getByRole('alert')).not.toBeVisible();
    expect(orderResponseSchema.parse(await (await request.get(`/api/orders/${original.order.id}`)).json())).toEqual(original);
    await compose(['up', '--detach', '--force-recreate', '--wait', '--wait-timeout', '60', 'backend']);
    expect(await compose(['ps', '--quiet', 'backend'])).not.toBe(backendId);
    expect(await compose(['ps', '--quiet', 'frontend'])).toBe(frontendId);
    await expect.poll(async () => (await request.get('/api/health/ready')).status()).toBe(200);
    await expect(page.getByRole('button', { name: 'Connection details' })).toContainText('Connected');
    expect(orderResponseSchema.parse(await (await request.get(`/api/orders/by-request/${key}`)).json())).toEqual(original);
    const replay = await request.post('/api/orders', { headers: { 'Idempotency-Key': key }, data: { quoteId: quote.quoteId } });
    expect(replay.ok()).toBe(true);
    expect(orderResponseSchema.parse(await replay.json())).toEqual(original);
    expect(itemsResponseSchema.parse(await (await request.get('/api/menu/items')).json()).total).toBe(36);
    await page.goto(`/orders/${original.order.id}`);
    await expect(page.getByRole('main')).toContainText(item.name);
  } finally {
    polling.client.disconnect();
    upgrade.client.disconnect();
  }
});
