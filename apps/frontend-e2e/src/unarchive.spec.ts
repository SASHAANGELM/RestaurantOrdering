import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { categoryMutationResponseSchema, itemMutationResponseSchema, orderResponseSchema, quoteResponseSchema, setupCatalogSchema } from '@restaurant-ordering/contracts';
import { addFromMenu } from './order-helpers';

async function fixture(request: APIRequestContext) {
  const name = `Restore ${randomUUID()}`;
  const category = categoryMutationResponseSchema.parse(await (await request.post('/api/setup/categories', {
    data: { name, sortOrder: -1000 }
  })).json()).category;
  const item = itemMutationResponseSchema.parse(await (await request.post('/api/setup/items', {
    data: { name, categoryId: category.id, available: true, pricingMode: 'fixed', priceMinor: 750 }
  })).json()).item;
  return { category, item, name };
}

async function filter(page: Page, name: string) {
  await page.getByRole('textbox', { name: 'Search items', exact: true }).fill(name);
}

async function restoreCategoryButton(page: Page, name: string) {
  const button = page.getByRole('button', { name: `Restore category ${name}`, exact: true });
  const pages = page.getByRole('group', { name: 'Category pages', exact: true });
  const range = pages.getByRole('status');
  const catalog = setupCatalogSchema.parse(await (await page.request.get('/api/setup/catalog')).json());
  // Wait for the archived toggle to render its full dataset before paging.
  await expect(range).toContainText(`of ${catalog.categories.length}`);
  while (await button.count() === 0) {
    const previous = await range.innerText();
    const next = pages.getByRole('button', { name: 'Next page', exact: true });
    await expect(next).toBeEnabled(); await next.click();
    await expect(range).not.toHaveText(previous);
  }
  return button;
}

