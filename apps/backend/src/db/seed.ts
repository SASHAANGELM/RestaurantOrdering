import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { demoMenu } from './demo-menu';
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

    const categoryCount = mode === 'large' ? 50 : demoMenu.length;
    const itemCount = mode === 'large' ? 5_000 : demoMenu.reduce((sum, category) => sum + category.items.length, 0);
    const categoryIds = Array.from({ length: categoryCount }, () => randomUUID());
    for (let index = 0; index < categoryCount; index++) {
      connection.db.insert(categories).values({
        id: categoryIds[index]!,
        name: mode === 'small' ? demoMenu[index]!.name : `Category ${String(index + 1).padStart(2, '0')}`,
        sortOrder: index,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP
      }).run();
    }
    const insertItem = connection.db.insert(menuItems).values({
      id: sql.placeholder('id'), categoryId: sql.placeholder('categoryId'), name: sql.placeholder('name'),
      description: sql.placeholder('description'), imageUrl: sql.placeholder('imageUrl'), pricingMode: sql.placeholder('pricingMode'),
      priceMinor: sql.placeholder('priceMinor'), available: sql.placeholder('available'),
      createdAt: SEED_TIMESTAMP, updatedAt: SEED_TIMESTAMP
    }).prepare();
    const dishes = demoMenu.flatMap((category, categoryIndex) => category.items.map((item) => ({ ...item, categoryIndex })));
    for (let index = 0; index < itemCount; index++) {
      const dish = dishes[index % dishes.length]!;
      const isOpen = mode === 'small' ? dish.priceMinor === null : index % 10 === 9;
      insertItem.run({
        id: randomUUID(),
        categoryId: categoryIds[mode === 'small' ? dish.categoryIndex : index % categoryCount]!,
        name: mode === 'small' ? dish.name : `Menu item ${String(index + 1).padStart(4, '0')}`,
        description: mode === 'small' ? dish.description : `Large-menu fixture ${index + 1}`,
        imageUrl: dish.imageUrl,
        pricingMode: isOpen ? 'open' : 'fixed',
        priceMinor: isOpen ? null : mode === 'small' ? dish.priceMinor : 250 + (index % 100) * 25,
        available: (mode === 'small' ? dish.name !== 'Fruit' : index % 17 !== 16) ? 1 : 0
      });
    }
    connection.db.update(appState).set({ menuRevision: 1, demoSeedMode: mode }).where(eq(appState.id, 1)).run();
    return { seeded: true, mode, categories: categoryCount, items: itemCount } as const;
  }).immediate();
}
