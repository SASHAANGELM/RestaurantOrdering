import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { categoryMutationResponseSchema, itemMutationResponseSchema, orderResponseSchema, quoteResponseSchema } from '@restaurant-ordering/contracts';
import { addFromMenu } from './order-helpers';

async function fixture(request: APIRequestContext, open = false) {
  const name = `Refinements ${randomUUID()}`;
  const category = categoryMutationResponseSchema.parse(await (await request.post('/api/setup/categories', { data: { name, sortOrder: -5000 } })).json()).category;
  const item = itemMutationResponseSchema.parse(await (await request.post('/api/setup/items', { data: {
    name, categoryId: category.id, available: true, imageUrl: '/api/images/soup.jpg',
    ...(open ? { pricingMode: 'open' } : { pricingMode: 'fixed', priceMinor: 750 })
  } })).json()).item;
  return { name, item, category };
}
async function menu(page: Page, name: string) { await page.goto('/menu'); await page.getByRole('textbox', { name: 'Search menu', exact: true }).fill(name); }

test('cart dialogs share price/quantity controls, hide comments until requested, and expose deletion only for existing lines', async ({ page, request }, testInfo) => {
  const { name } = await fixture(request, true);
  await page.setViewportSize({ width: 375, height: 812 }); await menu(page, name);
  await page.getByRole('button', { name: `Add ${name} to cart`, exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Add to cart', exact: true });
  await expect(dialog.locator('textarea')).toHaveCount(0); await expect(dialog.getByRole('button', { name: 'Delete from cart', exact: true })).toHaveCount(0);
  const price = dialog.getByRole('textbox', { name: 'Unit price (USD)', exact: true }); const quantity = dialog.getByRole('spinbutton', { name: 'Quantity', exact: true });
  await price.fill('1,25'); await expect(price).toHaveValue('1.25'); await quantity.fill('2');
  await expect(dialog.getByRole('img', { name, exact: true })).toHaveAttribute('src', '/api/images/soup.jpg');
  const p = await price.boundingBox(); const q = await quantity.boundingBox();
  expect(p!.x).toBeLessThan(q!.x); expect(Math.abs(p!.y - q!.y)).toBeLessThan(2);
  await dialog.getByRole('button', { name: 'Add comment', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Comment for the kitchen', exact: true }).fill('test123');
  await dialog.getByRole('button', { name: 'Remove comment', exact: true }).click(); await expect(dialog.locator('textarea')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Add comment', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Comment for the kitchen', exact: true }).fill('test123');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('open-price-dialog-mobile.png') });
  await dialog.getByRole('button', { name: 'Add to cart', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: `Add ${name} to cart`, exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Edit in cart', exact: true });
  await expect(dialog.locator('textarea')).toHaveCount(0); await expect(dialog).toContainText('Comment: test123');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(dialog).not.toBeVisible();
  await page.goto('/cart');
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
  await expect(breadcrumb).toHaveText('Menu>Cart'); await expect(breadcrumb.locator('i')).toHaveCount(0);
  const cart = page.getByRole('region', { name: /\d+ items? in your cart/, exact: true });
  const priceInput = cart.getByRole('textbox', { name: `Cart unit price for ${name}`, exact: true });
  await expect(priceInput).toHaveValue('1.25');
  await priceInput.fill('2,50'); await expect(priceInput).toHaveValue('2.50');
  await expect(cart.locator('.line-total')).toHaveText('$5.00');
  await page.reload(); await expect(priceInput).toHaveValue('2.50');
  const cartPrice = await cart.getByRole('textbox', { name: `Cart unit price for ${name}`, exact: true }).boundingBox();
  const cartQuantity = await cart.getByRole('spinbutton', { name: `Cart quantity for ${name}`, exact: true }).boundingBox();
  expect(cartPrice!.x).toBeLessThan(cartQuantity!.x); expect(Math.abs(cartPrice!.y - cartQuantity!.y)).toBeLessThan(2);
  await cart.getByText('Add a discount', { exact: true }).click(); await cart.getByRole('textbox', { name: 'Fixed discount (USD)', exact: true }).fill('0.25');
  await expect(cart.locator('dl dt')).toHaveText(['Estimated subtotal', 'Discount', 'Estimated total']);
  await cart.getByRole('textbox', { name: 'Fixed discount (USD)', exact: true }).fill('0');
  await expect(cart.locator('dl dt')).toHaveText(['Estimated subtotal', 'Estimated total']);
  await breadcrumb.getByRole('link', { name: 'Menu', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search menu', exact: true }).fill(name);
  await page.getByRole('button', { name: `Add ${name} to cart`, exact: true }).click();
  await page.getByRole('dialog', { name: 'Edit in cart', exact: true }).getByRole('button', { name: 'Delete from cart', exact: true }).click();
  await page.getByRole('dialog', { name: 'Remove item?', exact: true }).getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Cart summary', exact: true })).toHaveCount(0);
});

test('fixed unit prices share the left column with open prices in cart and dialogs at desktop and mobile sizes', async ({ page, request }, testInfo) => {
  const fixed = await fixture(request); const open = await fixture(request, true);
  await menu(page, open.name); await page.getByRole('button', { name: `Add ${open.name} to cart`, exact: true }).click();
  const openDialog = page.getByRole('dialog', { name: 'Add to cart', exact: true });
  await openDialog.getByRole('textbox', { name: 'Unit price (USD)', exact: true }).fill('1,00');
  await openDialog.getByRole('button', { name: 'Add to cart', exact: true }).click(); await expect(openDialog).not.toBeVisible();
  await menu(page, fixed.name);
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: `Add ${fixed.name} to cart`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /^(Add to cart|Edit in cart)$/ });
    await expect(dialog.locator('.mat-mdc-dialog-surface')).toHaveCSS('transform', 'none');
    await expect(dialog.locator('.fixed-price')).toHaveText('7.50 USD');
    await expect(dialog.locator('app-price-input')).toHaveCount(0);
    await expect(dialog.getByRole('img', { name: fixed.name, exact: true })).toBeVisible();
    const price = await dialog.locator('.fixed-price').boundingBox(); const quantity = await dialog.getByRole('spinbutton', { name: 'Quantity', exact: true }).boundingBox();
    expect(price!.x).toBeLessThan(quantity!.x); expect(Math.abs(price!.y - quantity!.y)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`fixed-price-dialog-${width}.png`) });
    await dialog.getByRole('button', { name: /^(Add to cart|Edit in cart)$/ }).click(); await expect(dialog).not.toBeVisible();
    await page.goto('/cart');
    const rows = page.getByRole('region', { name: /\d+ items? in your cart/, exact: true }).getByRole('listitem');
    const fixedRow = rows.filter({ has: page.getByRole('link', { name: fixed.name, exact: true }) });
    const openRow = rows.filter({ has: page.getByRole('link', { name: open.name, exact: true }) });
    await expect(fixedRow.locator('.fixed-price')).toHaveText('7.50 USD');
    await expect(rows.locator('.line-copy')).not.toContainText(['Unit price', 'Unit price']);
    const fixedPrice = await fixedRow.locator('.fixed-price').boundingBox();
    const openPrice = await openRow.getByRole('textbox', { name: `Cart unit price for ${open.name}`, exact: true }).boundingBox();
    const fixedQuantity = await fixedRow.getByRole('spinbutton', { name: `Cart quantity for ${fixed.name}`, exact: true }).boundingBox();
    expect(fixedPrice!.x).toBeLessThan(fixedQuantity!.x); expect(Math.abs(fixedPrice!.y - fixedQuantity!.y)).toBeLessThan(2);
    // The read-only value starts at the editable control's left edge (before its minus button).
    const openField = await openRow.locator('app-unit-price-field').boundingBox();
    expect(Math.abs(fixedPrice!.x - openField!.x)).toBeLessThan(2); expect(openPrice!.x).toBeLessThan(fixedQuantity!.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`cart-unit-prices-${width}.png`), fullPage: true });
    await menu(page, fixed.name);
  }
});

