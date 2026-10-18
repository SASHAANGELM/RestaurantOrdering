import { expect, test } from '@playwright/test';

test('real 5,000-item seed stays server-paged, searchable and category-filtered', async ({ page }, testInfo) => {
  let release!: () => void;
  const firstPageGate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/menu/items?*', async (route) => { await firstPageGate; await route.continue(); });
  const responses: { count: number; total: number; pageSize: number }[] = [];
  const responseReads: Promise<void>[] = [];
  const responseErrors: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/api/menu/items?') && response.ok()) {
      responseReads.push((async () => {
        if (await response.finished()) return;
        const body = await response.json();
        responses.push({ count: body.items.length, total: body.total, pageSize: body.pageSize });
      })().catch((error: unknown) => {
        // Superseded filter requests are intentionally cancelled by the client.
        if (!response.request().failure()) responseErrors.push(String(error));
      }));
    }
  });
  await page.goto('/menu');
  const menu = page.getByRole('region', { name: 'Menu items' });
  await expect(menu.locator('.skeleton')).toHaveCount(50);
  const skeletonHeight = (await menu.locator('.skeleton').first().boundingBox())?.height;
  release();
  await expect(menu).toContainText('5000 menu items'); await expect(menu.getByRole('listitem')).toHaveCount(50);
  expect((await menu.getByRole('listitem').first().boundingBox())?.height).toBe(skeletonHeight);
  const results = menu.getByRole('list', { name: 'Menu results', exact: true });
  expect(await results.evaluate((element) => getComputedStyle(element).overflowY)).toBe('visible');
  await results.focus();
  const scrolling = page.evaluate(() => new Promise<void>((resolve) => window.addEventListener('scrollend', () => resolve(), { once: true })));
  await page.keyboard.press('PageDown'); await scrolling;
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await page.getByLabel('Menu pages', { exact: true }).getByRole('button', { name: 'Next page' }).click();
  await expect(menu).toContainText('Page 2'); await expect(menu.getByRole('listitem')).toHaveCount(50);
  expect(await results.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await results.evaluate((element) => element.clientHeight)).toBe(await results.evaluate((element) => element.scrollHeight));
  await page.getByRole('textbox', { name: 'Search menu' }).fill('Menu item 5000');
  await expect(menu.getByRole('listitem')).toHaveCount(1); await expect(menu).toContainText('Page 1');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click(); await expect(menu.getByRole('listitem')).toHaveCount(50);
  await page.getByRole('navigation', { name: 'Menu categories' }).getByRole('button', { name: 'Category 01', exact: true }).click();
  await expect(menu).toContainText('100 menu items'); await expect(menu.getByRole('listitem')).toHaveCount(50);
  await Promise.all(responseReads); expect(responseErrors).toEqual([]);
  await page.getByRole('textbox', { name: 'Search menu' }).fill('Menu item 0017');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search menu' }).fill('Menu item 0017');
  await expect(page.getByRole('button', { name: 'Add Menu item 0017 to cart', exact: true })).toBeDisabled();
  expect(responses.some((r) => r.total === 5000)).toBe(true);
  expect(responses.every((r) => r.count <= r.pageSize && r.pageSize <= 100)).toBe(true);
  await testInfo.attach('bounded-pages', { body: JSON.stringify(responses, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('large-menu.png') });
});
