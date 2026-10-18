import { expect, test } from '@playwright/test';

test('real 5,000-item seed stays server-paged, searchable and category-filtered', async ({ page }, testInfo) => {
  let release!: () => void;
  const firstPageGate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/menu/items?*', async (route) => { await firstPageGate; await route.continue(); });
  const responses: { count: number; total: number; pageSize: number }[] = [];
  page.on('response', async (response) => {
    if (response.url().includes('/api/menu/items?') && response.ok()) {
      const body = await response.json(); responses.push({ count: body.items.length, total: body.total, pageSize: body.pageSize });
    }
  });
  await page.goto('/menu');
  const menu = page.getByRole('region', { name: 'Menu items' });
  await expect(menu.locator('.skeleton')).toHaveCount(50);
  const skeletonHeight = (await menu.locator('.skeleton').first().boundingBox())?.height;
  release();
  await expect(menu).toContainText('5000 menu items'); await expect(menu.getByRole('listitem')).toHaveCount(50);
  expect((await menu.getByRole('listitem').first().boundingBox())?.height).toBe(skeletonHeight);
  await expect(menu.getByText('Menu item 0017', { exact: true }).locator('..')).toContainText('Unavailable');
  await expect(page.getByRole('button', { name: 'Add Menu item 0017 to cart', exact: true })).toBeDisabled();
  await page.getByLabel('Menu pages', { exact: true }).getByRole('button', { name: 'Next page' }).click();
  await expect(menu).toContainText('Page 2'); await expect(menu.getByRole('listitem')).toHaveCount(50);
  await page.getByRole('textbox', { name: 'Search menu' }).fill('Menu item 5000');
  await expect(menu.getByRole('listitem')).toHaveCount(1); await expect(menu).toContainText('Page 1');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click(); await expect(menu.getByRole('listitem')).toHaveCount(50);
  await page.getByRole('combobox', { name: 'Menu category', exact: true }).click();
  await page.getByRole('option', { name: 'Category 01', exact: true }).click();
  await expect(menu).toContainText('100 menu items'); await expect(menu.getByRole('listitem')).toHaveCount(50);
  expect(responses.some((r) => r.total === 5000)).toBe(true);
  expect(responses.every((r) => r.count <= r.pageSize && r.pageSize <= 100)).toBe(true);
  await testInfo.attach('bounded-pages', { body: JSON.stringify(responses, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('large-menu.png') });
});