test('Restore confirmations cancel safely and recover menu/cart eligibility live without changing archived siblings or historical orders', async ({ page, browser, baseURL, request }, testInfo) => {
  const { category, item, name } = await fixture(request);
  const sibling = itemMutationResponseSchema.parse(await (await request.post('/api/setup/items', {
    data: { name: `${name} sibling`, categoryId: category.id, available: false, pricingMode: 'open' }
  })).json()).item;
  expect((await request.patch(`/api/setup/items/${sibling.id}`, { data: { expectedRevision: 1, archived: true } })).ok()).toBe(true);
  const quote = quoteResponseSchema.parse(await (await request.post('/api/checkout/quotes', {
    data: { lines: [{ itemId: item.id, quantity: 1, observedRevision: 1 }], discountMinor: 0 }
  })).json());
  const order = orderResponseSchema.parse(await (await request.post('/api/orders', {
    data: { quoteId: quote.quoteId }, headers: { 'Idempotency-Key': randomUUID() }
  })).json()).order;
  const context = await browser.newContext({ baseURL });
  const customer = await context.newPage();
  try {
    await customer.goto('/menu');
    await customer.getByRole('textbox', { name: 'Search menu', exact: true }).fill(name);
    await addFromMenu(customer, name);
    const row = customer.getByRole('region', { name: 'Menu items' }).getByRole('listitem').filter({ hasText: name });
    const summary = customer.getByRole('region', { name: 'Cart summary' });
    expect((await request.patch(`/api/setup/categories/${category.id}`, { data: { expectedRevision: 1, archived: true } })).ok()).toBe(true);
    await expect(row).toHaveCount(0); await expect(summary).toContainText('Category archived');
    expect((await request.patch(`/api/setup/items/${item.id}`, { data: { expectedRevision: 1, available: false } })).ok()).toBe(true);
    expect((await request.patch(`/api/setup/items/${item.id}`, { data: { expectedRevision: 2, archived: true } })).ok()).toBe(true);
    await expect(summary).toContainText('Item archived');
    await page.goto('/setup/categories');
    await expect(page.getByRole('button', { name: `Restore category ${name}`, exact: true })).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Show archived records' }).check();
    const restoreCategory = await restoreCategoryButton(page, name);
    await restoreCategory.click();
    let dialog = page.getByRole('dialog', { name: 'Restore category', exact: true });
    await expect(dialog).toContainText('Individually archived items stay archived');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).not.toBeVisible(); await expect(restoreCategory).toBeFocused();
    await expect(summary).toContainText('Item archived');
    await restoreCategory.click();
    const categoryRequest = page.waitForRequest((r) => r.url().endsWith(`/api/setup/categories/${category.id}`) && r.method() === 'PATCH');
    await dialog.getByRole('button', { name: 'Restore', exact: true }).click();
    expect((await categoryRequest).postDataJSON()).toEqual({ expectedRevision: 2, archived: false });
    await expect(dialog).not.toBeVisible(); await expect(row).toHaveCount(0);
    await expect(page.getByRole('button', { name: `Edit category ${name}`, exact: true })).toBeVisible();
    await page.goto('/setup/items'); await filter(page, name);
    await page.locator('summary').filter({ hasText: 'Archived items' }).click();
    const restoreItem = page.getByRole('button', { name: `Restore item ${name}`, exact: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await restoreItem.click(); dialog = page.getByRole('dialog', { name: 'Restore item', exact: true });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible(); await expect(restoreItem).toBeFocused();
    await restoreItem.click();
    await page.route(`**/api/setup/items/${item.id}`, (route) => route.abort('failed'), { times: 1 });
    await dialog.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Cannot reach the server');
    await expect(dialog.getByRole('button', { name: 'Restore', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('restore-item-mobile.png') });
    const itemRequest = page.waitForRequest((r) => r.url().endsWith(`/api/setup/items/${item.id}`) && r.method() === 'PATCH');
    await dialog.getByRole('button', { name: 'Restore', exact: true }).click();
    expect((await itemRequest).postDataJSON()).toEqual({ expectedRevision: 3, archived: false });
    await expect(dialog).not.toBeVisible(); await expect(row).toHaveCount(1);
    await expect(summary).not.toContainText('Item archived'); await expect(summary).not.toContainText('Category archived');
    await expect(page.getByRole('button', { name: `Restore item ${sibling.name}`, exact: true })).toBeVisible();
    await expect(row).toContainText('Unavailable');
    await expect(summary).toContainText('Unavailable');
    await page.getByRole('switch', { name: `Available ${name}`, exact: true }).click();
    await expect(row).not.toContainText('Unavailable');
    const restoredQuote = await request.post('/api/checkout/quotes', {
      data: { lines: [{ itemId: item.id, quantity: 1, observedRevision: 5 }], discountMinor: 0 }
    });
    expect(restoredQuote.ok()).toBe(true);
    expect(quoteResponseSchema.parse(await restoredQuote.json()).lines[0]).toMatchObject({ itemId: item.id, itemRevision: 5 });
    expect(orderResponseSchema.parse(await (await request.get(`/api/orders/${order.id}`)).json()).order).toEqual(order);
  } finally { await context.close(); }
});

test('restoring under an archived category remains unavailable, and concurrent restoration requires conflict recovery', async ({ page, request }) => {
  const { category, item, name } = await fixture(request);
  expect((await request.patch(`/api/setup/items/${item.id}`, { data: { expectedRevision: 1, available: false } })).ok()).toBe(true);
  expect((await request.patch(`/api/setup/items/${item.id}`, { data: { expectedRevision: 2, archived: true } })).ok()).toBe(true);
  expect((await request.patch(`/api/setup/categories/${category.id}`, { data: { expectedRevision: 1, archived: true } })).ok()).toBe(true);
  await page.goto('/setup/items'); await filter(page, name);
  await page.locator('summary').filter({ hasText: 'Archived items' }).click();
  await page.getByRole('button', { name: `Restore item ${name}`, exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Restore item', exact: true });
  await expect(dialog).toContainText("This item's category is archived");
  await expect(dialog).toContainText('restored as unavailable');
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  let resolved = await (await request.post('/api/menu/resolve', { data: { itemIds: [item.id] } })).json();
  expect(resolved.items[0]).toMatchObject({ state: 'category-archived', item: { archivedAt: null, available: false, revision: 4 } });
  const blocked = await request.post('/api/checkout/quotes', {
    data: { lines: [{ itemId: item.id, quantity: 1, observedRevision: 4 }], discountMinor: 0 }
  });
  expect(blocked.status()).toBe(422);
  expect(await blocked.json()).toMatchObject({ error: { details: { issues: [{ code: 'CATEGORY_ARCHIVED' }] } } });
  await page.goto('/setup/categories'); await page.getByRole('checkbox', { name: 'Show archived records' }).check();
  const restoreCategory = await restoreCategoryButton(page, name);
  await restoreCategory.click();
  dialog = page.getByRole('dialog', { name: 'Restore category', exact: true });
  expect((await request.patch(`/api/setup/categories/${category.id}`, { data: { expectedRevision: 2, archived: false } })).ok()).toBe(true);
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('revision 2 to 3');
  await expect(dialog.getByRole('button', { name: 'Restore', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Reload latest values', exact: true }).click();
  await expect(dialog).toContainText('This record is already active');
  await expect(dialog.getByRole('button', { name: 'Restore', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  resolved = await (await request.post('/api/menu/resolve', { data: { itemIds: [item.id] } })).json();
  expect(resolved.items[0]).toMatchObject({ state: 'unavailable', item: { archivedAt: null, available: false }, category: { revision: 3 } });
});