test('cart silently updates names/images, requires persistent OK for price/type changes, and keeps eligibility errors red', async ({ page, request }, testInfo) => {
  const { item, name } = await fixture(request); await menu(page, name); await addFromMenu(page, name); await page.goto('/cart');
  const line = page.getByRole('region', { name: /\d+ items? in your cart/, exact: true }).getByRole('listitem');
  const confirm = page.getByRole('button', { name: 'Confirm order', exact: true }); const renamed = `${name} renamed`;
  expect((await request.patch(`/api/setup/items/${item.id}`, { data: { expectedRevision: 1, name: renamed, imageUrl: '/api/images/salad.jpg' } })).ok()).toBe(true);
  await expect(line.getByRole('link', { name: renamed, exact: true })).toBeVisible();
  await expect(line.getByRole('img')).toHaveAttribute('src', '/api/images/salad.jpg');
  await expect(line).not.toHaveClass(/line-warning|line-unavailable/);
  expect((await request.patch(`/api/setup/items/${item.id}`, { data: { expectedRevision: 2, pricingMode: 'fixed', priceMinor: 900 } })).ok()).toBe(true);
  await expect(line).toHaveClass(/line-warning/); await expect(line).toContainText('Price changed from $7.50 to $9.00'); await expect(confirm).toBeDisabled();
  await page.reload(); await expect(line).toHaveClass(/line-warning/); await expect(confirm).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('cart-price-warning-desktop.png'), fullPage: true });
  await line.getByRole('button', { name: 'OK', exact: true }).click(); await expect(line).not.toHaveClass(/line-warning/); await expect(confirm).toBeEnabled();
  expect((await request.patch(`/api/setup/items/${item.id}`, { data: { expectedRevision: 3, pricingMode: 'open' } })).ok()).toBe(true);
  await expect(line).toContainText('fixed price to open price'); await expect(confirm).toBeDisabled();
  await line.getByRole('textbox', { name: `Cart unit price for ${renamed}`, exact: true }).fill('2.35');
  await line.getByRole('button', { name: 'OK', exact: true }).click(); await expect(line).not.toHaveClass(/line-warning/); await expect(confirm).toBeEnabled();
  expect((await request.patch(`/api/setup/items/${item.id}`, { data: { expectedRevision: 4, pricingMode: 'fixed', priceMinor: 500 } })).ok()).toBe(true);
  await expect(line).toContainText('open price to fixed price'); await line.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(line).toContainText('$5.00'); await expect(line).not.toHaveClass(/line-warning/);
  expect((await request.patch(`/api/setup/items/${item.id}`, { data: { expectedRevision: 5, available: false } })).ok()).toBe(true);
  await expect(line).toHaveClass(/line-unavailable/); await expect(line).not.toHaveClass(/line-warning/); await expect(confirm).toBeDisabled();
});

