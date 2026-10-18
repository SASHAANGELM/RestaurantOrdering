import { computed, effect, inject, InjectionToken, untracked } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';
import { MAX_CART_LINES, parseUnitPriceMinor, type MenuItem, type ResolveItemsResponse } from '@restaurant-ordering/contracts';
import { ApiClient } from '../../core/api-client';
import { RealtimeSync } from '../../core/realtime-sync';
import { remoteQuery } from '../../core/remote-query';
import {
  CART_STORAGE_KEY, emptyCart, entryChanges, entryInputIssue, entryPrice, estimateCart, moneyText,
  newEntry, quantityValue, storedCartSchema, type StoredCart
} from './cart.model';

export const CART_STORAGE = new InjectionToken<() => Storage>('Per-tab cart storage', {
  providedIn: 'root', factory: () => () => window.sessionStorage
});
function restore(storage: () => Storage): StoredCart & { storageNotice: string | null } {
  try {
    const raw = storage().getItem(CART_STORAGE_KEY);
    if (raw === null) return { ...emptyCart(), storageNotice: null };
    return { ...storedCartSchema.parse(JSON.parse(raw)), storageNotice: null };
  } catch {
    return { ...emptyCart(), storageNotice: 'Saved cart could not be restored. You can start a new cart; keep this tab open if storage is unavailable.' };
  }
}

/** Root lifetime keeps per-tab intent independent of route/page and menu snapshots. */
export const CartStore = signalStore(
  { providedIn: 'root' },
  withState(() => restore(inject(CART_STORAGE))),
  withComputed((store) => ({
    itemIds: computed(() => [...new Set(store.lines().map((line) => line.item.id))].sort(), { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) }),
    estimate: computed(() => estimateCart(store.lines(), store.discountText()))
  })),
  withProps((store, api = inject(ApiClient), sync = inject(RealtimeSync)) => ({
    resolved: remoteQuery({ query: store.itemIds, stream: 'menuRevision',
      load: (itemIds) => itemIds.length ? api.resolveItems({ itemIds }) : of<ResolveItemsResponse>({ items: [], menuRevision: sync.highest().menuRevision }),
      revision: (data) => data.menuRevision })
  })),
  withComputed((store) => ({
    entries: computed(() => {
      const resolved = new Map(store.resolved.data()?.items.map((item) => [item.itemId, item]));
      return store.lines().map((line) => ({ ...line, inputIssue: entryInputIssue(line), changes: entryChanges(line, resolved.get(line.item.id)),
        lineTotalMinor: entryInputIssue(line) ? null : entryPrice(line) * quantityValue(line.quantityText) }));
    })
  })),
  withMethods((store) => ({
    add(item: MenuItem, quantityText: string, priceText = ''): string | null {
      if (!item.available || item.archivedAt) return 'This item is unavailable. Your cart is retained.';
      let quantity: number;
      let price: number;
      try { quantity = quantityValue(quantityText); } catch { return 'Enter a whole quantity from 1 to 99.'; }
      try { price = item.pricingMode === 'fixed' ? item.priceMinor : parseUnitPriceMinor(priceText); }
      catch { return 'Enter a price from 0.00 to 10,000.00 with at most two decimal places.'; }
      const match = store.lines().find((line) => line.item.id === item.id && line.item.pricingMode === item.pricingMode &&
        !entryInputIssue(line) && entryPrice(line) === price);
      if (match) {
        const combined = quantityValue(match.quantityText) + quantity;
        if (combined > 99) return 'A cart line can contain at most 99 items. Your existing quantity is retained.';
        patchState(store, { lines: store.lines().map((line) => line.id === match.id ? { ...line, quantityText: String(combined) } : line) });
      } else {
        if (store.lines().length >= MAX_CART_LINES) return 'The cart can contain at most 100 lines. Remove a line first.';
        patchState(store, { lines: [...store.lines(), newEntry(item, String(quantity), moneyText(price))] });
      }
      return null;
    },
    edit(id: string, field: 'quantityText' | 'priceText', value: string) {
      patchState(store, { lines: store.lines().map((line) => line.id === id ? { ...line, [field]: value.slice(0, 32) } : line) });
    },
    discount(value: string) { patchState(store, { discountText: value.slice(0, 32) }); },
    remove(id: string) { patchState(store, { lines: store.lines().filter((line) => line.id !== id) }); }
  })),
  withHooks({ onInit(store, storage = inject(CART_STORAGE)) {
    effect(() => {
      const data: StoredCart = { version: 1, lines: store.lines(), discountText: store.discountText() };
      untracked(() => {
        try { storage().setItem(CART_STORAGE_KEY, JSON.stringify(storedCartSchema.parse(data))); }
        catch { patchState(store, { storageNotice: 'Cart changes cannot be saved in this tab. Keep it open; reloading or closing may lose your cart.' }); }
      });
    });
  } })
);
