import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { setupItemsQuerySchema, type SetupItemsQuery } from '@restaurant-ordering/contracts';
import { ApiClient } from '../../core/api-client';
import { remoteQuery } from '../../core/remote-query';

export const SetupStore = signalStore(
  withState({ query: setupItemsQuerySchema.parse({}) }),
  withProps((store, api = inject(ApiClient)) => ({
    items: remoteQuery({ query: store.query, stream: 'menuRevision', load: (query) => api.setupItems(query), revision: (data) => data.menuRevision }),
    categories: remoteQuery({ query: () => store.query().includeArchived, stream: 'menuRevision', load: (include) => api.setupCategories(include), revision: (data) => data.menuRevision })
  })),
  withMethods((store) => ({
    setQuery(query: SetupItemsQuery) { patchState(store, { query: setupItemsQuerySchema.parse(query) }); },
    reload() { store.items.reload(); store.categories.reload(); }
  }))
);
