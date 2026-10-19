import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { categoryMutationResponseSchema, itemMutationResponseSchema, orderResponseSchema, quoteResponseSchema } from '@restaurant-ordering/contracts';
import { addFromMenu } from './order-helpers';

async function fixture(request: APIRequestContext) {
  const suffix = randomUUID();
  const category = categoryMutationResponseSchema.parse(await (await request.post('/api/setup/categories', { data: { name: suffix } })).json()).category;
  const items = [];
  for (const [name, image] of [['Burger', 'burger'], ['Ice cream', 'ice-cream']]) {
    items.push(itemMutationResponseSchema.parse(await (await request.post('/api/setup/items', { data: {
      name: `${name} ${suffix}`, categoryId: category.id, available: true, pricingMode: 'fixed', priceMinor: 500, imageUrl: `/api/images/${image}.jpg`
    } })).json()).item);
  }
  return { suffix, burger: items[0]!, iceCream: items[1]! };
}

test('footer quantities, padded cart comment actions and the remove-comment tooltip work together', async ({ page, request }, testInfo) => {
  const { suffix, burger, iceCream } = await fixture(request);
  await page.goto('/menu'); await page.getByRole('textbox', { name: 'Search menu', exact: true }).fill(suffix);
  await addFromMenu(page, burger.name, '2'); await addFromMenu(page, iceCream.name, '4');
  const summary = page.getByRole('region', { name: 'Cart summary' });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(summary).toContainText('6 items in your cart');
    await expect(summary.locator('.dish-names')).toHaveText(`2x ${burger.name}, 4x ${iceCream.name}`);
    await expect(summary.locator('.dish-names')).toHaveAttribute('title', `2x ${burger.name}, 4x ${iceCream.name}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: `Add ${burger.name} to cart`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit in cart', exact: true });
  await dialog.getByRole('button', { name: 'Add comment', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Comment for the kitchen', exact: true }).fill('No mustard');
  await dialog.getByRole('button', { name: 'Remove comment', exact: true }).hover();
  await expect(page.locator('.mat-mdc-tooltip-surface')).toHaveText('Remove comment');
  await dialog.getByRole('button', { name: 'Edit in cart', exact: true }).click();
  await summary.getByRole('link', { name: 'View cart', exact: true }).click();
  const cart = page.getByRole('region', { name: '6 items in your cart', exact: true });
  for (const name of ['Add comment', 'Edit comment']) {
    const button = cart.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    expect(await button.evaluate(element => {
      const style = getComputedStyle(element);
      return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].every(value => parseFloat(value) > 0);
    })).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('cart-comment-actions-mobile.png'), fullPage: true });
});

test('item history shares order images and live read-only statuses while Orders retains revision-safe editing', async ({ page, request }, testInfo) => {
  const { burger, iceCream } = await fixture(request);
  const quote = quoteResponseSchema.parse(await (await request.post('/api/checkout/quotes', { data: {
    lines: [burger, iceCream].map(item => ({ itemId: item.id, quantity: 1, observedRevision: item.revision })), discountMinor: 0
  } })).json());
  const order = orderResponseSchema.parse(await (await request.post('/api/orders', { data: { quoteId: quote.quoteId }, headers: { 'Idempotency-Key': randomUUID() } })).json()).order;
  // Current item photos may change; both order surfaces must keep the original snapshots.
  expect((await request.patch(`/api/setup/items/${burger.id}`, { data: { expectedRevision: 1, imageUrl: '/api/images/soup.jpg' } })).ok()).toBe(true);
  await page.goto(`/items/${burger.id}`);
  const related = page.getByRole('region', { name: 'Related orders', exact: true });
  const row = related.getByRole('listitem').filter({ hasText: order.id.slice(0, 8) });
  await expect(row.getByRole('img')).toHaveCount(2);
  await expect(row.getByRole('img', { name: burger.name, exact: true })).toHaveAttribute('src', '/api/images/burger.jpg');
  await expect(row.getByRole('img', { name: iceCream.name, exact: true })).toHaveAttribute('src', '/api/images/ice-cream.jpg');
  await expect(row).toContainText('Placed'); await expect(row).toContainText('$10.00');
  await expect(row.getByRole('combobox')).toHaveCount(0);
  await expect(row.locator('app-order-status-control')).toHaveCount(0);
  await expect(row.locator('.status-badge')).toHaveText('Placed');
  expect((await request.patch(`/api/orders/${order.id}/status`, { data: { expectedRevision: 1, status: 'preparing' } })).ok()).toBe(true);
  await expect(row.locator('.status-badge')).toHaveText('Preparing');
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`related-order-${width}.png`), fullPage: true });
  }
  await page.goto('/orders');
  const listed = page.getByRole('listitem').filter({ hasText: order.id.slice(0, 8) });
  await expect(listed.getByRole('img')).toHaveCount(2);
  await expect(listed.getByRole('img', { name: burger.name, exact: true })).toHaveAttribute('src', '/api/images/burger.jpg');
  await expect(listed.getByRole('img', { name: iceCream.name, exact: true })).toHaveAttribute('src', '/api/images/ice-cream.jpg');
  await expect(listed.getByRole('combobox')).toHaveValue('preparing');
  const update = page.waitForRequest(request => request.method() === 'PATCH' && request.url().endsWith(`/api/orders/${order.id}/status`));
  await listed.getByRole('combobox').selectOption('ready');
  expect((await update).postDataJSON()).toEqual({ expectedRevision: 2, status: 'ready' });
  await expect(listed.getByRole('combobox')).toHaveValue('ready');
  await expect(listed).toContainText('$10.00');
  await listed.getByRole('link', { name: `Order ${order.id.slice(0, 8)}`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}$`));
});
