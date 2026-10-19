import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { categoryMutationResponseSchema, itemMutationResponseSchema } from '@restaurant-ordering/contracts';
import { addFromMenu } from './order-helpers';

async function fixture(request: APIRequestContext) {
  const name = `Flow ${randomUUID()}`;
  const category = categoryMutationResponseSchema.parse(await (await request.post('/api/setup/categories', { data: { name } })).json()).category;
  const item = itemMutationResponseSchema.parse(await (await request.post('/api/setup/items', { data: { name, categoryId: category.id,
    available: true, pricingMode: 'fixed', priceMinor: 750, imageUrl: '/api/images/soup.jpg' } })).json()).item;
  return { name, category, item };
}
async function menu(page: Page, name: string) { await page.goto('/menu'); await page.getByRole('textbox', { name: 'Search menu', exact: true }).fill(name); }

test('quantity dialogs edit/remove existing entries and confirmed clearing works on footer and the two-column cart', async ({ page, request }, testInfo) => {
  const { name } = await fixture(request); await page.setViewportSize({ width: 1440, height: 1000 }); await menu(page, name);
  const card = page.getByRole('listitem').filter({ hasText: name });
  await expect(card.getByRole('textbox')).toHaveCount(0);
  const button = card.getByRole('button', { name: `Add ${name} to cart`, exact: true });
  const bounds = (await card.boundingBox())!; expect((await button.boundingBox())!.width).toBeGreaterThan(bounds.width - 40);
  await addFromMenu(page, name, '2');
  await button.click(); let dialog = page.getByRole('dialog', { name: /^(Add to cart|Edit in cart)$/, exact: true });
  await expect(dialog.getByRole('spinbutton', { name: 'Quantity', exact: true })).toHaveValue('2');
  await expect(dialog.getByRole('textbox', { name: 'Unit price (USD)' })).toHaveCount(0);
  await dialog.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('3'); await dialog.getByRole('button', { name: 'Edit in cart' }).click();
  const summary = page.getByRole('region', { name: 'Cart summary' }); await expect(summary).toContainText('3 items');
  await button.click(); await dialog.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('0'); await dialog.getByRole('button', { name: 'Edit in cart' }).click(); await page.getByRole('dialog', { name: 'Remove item?' }).getByRole('button', { name: 'Remove', exact: true }).click(); await expect(summary).toHaveCount(0);
  await addFromMenu(page, name, '2'); await summary.getByRole('button', { name: 'Clear cart', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Clear your cart?' }); await dialog.getByRole('button', { name: 'Cancel' }).click(); await expect(dialog).not.toBeVisible();
  await expect(summary).toContainText('2 items'); await summary.getByRole('button', { name: 'Clear cart', exact: true }).click();
  await dialog.getByRole('button', { name: 'Clear cart', exact: true }).click(); await expect(summary).toHaveCount(0);
  await addFromMenu(page, name, '2'); await summary.getByRole('link', { name: 'View cart' }).click();
  const cart = page.getByRole('region', { name: /\d+ items? in your cart/ });
  await cart.getByText('Add a discount', { exact: true }).click(); await cart.getByRole('textbox', { name: 'Fixed discount (USD)' }).fill('1.00');
  const left = (await page.locator('.cart-items').boundingBox())!; const right = (await page.getByRole('complementary', { name: 'Order summary' }).boundingBox())!;
  expect(right.x).toBeGreaterThan(left.x + left.width); expect(Math.abs(right.y - left.y)).toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath('two-column-cart.png'), fullPage: true });
  await cart.getByRole('button', { name: 'Clear cart', exact: true }).click(); await dialog.getByRole('button', { name: 'Clear cart', exact: true }).click();
  await expect(cart).toContainText('Your cart is empty'); await expect(cart.getByRole('textbox', { name: 'Fixed discount (USD)' })).toHaveCount(0);
  await expect(cart.getByText('Estimated total', { exact: true })).toHaveCount(0); await expect(cart.getByRole('button', { name: 'Review order' })).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('restaurant-ordering.cart.v1')!)); expect(saved.discountText).toBe(''); expect(saved.lines).toEqual([]);
});