test('orders show snapshot image stacks, short IDs and inline statuses; details share breadcrumbs, item editing and colored states', async ({ page, request }, testInfo) => {
  const { item, category, name } = await fixture(request);
  const items = [item];
  for (let index = 0; index < 3; index++) items.push(itemMutationResponseSchema.parse(await (await request.post('/api/setup/items', { data: {
    name: `${name} ${index}`, categoryId: category.id, available: true, pricingMode: 'fixed', priceMinor: 100, imageUrl: '/api/images/salad.jpg'
  } })).json()).item);
  const quote = quoteResponseSchema.parse(await (await request.post('/api/checkout/quotes', { data: { lines: items.map(entry => ({ itemId: entry.id, quantity: 1, observedRevision: 1, comment: 'test123' })), discountMinor: 0 } })).json());
  const order = orderResponseSchema.parse(await (await request.post('/api/orders', { data: { quoteId: quote.quoteId }, headers: { 'Idempotency-Key': randomUUID() } })).json()).order;
  for (const path of ['/menu', '/orders', '/setup']) { await page.goto(path); await expect(page.getByRole('navigation', { name: 'Breadcrumb', exact: true })).toHaveCount(0); }
  await page.goto('/orders');
  const link = page.getByRole('link', { name: `Order ${order.id.slice(0, 8)}`, exact: true }); const row = page.getByRole('listitem').filter({ has: link });
  await expect(row.locator('app-item-image-stack img')).toHaveCount(3); await expect(row).not.toContainText(order.id);
  const status = row.getByRole('combobox', { name: `Status for order ${order.id.slice(0, 8)}`, exact: true });
  await status.selectOption('preparing'); await expect(row).toHaveClass(/status-preparing/);
  await page.route(`**/api/orders/${order.id}/status`, async route => {
    expect((await request.patch(`/api/orders/${order.id}/status`, { data: { expectedRevision: 2, status: 'ready' } })).ok()).toBe(true);
    await route.fulfill({ response: await route.fetch() });
  }, { times: 1 });
  await status.selectOption('ready'); await expect(row.getByRole('alert')).toBeVisible(); await expect(status).toBeDisabled();
  await expect(status).toHaveValue('ready');
  await row.getByRole('button', { name: 'Refresh status', exact: true }).click(); await expect(status).toHaveValue('ready'); await expect(status).toBeEnabled();
  await status.selectOption('completed'); await expect(status).toBeDisabled(); await expect(row).toHaveClass(/status-completed/);
  await page.screenshot({ path: testInfo.outputPath('orders-inline-status-desktop.png'), fullPage: true });
  await link.click();
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
  await expect(breadcrumb).toHaveText(`Orders>Order ${order.id.slice(0, 8)}`); await expect(breadcrumb.locator('i')).toHaveCount(0);
  expect(await page.getByRole('button', { name: 'Refresh order', exact: true }).evaluate(element => element.previousElementSibling?.tagName)).toBe('H1');
  const ordered = page.getByRole('region', { name: 'Ordered items', exact: true });
  await expect(ordered).toContainText('Comment: test123'); await expect(page.locator('.order-id')).toHaveText(order.id.slice(0, 8));
  const image = await ordered.getByRole('img', { name, exact: true }).boundingBox();
  const title = await ordered.getByRole('link', { name, exact: true }).boundingBox();
  expect(image!.x).toBeLessThan(title!.x); expect(Math.abs(image!.y - title!.y)).toBeLessThan(8);
  await page.screenshot({ path: testInfo.outputPath('order-details-desktop.png'), fullPage: true });
  await ordered.getByRole('link', { name, exact: true }).click();
  await expect(breadcrumb).toHaveText(`Settings>Items>${name}`);
  const state = page.locator('.item-status'); await expect(state).toHaveClass(/available/); await expect(state.locator('i')).toHaveClass(/ti-eye/);
  const colors = [await state.evaluate(element => getComputedStyle(element).color)];
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit item', exact: true }); const renamed = `${name} updated`;
  await editor.getByRole('textbox', { name: 'Name', exact: true }).fill(renamed); await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).not.toBeVisible(); await expect(breadcrumb).toHaveText(`Settings>Items>${renamed}`);
  expect((await request.patch(`/api/setup/items/${item.id}`, { data: { expectedRevision: 2, available: false } })).ok()).toBe(true);
  await expect(state).toHaveClass(/unavailable/); colors.push(await state.evaluate(element => getComputedStyle(element).color));
  expect((await request.patch(`/api/setup/items/${item.id}`, { data: { expectedRevision: 3, archived: true } })).ok()).toBe(true);
  await expect(state).toHaveClass(/archived/); colors.push(await state.evaluate(element => getComputedStyle(element).color)); expect(new Set(colors).size).toBe(3);
  await page.setViewportSize({ width: 375, height: 812 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('item-status-mobile.png'), fullPage: true });
});
