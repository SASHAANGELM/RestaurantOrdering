import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type {
  CategoryMutationResponse, CreateCategory, CreateItem, ItemMutationResponse, MenuChanged, UpdateCategory, UpdateItem
} from '@restaurant-ordering/contracts';
import type { DatabaseConnection } from '../../db/connection';
import { appState, categories, menuItems } from '../../db/schema';
import { HttpError } from '../../middleware/errors';
import { readMenuRevision, toCategory, toItem } from './queries';

export interface MenuMutation<T> { response: T; notification: MenuChanged | null }

function notFound(resourceType: 'category' | 'item', resourceId: string): never {
  throw new HttpError({ code: 'NOT_FOUND', message: `The ${resourceType} was not found.`, details: { resourceType, resourceId } });
}

function checkRevision(entityType: 'category' | 'item', entityId: string, expectedRevision: number, currentRevision: number) {
  if (expectedRevision !== currentRevision) throw new HttpError({
    code: 'REVISION_CONFLICT', message: 'This record changed. Reload it before applying your edit.',
    details: { entityType, entityId, expectedRevision, currentRevision }
  });
}

export function createMenuService(connection: DatabaseConnection) {
  function activeCategory(id: string) {
    const category = connection.db.select().from(categories).where(eq(categories.id, id)).get();
    if (!category) notFound('category', id);
    if (category.archivedAt !== null) throw new HttpError({
      code: 'CATEGORY_ARCHIVED', message: 'Choose an active category.', details: { categoryId: id }
    });
  }

  function result<T>(response: (menuRevision: number) => T, entityType: MenuChanged['entityType'], entityId: string,
    change: MenuChanged['change'] | null): MenuMutation<T> {
    if (change !== null) connection.db.update(appState).set({ menuRevision: sql`${appState.menuRevision} + 1` })
      .where(eq(appState.id, 1)).run();
    const menuRevision = readMenuRevision(connection);
    return { response: response(menuRevision), notification: change === null ? null : {
      eventId: randomUUID(), menuRevision, entityType, entityId, change
    } };
  }

  // Each method returns only after COMMIT. T08 can publish notification directly;
  // failed transactions throw and no-op writes return null notification.
  return {
    createCategory(input: CreateCategory): MenuMutation<CategoryMutationResponse> {
      return connection.sqlite.transaction(() => {
        const now = new Date().toISOString();
        const row = connection.db.insert(categories).values({ ...input, id: randomUUID(), createdAt: now, updatedAt: now }).returning().get();
        return result((menuRevision) => ({ category: toCategory(row), menuRevision }), 'category', row.id, 'created');
      }).immediate();
    },
    updateCategory(id: string, input: UpdateCategory): MenuMutation<CategoryMutationResponse> {
      return connection.sqlite.transaction(() => {
        const current = connection.db.select().from(categories).where(eq(categories.id, id)).get();
        if (!current) notFound('category', id);
        checkRevision('category', id, input.expectedRevision, current.revision);
        const now = new Date().toISOString();
        const changes = { name: input.name ?? current.name, sortOrder: input.sortOrder ?? current.sortOrder,
          archivedAt: input.archived ? current.archivedAt ?? now : current.archivedAt };
        const changed = changes.name !== current.name || changes.sortOrder !== current.sortOrder || changes.archivedAt !== current.archivedAt;
        const row = changed ? connection.db.update(categories).set({ ...changes, revision: current.revision + 1, updatedAt: now })
          .where(eq(categories.id, id)).returning().get()! : current;
        return result((menuRevision) => ({ category: toCategory(row), menuRevision }), 'category', id,
          changed ? current.archivedAt === null && row.archivedAt !== null ? 'archived' : 'updated' : null);
      }).immediate();
    },
    createItem(input: CreateItem): MenuMutation<ItemMutationResponse> {
      return connection.sqlite.transaction(() => {
        activeCategory(input.categoryId);
        const now = new Date().toISOString();
        const row = connection.db.insert(menuItems).values({ ...input, priceMinor: input.pricingMode === 'fixed' ? input.priceMinor : null,
          id: randomUUID(), createdAt: now, updatedAt: now }).returning().get();
        return result((menuRevision) => ({ item: toItem(row), menuRevision }), 'item', row.id, 'created');
      }).immediate();
    },
    updateItem(id: string, input: UpdateItem): MenuMutation<ItemMutationResponse> {
      return connection.sqlite.transaction(() => {
        const current = connection.db.select().from(menuItems).where(eq(menuItems.id, id)).get();
        if (!current) notFound('item', id);
        checkRevision('item', id, input.expectedRevision, current.revision);
        if (input.categoryId !== undefined) activeCategory(input.categoryId);
        const now = new Date().toISOString();
        const changes = {
          categoryId: input.categoryId ?? current.categoryId, name: input.name ?? current.name,
          description: input.description === undefined ? current.description : input.description,
          imageUrl: input.imageUrl === undefined ? current.imageUrl : input.imageUrl,
          available: input.available ?? current.available,
          pricingMode: 'pricingMode' in input ? input.pricingMode : current.pricingMode,
          priceMinor: 'pricingMode' in input ? input.pricingMode === 'fixed' ? input.priceMinor : null : current.priceMinor,
          archivedAt: input.archived ? current.archivedAt ?? now : current.archivedAt
        };
        const changed = (Object.keys(changes) as (keyof typeof changes)[]).some((key) => changes[key] !== current[key]);
        const row = changed ? connection.db.update(menuItems).set({ ...changes, revision: current.revision + 1, updatedAt: now })
          .where(eq(menuItems.id, id)).returning().get()! : current;
        return result((menuRevision) => ({ item: toItem(row), menuRevision }), 'item', id,
          changed ? current.archivedAt === null && row.archivedAt !== null ? 'archived' : 'updated' : null);
      }).immediate();
    }
  };
}
