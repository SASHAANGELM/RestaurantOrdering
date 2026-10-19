import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { categoryMutationResponseSchema, itemMutationResponseSchema } from '@restaurant-ordering/contracts';
import { addFromMenu } from './order-helpers';

async function fixture(request: APIRequestContext) {
  const name = `Images ${randomUUID()}`;
  const category = categoryMutationResponseSchema.parse(await (await request.post('/api/setup/categories', { data: { name } })).json()).category;
  const item = itemMutationResponseSchema.parse(await (await request.post('/api/setup/items', { data: {
    name, categoryId: category.id, available: true, pricingMode: 'fixed', priceMinor: 450
  } })).json()).item;
  return { name, item, category };
}

test('cart counts, labelled comments, empty discounts and balanced spacing work on desktop and mobile', async ({ page, request }, testInfo) => {
  const { name } = await fixture(request);
  await page.goto('/menu');
  await expect(page.locator('.app-toolbar .cart-count')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search menu', exact: true }).fill(name);
  await expect(page.getByRole('listitem').filter({ hasText: name }).getByRole('img', { name: `${name} — no image available`, exact: true })).toBeVisible();
  await addFromMenu(page, name, '3');
  const desktopCart = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /Cart/ });
  await expect(desktopCart.locator('.cart-count')).toHaveText('3');
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    const summary = page.getByRole('region', { name: 'Cart summary' });
    await expect(summary.getByRole('link', { name: 'View cart' })).toContainText('View cart');
    await expect(summary.locator('.cart-link-text')).toBeVisible();
    expect(await summary.locator('.summary-inner').evaluate(element => {
      const style = getComputedStyle(element); return style.paddingLeft === style.paddingRight;
    })).toBe(true);
    if (width === 375) await expect(page.locator('.header-cart .cart-count')).toHaveText('3');
    const link = width === 375 ? page.locator('.header-cart') : desktopCart;
    const linkBounds = (await link.boundingBox())!; const badgeBounds = (await link.locator('.cart-count').boundingBox())!;
    expect(badgeBounds.y).toBeLessThan(linkBounds.y + 3);
    expect(badgeBounds.x + badgeBounds.width).toBeGreaterThanOrEqual(linkBounds.x + linkBounds.width - 4);
    await page.screenshot({ path: testInfo.outputPath(`menu-${width}.png`) });
  }
  // Existing tabs may have persisted the old zero default. Render it as an empty input too.
  await page.evaluate(() => {
    const key = 'restaurant-ordering.cart.v1'; const stored = JSON.parse(sessionStorage.getItem(key)!);
    sessionStorage.setItem(key, JSON.stringify({ ...stored, discountText: '0.00' }));
  });
  await page.goto('/cart');
  const cart = page.getByRole('region', { name: '3 items in your cart', exact: true });
  await cart.getByRole('button', { name: 'Add comment' }).click();
  const comment = page.getByRole('dialog', { name: 'Kitchen comment' });
  await comment.getByRole('textbox').fill('No mustard');
  await comment.getByRole('button', { name: 'Save comment' }).click();
  await expect(cart.locator('.comment-label')).toHaveText('Comment:');
  await expect(cart.locator('.kitchen-comment p')).toHaveText('No mustard');
  await cart.getByText('Add a discount', { exact: true }).click();
  const discount = cart.getByRole('textbox', { name: 'Fixed discount (USD)' });
  await expect(discount).toHaveValue(''); await expect(discount).toHaveAttribute('placeholder', '0.00');
  await discount.fill('1.00'); await expect(cart.locator('dl .total')).toContainText('$12.50');
  await discount.fill(''); await expect(cart.locator('dl .total')).toContainText('$13.50');
  await expect(cart.getByRole('alert')).toHaveCount(0);
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await cart.getByRole('listitem').evaluate(element => {
      const style = getComputedStyle(element); return style.paddingLeft === style.paddingRight;
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`cart-${width}.png`), fullPage: true });
  }
  await cart.getByRole('button', { name: 'Clear cart', exact: true }).click();
  await page.getByRole('dialog', { name: 'Clear your cart?' }).getByRole('button', { name: 'Clear cart', exact: true }).click();
  await expect(page.locator('.app-toolbar .cart-count')).toHaveCount(0);
});

