import { addFromMenu } from './order-helpers';
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { categoryMutationResponseSchema, itemMutationResponseSchema } from '@restaurant-ordering/contracts';

async function fixture(request: APIRequestContext) {
  const name = `Cart ${randomUUID()}`;
  const category = categoryMutationResponseSchema.parse(await (await request.post('/api/setup/categories', { data: { name } })).json()).category;
  const items = [];
  for (const [suffix, pricingMode] of [['Fixed', 'fixed'], ['Open', 'open']] as const) {
    items.push(itemMutationResponseSchema.parse(await (await request.post('/api/setup/items', { data: {
      name: `${name} ${suffix}`, categoryId: category.id, available: true, pricingMode,
      ...(pricingMode === 'fixed' ? { priceMinor: 750 } : {})
    } })).json()).item);
  }
  return { name, category, fixed: items[0]!, open: items[1]! };
}
async function search(page: Page, value: string) {
  if (!page.url().endsWith('/menu')) await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Menu', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search menu', exact: true }).fill(value);
}

test('cart preserves open-price lines, drafts, route/reload state and off-page realtime changes', async ({ page, request }, testInfo) => {
  const { name, fixed, open, category } = await fixture(request);
  await page.goto('/menu'); await search(page, name);
  const menu = page.getByRole('region', { name: 'Menu items' });
  const cart = page.getByRole('region', { name: /\d+ items? in your cart/ });
  await expect(menu.getByRole('listitem')).toHaveCount(2);
  await addFromMenu(page, fixed.name, '2');
  await page.getByRole('button', { name: `Add ${open.name} to cart`, exact: true }).click();
  let dialog = page.getByRole('dialog', { name: /^(Add to cart|Edit in cart)$/ });
  const price = dialog.getByRole('textbox', { name: 'Unit price (USD)', exact: true });
  await expect(price).toBeFocused(); await price.fill('1.234');
  await dialog.getByRole('button', { name: 'Add to cart', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('two decimal places'); await expect(price).toHaveValue('1.234');
  await price.fill('1.25'); await dialog.getByRole('button', { name: 'Add to cart', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: `Add ${open.name} to cart`, exact: true })).toBeFocused();
  await page.getByRole('button', { name: `Add ${open.name} to cart`, exact: true }).click();
  dialog = page.getByRole('dialog', { name: /^(Add to cart|Edit in cart)$/ });
  await expect(dialog.getByRole('spinbutton', { name: 'Quantity', exact: true })).toHaveValue('1');
  await dialog.getByRole('combobox', { name: 'Cart entry' }).click();
  await page.getByRole('option', { name: 'New price / cart line', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Unit price (USD)', exact: true }).fill('2.00');
  await dialog.getByRole('button', { name: 'Add to cart', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Cart', exact: true }).click();
  await expect(cart.getByRole('listitem')).toHaveCount(3);
  await cart.getByText('Add a discount', { exact: true }).click();
  await cart.getByRole('textbox', { name: 'Fixed discount (USD)', exact: true }).fill('0.25');
  await expect(cart.locator('dl .total')).toContainText('$18.00');
  await cart.getByRole('spinbutton', { name: `Cart quantity for ${fixed.name}`, exact: true }).fill('0');
  await expect(cart.getByRole('alert').first()).toContainText('1 to 99');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Orders', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Cart', exact: true }).click();
  await expect(cart.getByRole('spinbutton', { name: `Cart quantity for ${fixed.name}`, exact: true })).toHaveValue('0');
  await page.reload(); await expect(cart.getByRole('listitem')).toHaveCount(3);
  await cart.getByRole('spinbutton', { name: `Cart quantity for ${fixed.name}`, exact: true }).fill('2');
  await expect(cart.locator('dl .total')).toContainText('$18.00');
  const other = await page.context().newPage();
  try {
    await other.goto('/cart');
    await expect(other.getByRole('region', { name: /\d+ items? in your cart/ })).toContainText('Your cart is empty');
    // The cart's fixed item is outside the visible search; notifications must use /resolve.
    await search(page, open.name); await expect(menu.getByRole('listitem')).toHaveCount(1);
    expect((await request.patch(`/api/setup/items/${fixed.id}`, { data: { expectedRevision: 1, pricingMode: 'fixed', priceMinor: 900, available: false } })).ok()).toBe(true);
    await expect(page.getByRole('region', { name: 'Cart summary' })).toContainText('Unavailable');
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Cart', exact: true }).click();
    const line = cart.getByRole('listitem').filter({ hasText: fixed.name });
    await expect(line).toContainText('Price changed from $7.50 to $9.00'); await expect(line).toContainText('Unavailable');
    await expect(line.getByRole('spinbutton')).toHaveValue('2'); await expect(cart.locator('dl .total')).toContainText('$18.00');
    expect((await request.patch(`/api/setup/categories/${category.id}`, { data: { expectedRevision: 1, archived: true } })).ok()).toBe(true);
    await expect(line).toContainText('Category archived'); await expect(cart.getByRole('listitem')).toHaveCount(3);
    await page.route('**/api/menu/resolve', (route) => route.abort('failed'));
    expect((await request.patch(`/api/setup/items/${open.id}`, { data: { expectedRevision: 1, description: 'Trigger automatic cart reconciliation' } })).ok()).toBe(true);
    await expect(cart.getByRole('alert')).toContainText('Cannot reach the server');
    await cart.getByRole('textbox', { name: 'Fixed discount (USD)', exact: true }).fill('99');
    await expect(cart.getByRole('alert').last()).toContainText('Discount cannot exceed');
    await page.screenshot({ path: testInfo.outputPath('menu-cart-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('menu-cart-mobile.png'), fullPage: true });
  } finally { await other.close(); }
});

test('menu filters locally by search/category and bounds rendered pages and retains quantity focus through refresh', async ({ page, request }) => {
  const { name, category, fixed } = await fixture(request);
  for (let index = 0; index < 11; index++) {
    expect((await request.post('/api/setup/items', { data: { name: `${name} ${index}`, categoryId: category.id, available: true, pricingMode: 'fixed', priceMinor: 100 } })).ok()).toBe(true);
  }
  await page.goto('/menu'); await search(page, name);
  const menu = page.getByRole('region', { name: 'Menu items' });
  await expect(menu.getByRole('listitem')).toHaveCount(13);
  await page.getByRole('navigation', { name: 'Menu categories' }).getByRole('button', { name, exact: true }).click();
  const pages = page.getByLabel('Menu pages', { exact: true });
  await pages.getByRole('combobox', { name: 'Items per page' }).focus(); await page.keyboard.press('Enter');
  await page.getByRole('option', { name: '10', exact: true }).click(); await expect(menu.getByRole('listitem')).toHaveCount(10);
  await pages.getByRole('button', { name: 'Next page' }).click(); await expect(menu.getByRole('listitem')).toHaveCount(3);
  const searches: URL[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/menu/catalog')) searches.push(new URL(r.url())); });
  await search(page, `${name} F`); await search(page, `${name} Fi`); await search(page, fixed.name);
  await expect(menu.getByRole('listitem')).toHaveCount(1);
  expect(searches).toEqual([]);
  await page.getByRole('button', { name: `Add ${fixed.name} to cart`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /^(Add to cart|Edit in cart)$/, exact: true });
  const quantity = dialog.getByRole('spinbutton', { name: 'Quantity', exact: true }); await quantity.fill('3');
  expect((await request.patch(`/api/setup/items/${fixed.id}`, { data: { expectedRevision: 1, description: 'Updated without stealing focus' } })).ok()).toBe(true);
  await expect(menu).toContainText('Updated without stealing focus'); await expect(quantity).toBeFocused(); await expect(quantity).toHaveValue('3');
  await dialog.getByRole('button', { name: 'Add to cart', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Cart', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: `Cart quantity for ${fixed.name}`, exact: true })).toHaveValue('3');
});

test('corrupt and unavailable sessionStorage show recovery notices and allow in-memory cart edits', async ({ page, request, browser, baseURL }) => {
  const { fixed } = await fixture(request);
  await page.addInitScript(() => sessionStorage.setItem('restaurant-ordering.cart.v1', '{broken'));
  await page.goto('/cart');
  await expect(page.getByRole('region', { name: /\d+ items? in your cart/ })).toContainText('Saved cart could not be restored');
  await search(page, fixed.name); await addFromMenu(page, fixed.name);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Cart', exact: true }).click();
  await expect(page.getByRole('region', { name: /\d+ items? in your cart/ }).getByRole('listitem')).toHaveCount(1);
  const context = await browser.newContext({ baseURL });
  try {
    await context.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Storage unavailable'); } }));
    const noStorage = await context.newPage(); await noStorage.goto('/menu'); await search(noStorage, fixed.name);
    await addFromMenu(noStorage, fixed.name);
    await noStorage.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Cart', exact: true }).click();
    const cart = noStorage.getByRole('region', { name: /\d+ items? in your cart/ });
    await expect(cart).toContainText('Cart changes cannot be saved'); await expect(cart.getByRole('listitem')).toHaveCount(1);
    await cart.getByRole('spinbutton', { name: `Cart quantity for ${fixed.name}`, exact: true }).fill('3');
    await expect(cart.locator('dl .total')).toContainText('$22.50');
  } finally { await context.close(); }
});
