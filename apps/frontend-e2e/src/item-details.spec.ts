import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { categoryMutationResponseSchema, itemMutationResponseSchema, orderResponseSchema, quoteResponseSchema, type MenuItem } from '@restaurant-ordering/contracts';
import { addFromMenu } from './order-helpers';

async function fixture(request: APIRequestContext) {
  const name = `Details ${randomUUID()}`;
  const category = categoryMutationResponseSchema.parse(await (await request.post('/api/setup/categories', { data: { name, sortOrder: -2000 } })).json()).category;
  const item = itemMutationResponseSchema.parse(await (await request.post('/api/setup/items', { data: {
    name, categoryId: category.id, available: true, pricingMode: 'fixed', priceMinor: 750,
    imageUrl: '/api/images/soup.jpg', description: 'A bowl of freshly prepared soup.'
  } })).json()).item;
  return { category, item, name };
}
async function search(page: Page, name: string) { await page.getByRole('textbox', { name: 'Search items', exact: true }).fill(name); }
async function order(request: APIRequestContext, item: MenuItem) {
  const quote = quoteResponseSchema.parse(await (await request.post('/api/checkout/quotes', {
    data: { lines: [{ itemId: item.id, quantity: 1, observedRevision: item.revision }], discountMinor: 0 }
  })).json());
  return orderResponseSchema.parse(await (await request.post('/api/orders', {
    data: { quoteId: quote.quoteId }, headers: { 'Idempotency-Key': randomUUID() }
  })).json()).order;
}

