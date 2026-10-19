import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { categoryMutationResponseSchema, itemMutationResponseSchema, orderResponseSchema, quoteResponseSchema } from '@restaurant-ordering/contracts';

async function createItem(request: APIRequestContext) {
  const name = `Shell soup ${randomUUID()}`;
  const category = categoryMutationResponseSchema.parse(await (await request.post('/api/setup/categories', { data: { name } })).json());
  const item = itemMutationResponseSchema.parse(await (await request.post('/api/setup/items', {
    data: { name, categoryId: category.category.id, available: true, pricingMode: 'fixed', priceMinor: 750 }
  })).json());
  return item.item;
}

test('lazy routes keep one socket, move heading focus, and support a keyboard-accessible connection dialog', async ({ page }) => {
  const handshakes: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/socket.io') && url.searchParams.has('EIO') &&
      url.searchParams.get('transport') === 'polling' && !url.searchParams.has('sid')) handshakes.push(request.url());
  });
  await page.goto('/');
  const connection = page.getByRole('button', { name: 'Connection details', exact: true });
  await expect(connection).toContainText('Connected');
  for (const name of ['Settings', 'Orders', 'Menu', 'Orders', 'Settings', 'Menu']) {
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page');
  }
  expect(handshakes).toHaveLength(1);
  await connection.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Connection details', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Check for updates' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Check for updates' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(connection).toBeFocused();
  await page.goto('/setup');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  expect(errors).toEqual([]);
});

test('real Angular stores update in a second context and retain content through failed offline refresh', async ({ page, browser, baseURL, request }) => {
  const item = await createItem(request);
  const secondContext = await browser.newContext({ baseURL });
  const second = await secondContext.newPage();
  try {
    await Promise.all([page.goto('/menu'), second.goto('/menu')]);
    for (const client of [page, second]) {
      await client.getByRole('textbox', { name: 'Search menu', exact: true }).fill(item.name);
      await expect(client.getByRole('list', { name: 'Menu results' }).getByText(item.name, { exact: true })).toBeVisible();
      await expect(client.getByRole('button', { name: 'Connection details' })).toContainText('Connected');
    }
    const name = `Updated ${item.name}`;
    const response = await request.patch(`/api/setup/items/${item.id}`, { data: { expectedRevision: 1, name } });
    expect(response.ok()).toBe(true);
    for (const client of [page, second]) await expect(client.getByText(name, { exact: true })).toBeVisible();
    await secondContext.setOffline(true);
    await second.getByRole('button', { name: 'Refresh menu' }).click();
    await expect(second.getByRole('alert')).toContainText('Cannot reach the server');
    await expect(second.getByText(name, { exact: true })).toBeVisible();
    const latestName = `Recovered ${item.name}`;
    const change = await request.patch(`/api/setup/items/${item.id}`, { data: { expectedRevision: 2, name: latestName } });
    expect(change.ok()).toBe(true);
    await secondContext.setOffline(false);
    await second.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(second.getByText(latestName, { exact: true })).toBeVisible();
    await expect(second.getByRole('alert')).not.toBeVisible();
  } finally { await secondContext.close(); }
});

test('order deep links read snapshots and route parameter changes recover from invalid and missing IDs', async ({ page, request }) => {
  const item = await createItem(request);
  const quote = quoteResponseSchema.parse(await (await request.post('/api/checkout/quotes', {
    data: { lines: [{ itemId: item.id, quantity: 2, observedRevision: 1 }], discountMinor: 0 }
  })).json());
  const result = orderResponseSchema.parse(await (await request.post('/api/orders', {
    data: { quoteId: quote.quoteId }, headers: { 'Idempotency-Key': randomUUID() }
  })).json());
  await page.goto(`/orders/${result.order.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Order details');
  await expect(page.getByText(item.name, { exact: true })).toBeVisible();
  await expect(page.locator('dl')).toContainText('$15.00');
  await page.reload();
  await expect(page.getByText(item.name, { exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Breadcrumb', exact: true }).getByRole('link', { name: 'Orders', exact: true }).click();
  await page.getByRole('link', { name: `Order ${result.order.id.slice(0, 8)}`, exact: true }).click();
  await expect(page.getByText(item.name, { exact: true })).toBeVisible();
  await page.goto('/orders/invalid');
  await expect(page.getByRole('alert')).toContainText('Check the request fields');
  await page.goto(`/orders/${randomUUID()}`);
  await expect(page.getByRole('alert')).toContainText('not found');
  await page.getByRole('navigation', { name: 'Breadcrumb', exact: true }).getByRole('link', { name: 'Orders', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Orders');
});
