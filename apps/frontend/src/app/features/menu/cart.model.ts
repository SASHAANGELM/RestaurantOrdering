import * as z from 'zod';
import {
  calculateLineTotal, calculateTotals, kitchenCommentSchema, idSchema, MAX_CART_LINES, menuItemSchema,
  parseDecimalMinor, parseUnitPriceMinor, quantitySchema, type MenuItem, type ResolvedItem
} from '@restaurant-ordering/contracts';

export const CART_STORAGE_KEY = 'restaurant-ordering.cart.v1';
const draftSchema = z.string().max(32);
export const storedCartSchema = z.strictObject({
  version: z.literal(1),
  lines: z.array(z.strictObject({ id: idSchema, item: menuItemSchema, comment: kitchenCommentSchema.optional(), quantityText: draftSchema, priceText: draftSchema })).max(MAX_CART_LINES)
    .refine((lines) => new Set(lines.map((line) => line.id)).size === lines.length, 'Duplicate cart line IDs.'),
  discountText: draftSchema
});
export type StoredCart = z.infer<typeof storedCartSchema>;
export type CartEntry = StoredCart['lines'][number];
export const emptyCart = (): StoredCart => ({ version: 1, lines: [], discountText: '' });
export function moneyText(minor: number) { return (minor / 100).toFixed(2); }
export function quantityValue(text: string) {
  if (!/^[0-9]{1,2}$/.test(text)) throw new Error('Enter a whole quantity from 1 to 99.');
  return quantitySchema.parse(Number(text));
}
export function entryPrice(line: CartEntry) {
  return line.item.pricingMode === 'fixed' ? line.item.priceMinor : parseUnitPriceMinor(line.priceText);
}
export function entryInputIssue(line: CartEntry): string | null {
  try { quantityValue(line.quantityText); } catch { return 'Enter a whole quantity from 1 to 99.'; }
  try { entryPrice(line); } catch { return 'Enter a price from 0.00 to 10,000.00 with at most two decimal places.'; }
  return null;
}
export function estimateCart(lines: CartEntry[], discountText: string) {
  if (lines.some(entryInputIssue)) return { subtotalMinor: null, totalMinor: null, discountMinor: null, error: 'Correct cart line inputs to calculate the estimate.' };
  const subtotalMinor = lines.reduce((sum, line) => sum + calculateLineTotal(entryPrice(line), quantityValue(line.quantityText)), 0);
  try {
    const discountMinor = parseDecimalMinor(discountText === '' ? '0' : discountText);
    if (discountMinor > subtotalMinor) return { subtotalMinor, totalMinor: null, discountMinor, error: 'Discount cannot exceed the estimated subtotal.' };
    return { ...calculateTotals([subtotalMinor], discountMinor), error: null };
  } catch { return { subtotalMinor, totalMinor: null, discountMinor: null, error: 'Enter a nonnegative discount with at most two decimal places.' }; }
}
export function entryEligibilityIssue(resolved?: ResolvedItem): string | null {
  if (!resolved) return 'Availability has not been checked yet.';
  if (resolved.state === 'missing') return 'Item removed — cannot be ordered.';
  return {
    available: '', unavailable: 'Unavailable — cannot be ordered.', archived: 'Item archived — cannot be ordered.',
    'category-archived': 'Category archived — cannot be ordered.'
  }[resolved.state] || null;
}
export function entryPricingWarning(line: CartEntry, resolved?: ResolvedItem): string | null {
  if (!resolved || resolved.state === 'missing') return null;
  if (resolved.item.pricingMode !== line.item.pricingMode) return resolved.item.pricingMode === 'fixed'
    ? `Pricing changed from open price to fixed price ($${moneyText(resolved.item.priceMinor)}). Select OK to use the fixed price.`
    : 'Pricing changed from fixed price to open price. Review the unit price, then select OK.';
  if (resolved.item.pricingMode === 'fixed' && line.item.pricingMode === 'fixed' && resolved.item.priceMinor !== line.item.priceMinor)
    return `Price changed from $${moneyText(line.item.priceMinor)} to $${moneyText(resolved.item.priceMinor)}. Select OK to update the estimate.`;
  return null;
}
export function entryChanges(line: CartEntry, resolved?: ResolvedItem): string[] {
  return [entryEligibilityIssue(resolved), entryPricingWarning(line, resolved)].filter((message): message is string => !!message);
}
export function newEntry(item: MenuItem, quantityText: string, priceText: string, comment = ''): CartEntry {
  return { id: crypto.randomUUID(), item, quantityText, priceText, ...(comment ? { comment } : {}) };
}

/** Sum valid quantities consistently across cart headings, navigation and footer. */
export function cartItemCount(lines: readonly { quantityText: string }[]) {
  return lines.reduce((sum, line) => { try { return sum + quantityValue(line.quantityText); } catch { return sum; } }, 0);
}
