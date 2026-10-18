import { expect, test } from '@playwright/test';

test('serves Angular and proxies API requests to Express', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Restaurant Ordering');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A place for every order.');

  const response = await request.get('/api');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('application/json');
  expect(await response.json()).toEqual({ name: 'Restaurant Ordering API' });
});
