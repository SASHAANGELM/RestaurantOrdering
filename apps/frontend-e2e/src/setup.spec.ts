import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { categoryMutationResponseSchema, itemMutationResponseSchema } from '@restaurant-ordering/contracts';

async function fixture(request: APIRequestContext, prefix: string) {
  const name = `${prefix} ${randomUUID()}`;
  const category = categoryMutationResponseSchema.parse(await (await request.post('/api/setup/categories', {
    data: { name, sortOrder: -100 }
  })).json()).category;
  const item = itemMutationResponseSchema.parse(await (await request.post('/api/setup/items', {
    data: { name, categoryId: category.id, available: true, pricingMode: 'fixed', priceMinor: 750 }
  })).json()).item;
  return { name, category, item };
}
async function select(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
async function filter(page: Page, search: string) {
  await page.getByRole('textbox', { name: 'Search items', exact: true }).fill(search);
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
}

test('Setup forms publish live changes, omit fixed prices for open pricing, and confirm archive eligibility', async ({ page, browser, baseURL, request }) => {
  const suffix = randomUUID();
  const categoryName = `UI category ${suffix}`;
  const itemName = `UI item ${suffix}`;
  const customerContext = await browser.newContext({ baseURL });
  const customer = await customerContext.newPage();
  try {
    await Promise.all([page.goto('/setup'), customer.goto('/menu')]);
    await page.getByRole('button', { name: 'Add category', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Add category', exact: true });
    await expect(dialog.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused();
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(categoryName);
    await dialog.getByRole('spinbutton', { name: 'Sort order' }).fill('-1000');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole('button', { name: 'Add item', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Add item', exact: true });
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(itemName);
    await select(page, 'Category', categoryName);
    await dialog.getByRole('textbox', { name: 'Description' }).fill('Created from Setup');
    await dialog.getByRole('textbox', { name: 'Price (USD)' }).fill('1.234');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('two decimal places');
    await expect(dialog.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(itemName);
    await dialog.getByRole('textbox', { name: 'Price (USD)' }).fill('8.25');
    const created = page.waitForResponse((r) => r.url().endsWith('/api/setup/items') && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    const item = itemMutationResponseSchema.parse(await (await created).json()).item;
    await expect(dialog).not.toBeVisible();
    let customerRow = customer.getByRole('listitem').filter({ hasText: itemName });
    await expect(customerRow).toContainText('$8.25');
    await filter(page, itemName);
    const edit = page.getByRole('button', { name: `Edit item ${itemName}`, exact: true });
    await edit.click();
    dialog = page.getByRole('dialog', { name: 'Edit item', exact: true });
    await dialog.getByRole('textbox', { name: 'Price (USD)' }).fill('6.40');
    await dialog.getByRole('checkbox', { name: 'Available for ordering' }).uncheck();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(customerRow).toContainText('$6.40');
    await expect(customerRow).toContainText('Unavailable');
    await edit.click();
    await select(page, 'Pricing', 'Open price');
    await dialog.getByRole('checkbox', { name: 'Available for ordering' }).check();
    const openRequest = page.waitForRequest((r) => r.url().endsWith(`/api/setup/items/${item.id}`) && r.method() === 'PATCH');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    const payload: unknown = (await openRequest).postDataJSON();
    expect(payload).toMatchObject({ pricingMode: 'open', expectedRevision: 2 });
    expect(payload).not.toHaveProperty('priceMinor');
    await expect(customerRow).toContainText('Open price');
    await expect(customerRow).not.toContainText('Unavailable');

    // Escape cancels archival and restores focus to the labelled trigger.
    const archive = page.getByRole('button', { name: `Archive item ${itemName}`, exact: true });
    await archive.click();
    dialog = page.getByRole('dialog', { name: 'Archive item', exact: true });
    await expect(dialog).toContainText('cannot be ordered');
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(archive).toBeFocused();
    await expect(customerRow).toBeVisible();
    await archive.click();
    await dialog.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(customerRow).not.toBeVisible();
    const archivedQuote = await request.post('/api/checkout/quotes', {
      data: { lines: [{ itemId: item.id, quantity: 1, observedRevision: 3, openPriceMinor: 400 }], discountMinor: 0 }
    });
    expect(archivedQuote.status()).toBe(422);
    expect(await archivedQuote.json()).toMatchObject({ error: { code: 'CART_INVALID', details: { issues: [{ code: 'ITEM_ARCHIVED' }] } } });
    await page.getByRole('checkbox', { name: 'Show archived records' }).check();
    await expect(page.getByRole('listitem').filter({ hasText: itemName })).toContainText('Archived');
    await expect(page.getByRole('button', { name: `Edit item ${itemName}`, exact: true })).not.toBeVisible();

    // A second active child demonstrates category archival, without archiving its item record.
    const childName = `Child ${suffix}`;
    const child = itemMutationResponseSchema.parse(await (await request.post('/api/setup/items', {
      data: { name: childName, categoryId: item.categoryId, available: true, pricingMode: 'fixed', priceMinor: 100 }
    })).json()).item;
    customerRow = customer.getByRole('listitem').filter({ hasText: childName });
    await expect(customerRow).toBeVisible();
    await page.getByRole('button', { name: `Edit category ${categoryName}`, exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Edit category', exact: true });
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(`Renamed ${categoryName}`);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: `Archive category Renamed ${categoryName}`, exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Archive category', exact: true });
    await expect(dialog).toContainText('All active items in this category');
    await expect(dialog).toContainText('Existing orders keep their original details');
    await dialog.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(customerRow).not.toBeVisible();
    const categoryQuote = await request.post('/api/checkout/quotes', {
      data: { lines: [{ itemId: child.id, quantity: 1, observedRevision: 1 }], discountMinor: 0 }
    });
    expect(categoryQuote.status()).toBe(422);
    expect(await categoryQuote.json()).toMatchObject({ error: { code: 'CART_INVALID', details: { issues: [{ code: 'CATEGORY_ARCHIVED' }] } } });
  } finally { await customerContext.close(); }
});

test('concurrent editors retain input, require revision recovery, and preserve drafts after failed submission', async ({ page, browser, baseURL, request }) => {
  const { item, name } = await fixture(request, 'Conflict');
  const secondContext = await browser.newContext({ baseURL });
  const second = await secondContext.newPage();
  try {
    for (const client of [page, second]) {
      await client.goto('/setup'); await filter(client, name);
      await client.getByRole('button', { name: `Edit item ${name}`, exact: true }).click();
    }
    const firstDialog = page.getByRole('dialog', { name: 'Edit item', exact: true });
    const secondDialog = second.getByRole('dialog', { name: 'Edit item', exact: true });
    await secondDialog.getByRole('textbox', { name: 'Name', exact: true }).fill(`Draft ${name}`);
    await firstDialog.getByRole('textbox', { name: 'Name', exact: true }).fill(`Other ${name}`);
    await firstDialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(firstDialog).not.toBeVisible();
    await expect(secondDialog.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(`Draft ${name}`);
    await secondDialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(secondDialog.getByRole('alert')).toContainText('revision 1 to 2');
    await expect(secondDialog.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(`Draft ${name}`);
    await expect(secondDialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await secondDialog.getByRole('button', { name: 'Reload latest values' }).click();
    await expect(secondDialog.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(`Other ${name}`);
    await secondDialog.getByRole('textbox', { name: 'Name', exact: true }).fill(`Reviewed ${name}`);
    const retry = second.waitForRequest((r) => r.url().endsWith(`/api/setup/items/${item.id}`) && r.method() === 'PATCH');
    await secondDialog.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await retry).postDataJSON()).toMatchObject({ expectedRevision: 2 });
    await expect(secondDialog).not.toBeVisible();
    await second.getByRole('button', { name: `Edit item Reviewed ${name}`, exact: true }).click();
    await secondDialog.getByRole('textbox', { name: 'Name', exact: true }).fill(`Retry ${name}`);
    await second.route(`**/api/setup/items/${item.id}`, async (route) => { await route.abort('failed'); }, { times: 1 });
    await secondDialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(secondDialog.getByRole('alert')).toContainText('Cannot reach the server');
    await expect(secondDialog.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(`Retry ${name}`);
    await secondDialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(secondDialog).not.toBeVisible();
    await expect(page.getByRole('button', { name: `Edit item Retry ${name}`, exact: true })).toBeVisible();
  } finally { await secondContext.close(); }
});

test('Setup lists page categories and request bounded, searchable category-filtered item pages', async ({ page, request }, testInfo) => {
  const { category, name } = await fixture(request, 'Paging');
  for (let index = 0; index < 11; index++) {
    expect((await request.post('/api/setup/items', { data: {
      name: `${name} ${String(index).padStart(2, '0')}`, categoryId: category.id, available: true, pricingMode: 'open'
    } })).ok()).toBe(true);
  }
  // Enough category records to exercise the independent category paginator.
  for (let index = 0; index < 11; index++) {
    expect((await request.post('/api/setup/categories', { data: { name: `${name} category ${index}` } })).ok()).toBe(true);
  }
  await page.goto('/setup');
  await filter(page, name);
  await select(page, 'Filter by category', name);
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  const section = page.getByRole('region', { name: 'Items', exact: true });
  const paginator = page.getByLabel('Item pages', { exact: true });
  // Material's larger pointer target overlays this select; exercise its labelled keyboard control.
  await paginator.getByRole('combobox', { name: 'Items per page' }).focus();
  await page.keyboard.press('Enter');
  const bounded = page.waitForRequest((r) => r.url().includes('/api/setup/items?') && new URL(r.url()).searchParams.get('pageSize') === '10');
  await page.getByRole('option', { name: '10', exact: true }).click();
  expect(new URL((await bounded).url()).searchParams.get('categoryId')).toBe(category.id);
  await expect(section.getByRole('listitem')).toHaveCount(10);
  await paginator.getByRole('button', { name: 'Next page' }).click();
  await expect(section.getByRole('listitem')).toHaveCount(2);
  await expect(section).toContainText('Page 2');
  await filter(page, `${name} 00`);
  await expect(section.getByRole('listitem')).toHaveCount(1);
  await expect(section).toContainText('Page 1');
  const categories = page.getByRole('region', { name: 'Categories', exact: true });
  await expect(categories.getByRole('listitem')).toHaveCount(10);
  const firstCategory = await categories.getByRole('listitem').first().textContent();
  await page.getByLabel('Category pages', { exact: true }).getByRole('button', { name: 'Next page' }).click();
  await expect(categories.getByRole('listitem').first()).not.toHaveText(firstCategory ?? '');
  await page.screenshot({ path: testInfo.outputPath('setup-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add item', exact: true });
  await expect(dialog.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('setup-mobile-dialog.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Add item', exact: true })).toBeFocused();
});