test('available category counts follow search across pages, unavailable dishes are faded and last, and only the page scrolls', async ({ page, request }) => {
  const { name, category } = await fixture(request);
  for (let i = 0; i < 13; i++) await request.post('/api/setup/items', { data: { name: `${name} ${i < 2 ? 'A unavailable' : 'Z available'} ${i}`, categoryId: category.id,
    available: i >= 2, pricingMode: 'fixed', priceMinor: 100 } });
  await menu(page, name); const result = page.getByRole('list', { name: 'Menu results' }); await expect(result.getByRole('listitem')).toHaveCount(14);
  const categoryButton = page.getByRole('navigation', { name: 'Menu categories' }).getByRole('button', { name, exact: true });
  await expect(categoryButton.locator('.category-count')).toHaveText('12'); await expect(result.getByRole('listitem').last()).toContainText('Unavailable');
  expect(await result.getByRole('listitem').last().locator('.item-copy').evaluate((element) => Number(getComputedStyle(element).opacity))).toBe(0.5);
  expect(await result.evaluate((element) => ({ overflow: getComputedStyle(element).overflowY, height: element.clientHeight, scrollHeight: element.scrollHeight }))).toMatchObject({ overflow: 'visible' });
  expect(await result.evaluate((element) => element.clientHeight)).toBe(await result.evaluate((element) => element.scrollHeight));
  const paginator = page.getByLabel('Menu pages', { exact: true }); await paginator.getByRole('combobox', { name: 'Items per page' }).focus(); await page.keyboard.press('Enter');
  await page.getByRole('option', { name: '10', exact: true }).click(); await expect(result.getByRole('listitem')).toHaveCount(10); await expect(categoryButton.locator('.category-count')).toHaveText('12');
  await page.getByRole('textbox', { name: 'Search menu' }).fill(`${name} Z available`); await expect(categoryButton.locator('.category-count')).toHaveText('12');
});

test('header navigation, combined connection status and actual menu timestamps recover from offline mode', async ({ page, context, request }, testInfo) => {
  const { name, item } = await fixture(request); await menu(page, name);
  const indicator = page.getByRole('button', { name: 'Connection details', exact: true }); await expect(indicator).toHaveAttribute('title', 'Connected');
  await expect(indicator).toContainText('Connected'); await expect(indicator).toContainText('Last checked');
  await expect(page.locator('.connection-indicator')).toHaveCount(0);
  const dot = indicator.locator('.connection-dot');
  expect(await dot.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(38, 131, 71)');
  await expect(page.locator('mat-toolbar').getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link').last()).toHaveText('Settings');
  expect(await indicator.evaluate(element => getComputedStyle(element).position)).toBe('static');
  expect(await page.locator('.sync-banner').evaluate(element => !!(element.compareDocumentPosition(document.querySelector('main')!) & Node.DOCUMENT_POSITION_PRECEDING))).toBe(true);
  const timestamp = page.locator('.sync-banner time'); await expect(timestamp).toBeVisible(); const previous = await timestamp.getAttribute('datetime');
  await context.setOffline(true); await expect(indicator).toHaveAttribute('title', 'Disconnected'); await expect(page.locator('.sync-banner')).toContainText('Offline');
  await expect(timestamp).toHaveAttribute('datetime', previous!);
  expect(await dot.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(179, 38, 30)');
  await context.setOffline(false); await expect(indicator).toHaveAttribute('title', 'Connected');
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/menu/catalog', async (route) => { await gate; await route.continue(); });
  expect((await request.patch(`/api/setup/items/${item.id}`, { data: { expectedRevision: 1, description: 'Updated now' } })).ok()).toBe(true);
  await expect(page.locator('.sync-banner')).toContainText('Checking for menu updates'); release();
  await expect(timestamp).not.toHaveAttribute('datetime', previous!); await expect(page.getByRole('listitem').filter({ hasText: name })).toContainText('Updated now');
  await page.setViewportSize({ width: 375, height: 812 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('menu-mobile.png') });
  await page.goto('/setup/items'); await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/setup');
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Settings' }).click(); await expect(page).toHaveURL(/\/setup$/);
});