test('nested stock gallery previews selections, cancels safely, saves no image and creates with a photo', async ({ page, request }, testInfo) => {
  const { name, item, category } = await fixture(request);
  await page.goto('/setup/items');
  await page.getByRole('textbox', { name: 'Search items', exact: true }).fill(name);
  const edit = page.getByRole('button', { name: `Edit item ${name}`, exact: true });
  await edit.click();
  const editor = page.getByRole('dialog', { name: 'Edit item', exact: true });
  const editImage = editor.getByRole('button', { name: 'Edit image', exact: true });
  const gallery = page.getByRole('dialog', { name: 'Choose item image', exact: true });
  await expect(editor.locator('.image-preview .placeholder')).toBeVisible();
  await expect(editor.getByRole('textbox', { name: 'Image URL' })).toHaveCount(0);
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await editImage.click();
    await expect(gallery.locator('.image-option')).toHaveCount(14);
    expect(await gallery.locator('.image-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(width === 375 ? 3 : 4);
    await expect(gallery.getByRole('button', { name: 'Add image', exact: true })).toBeDisabled();
    await expect(gallery.locator('#prototype-image-help')).toContainText('Adding or removing images is unavailable in this prototype');
    await expect.poll(() => gallery.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await expect(gallery.locator('mat-dialog-content')).toHaveCSS('opacity', '1');
    await expect.poll(() => gallery.evaluate(element => element.getAnimations({ subtree: true }).some(animation => animation.playState === 'running'))).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`gallery-${width}.png`) });
    await page.keyboard.press('Escape'); await expect(gallery).not.toBeVisible(); await expect(editImage).toBeFocused();
  }
  await editImage.click(); await gallery.getByRole('button', { name: 'Soup', exact: true }).click();
  await expect(editor.locator('.image-preview img')).toHaveAttribute('src', '/api/images/soup.jpg');
  await editImage.click(); await gallery.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor.locator('.image-preview img')).toHaveAttribute('src', '/api/images/soup.jpg');
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(itemMutationResponseSchema.parse(await (await request.patch(`/api/setup/items/${item.id}`, { data: { expectedRevision: 1, imageUrl: '/api/images/bread.jpg' } })).json()).item.imageUrl).toBe('/api/images/bread.jpg');
  await edit.click(); await expect(editor.locator('.image-preview img')).toHaveAttribute('src', '/api/images/bread.jpg');
  await editImage.click(); await gallery.getByRole('button', { name: 'No image', exact: true }).click();
  const saved = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().endsWith(`/api/setup/items/${item.id}`));
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  expect(itemMutationResponseSchema.parse(await (await saved).json()).item.imageUrl).toBeUndefined();
  await page.reload(); await edit.click(); await expect(editor.locator('.image-preview .placeholder')).toBeVisible();
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  const add = page.getByRole('dialog', { name: 'Add item', exact: true });
  await add.getByRole('textbox', { name: 'Name', exact: true }).fill(`${name} photo`);
  await add.getByRole('combobox', { name: 'Category', exact: true }).click(); await page.getByRole('option', { name: category.name, exact: true }).click();
  await add.getByRole('textbox', { name: 'Price (USD)', exact: true }).fill('5.00');
  await add.getByRole('button', { name: 'Edit image', exact: true }).click(); await gallery.getByRole('button', { name: 'Pizza', exact: true }).click();
  const created = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/setup/items'));
  await add.getByRole('button', { name: 'Save', exact: true }).click();
  expect(itemMutationResponseSchema.parse(await (await created).json()).item.imageUrl).toBe('/api/images/pizza.jpg');
});
