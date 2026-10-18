import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { menuItemsQuerySchema, type MenuItemsQuery } from '@restaurant-ordering/contracts';
import { ApiClient } from '../../core/api-client';
import { remoteQuery } from '../../core/remote-query';

export const MenuStore = signalStore(
  withState({ query: menuItemsQuerySchema.parse({}) }),
  withProps((store, api = inject(ApiClient)) => ({
    items: remoteQuery({ query: store.query, stream: 'menuRevision', load: (query) => api.items(query), revision: (data) => data.menuRevision }),
    categories: remoteQuery({ query: () => null, stream: 'menuRevision', load: () => api.categories(), revision: (data) => data.menuRevision })
  })),
  withMethods((store) => ({
    setQuery(query: MenuItemsQuery) { patchState(store, { query: menuItemsQuerySchema.parse(query) }); },
    reload() { store.items.reload(); store.categories.reload(); }
  }))
);
