import { addFromMenu } from './order-helpers';
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { categoryMutationResponseSchema, itemMutationResponseSchema, orderResponseSchema } from '@restaurant-ordering/contracts';

async function fixture(request: APIRequestContext) {
  const name = `Checkout ${randomUUID()}`;
  const category = categoryMutationResponseSchema.parse(await (await request.post('/api/setup/categories', { data: { name } })).json()).category;
  return itemMutationResponseSchema.parse(await (await request.post('/api/setup/items', { data: {
    name, categoryId: category.id, available: true, pricingMode: 'fixed', priceMinor: 750
  } })).json()).item;
}
async function add(page: Page, name: string) {
  await page.goto('/menu');
  await page.getByRole('textbox', { name: 'Search menu', exact: true }).fill(name);
  await addFromMenu(page, name);
  await page.getByRole('link', { name: 'View cart', exact: true }).first().click();
}
const cart = (page: Page) => page.getByRole('region', { name: /\d+ items? in your cart/ });

test('one confirm click checks current prices and places the order; late menu changes retain the cart for retry', async ({ page, request }) => {
  const item = await fixture(request); await add(page, item.name);
  await cart(page).getByText('Add a discount', { exact: true }).click();
  await cart(page).getByRole('textbox', { name: 'Fixed discount (USD)' }).fill('1.00');
  let posts = 0;
  await page.route('**/api/orders', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    posts++;
    if (posts === 1) expect((await request.patch(`/api/setup/items/${item.id}`, { data: { expectedRevision: 1, pricingMode: 'fixed', priceMinor: 900 } })).ok()).toBe(true);
    await route.fulfill({ response: await route.fetch() });
  });
  await page.getByRole('button', { name: 'Confirm order', exact: true }).click();
  await expect(cart(page)).toContainText('Your cart is retained.'); expect(posts).toBe(1);
  await expect(page.getByRole('button', { name: 'Review order' })).toHaveCount(0);
  await expect(cart(page).locator('.line-warning')).toContainText('Price changed');
  await cart(page).getByRole('button', { name: 'OK', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm order', exact: true }).click();
  await expect(page).toHaveURL(/\/orders\/[a-f0-9-]+$/); expect(posts).toBe(2);
  await expect(page.locator('dl')).toContainText('$8.00');
});

test('a committed response lost before delivery survives reload and a 404 lookup; explicit retry uses one original key', async ({ page, request }, testInfo) => {
  const item = await fixture(request); await add(page, item.name);

  await expect(page.getByRole('button', { name: 'Confirm order', exact: true })).toBeEnabled();
  const attempts: { key: string; payload: unknown }[] = [];
  let committedId = '';
  await page.route('**/api/orders', async (route) => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    attempts.push({ key: route.request().headers()['idempotency-key']!, payload: route.request().postDataJSON() });
    const response = await route.fetch();
    const result = orderResponseSchema.parse(await response.json());
    if (!committedId) { committedId = result.order.id; await route.abort('failed'); }
    else { expect(result.order.id).toBe(committedId); await route.fulfill({ response }); }
  });
  // Dispatch duplicate clicks synchronously while POST is pending.
  await page.getByRole('button', { name: 'Confirm order', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(cart(page)).toContainText('Order outcome is unknown'); expect(attempts).toHaveLength(1);
  await expect(cart(page).getByRole('spinbutton', { name: `Cart quantity for ${item.name}`, exact: true })).toBeDisabled();
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('restaurant-ordering.checkout.v1')!));
  expect(saved.key).toBe(attempts[0]!.key); expect(saved.payload).toEqual(attempts[0]!.payload);
  // A lookup may miss a still-running request, so even 404 must never discard the key.
  await page.route('**/api/orders/by-request/*', (route) => route.fulfill({ status: 404, json: {
    error: { code: 'NOT_FOUND', requestId: randomUUID(), message: 'Not visible yet', details: { resourceType: 'request', resourceId: saved.key } }
  } }));
  await page.goto('/menu');
  await page.getByRole('textbox', { name: 'Search menu', exact: true }).fill(item.name);
  await expect(page.getByRole('button', { name: `Add ${item.name} to cart`, exact: true })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Cart summary' })).toContainText('Checkout pending');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Cart', exact: true }).click();
  await expect(cart(page)).toContainText('No order is visible for this key yet');
  expect(attempts).toHaveLength(1); await expect(cart(page)).toContainText(saved.key);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Retry same checkout', exact: true })).toBeEnabled(); expect(attempts).toHaveLength(1);
  await page.screenshot({ path: testInfo.outputPath('pending-checkout-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Retry same checkout', exact: true }).click();
  await expect(page).toHaveURL(`/orders/${committedId}`); expect(attempts).toHaveLength(2); expect(attempts[1]).toEqual(attempts[0]);
  const orders = await (await request.get('/api/orders?page=1&pageSize=100')).json();
  expect(orders.orders.filter((order: { quoteId: string }) => order.quoteId === saved.payload.quoteId)).toHaveLength(1);
  expect(await page.evaluate(() => sessionStorage.getItem('restaurant-ordering.checkout.v1'))).toBeNull();
});

test('reload recovers a committed order by key without another POST', async ({ page, request }) => {
  const item = await fixture(request); await add(page, item.name);
  let posts = 0; let id = '';
  await page.route('**/api/orders', async (route) => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    posts++; const result = orderResponseSchema.parse(await (await route.fetch()).json()); id = result.order.id; await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Confirm order', exact: true }).click(); await expect(cart(page)).toContainText('Order outcome is unknown');
  await page.reload(); await expect(page).toHaveURL(`/orders/${id}`); expect(posts).toBe(1);
});

test('QUOTE_USED opens its existing order and write failures explain memory-only recovery', async ({ page, request }) => {
  const item = await fixture(request); await add(page, item.name);
  // Fail only attempt writes: cart persistence still works, and the key remains available in memory.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'restaurant-ordering.checkout.v1') throw Error('Quota');
      original.call(this, key, value);
    };
  });
  let id = ''; let posts = 0;
  await page.route('**/api/orders', async (route) => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    posts++;
    // Consume the exact quote under a different key, then forward the original request.
    const response = await request.post('/api/orders', { data: route.request().postDataJSON(), headers: { 'Idempotency-Key': randomUUID() } });
    id = orderResponseSchema.parse(await response.json()).order.id;
    // Hold the response so the recovery warning can be asserted before navigation.
    await expect(cart(page)).toContainText('reloading or closing it may lose the request key');
    await route.fulfill({ response: await route.fetch() });
  });
  await page.getByRole('button', { name: 'Confirm order', exact: true }).click();
  await expect(page).toHaveURL(/\/orders\/[a-f0-9-]+$/); expect(page.url()).toContain(id); expect(posts).toBe(1);
});
