import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { EMPTY } from 'rxjs';
import { ordersQuerySchema, type OrdersQuery } from '@restaurant-ordering/contracts';
import { ApiClient } from '../../core/api-client';
import { remoteQuery } from '../../core/remote-query';

export const OrdersStore = signalStore(
  withState({ query: ordersQuerySchema.parse({}) }),
  withProps((store, api = inject(ApiClient)) => ({
    orders: remoteQuery({ query: store.query, stream: 'ordersRevision', load: (query) => api.orders(query), revision: (data) => data.ordersRevision })
  })),
  withMethods((store) => ({
    setQuery(query: OrdersQuery) { patchState(store, { query: ordersQuerySchema.parse(query) }); },
    reload() { store.orders.reload(); }
  }))
);

export const OrderDetailStore = signalStore(
  withState<{ id: string | null }>({ id: null }),
  withProps((store, api = inject(ApiClient)) => ({
    detail: remoteQuery({ query: store.id, stream: 'ordersRevision', load: (id) => id === null ? EMPTY : api.order(id), revision: (data) => data.ordersRevision })
  })),
  withMethods((store) => ({
    select(id: string | null) { patchState(store, { id }); },
    reload() { store.detail.reload(); }
  }))
);
