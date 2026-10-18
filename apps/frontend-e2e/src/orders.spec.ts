import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  categoryMutationResponseSchema, itemMutationResponseSchema, orderResponseSchema, quoteResponseSchema,
  type MenuItem, type Order, type OrderStatus
} from '@restaurant-ordering/contracts';

async function itemFixture(request: APIRequestContext) {
  const name = `Orders ${randomUUID()}`;
  const category = categoryMutationResponseSchema.parse(await (await request.post('/api/setup/categories', { data: { name } })).json()).category;
  return itemMutationResponseSchema.parse(await (await request.post('/api/setup/items', { data: {
    name, categoryId: category.id, available: true, pricingMode: 'open'
  } })).json()).item;
}
async function createOrder(request: APIRequestContext, item: MenuItem): Promise<Order> {
  const quote = quoteResponseSchema.parse(await (await request.post('/api/checkout/quotes', {
    data: { lines: [{ itemId: item.id, observedRevision: 1, quantity: 2, openPriceMinor: 750 }], discountMinor: 100 }
  })).json());
  const response = await request.post('/api/orders', { data: { quoteId: quote.quoteId }, headers: { 'Idempotency-Key': randomUUID() } });
  expect(response.status()).toBe(201);
  return orderResponseSchema.parse(await response.json()).order;
}
async function change(request: APIRequestContext, order: Order, status: OrderStatus): Promise<Order> {
  const response = await request.patch(`/api/orders/${order.id}/status`, { data: { expectedRevision: order.revision, status } });
  expect(response.ok()).toBe(true); return orderResponseSchema.parse(await response.json()).order;
}
async function filter(page: Page, status: string) {
  await page.getByRole('combobox', { name: 'Filter by status', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox', { name: 'Filter by status', exact: true })).toBeVisible();
  await page.keyboard.press('Home');
  const index = ['All statuses', 'Placed', 'Preparing', 'Ready', 'Completed', 'Cancelled'].indexOf(status);
  for (let step = 0; step < index; step++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox', { name: 'Filter by status', exact: true })).not.toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Filter by status', exact: true })).toContainText(status);
}
const link = (page: Page, order: Order) => page.getByRole('link', { name: `Order ${order.id}`, exact: true });

test('orders appear live, filters add/remove membership, and two independent staff browsers see progression and reconnect repair', async ({ page, browser, baseURL, request }) => {
  const item = await itemFixture(request);
  const context = await browser.newContext({ baseURL }); const second = await context.newPage();
  try {
    await Promise.all([page.goto('/orders'), second.goto('/orders')]);
    for (const client of [page, second]) await expect(client.getByRole('button', { name: 'Connection details' })).toContainText('Connected');
    const order = await createOrder(request, item);
    for (const client of [page, second]) await expect(link(client, order)).toBeVisible();
    await link(page, order).click(); await expect(page.getByText('Total: $14.00', { exact: true })).toBeVisible();
    await expect(page.getByText('Quantity: 2 × $7.50', { exact: true })).toBeVisible();
    await filter(second, 'Preparing'); await expect(link(second, order)).not.toBeVisible();
    await page.getByRole('button', { name: 'Start preparing', exact: true }).click();
    await expect(link(second, order)).toBeVisible();
    await page.getByRole('button', { name: 'Mark ready', exact: true }).click(); await expect(link(second, order)).not.toBeVisible();
    await filter(second, 'Ready'); await expect(link(second, order)).toBeVisible(); await link(second, order).click();
    await expect(second.getByText('Status: Ready', { exact: true })).toBeVisible();
    await expect(second.getByRole('button', { name: 'Cancel order', exact: true })).not.toBeVisible();
    await context.setOffline(true); await second.getByRole('button', { name: 'Refresh order', exact: true }).click();
    await expect(second.getByRole('alert')).toContainText('Cannot reach the server'); await expect(second.getByText(item.name, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Complete order', exact: true }).click(); await expect(page.getByText('Status: Completed', { exact: true })).toBeVisible();
    await context.setOffline(false); await second.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(second.getByText('Status: Completed', { exact: true })).toBeVisible();
    for (const client of [page, second]) {
      await expect(client.getByRole('button', { name: /^(Start preparing|Mark ready|Complete order|Cancel order)$/ })).toHaveCount(0);
    }
    await second.getByRole('link', { name: 'Back to orders', exact: true }).click(); await filter(second, 'Completed');
    await expect(link(second, order)).toHaveCount(1);
  } finally { await context.close(); }
});

test('stale and lost staff responses retain order context and require refresh; cancellation is available from placed and preparing', async ({ page, request }) => {
  const item = await itemFixture(request); let order = await createOrder(request, item);
  await page.goto(`/orders/${order.id}`); await expect(page.getByRole('button', { name: 'Cancel order', exact: true })).toBeEnabled();
  let posts = 0;
  await page.route(`**/api/orders/${order.id}/status`, async (route) => {
    posts++;
    order = await change(request, order, 'preparing');
    await route.fulfill({ response: await route.fetch() });
  });
  await page.getByRole('button', { name: 'Cancel order', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not set status to cancelled');
  await expect(page.getByRole('alert')).toContainText('Another staff action changed this order');
  await expect(page.getByText(item.name, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark ready', exact: true })).toBeDisabled(); expect(posts).toBe(1);
  await page.unroute(`**/api/orders/${order.id}/status`);
  await page.getByRole('button', { name: 'Refresh latest status', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel order', exact: true })).toBeEnabled();
  // A real commit whose HTTP response is lost must be read before any further action.
  await page.route(`**/api/orders/${order.id}/status`, async (route) => {
    posts++; const response = await route.fetch(); expect(response.ok()).toBe(true); await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Cancel order', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('The update may have reached the server');
  await page.getByRole('button', { name: 'Refresh latest status', exact: true }).click();
  await expect(page.getByText('Status: Cancelled', { exact: true })).toBeVisible(); expect(posts).toBe(2);
  await expect(page.getByRole('button', { name: 'Cancel order', exact: true })).not.toBeVisible();
  const placed = await createOrder(request, item); await page.goto(`/orders/${placed.id}`);
  await page.getByRole('button', { name: 'Cancel order', exact: true }).click(); await expect(page.getByText('Status: Cancelled', { exact: true })).toBeVisible();
});

test('orders use bounded server pages, keep filters during paging, and recover an empty last page after live removals', async ({ page, request }, testInfo) => {
  const item = await itemFixture(request); const orders: Order[] = [];
  for (let i = 0; i < 11; i++) orders.push(await change(request, await createOrder(request, item), 'preparing'));
  await page.goto('/orders'); await filter(page, 'Preparing');
  await page.getByRole('combobox', { name: 'Items per page' }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox', { name: 'Items per page:' })).toBeVisible();
  await page.keyboard.press('Home'); await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox', { name: 'Items per page:' })).not.toBeVisible();
  await expect(page.locator('.data-list > li')).toHaveCount(10);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /orders · Page 2/ })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Filter by status', exact: true })).toContainText('Preparing');
  await page.setViewportSize({ width: 375, height: 812 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('orders-mobile.png'), fullPage: true });
  // Move only this scenario's orders out of the current filter.
  for (const order of orders) await change(request, order, 'ready');
  await expect(page.getByRole('button', { name: 'Return to first order page', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Return to first order page', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /orders · Page 1/ })).toBeVisible();
  await filter(page, 'Ready'); await expect(link(page, orders[orders.length - 1]!)).toBeVisible();
  await link(page, orders[orders.length - 1]!).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('order-detail-mobile.png'), fullPage: true });
});
