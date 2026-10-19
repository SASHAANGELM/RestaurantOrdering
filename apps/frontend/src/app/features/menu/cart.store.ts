import { computed, effect, inject, InjectionToken, untracked } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';
import { MAX_CART_LINES, parseUnitPriceMinor, type MenuItem, type ResolveItemsResponse } from '@restaurant-ordering/contracts';
import { ApiClient } from '../../core/api-client';
import { RealtimeSync } from '../../core/realtime-sync';
import { remoteQuery } from '../../core/remote-query';
import {
  CART_STORAGE_KEY, emptyCart, entryChanges, entryEligibilityIssue, entryPricingWarning, entryInputIssue, entryPrice, estimateCart, moneyText,
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
  withState(() => ({ ...restore(inject(CART_STORAGE)), checkoutLocked: false, intentRevision: 0 })),
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
      return store.lines().map(line => {
        const current = resolved.get(line.item.id);
        const item = current && current.state !== 'missing' ? current.item : line.item;
        return { ...line, item, inputIssue: entryInputIssue({ ...line, item }), changes: entryChanges(line, current),
          eligibilityIssue: entryEligibilityIssue(current), pricingWarning: entryPricingWarning(line, current),
          lineTotalMinor: entryInputIssue(line) ? null : entryPrice(line) * quantityValue(line.quantityText) };
      });
    })
  })),
  withMethods((store, storage = inject(CART_STORAGE)) => ({
    acknowledgePrice(id: string): string | null {
      if (store.checkoutLocked()) return 'Resolve the pending checkout before changing your cart.';
      if (store.resolved.loading() || store.resolved.stale() || store.resolved.error()) return 'Wait for current prices to finish loading.';
      const line = store.lines().find(entry => entry.id === id);
      const current = store.resolved.data()?.items.find(entry => entry.itemId === line?.item.id);
      if (!line || !current || current.state === 'missing') return 'This item is no longer available.';
      const next = { ...line, item: current.item, priceText: current.item.pricingMode === 'fixed' ? moneyText(current.item.priceMinor) : line.priceText };
      const issue = entryInputIssue(next);
      if (issue) return issue;
      patchState(store, { intentRevision: store.intentRevision() + 1, lines: store.lines().map(entry => entry.id === id ? next : entry) });
      return null;
    },
    clear() { if (!store.checkoutLocked()) patchState(store, { ...emptyCart(), intentRevision: store.intentRevision() + 1 }); },
    updateLine(id: string, quantityText: string, priceText: string, comment?: string): string | null {
      if (store.checkoutLocked()) return 'Resolve the pending checkout before changing your cart.';
      const line = store.lines().find((entry) => entry.id === id);
      if (!line) return 'This cart line was removed. Close and reopen this dialog.';
      const note = (comment ?? line.comment ?? '').trim();
      if (note.length > 500) return 'Keep kitchen comments within 500 characters.';
      let quantity: number; let price: number;
      try { quantity = quantityValue(quantityText); } catch { return 'Enter a whole quantity from 1 to 99.'; }
      try { price = line.item.pricingMode === 'fixed' ? line.item.priceMinor : parseUnitPriceMinor(priceText); }
      catch { return 'Enter a price from 0.00 to 10,000.00 with at most two decimal places.'; }
      const match = store.lines().find((other) => other.id !== id && other.item.id === line.item.id && (other.comment ?? '') === note && other.item.pricingMode === line.item.pricingMode && !entryInputIssue(other) && entryPrice(other) === price);
      if (match && quantity + quantityValue(match.quantityText) > 99) return 'A cart line can contain at most 99 items. Your existing quantity is retained.';
      patchState(store, { intentRevision: store.intentRevision() + 1, lines: store.lines().flatMap((entry) => {
        if (match && entry.id === id) return [];
        if (entry.id === (match?.id ?? id)) return [{ ...entry, comment: note, quantityText: String(quantity + (match ? quantityValue(match.quantityText) : 0)), priceText: moneyText(price) }];
        return [entry];
      }) });
      return null;
    },
    lockCheckout(locked: boolean) { patchState(store, { checkoutLocked: locked }); },
    completeCheckout(original: StoredCart): boolean {
      if (JSON.stringify({ version: 1, lines: store.lines(), discountText: store.discountText() }) === JSON.stringify(original)) {
        patchState(store, { ...emptyCart(), intentRevision: store.intentRevision() + 1 });
      }
      try {
        storage().setItem(CART_STORAGE_KEY, JSON.stringify({ version: 1, lines: store.lines(), discountText: store.discountText() }));
        return true;
      } catch { return false; }
    },
    add(item: MenuItem, quantityText: string, priceText = '', comment = ''): string | null {
      if (store.checkoutLocked()) return 'Resolve the pending checkout before changing your cart.';
      const note = comment.trim();
      if (note.length > 500) return 'Keep kitchen comments within 500 characters.';
      if (!item.available || item.archivedAt) return 'This item is unavailable. Your cart is retained.';
      let quantity: number;
      let price: number;
      try { quantity = quantityValue(quantityText); } catch { return 'Enter a whole quantity from 1 to 99.'; }
      try { price = item.pricingMode === 'fixed' ? item.priceMinor : parseUnitPriceMinor(priceText); }
      catch { return 'Enter a price from 0.00 to 10,000.00 with at most two decimal places.'; }
      const match = store.lines().find((line) => line.item.id === item.id && (line.comment ?? '') === note && line.item.pricingMode === item.pricingMode &&
        !entryInputIssue(line) && entryPrice(line) === price);
      if (match) {
        const combined = quantityValue(match.quantityText) + quantity;
        if (combined > 99) return 'A cart line can contain at most 99 items. Your existing quantity is retained.';
        patchState(store, { intentRevision: store.intentRevision() + 1, lines: store.lines().map((line) => line.id === match.id ? { ...line, quantityText: String(combined) } : line) });
      } else {
        if (store.lines().length >= MAX_CART_LINES) return 'The cart can contain at most 100 lines. Remove a line first.';
        patchState(store, { intentRevision: store.intentRevision() + 1, lines: [...store.lines(), newEntry(item, String(quantity), moneyText(price), note)] });
      }
      return null;
    },
    edit(id: string, field: 'quantityText' | 'priceText' | 'comment', value: string) {
      if (store.checkoutLocked()) return;
      patchState(store, { intentRevision: store.intentRevision() + 1, lines: store.lines().map((line) => line.id === id ? { ...line, [field]: value.slice(0, field === 'comment' ? 500 : 32) } : line) });
    },
    discount(value: string) { if (!store.checkoutLocked()) patchState(store, { intentRevision: store.intentRevision() + 1, discountText: value.slice(0, 32) }); },
    remove(id: string) { if (!store.checkoutLocked()) patchState(store, { intentRevision: store.intentRevision() + 1, lines: store.lines().filter((line) => line.id !== id) }); }
  })),
  withHooks({ onInit(store, storage = inject(CART_STORAGE)) {
    effect(() => {
      const snapshot = store.resolved.data();
      if (!snapshot || store.checkoutLocked() || store.resolved.stale() || store.resolved.error()) return;
      const current = new Map(snapshot.items.map(entry => [entry.itemId, entry]));
      const lines = store.lines().map(line => {
        const resolved = current.get(line.item.id);
        if (!resolved || resolved.state === 'missing') return line;
        // Keep accepted pricing until OK, but publish current names/images and eligibility silently.
        const item: MenuItem = line.item.pricingMode === 'fixed'
          ? { ...resolved.item, pricingMode: 'fixed', priceMinor: line.item.priceMinor }
          : { ...resolved.item, pricingMode: 'open', priceMinor: null };
        return { ...line, item };
      });
      if (JSON.stringify(lines) !== JSON.stringify(store.lines())) untracked(() => patchState(store, { lines, intentRevision: store.intentRevision() + 1 }));
    });
    effect(() => {
      const data: StoredCart = { version: 1, lines: store.lines(), discountText: store.discountText() };
      untracked(() => {
        try { storage().setItem(CART_STORAGE_KEY, JSON.stringify(storedCartSchema.parse(data))); }
        catch { patchState(store, { storageNotice: 'Cart changes cannot be saved in this tab. Keep it open; reloading or closing may lose your cart.' }); }
      });
    });
  } })
);
