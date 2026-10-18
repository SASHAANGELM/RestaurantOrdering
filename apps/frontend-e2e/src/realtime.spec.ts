import { expect, test, type Page } from '@playwright/test';
import type { io, Socket } from 'socket.io-client';
import {
  categoryMutationResponseSchema, menuChangedSchema, syncStateSchema,
  type ClientToServerEvents, type MenuChanged, type ServerToClientEvents, type SyncState
} from '@restaurant-ordering/contracts';

declare global {
  interface Window {
    io: typeof io;
    realtimeTest: {
      socket: Socket<ServerToClientEvents, ClientToServerEvents>;
      states: SyncState[];
      menus: MenuChanged[];
    };
  }
}

async function connect(page: Page, transports: string[]) {
  await page.goto('/');
  await page.addScriptTag({ path: require.resolve('socket.io-client/dist/socket.io.js') });
  await page.evaluate((transports) => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = window.io({
      path: '/socket.io', transports, autoConnect: false, reconnection: false
    });
    const state = { socket, states: [] as SyncState[], menus: [] as MenuChanged[] };
    window.realtimeTest = state;
    socket.on('sync.state', (event) => state.states.push(event));
    socket.on('menu.changed', (event) => state.menus.push(event));
    socket.connect();
  }, transports);
  await expect.poll(() => page.evaluate(() => window.realtimeTest.states.length)).toBe(1);
}

test('two browser contexts receive committed notifications through the same-origin polling and upgrade proxy', async ({ page, browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  const second = await context.newPage();
  try {
    await Promise.all([connect(page, ['polling']), connect(second, ['polling', 'websocket'])]);
    expect(await page.evaluate(() => window.realtimeTest.socket.io.engine.transport.name)).toBe('polling');
    await expect.poll(() => second.evaluate(() => window.realtimeTest.socket.io.engine.transport.name)).toBe('websocket');
    const initial = syncStateSchema.parse(await page.evaluate(() => window.realtimeTest.states[0]));
    expect(await second.evaluate(() => window.realtimeTest.states[0])).toEqual(initial);

    const result = await page.evaluate(async () => {
      const response = await fetch('/api/setup/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Browser realtime test' })
      });
      return { status: response.status, body: await response.json() as unknown };
    });
    expect(result.status).toBe(201);
    const committed = categoryMutationResponseSchema.parse(result.body);
    for (const client of [page, second]) {
      await expect.poll(() => client.evaluate(() => window.realtimeTest.menus.length)).toBe(1);
      const event = menuChangedSchema.parse(await client.evaluate(() => window.realtimeTest.menus[0]));
      expect(event).toMatchObject({ menuRevision: committed.menuRevision,
        entityType: 'category', entityId: committed.category.id, change: 'created' });
      expect(event.menuRevision).toBe(initial.menuRevision + 1);
      const sync = syncStateSchema.parse(await client.evaluate(async () => (await fetch('/api/sync')).json()));
      expect(sync).toEqual({ menuRevision: committed.menuRevision, ordersRevision: initial.ordersRevision });
    }
    expect(await second.evaluate(() => window.realtimeTest.menus)).toEqual(await page.evaluate(() => window.realtimeTest.menus));
  } finally {
    await page.evaluate(() => window.realtimeTest?.socket.disconnect());
    await context.close();
  }
});
