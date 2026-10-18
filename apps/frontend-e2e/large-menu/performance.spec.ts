import { writeFile } from 'node:fs/promises';
import { cpus, platform, arch } from 'node:os';
import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    menuPerformance: { cls: number; interactionMs: number[]; shifts: { time: number; value: number; sources: string[] }[] };
  }
}

test('production 5,000-item menu has bounded DOM and measured feedback/layout under mobile throttling', async ({ page, context, browser }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const cdp = await context.newCDPSession(page);
  const profile = { cpuSlowdown: 4, latencyMs: 150, downloadBytesPerSecond: 200_000, uploadBytesPerSecond: 93_750 };
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuSlowdown });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: profile.latencyMs, downloadThroughput: profile.downloadBytesPerSecond,
    uploadThroughput: profile.uploadBytesPerSecond, connectionType: 'cellular3g'
  });
  await page.addInitScript(() => {
    const metrics = { cls: 0, interactionMs: [] as number[], shifts: [] as { time: number; value: number; sources: string[] }[] };
    window.menuPerformance = metrics;
    let sessionStart = 0; let previous = 0; let sessionValue = 0;
    new PerformanceObserver((list) => {
      for (const raw of list.getEntries()) {
        const entry = raw as PerformanceEntry & { hadRecentInput: boolean; value: number; sources: { node?: Element; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[] };
        if (entry.hadRecentInput) continue;
        if (entry.startTime - previous > 1000 || entry.startTime - sessionStart > 5000) {
          sessionStart = entry.startTime; sessionValue = 0;
        }
        previous = entry.startTime; sessionValue += entry.value;
        metrics.cls = Math.max(metrics.cls, sessionValue);
        metrics.shifts.push({ time: entry.startTime, value: entry.value, sources: entry.sources.map((source) => JSON.stringify({ node: source.node?.outerHTML.slice(0, 80), before: source.previousRect, after: source.currentRect, scrollY })) });
      }
    }).observe({ type: 'layout-shift', buffered: true });
    // Timestamp the actual trusted input, then observe the visible feedback and
    // allow a paint. This excludes Playwright's locator/actionability overhead.
    document.addEventListener('click', (event) => {
      const button = (event.target as Element).closest('button[aria-label="Add Menu item 0001 to cart"]');
      if (!button) return;
      const start = performance.now();
      const row = button.closest('li');
      const observer = new MutationObserver(() => {
        if (!row?.textContent?.includes('Added to cart.')) return;
        observer.disconnect();
        requestAnimationFrame(() => requestAnimationFrame(() => metrics.interactionMs.push(performance.now() - start)));
      });
      observer.observe(row!, { childList: true, subtree: true, characterData: true });
    }, true);
  });
  const start = Date.now();
  await page.goto('/menu');
  const menu = page.getByRole('region', { name: 'Menu items' });
  await expect(menu).toContainText('5000 menu items');
  await expect(menu.getByRole('listitem')).toHaveCount(50);
  const resultsHeight = (await menu.getByRole('list', { name: 'Menu results', exact: true }).boundingBox())!.height;
  const initialReadyMs = Date.now() - start;
  const add = page.getByRole('button', { name: 'Add Menu item 0001 to cart', exact: true });
  await add.click();
  await expect.poll(() => page.evaluate(() => window.menuPerformance.interactionMs.length)).toBe(1);
  const domCounts: number[] = [];
  for (let index = 0; index < 4; index++) {
    domCounts.push(await menu.getByRole('listitem').count());
    await page.getByLabel('Menu pages', { exact: true }).getByRole('button', { name: 'Next page' }).click();
    await expect(menu).toContainText(`Page ${index + 2}`);
    await expect(menu.getByRole('listitem')).toHaveCount(50);
  }
  domCounts.push(await menu.getByRole('listitem').count());
  const searchStart = Date.now();
  await page.getByRole('textbox', { name: 'Search menu', exact: true }).fill('Menu item 5000');
  await expect(menu.getByRole('listitem')).toHaveCount(1);
  expect((await menu.getByRole('list', { name: 'Menu results', exact: true }).boundingBox())!.height).toBe(resultsHeight);
  const searchMs = Date.now() - searchStart;
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const metrics = await page.evaluate(() => window.menuPerformance);
  const report = { hardware: { model: cpus()[0]?.model, logicalCpus: cpus().length, platform: platform(), arch: arch() },
    chromium: browser.version(), profile, viewport: page.viewportSize(), initialReadyMs, searchMs, domCounts, ...metrics };
  const reportPath = testInfo.outputPath('production-performance.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await testInfo.attach('production-performance', { path: reportPath, contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('throttled-menu.png'), fullPage: true });
  expect(metrics.cls).toBeLessThan(0.1);
  expect(metrics.interactionMs[0]).toBeLessThan(100);
  expect(domCounts.every((count) => count === 50)).toBe(true);
});
