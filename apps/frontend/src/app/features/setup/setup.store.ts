import { computed, inject } from '@angular/core';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { setupItemsQuerySchema, type SetupItemsQuery } from '@restaurant-ordering/contracts';
import { ApiClient } from '../../core/api-client';
import { remoteQuery } from '../../core/remote-query';

export type ItemGroup = 'available' | 'unavailable' | 'archived';
const groups = ['available', 'unavailable', 'archived'] as const;

export const SetupStore = signalStore(
  withState({ query: setupItemsQuerySchema.parse({}),
    pages: { available: 1, unavailable: 1, archived: 1 }, sizes: { available: 25, unavailable: 25, archived: 25 } }),
  withProps((_store, api = inject(ApiClient)) => ({
    catalog: remoteQuery({ query: () => null, stream: 'menuRevision', load: () => api.setupCatalog(), revision: data => data.menuRevision })
  })),
  withProps(store => ({
    categories: computed(() => store.catalog.data()?.categories ?? []),
    visibleCategories: computed(() => (store.catalog.data()?.categories ?? []).filter(category => store.query().includeArchived || !category.archivedAt)),
    groups: computed(() => {
      const query = store.query();
      const search = (query.search ?? '').toLocaleLowerCase();
      const matches = (store.catalog.data()?.items ?? []).filter(item => (!query.categoryId || item.categoryId === query.categoryId) &&
        (!search || item.name.toLocaleLowerCase().includes(search)));
      return groups.map(key => {
        const items = matches.filter(item => (item.archivedAt ? 'archived' : item.available ? 'available' : 'unavailable') === key);
        const pageSize = store.sizes()[key];
        const page = Math.min(store.pages()[key], Math.max(1, Math.ceil(items.length / pageSize)));
        return { key, label: key === 'available' ? 'Available items' : key === 'unavailable' ? 'Unavailable items' : 'Archived items',
          total: items.length, page, pageSize, items: items.slice((page - 1) * pageSize, page * pageSize) };
      });
    })
  })),
  withMethods(store => ({
    setQuery(query: SetupItemsQuery) { patchState(store, { query: setupItemsQuerySchema.parse(query), pages: { available: 1, unavailable: 1, archived: 1 } }); },
    page(key: ItemGroup, page: number, pageSize: number) {
      patchState(store, { pages: { ...store.pages(), [key]: page }, sizes: { ...store.sizes(), [key]: pageSize } });
    },
    reload() { store.catalog.reload(); }
  }))
);
