import { addFromMenu } from './order-helpers';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { categoryMutationResponseSchema, itemMutationResponseSchema } from '@restaurant-ordering/contracts';

test('photo grid, category navigation and compact cart footer work across desktop and mobile', async ({ page, request }, testInfo) => {
  const name = `Gallery ${randomUUID()}`;
  const category = categoryMutationResponseSchema.parse(await (await request.post('/api/setup/categories', { data: { name } })).json()).category;
  const items = [];
  for (const [index, image] of ['salad', 'burger', 'pasta', 'pizza'].entries()) {
    items.push(itemMutationResponseSchema.parse(await (await request.post('/api/setup/items', { data: {
      name: `${name} ${index}`, categoryId: category.id, pricingMode: 'fixed', priceMinor: 1000,
      available: true, imageUrl: `/images/${image}.jpg`, description: 'Freshly prepared in our kitchen.'
    } })).json()).item);
  }
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/menu');
  const summary = page.getByRole('region', { name: 'Cart summary' });
  const menu = page.getByRole('region', { name: 'Menu items' });
  await expect(summary).toHaveCount(0); await expect(page.getByRole('region', { name: 'Your cart' })).toHaveCount(0);
  const categoryButton = page.getByRole('navigation', { name: 'Menu categories' }).getByRole('button', { name, exact: true });
  await categoryButton.click(); await expect(categoryButton).toHaveAttribute('aria-pressed', 'true');
  await expect(menu.getByRole('listitem')).toHaveCount(4);
  const results = menu.getByRole('list', { name: 'Menu results' });
  expect(await results.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(4);
  expect((await categoryButton.boundingBox())!.x).toBeLessThan((await results.boundingBox())!.x);
  const images = menu.getByRole('img'); await expect(images).toHaveCount(4);
  await expect.poll(() => images.evaluateAll((elements) => elements.every((element) => (element as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.setViewportSize({ width: 1200, height: 1000 });
  expect(await results.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(3);
  await addFromMenu(page, items[0]!.name, '2');
  await addFromMenu(page, items[1]!.name);
  await expect(summary).toContainText('3 items'); await expect(summary).toContainText('$30.00');
  expect((await summary.boundingBox())!.height).toBe(80);
  expect(await categoryButton.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(44, 108, 147)');
  expect((await request.patch(`/api/setup/items/${items[0]!.id}`, { data: { expectedRevision: 1, available: false } })).ok()).toBe(true);
  await expect(summary).toContainText('Unavailable');
  expect((await request.patch(`/api/setup/items/${items[0]!.id}`, { data: { expectedRevision: 2, imageUrl: '/images/missing.jpg' } })).ok()).toBe(true);
  const firstPhoto = menu.getByRole('img', { name: items[0]!.name, exact: true });
  await expect(firstPhoto).toHaveAttribute('src', '/api/images/salad.jpg');
  expect((await request.patch(`/api/setup/items/${items[0]!.id}`, { data: { expectedRevision: 3, imageUrl: '/images/soup.jpg' } })).ok()).toBe(true);
  await expect(firstPhoto).toHaveAttribute('src', '/api/images/soup.jpg');
  await page.screenshot({ path: testInfo.outputPath('menu-grid-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole('combobox', { name: 'Menu category', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('menu-grid-mobile.png'), fullPage: true });
  await summary.getByRole('link', { name: 'View cart' }).click(); await expect(page).toHaveURL(/\/cart$/);
  const cart = page.getByRole('region', { name: 'Your cart' }); await expect(cart.getByRole('listitem')).toHaveCount(2);
  await cart.getByRole('textbox', { name: `Cart quantity for ${items[0]!.name}`, exact: true }).fill('bad');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Menu', exact: true }).click();
  await expect(summary).toContainText('Correct cart line inputs'); await expect(summary).toContainText('Check total');
  await summary.getByRole('link', { name: 'View cart' }).click();
  for (const item of items.slice(0, 2)) await cart.getByRole('button', { name: `Remove ${item.name} from cart`, exact: true }).click();
  await page.getByRole('link', { name: 'Back to menu', exact: true }).click(); await expect(summary).toHaveCount(0);
});

test('Setup hub opens independent pages and availability precedes Edit with archival inside its dialog', async ({ page, request }) => {
  const name = `Manage ${randomUUID()}`;
  const category = categoryMutationResponseSchema.parse(await (await request.post('/api/setup/categories', { data: { name } })).json()).category;
  const item = itemMutationResponseSchema.parse(await (await request.post('/api/setup/items', { data: {
    name, categoryId: category.id, pricingMode: 'fixed', priceMinor: 1000, available: true
  } })).json()).item;
  await page.goto('/setup');
  await page.getByRole('link', { name: /Categories.*Manage categories/ }).click(); await expect(page).toHaveURL(/\/setup\/categories$/);
  await expect(page.getByRole('region', { name: 'Items', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Items', exact: true }).click(); await expect(page).toHaveURL(/\/setup\/items$/);
  await page.getByRole('textbox', { name: 'Search items', exact: true }).fill(name);
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  const row = page.getByRole('listitem').filter({ hasText: name });
  await expect(row.getByRole('button', { name: /Archive/ })).toHaveCount(0);
  const available = row.getByRole('checkbox', { name: `Available ${name}`, exact: true });
  const edit = row.getByRole('button', { name: `Edit item ${name}`, exact: true });
  expect((await available.boundingBox())!.x).toBeLessThan((await edit.boundingBox())!.x);
  await page.route(`**/api/setup/items/${item.id}`, (route) => route.abort('failed'), { times: 1 });
  await available.click();
  await expect(page.getByRole('alert')).toContainText('Cannot reach the server');
  await expect(available).toBeChecked(); await expect(available).toBeEnabled();
  await available.click(); await expect(row).toContainText('Unavailable');
  const unavailable = await (await request.post('/api/menu/resolve', { data: { itemIds: [item.id] } })).json();
  expect(unavailable.items[0]).toMatchObject({ state: 'unavailable', item: { revision: 2 } });
  await edit.click();
  let dialog = page.getByRole('dialog', { name: 'Edit item', exact: true });
  await dialog.getByRole('button', { name: 'Archive item', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Archive item', exact: true });
  await expect(dialog).toContainText('cannot be ordered'); await dialog.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(row).toHaveCount(0);
  const resolved = await (await request.post('/api/menu/resolve', { data: { itemIds: [item.id] } })).json();
  expect(resolved.items[0].state).toBe('archived');
});
