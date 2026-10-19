import { expect, test } from '@playwright/test';

test('complete 5,000-item snapshot supports local search, category filters and pagination without more catalog calls', async ({ page, request }) => {
  const catalogCalls: string[] = [];
  page.on('request', request => { if (/\/api\/menu\/(catalog|items|categories)/.test(request.url())) catalogCalls.push(request.url()); });
  const body = await (await request.get('/api/menu/catalog')).json();
  expect(body.items).toHaveLength(5000); expect(body.categories).toHaveLength(50);
  await page.goto('/menu');
  const menu = page.getByRole('region', { name: 'Menu items' });
  await expect(menu).toContainText('5000 menu items'); await expect(menu.getByRole('listitem')).toHaveCount(50);
  const initialCalls = catalogCalls.length;
  await page.getByLabel('Menu pages', { exact: true }).getByRole('button', { name: 'Next page' }).click();
  await expect(menu).toContainText('Page 2'); await expect(menu.getByRole('listitem')).toHaveCount(50);
  await page.getByRole('textbox', { name: 'Search menu' }).fill('Menu item 5000'); await expect(menu.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await page.getByRole('navigation', { name: 'Menu categories' }).getByRole('button', { name: 'Category 01', exact: true }).click();
  await expect(menu).toContainText('100 menu items');
  await page.getByRole('textbox', { name: 'Search menu' }).fill('Menu item 5000'); await expect(menu.getByText('No dishes found')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).first().click(); await expect(menu).toContainText('100 menu items');
  expect(catalogCalls).toHaveLength(initialCalls);
});
