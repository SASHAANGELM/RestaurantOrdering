import { randomUUID } from 'node:crypto';
import {
  calculateLineTotal, calculateTotals, CURRENCY, QUOTE_LIFETIME_MS, quoteSnapshotSchema,
  type CartIssue, type CreateQuote, type QuoteChange, type QuoteResponse, type SnapshotLine
} from '@restaurant-ordering/contracts';
import type { DatabaseConnection } from '../../db/connection';
import { checkoutQuotes } from '../../db/schema';
import { HttpError } from '../../middleware/errors';
import { readMenuRevision, readResolvedItems } from '../menu/queries';

const eligibilityIssues = {
  missing: { code: 'ITEM_MISSING', message: 'This item no longer exists.' },
  archived: { code: 'ITEM_ARCHIVED', message: 'This item has been archived.' },
  'category-archived': { code: 'CATEGORY_ARCHIVED', message: 'This item belongs to an archived category.' },
  unavailable: { code: 'ITEM_UNAVAILABLE', message: 'This item is unavailable.' }
} as const;

export function createCheckoutService(connection: DatabaseConnection) {
  return {
    createQuote(input: CreateQuote): QuoteResponse {
      // Acquire the writer before reading so a Setup edit cannot occur between
      // the authoritative menu snapshot and quote persistence. No async work here.
      return connection.sqlite.transaction(() => {
        const resolved = readResolvedItems(connection, input.lines.map((line) => line.itemId));
        const menuRevision = readMenuRevision(connection);
        const issues: CartIssue[] = [];
        const lines: SnapshotLine[] = [];
        const changes: QuoteChange[] = [];

        input.lines.forEach((intent, lineIndex) => {
          const current = resolved[lineIndex]!;
          const identity = { lineIndex, itemId: intent.itemId };
          if (current.state !== 'available') {
            issues.push({ ...identity, ...eligibilityIssues[current.state] });
            return;
          }
          const { item, category } = current;
          if (item.pricingMode === 'open' && intent.openPriceMinor === undefined) {
            issues.push({ ...identity, code: 'OPEN_PRICE_REQUIRED', message: 'Enter a price for this open-price item.' });
            return;
          }
          if (item.pricingMode === 'fixed' && intent.openPriceMinor !== undefined) {
            issues.push({ ...identity, code: 'FIXED_PRICE_OVERRIDE', message: 'Remove the open price from this fixed-price item.' });
            return;
          }
          const unitPriceMinor = item.pricingMode === 'fixed' ? item.priceMinor : intent.openPriceMinor!;
          lines.push({
            ...(intent.comment ? { comment: intent.comment } : {}),
            itemId: item.id, categoryId: category.id, itemName: item.name, categoryName: category.name,
            itemRevision: item.revision, pricingMode: item.pricingMode, unitPriceMinor, quantity: intent.quantity,
            lineTotalMinor: calculateLineTotal(unitPriceMinor, intent.quantity)
          });
          if (intent.observedRevision !== item.revision) changes.push({
            ...identity, field: 'revision', observed: intent.observedRevision, current: item.revision
          });
          if (intent.observedUnitPriceMinor !== undefined && intent.observedUnitPriceMinor !== unitPriceMinor) changes.push({
            ...identity, field: 'unitPriceMinor', observed: intent.observedUnitPriceMinor, current: unitPriceMinor
          });
          if (intent.observedName !== undefined && intent.observedName !== item.name) changes.push({
            ...identity, field: 'name', observed: intent.observedName, current: item.name
          });
        });
        if (issues.length > 0) throw new HttpError({
          code: 'CART_INVALID', message: 'Correct the indicated cart lines before reviewing.', details: { issues }
        });

        // Shared money helpers check each product and sum for safe integers.
        const { subtotalMinor } = calculateTotals(lines.map((line) => line.lineTotalMinor), 0);
        if (input.discountMinor > subtotalMinor) throw new HttpError({
          code: 'DISCOUNT_EXCEEDS_SUBTOTAL', message: 'Discount cannot exceed the subtotal.',
          details: { subtotalMinor, discountMinor: input.discountMinor }
        });
        const now = Date.now();
        const snapshot = quoteSnapshotSchema.parse({
          quoteId: randomUUID(), menuRevision, createdAt: new Date(now).toISOString(),
          expiresAt: new Date(now + QUOTE_LIFETIME_MS).toISOString(), lines,
          ...calculateTotals(lines.map((line) => line.lineTotalMinor), input.discountMinor), currency: CURRENCY
        });
        connection.db.insert(checkoutQuotes).values({
          id: snapshot.quoteId, menuRevision, snapshot, currency: snapshot.currency,
          createdAt: snapshot.createdAt, expiresAt: snapshot.expiresAt
        }).run();
        return { ...snapshot, changes };
      }).immediate();
    }
  };
}
