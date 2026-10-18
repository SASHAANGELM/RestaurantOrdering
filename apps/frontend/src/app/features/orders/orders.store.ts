import { computed, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { EMPTY, type Subscription } from 'rxjs';
import { ORDER_STATUS_TRANSITIONS, ordersQuerySchema, type OrderResponse, type OrderStatus, type OrdersQuery } from '@restaurant-ordering/contracts';
import { ApiClient, clientError, type ClientError } from '../../core/api-client';
import { RealtimeSync } from '../../core/realtime-sync';
import { remoteQuery } from '../../core/remote-query';

export const OrdersStore = signalStore(
  withState({ query: ordersQuerySchema.parse({}) }),
  withProps((store, api = inject(ApiClient)) => ({
    orders: remoteQuery({ query: store.query, stream: 'ordersRevision', load: (query) => api.orders(query), revision: (data) => data.ordersRevision })
  })),
  withMethods((store) => ({
    setQuery(query: OrdersQuery) { patchState(store, { query: ordersQuerySchema.parse(query) }); },
    filter(status?: OrderStatus) { patchState(store, { query: { ...store.query(), status, page: 1 } }); },
    page(page: number, pageSize: number) { patchState(store, { query: ordersQuerySchema.parse({ ...store.query(), page, pageSize }) }); },
    reload() { store.orders.reload(); }
  }))
);

export const OrderDetailStore = signalStore(
  withState<{ id: string | null; busy: boolean; actionError: ClientError | null; attemptedStatus: OrderStatus | null; blockedSnapshot: OrderResponse | null; recoveryRequested: boolean }>({
    id: null, busy: false, actionError: null, attemptedStatus: null, blockedSnapshot: null, recoveryRequested: false
  }),
  withProps((store, api = inject(ApiClient)) => ({
    detail: remoteQuery({ query: store.id, stream: 'ordersRevision', load: (id) => id === null ? EMPTY : api.order(id), revision: (data) => data.ordersRevision })
  })),
  withComputed((store) => ({
    current: computed(() => store.detail.data()?.order.id === store.id() ? store.detail.data()?.order ?? null : null),
    needsRefresh: computed(() => store.blockedSnapshot() !== null && (store.blockedSnapshot() === store.detail.data() || (store.actionError() !== null && !store.recoveryRequested())))
  })),
  withComputed((store) => ({
    transitions: computed(() => {
      const order = store.current();
      return order ? ORDER_STATUS_TRANSITIONS[order.status] : [];
    }),
    canAct: computed(() => store.current() !== null && !store.busy() && !store.needsRefresh() &&
      !store.detail.loading() && !store.detail.stale() && store.detail.error() === null)
  })),
  withMethods((store, api = inject(ApiClient), sync = inject(RealtimeSync), destroy = inject(DestroyRef)) => {
    let pending: Subscription | undefined;
    let generation = 0;
    return {
      select(id: string | null) {
        if (id === store.id()) return;
        generation++; pending?.unsubscribe();
        patchState(store, { id, busy: false, actionError: null, attemptedStatus: null, blockedSnapshot: null, recoveryRequested: false });
      },
      reload() {
        if (store.actionError()) patchState(store, { recoveryRequested: true, blockedSnapshot: store.detail.data() });
        store.detail.reload();
      },
      transition(status: OrderStatus) {
        const order = store.current();
        if (!order || !store.canAct() || !store.transitions().includes(status)) return;
        const request = ++generation;
        patchState(store, { busy: true, actionError: null, attemptedStatus: status });
        pending = api.updateOrderStatus(order.id, { status, expectedRevision: order.revision })
          .pipe(takeUntilDestroyed(destroy)).subscribe({
            next: (result) => {
              if (request !== generation || store.id() !== order.id) return;
              // A socket or another action can overtake this response. Only authoritative reads publish details.
              patchState(store, { busy: false, blockedSnapshot: store.detail.data() });
              sync.observe({ ordersRevision: result.ordersRevision });
              store.detail.reload();
            },
            error: (failure: unknown) => {
              if (request !== generation || store.id() !== order.id) return;
              patchState(store, { busy: false, actionError: clientError(failure), blockedSnapshot: store.detail.data(), recoveryRequested: false });
            }
          });
      }
    };
  })
);
