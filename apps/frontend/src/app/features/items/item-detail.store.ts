import { computed, inject } from '@angular/core';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { EMPTY, map } from 'rxjs';
import { idSchema, ordersQuerySchema } from '@restaurant-ordering/contracts';
import { ApiClient } from '../../core/api-client';
import { remoteQuery } from '../../core/remote-query';

export const ItemDetailStore = signalStore(
  withState<{ id: string | null; page: number; pageSize: number }>({ id: null, page: 1, pageSize: 10 }),
  withProps((store, api = inject(ApiClient)) => ({
    detail: remoteQuery({ query: store.id, stream: 'menuRevision', load: id => id === null ? EMPTY : api.item(id), revision: data => data.menuRevision }),
    history: remoteQuery({ query: () => ({ id: store.id(), page: store.page(), pageSize: store.pageSize() }), stream: 'ordersRevision',
      load: query => !idSchema.safeParse(query.id).success ? EMPTY : api.orders({ itemId: query.id!, page: query.page, pageSize: query.pageSize })
        .pipe(map(data => ({ ...data, itemId: query.id }))), revision: data => data.ordersRevision })
  })),
  withProps(store => ({
    current: computed(() => store.detail.error()?.body?.code === 'NOT_FOUND' || store.detail.error()?.kind === 'invalid-request'
      ? null : store.detail.data()?.item.id === store.id() ? store.detail.data() : null),
    related: computed(() => {
      const data = store.history.data();
      return data?.itemId === store.id() && data?.page === store.page() && data?.pageSize === store.pageSize() ? data : null;
    })
  })),
  withMethods(store => ({
    select(id: string | null) { if (id !== store.id()) patchState(store, { id, page: 1 }); },
    orderPage(page: number, pageSize: number) {
      const query = ordersQuerySchema.parse({ page, pageSize });
      patchState(store, { page: query.page, pageSize: query.pageSize });
    },
    reload() { store.detail.reload(); store.history.reload(); }
  }))
);
