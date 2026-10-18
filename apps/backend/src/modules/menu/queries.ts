import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  categorySchema, menuItemSchema, type Category, type MenuItem, type MenuItemsQuery,
  type ResolvedItem, type SetupItemsQuery
} from '@restaurant-ordering/contracts';
import type { DatabaseConnection } from '../../db/connection';
import { appState, categories, menuItems } from '../../db/schema';

export const toCategory = (row: typeof categories.$inferSelect): Category => categorySchema.parse(row);
export const toItem = (row: typeof menuItems.$inferSelect): MenuItem => {
  const { description, ...fields } = row;
  return menuItemSchema.parse({ ...fields, ...(description === null ? {} : { description }) });
};

export function readMenuRevision(connection: DatabaseConnection) {
  const state = connection.db.select({ revision: appState.menuRevision }).from(appState).where(eq(appState.id, 1)).get();
  if (!state) throw new Error('Menu state is not initialized.');
  return state.revision;
}

export function listCategories(connection: DatabaseConnection, includeArchived = false) {
  return connection.sqlite.transaction(() => ({
    categories: connection.db.select().from(categories).where(includeArchived ? undefined : isNull(categories.archivedAt))
      .orderBy(asc(categories.sortOrder), asc(categories.id)).all().map(toCategory),
    menuRevision: readMenuRevision(connection)
  }))();
}

export function listItems(connection: DatabaseConnection, query: MenuItemsQuery | SetupItemsQuery, setup = false) {
  return connection.sqlite.transaction(() => {
    const filter = and(
      setup && 'includeArchived' in query && query.includeArchived ? undefined : isNull(menuItems.archivedAt),
      setup ? undefined : isNull(categories.archivedAt),
      query.categoryId ? eq(menuItems.categoryId, query.categoryId) : undefined,
      // Literal substring search: '%' and '_' are ordinary characters, never wildcards.
      query.search ? sql`instr(lower(${menuItems.name}), lower(${query.search})) > 0` : undefined
    );
    const total = connection.db.select({ count: sql<number>`count(*)` }).from(menuItems)
      .innerJoin(categories, eq(menuItems.categoryId, categories.id)).where(filter).get()!.count;
    // Avoid unsafe offsets even when a valid safe-integer page is far beyond the last page.
    const items = query.page > Math.ceil(total / query.pageSize) ? [] : connection.db.select({ item: menuItems }).from(menuItems)
      .innerJoin(categories, eq(menuItems.categoryId, categories.id)).where(filter)
      .orderBy(asc(menuItems.name), asc(menuItems.id)).limit(query.pageSize).offset((query.page - 1) * query.pageSize)
      .all().map(({ item }) => toItem(item));
    return { items, total, page: query.page, pageSize: query.pageSize, menuRevision: readMenuRevision(connection) };
  })();
}

// Caller owns the read/write transaction. Checkout can use the same joined rows and
// eligibility precedence as cart resolution, within its own authoritative transaction.
export function readResolvedItems(connection: DatabaseConnection, itemIds: string[]): ResolvedItem[] {
  const rows = itemIds.length === 0 ? [] : connection.db.select({ item: menuItems, category: categories }).from(menuItems)
    .innerJoin(categories, eq(menuItems.categoryId, categories.id)).where(inArray(menuItems.id, itemIds)).all();
  const byId = new Map(rows.map((row) => [row.item.id, row]));
  return itemIds.map((itemId): ResolvedItem => {
    const row = byId.get(itemId);
    if (!row) return { itemId, state: 'missing' };
    const item = toItem(row.item);
    const category = toCategory(row.category);
    const state = item.archivedAt !== null ? 'archived' : category.archivedAt !== null ? 'category-archived'
      : !item.available ? 'unavailable' : 'available';
    return { itemId, state, item, category };
  });
}

export function resolveItems(connection: DatabaseConnection, itemIds: string[]) {
  return connection.sqlite.transaction(() => ({
    items: readResolvedItems(connection, itemIds), menuRevision: readMenuRevision(connection)
  }))();
}
