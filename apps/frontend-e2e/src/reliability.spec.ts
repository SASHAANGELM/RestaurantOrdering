import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { categoryMutationResponseSchema, itemMutationResponseSchema, orderResponseSchema, quoteResponseSchema } from '@restaurant-ordering/contracts';

test('connected browsers repair committed omitted broadcasts by periodic sync and focus without resubmitting writes', async ({ page, browser, baseURL, request }, testInfo) => {
  test.setTimeout(40_000);
  const name = `Recovery ${randomUUID()}`;
  const category = categoryMutationResponseSchema.parse(await (await request.post('/api/setup/categories', { data: { name } })).json()).category;
  const item = itemMutationResponseSchema.parse(await (await request.post('/api/setup/items', { data: {
    categoryId: category.id, name, available: true, pricingMode: 'fixed', priceMinor: 400
  } })).json()).item;
  const quote = quoteResponseSchema.parse(await (await request.post('/api/checkout/quotes', {
    data: { lines: [{ itemId: item.id, observedRevision: 1, quantity: 1 }], discountMinor: 0 }
  })).json());
  const order = orderResponseSchema.parse(await (await request.post('/api/orders', {
    data: { quoteId: quote.quoteId }, headers: { 'Idempotency-Key': randomUUID() }
  })).json()).order;
  const context = await browser.newContext({ baseURL });
  const staff = await context.newPage();
  let browserWrites = 0;
  for (const client of [page, staff]) client.on('request', (request) => {
    if (request.url().includes('/api/') && request.method() !== 'GET') browserWrites++;
  });
  const timing: Record<string, number> = {};
  try {
    await Promise.all([page.goto('/menu'), staff.goto(`/orders/${order.id}`)]);
    const searchLoaded = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/menu/items' && url.searchParams.get('search') === name && response.ok();
    });
    await page.getByRole('textbox', { name: 'Search menu', exact: true }).fill(name);
    await searchLoaded;
    const row = page.getByRole('listitem').filter({ hasText: name });
    await expect(row).toContainText('$4.00');
    await expect(staff.getByText('Status: Placed', { exact: true })).toBeVisible();
    for (const client of [page, staff]) await expect(client.getByRole('button', { name: 'Connection details' })).toContainText('Connected');
    const menuChange = async (revision: number, priceMinor: number) => {
      expect((await request.patch(`/api/setup/items/${item.id}`, { data: { expectedRevision: revision, pricingMode: 'fixed', priceMinor } })).ok()).toBe(true);
    };
    const orderChange = async (revision: number, status: string) => {
      expect((await request.patch(`/api/orders/${order.id}/status`, { data: { expectedRevision: revision, status } })).ok()).toBe(true);
    };
    let start = Date.now();
    await menuChange(1, 500); await expect(row).toContainText('$5.00');
    timing['liveMenuMs'] = Date.now() - start;
    start = Date.now();
    await orderChange(1, 'preparing'); await expect(staff.getByText('Status: Preparing', { exact: true })).toBeVisible();
    timing['liveOrderMs'] = Date.now() - start;
    expect(timing['liveMenuMs']).toBeLessThan(1000); expect(timing['liveOrderMs']).toBeLessThan(1000);
    // Settle the debounced search and revision-triggered reads first: otherwise
    // an unrelated in-flight request could repair the omitted update by chance.
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect(staff.getByRole('progressbar')).toHaveCount(0);

    // The real backend commits, but its notification callback deliberately omits
    // these entity IDs. Both browser sockets remain connected throughout.
    expect((await request.post('/api/__e2e/omit', { data: { menuId: item.id, orderId: order.id } })).ok()).toBe(true);
    start = Date.now();
    await menuChange(2, 600); await orderChange(2, 'ready');
    await expect(row).toContainText('$5.00');
    await expect(staff.getByText('Status: Preparing', { exact: true })).toBeVisible();
    const omitted = await (await request.get('/api/__e2e/omitted')).json();
    expect(omitted).toEqual(expect.arrayContaining([{ stream: 'menu', id: item.id }, { stream: 'orders', id: order.id }]));
    await Promise.all([
      expect(row).toContainText('$6.00', { timeout: 18_000 }).then(() => { timing['periodicMenuMs'] = Date.now() - start; }),
      expect(staff.getByText('Status: Ready', { exact: true })).toBeVisible({ timeout: 18_000 }).then(() => { timing['periodicOrderMs'] = Date.now() - start; })
    ]);
    for (const client of [page, staff]) await expect(client.getByRole('button', { name: 'Connection details' })).toContainText('Connected');

    await menuChange(3, 700); await orderChange(3, 'completed');
    start = Date.now();
    await Promise.all([page, staff].map((client) => client.evaluate(() => window.dispatchEvent(new Event('focus')))));
    await expect(row).toContainText('$7.00'); await expect(staff.getByText('Status: Completed', { exact: true })).toBeVisible();
    timing['focusRecoveryMs'] = Date.now() - start;
    expect(timing['focusRecoveryMs']).toBeLessThan(1000);
    expect(browserWrites).toBe(0);
    expect((await (await request.get(`/api/orders/${order.id}`)).json()).order.lines[0].unitPriceMinor).toBe(400);
    const reportPath = testInfo.outputPath('recovery-timing.json');
    await writeFile(reportPath, JSON.stringify(timing, null, 2));
    await testInfo.attach('recovery-timing', { path: reportPath, contentType: 'application/json' });
  } finally { await context.close(); }
});
