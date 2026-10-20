import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { categorySchema, menuItemSchema, type Category, type MenuItem, type ResolvedItem } from '@restaurant-ordering/contracts';
import type { DatabaseConnection } from '../../db/connection';
import { appState, categories, menuItems } from '../../db/schema';

import { readSyncState } from '../realtime/sync';
import { HttpError } from '../../middleware/errors';

export const toCategory = (row: typeof categories.$inferSelect): Category => categorySchema.parse(row);
export const toItem = (row: typeof menuItems.$inferSelect): MenuItem => {
  const { description, imageUrl, ...fields } = row;
  return menuItemSchema.parse({ ...fields, ...(imageUrl === null ? {} : { imageUrl: imageUrl.replace(/^\/images\//, '/api/images/') }), ...(description === null ? {} : { description }) });
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
    menuRevision: readMenuRevision(connection), menuUpdatedAt: readSyncState(connection).menuUpdatedAt
  }))();
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
    items: readResolvedItems(connection, itemIds), menuRevision: readMenuRevision(connection), menuUpdatedAt: readSyncState(connection).menuUpdatedAt
  }))();
}


export function readCatalog(connection: DatabaseConnection, setup = false) {
  return connection.sqlite.transaction(() => {
    const activeCategories = connection.db.select().from(categories).where(setup ? undefined : isNull(categories.archivedAt))
      .orderBy(asc(categories.sortOrder), asc(categories.id)).all().map(toCategory);
    const items = connection.db.select({ item: menuItems }).from(menuItems)
      .innerJoin(categories, eq(menuItems.categoryId, categories.id))
      .where(setup ? undefined : and(isNull(menuItems.archivedAt), isNull(categories.archivedAt)))
      .orderBy(desc(menuItems.available), asc(menuItems.name), asc(menuItems.id)).all().map(({ item }) => toItem(item));
    return { categories: activeCategories, items, menuRevision: readMenuRevision(connection), menuUpdatedAt: readSyncState(connection).menuUpdatedAt };
  })();
}

export function getItemDetails(connection: DatabaseConnection, id: string) {
  return connection.sqlite.transaction(() => {
    const resolved = readResolvedItems(connection, [id])[0];
    if (!resolved || resolved.state === 'missing') throw new HttpError({ code: 'NOT_FOUND', message: 'The item was not found.',
      details: { resourceType: 'item', resourceId: id } });
    return { item: resolved.item, category: resolved.category, menuRevision: readMenuRevision(connection),
      menuUpdatedAt: readSyncState(connection).menuUpdatedAt };
  })();
}
