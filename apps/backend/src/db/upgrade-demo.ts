import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { DatabaseConnection } from './connection';
import { demoMenu } from './demo-menu';
import { appState, categories, checkoutQuotes, menuItems, orderLines } from './schema';

const legacyId = /^0000000[12]-0000-4000-8000-[0-9a-f]{12}$/;

/** One-time, transactional upgrade of the old predictable demo identifiers.
 * Staff names, prices, revisions and archival are retained. Historical totals and
 * checkout recovery keys remain intact; stale carts retain intent for review.
 */
export function upgradeLegacyDemo(connection: DatabaseConnection) {
  connection.sqlite.transaction(() => {
    const oldCategories = connection.db.select().from(categories).all().filter((row) => legacyId.test(row.id));
    const oldItems = connection.db.select().from(menuItems).all().filter((row) => legacyId.test(row.id));
    if (!oldCategories.length && !oldItems.length) return;
    connection.sqlite.pragma('defer_foreign_keys = ON');
    const ids = new Map([...oldCategories, ...oldItems].map((row) => [row.id, randomUUID()]));
    const replacement = (id: string) => ids.get(id) ?? id;
    for (const category of oldCategories) {
      const id = replacement(category.id);
      connection.db.update(categories).set({ id }).where(eq(categories.id, category.id)).run();
      connection.db.update(menuItems).set({ categoryId: id }).where(eq(menuItems.categoryId, category.id)).run();
      connection.db.update(orderLines).set({ categoryId: id }).where(eq(orderLines.categoryId, category.id)).run();
    }
    for (const item of oldItems) {
      const id = replacement(item.id);
      connection.db.update(menuItems).set({ id }).where(eq(menuItems.id, item.id)).run();
      connection.db.update(orderLines).set({ itemId: id }).where(eq(orderLines.itemId, item.id)).run();
    }
    for (const quote of connection.db.select().from(checkoutQuotes).all()) {
      if (!quote.snapshot.lines.some((line) => ids.has(line.itemId) || ids.has(line.categoryId))) continue;
      connection.db.update(checkoutQuotes).set({ snapshot: { ...quote.snapshot,
        lines: quote.snapshot.lines.map((line) => ({ ...line, itemId: replacement(line.itemId), categoryId: replacement(line.categoryId) }))
      } }).where(eq(checkoutQuotes.id, quote.id)).run();
    }
    const state = connection.db.select().from(appState).get();
    if (state?.demoSeedMode === 'small') {
      const now = new Date().toISOString();
      for (const [index, category] of demoMenu.entries()) {
        const previous = oldCategories.find((row) => Number.parseInt(row.id.slice(-12), 16) === index);
        const categoryId = previous ? replacement(previous.id) : randomUUID();
        if (!previous) connection.db.insert(categories).values({ id: categoryId, name: category.name, sortOrder: index, createdAt: now, updatedAt: now }).run();
        for (const [itemIndex, dish] of category.items.entries()) {
          // The old four categories each contained three dishes. Retain all their edits.
          const original = index < 4 && itemIndex < 3
            ? oldItems.find((row) => Number.parseInt(row.id.slice(-12), 16) === index * 3 + itemIndex) : undefined;
          if (original) {
            if (!original.imageUrl) connection.db.update(menuItems).set({ imageUrl: dish.imageUrl }).where(eq(menuItems.id, replacement(original.id))).run();
          } else connection.db.insert(menuItems).values({ ...dish, id: randomUUID(), categoryId,
            pricingMode: dish.priceMinor === null ? 'open' : 'fixed', available: true, createdAt: now, updatedAt: now }).run();
        }
      }
    }
    connection.db.update(appState).set({ menuRevision: sql`${appState.menuRevision} + 1` }).where(eq(appState.id, 1)).run();
  }).immediate();
}
