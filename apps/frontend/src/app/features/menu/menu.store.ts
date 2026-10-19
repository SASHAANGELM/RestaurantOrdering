import { computed, inject } from '@angular/core';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { menuItemsQuerySchema, type MenuItemsQuery } from '@restaurant-ordering/contracts';
import { ApiClient } from '../../core/api-client';
import { remoteQuery } from '../../core/remote-query';

/** Only loading, explicit refresh and revision repair fetch the complete catalog. */
export const MenuStore = signalStore(
  withState({ query: menuItemsQuerySchema.parse({}) }),
  withProps((_store, api = inject(ApiClient)) => ({
    catalog: remoteQuery({ query: () => null, stream: 'menuRevision', load: () => api.catalog(), revision: data => data.menuRevision })
  })),
  withProps(store => ({
    categories: { ...store.catalog, data: computed(() => {
      const catalog = store.catalog.data();
      if (!catalog) return null;
      const counts = new Map<string, number>();
      for (const item of catalog.items) if (item.available) counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1);
      return { categories: catalog.categories.map(category => ({ ...category, availableCount: counts.get(category.id) ?? 0 })), menuRevision: catalog.menuRevision };
    }) },
    items: { ...store.catalog, data: computed(() => {
      const catalog = store.catalog.data();
      if (!catalog) return null;
      const query = store.query();
      const search = (query.search ?? '').toLocaleLowerCase();
      const matches = catalog.items.filter(item => (!query.categoryId || item.categoryId === query.categoryId) && (!search || item.name.toLocaleLowerCase().includes(search)));
      const page = Math.min(query.page, Math.max(1, Math.ceil(matches.length / query.pageSize)));
      return { items: matches.slice((page - 1) * query.pageSize, page * query.pageSize), total: matches.length, page, pageSize: query.pageSize, menuRevision: catalog.menuRevision };
    }) }
  })),
  withMethods(store => ({
    setQuery(query: MenuItemsQuery) { patchState(store, { query: menuItemsQuerySchema.parse(query) }); },
    reload() { store.catalog.reload(); }
  }))
);