test('management sections load every item, default to the requested expansion states, and browse locally with aligned actions', async ({ page, request }, testInfo) => {
  const { category, name } = await fixture(request);
  for (let index = 0; index < 105; index++) {
    expect((await request.post('/api/setup/items', { data: {
      name: `${name} ${String(index).padStart(3, '0')}`, categoryId: category.id, available: index < 103, pricingMode: 'open'
    } })).ok()).toBe(true);
  }
  let reads = 0;
  page.on('request', request => { if (request.url().includes('/api/setup/catalog')) reads++; });
  await page.goto('/setup/items'); await search(page, name);
  const available = page.getByRole('region', { name: 'Available items', exact: true });
  await expect(available).toContainText('104 items');
  await expect(page.locator('summary')).toHaveText(['Available items104', 'Unavailable items2', /Archived items\d+/]);
  expect(await page.locator('details').evaluateAll(elements => elements.map(element => (element as HTMLDetailsElement).open))).toEqual([true, true, false]);
  const baseline = reads;
  const row = available.getByRole('listitem').first();
  const toggle = await row.getByRole('switch').boundingBox(); const edit = await row.getByRole('button', { name: /^Edit item/ }).boundingBox();
  expect(Math.abs(toggle!.y + toggle!.height / 2 - edit!.y - edit!.height / 2)).toBeLessThan(2);
  await search(page, `${name} 102`); await expect(available.getByRole('link', { name: `${name} 102`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear item search', exact: true }).click();
  await page.getByRole('combobox', { name: 'Filter by category', exact: true }).click();
  await page.getByRole('option', { name, exact: true }).click();
  const paginator = page.getByLabel('Available items pages', { exact: true });
  await paginator.getByRole('combobox', { name: 'Items per page' }).focus(); await page.keyboard.press('Enter');
  await page.getByRole('option', { name: '10', exact: true }).click();
  await paginator.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(available).toContainText('Page 2'); await expect(available.getByRole('listitem')).toHaveCount(10);
  await page.locator('summary').filter({ hasText: 'Unavailable items' }).click();
  await expect(page.getByRole('region', { name: 'Unavailable items', exact: true })).not.toBeVisible();
  await page.locator('summary').filter({ hasText: 'Archived items' }).click();
  expect(reads).toBe(baseline);
  const refresh = page.getByRole('button', { name: 'Refresh items', exact: true });
  expect(await refresh.evaluate(element => element.previousElementSibling?.tagName)).toBe('H1');
  const refreshed = page.waitForRequest(request => request.url().endsWith('/api/setup/catalog'));
  await refresh.click(); expect(new URL((await refreshed).url()).search).toBe('');
  await expect(available).toContainText('Page 2');
  await page.screenshot({ path: testInfo.outputPath('item-sections-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('item-sections-mobile.png'), fullPage: true });
  await page.goto('/setup/categories');
  expect(await page.getByRole('button', { name: 'Refresh categories', exact: true }).evaluate(element => element.previousElementSibling?.tagName)).toBe('H1');
});

test('items require unavailable before archival and restore to unavailable before they can be enabled', async ({ page, request }) => {
  const { item, name } = await fixture(request);
  await page.goto('/setup/items'); await search(page, name);
  await page.getByRole('button', { name: `Edit item ${name}`, exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Edit item', exact: true });
  await expect(dialog.getByRole('button', { name: 'Archive item', exact: true })).toBeDisabled();
  await dialog.getByRole('switch', { name: 'Available for ordering', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Archive item', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click(); await expect(dialog).not.toBeVisible();
  const unavailable = page.getByRole('region', { name: 'Unavailable items', exact: true });
  await unavailable.getByRole('button', { name: `Edit item ${name}`, exact: true }).click();
  await page.getByRole('button', { name: 'Archive item', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Archive item', exact: true });
  await dialog.getByRole('button', { name: 'Archive', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await page.locator('summary').filter({ hasText: 'Archived items' }).click();
  await page.getByRole('button', { name: `Restore item ${name}`, exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Restore item', exact: true });
  await expect(dialog).toContainText('restored as unavailable');
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await expect(unavailable.getByRole('switch', { name: `Available ${name}`, exact: true })).not.toBeChecked();
  const quote = await request.post('/api/checkout/quotes', { data: { lines: [{ itemId: item.id, quantity: 1, observedRevision: 4 }], discountMinor: 0 } });
  expect(quote.status()).toBe(422);
  expect(await quote.json()).toMatchObject({ error: { details: { issues: [{ code: 'ITEM_UNAVAILABLE' }] } } });
  await unavailable.getByRole('switch', { name: `Available ${name}`, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Available items', exact: true }).getByRole('link', { name, exact: true })).toBeVisible();
});

test('item names on Menu, Cart and Items open details with live, paginated related order history and archived records', async ({ page, request }, testInfo) => {
  const { item, category, name } = await fixture(request);
  const original = await order(request, item);
  await page.goto('/menu'); await page.getByRole('textbox', { name: 'Search menu', exact: true }).fill(name);
  await addFromMenu(page, name);
  await page.getByRole('region', { name: 'Menu items' }).getByRole('link', { name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${item.id}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  await expect(page.getByRole('region', { name: 'Item details', exact: true })).toContainText(item.description!);
  const related = page.getByRole('region', { name: 'Related orders', exact: true });
  await expect(related.getByRole('link', { name: `Order ${original.id.slice(0, 8)}`, exact: true })).toBeVisible();
  for (let index = 0; index < 10; index++) await order(request, item);
  await expect(related).toContainText('11 orders');
  await page.getByLabel('Related order pages', { exact: true }).getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(related).toContainText('Page 2'); await expect(related.getByRole('listitem')).toHaveCount(1);
  await related.getByRole('link', { name: `Order ${original.id.slice(0, 8)}`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${original.id}$`));
  await page.goto('/cart'); await page.getByRole('region', { name: /\d+ items? in your cart/ }).getByRole('link', { name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${item.id}$`));
  const renamed = `${name} renamed`;
  expect((await request.patch(`/api/setup/items/${item.id}`, { data: { expectedRevision: 1, name: renamed, available: false } })).ok()).toBe(true);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(renamed);
  await expect(page.getByRole('region', { name: 'Item details', exact: true })).toContainText('Unavailable');
  expect((await request.patch(`/api/setup/items/${item.id}`, { data: { expectedRevision: 2, archived: true } })).ok()).toBe(true);
  expect((await request.patch(`/api/setup/categories/${category.id}`, { data: { expectedRevision: 1, archived: true } })).ok()).toBe(true);
  await expect(page.getByRole('region', { name: 'Item details', exact: true })).toContainText('This category is archived');
  await page.reload(); await expect(related).toContainText('11 orders');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('item-detail-mobile.png'), fullPage: true });
  await page.goto('/setup/items'); await search(page, renamed);
  await page.locator('summary').filter({ hasText: 'Archived items' }).click();
  await page.getByRole('region', { name: 'Archived items', exact: true }).getByRole('link', { name: renamed, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${item.id}$`));
  expect(orderResponseSchema.parse(await (await request.get(`/api/orders/${original.id}`)).json()).order).toEqual(original);
  await page.goto(`/items/${randomUUID()}`); await expect(page.getByRole('alert')).toContainText('The item was not found');
  await page.goto('/items/invalid'); await expect(page.getByRole('alert')).toContainText('Check the request fields');
});
