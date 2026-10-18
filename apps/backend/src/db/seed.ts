import { eq, sql } from 'drizzle-orm';
import type { DatabaseConnection } from './connection';
import { appState, categories, checkoutQuotes, menuItems, orderLines, orders } from './schema';

export type SeedMode = 'none' | 'small' | 'large';
export function parseSeedMode(value: string): SeedMode {
  if (value !== 'none' && value !== 'small' && value !== 'large') {
    throw new Error('SEED_MODE must be none, small, or large.');
  }
  return value;
}

const SEED_TIMESTAMP = '2026-01-01T00:00:00.000Z';
const SMALL_CATEGORIES = ['Starters', 'Mains', 'Desserts', 'Drinks'];
const SMALL_ITEMS = ['Soup', 'Salad', 'Bread', 'Pasta', 'Burger', 'Seasonal special', 'Cake', 'Ice cream', 'Fruit', 'Coffee', 'Tea', 'Custom drink'];
// Valid, stable UUIDs make fixture references reproducible without random collisions.
const seedId = (kind: number, index: number) =>
  `${kind.toString(16).padStart(8, '0')}-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;

export function seedDatabase(connection: DatabaseConnection, mode: SeedMode) {
  if (mode === 'none') return { seeded: false, reason: 'disabled' } as const;
  return connection.sqlite.transaction(() => {
    const state = connection.db.select().from(appState).where(eq(appState.id, 1)).get();
    if (!state) throw new Error('Migrate the database before seeding.');
    if (state.demoSeedMode !== null) return { seeded: false, reason: 'already-initialized' } as const;
    const populated = [categories, menuItems, checkoutQuotes, orders, orderLines]
      .some((table) => connection.db.select({ count: sql<number>`count(*)` }).from(table).get()?.count !== 0);
    if (populated || state.menuRevision !== 0 || state.ordersRevision !== 0) {
      return { seeded: false, reason: 'database-not-empty' } as const;
    }

    const categoryCount = mode === 'large' ? 50 : SMALL_CATEGORIES.length;
    const itemCount = mode === 'large' ? 5_000 : SMALL_ITEMS.length;
    for (let index = 0; index < categoryCount; index++) {
      connection.db.insert(categories).values({
        id: seedId(1, index),
        name: mode === 'small' ? SMALL_CATEGORIES[index]! : `Category ${String(index + 1).padStart(2, '0')}`,
        sortOrder: index,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP
      }).run();
    }
    const insertItem = connection.db.insert(menuItems).values({
      id: sql.placeholder('id'), categoryId: sql.placeholder('categoryId'), name: sql.placeholder('name'),
      description: sql.placeholder('description'), pricingMode: sql.placeholder('pricingMode'),
      priceMinor: sql.placeholder('priceMinor'), available: sql.placeholder('available'),
      createdAt: SEED_TIMESTAMP, updatedAt: SEED_TIMESTAMP
    }).prepare();
    for (let index = 0; index < itemCount; index++) {
      const isOpen = mode === 'small' ? index === 5 || index === 11 : index % 10 === 9;
      insertItem.run({
        id: seedId(2, index),
        categoryId: seedId(1, mode === 'small' ? Math.floor(index / 3) : index % categoryCount),
        name: mode === 'small' ? SMALL_ITEMS[index]! : `Menu item ${String(index + 1).padStart(4, '0')}`,
        description: mode === 'small' ? 'Demo menu item' : `Large-menu fixture ${index + 1}`,
        pricingMode: isOpen ? 'open' : 'fixed',
        priceMinor: isOpen ? null : 250 + (index % 100) * 25,
        available: (mode === 'small' ? index !== 8 : index % 17 !== 16) ? 1 : 0
      });
    }
    connection.db.update(appState).set({ menuRevision: 1, demoSeedMode: mode }).where(eq(appState.id, 1)).run();
    return { seeded: true, mode, categories: categoryCount, items: itemCount } as const;
  }).immediate();
}
