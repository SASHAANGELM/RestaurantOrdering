import { expect, type Page } from '@playwright/test';

export async function addFromMenu(page: Page, name: string, quantity = '1') {
  await page.getByRole('button', { name: `Add ${name} to cart`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /^(Add to cart|Edit in cart)$/, exact: true });
  await dialog.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill(quantity);
  await dialog.getByRole('button', { name: /^(Add to cart|Edit in cart)$/ }).click();
  await expect(dialog).not.toBeVisible();
}
