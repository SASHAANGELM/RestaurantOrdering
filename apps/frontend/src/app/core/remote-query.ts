import { computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { type Observable, type Subscription } from 'rxjs';
import { type SyncState } from '@restaurant-ordering/contracts';
import { clientError, type ClientError } from './api-client';
import { RealtimeSync } from './realtime-sync';

/** A cancelled request and a superseded query/revision can never publish a snapshot. */
export function remoteQuery<Query, Data>(options: {
  query: () => Query;
  stream: keyof Pick<SyncState, 'menuRevision' | 'ordersRevision'>;
  load: (query: Query) => Observable<Data>;
  revision: (data: Data) => number;
}) {
  const sync = inject(RealtimeSync);
  const menuReadToken = Symbol('menu query');
  const data = signal<Data | null>(null);
  const loading = signal(false);
  const error = signal<ClientError | null>(null);
  const refresh = signal(0);
  const acceptedKey = signal<string | null>(null);
  const targetRevision = computed(() => sync.highest()[options.stream]);
  let lastRefresh = -1;
  let generation = 0;
  let pending: Subscription | undefined;
  effect(() => {
    const query = options.query();
    const key = JSON.stringify(query);
    const highest = targetRevision();
    const refreshId = refresh();
    sync.successfulChecks();
    untracked(() => {
      const current = data();
      if (current !== null && acceptedKey() === key && options.revision(current) >= highest && lastRefresh === refreshId && error() === null) return;
      lastRefresh = refreshId;
      const request = ++generation;
      pending?.unsubscribe();
      loading.set(true);
      if (options.stream === 'menuRevision') sync.beginMenuRead?.(menuReadToken);
      error.set(null);
      pending = options.load(query).subscribe({
        next: (response) => {
          if (request !== generation || key !== JSON.stringify(options.query())) return;
          if (options.revision(response) < sync.highest()[options.stream]) {
            error.set(clientError(new Error('stale snapshot')));
            return;
          }
          acceptedKey.set(key);
          data.set(response);
          const modified = response !== null && typeof response === 'object' && 'menuUpdatedAt' in response ? response.menuUpdatedAt : undefined;
          sync.observe({ [options.stream]: options.revision(response), ...(typeof modified === 'string' || modified === null ? { menuUpdatedAt: modified } : {}) });
        },
        error: (failure: unknown) => {
          if (request === generation && key === JSON.stringify(options.query())) {
            error.set(clientError(failure));
            loading.set(false);
            if (options.stream === 'menuRevision') sync.endMenuRead?.(menuReadToken);
          }
        },
        complete: () => { if (request === generation) { loading.set(false); if (options.stream === 'menuRevision') sync.endMenuRead?.(menuReadToken); } }
      });
    });
  });
  inject(DestroyRef).onDestroy(() => { generation++; pending?.unsubscribe(); if (options.stream === 'menuRevision') sync.endMenuRead?.(menuReadToken); });
  return {
    data: data.asReadonly(), loading: loading.asReadonly(), error: error.asReadonly(),
    stale: computed(() => {
      const current = data();
      return current !== null && (options.revision(current) < sync.highest()[options.stream] ||
        acceptedKey() !== JSON.stringify(options.query()));
    }),
    reload: () => refresh.update((value) => value + 1)
  };
}
