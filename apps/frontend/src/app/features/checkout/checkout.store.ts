import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { type Subscription } from 'rxjs';
import * as z from 'zod';
import {
  confirmOrderSchema, createQuoteSchema, idSchema, quoteResponseSchema,
  type OrderResponse, type QuoteResponse
} from '@restaurant-ordering/contracts';
import { ApiClient, clientError } from '../../core/api-client';
import { RealtimeSync } from '../../core/realtime-sync';
import { entryPrice, quantityValue, storedCartSchema, type StoredCart } from '../menu/cart.model';
import { CART_STORAGE, CartStore } from '../menu/cart.store';

export const ATTEMPT_STORAGE_KEY = 'restaurant-ordering.checkout.v1';
export const attemptSchema = z.strictObject({
  version: z.literal(1), key: idSchema, payload: confirmOrderSchema,
  quote: quoteResponseSchema, cart: storedCartSchema, resolvedOrderId: idSchema.optional()
}).refine((value) => value.payload.quoteId === value.quote.quoteId, 'Attempt must reference the reviewed quote.');
type Attempt = z.infer<typeof attemptSchema>;

/** Root lifetime: leaving Menu never cancels a confirmation or unfreezes an unknown outcome. */
@Injectable({ providedIn: 'root' })
export class CheckoutStore {
  readonly cart = inject(CartStore);
  private readonly api = inject(ApiClient);
  private readonly sync = inject(RealtimeSync);
  private readonly router = inject(Router);
  private readonly storage = inject(CART_STORAGE);
  readonly quote = signal<QuoteResponse | null>(null);
  readonly attempt = signal<Attempt | null>(null);
  readonly busy = signal(false);
  readonly message = signal<string | null>(null);
  readonly storageNotice = signal<string | null>(null);
  readonly blocked = signal(false);
  readonly completedOrderId = signal<string | null>(null);
  private readonly now = signal(Date.now());
  private reviewedCart: string | null = null;
  private reviewedIntentRevision = -1;
  private pending?: Subscription;
  private generation = 0;
  private readonly cartSnapshot = computed<StoredCart>(() => ({ version: 1, lines: this.cart.lines(), discountText: this.cart.discountText() }));
  private readonly fingerprint = computed(() => JSON.stringify(this.cartSnapshot()));
  readonly validQuote = computed(() => {
    const quote = this.quote();
    return !!quote && this.reviewedCart === this.fingerprint() && this.reviewedIntentRevision === this.cart.intentRevision() &&
      quote.menuRevision >= this.sync.highest().menuRevision && Date.parse(quote.expiresAt) > this.now();
  });
  readonly canReview = computed(() => !this.busy() && !this.attempt() && !this.blocked() &&
    this.cart.lines().length > 0 && this.cart.estimate().error === null);
  readonly canConfirm = computed(() => !this.busy() && !this.attempt() && !this.blocked() && this.validQuote() &&
    !this.sync.syncing() && this.sync.error() === null);

  constructor() {
    const timer = window.setInterval(() => this.now.set(Date.now()), 1_000);
    inject(DestroyRef).onDestroy(() => { window.clearInterval(timer); this.pending?.unsubscribe(); });
    effect(() => {
      const quote = this.quote();
      const valid = this.validQuote();
      if (quote && !valid && !this.attempt()) untracked(() => {
        this.quote.set(null);
        this.message.set('Your cart, menu, or quote expiry changed. Review current prices and availability again.');
      });
    });
    let raw: string | null;
    try { raw = this.storage().getItem(ATTEMPT_STORAGE_KEY); }
    catch {
      this.blocked.set(true);
      this.storageNotice.set('Checkout recovery storage cannot be read. Cart editing is available in memory. Restore storage access and reload before checking out so any previous attempt can be recovered safely.');
      return;
    }
    try {
      if (raw !== null) {
        const attempt = attemptSchema.parse(JSON.parse(raw));
        this.attempt.set(attempt);
        this.cart.lockCheckout(true);
        if (attempt.resolvedOrderId) this.openExisting(attempt.resolvedOrderId);
        else this.lookup(); // Read only; a reload never submits an order.
      }
    } catch {
      // An unreadable existing record may represent a committed request. Never replace it with a new key.
      this.blocked.set(true);
      this.cart.lockCheckout(true);
      this.storageNotice.set('Checkout recovery storage cannot be read. A previous order may be unresolved. Restore storage access and reload before checking out; verify existing orders before clearing browser data.');
    }
  }

  review() {
    if (!this.canReview()) return;
    let body;
    try {
      body = createQuoteSchema.parse({ lines: this.cart.lines().map((line) => ({
        itemId: line.item.id, quantity: quantityValue(line.quantityText),
        ...(line.item.pricingMode === 'open' ? { openPriceMinor: entryPrice(line) } : {}),
        observedRevision: line.item.revision, observedUnitPriceMinor: entryPrice(line), observedName: line.item.name
      })), discountMinor: this.cart.estimate().discountMinor });
    } catch { this.message.set('Correct the cart inputs before reviewing.'); return; }
    this.completedOrderId.set(null);
    this.quote.set(null);
    this.message.set(null);
    this.busy.set(true);
    const fingerprint = this.fingerprint();
    const intentRevision = this.cart.intentRevision();
    const menuRevision = this.sync.highest().menuRevision;
    const generation = ++this.generation;
    this.pending = this.api.quote(body).subscribe({
      next: (quote) => {
        if (generation !== this.generation) return;
        this.busy.set(false);
        if (fingerprint !== this.fingerprint() || intentRevision !== this.cart.intentRevision() || menuRevision !== this.sync.highest().menuRevision ||
            quote.menuRevision < this.sync.highest().menuRevision || Date.parse(quote.expiresAt) <= Date.now()) {
          this.message.set('The cart or menu changed while loading. Review again.'); return;
        }
        this.reviewedCart = fingerprint;
        this.reviewedIntentRevision = intentRevision;
        this.now.set(Date.now());
        this.quote.set(quote);
        this.sync.observe({ menuRevision: quote.menuRevision });
      },
      error: (error: unknown) => { this.busy.set(false); this.message.set(this.describe(error)); }
    });
  }

  confirm() {
    this.now.set(Date.now()); // Also enforce expiry between timer ticks and after a background-tab pause.
    if (!this.canConfirm()) return;
    const quote = this.quote();
    if (!quote) return;
    const attempt: Attempt = { version: 1, key: crypto.randomUUID(), payload: { quoteId: quote.quoteId }, quote, cart: this.cartSnapshot() };
    this.attempt.set(attempt);
    this.cart.lockCheckout(true);
    this.persist(attempt); // Must finish before subscribing to POST.
    this.send();
  }

  retry() {
    if (!this.attempt() || this.busy()) return;
    const id = this.attempt()?.resolvedOrderId;
    if (id) { this.openExisting(id); return; }
    this.send();
  }

  lookup() {
    const attempt = this.attempt();
    if (!attempt || this.busy()) return;
    if (attempt.resolvedOrderId) { this.openExisting(attempt.resolvedOrderId); return; }
    this.busy.set(true);
    this.message.set('Checking the original checkout request…');
    this.pending = this.api.orderByRequest(attempt.key).subscribe({
      next: (response) => this.accept(response),
      error: (error: unknown) => {
        this.busy.set(false);
        const failure = clientError(error);
        this.message.set(failure.body?.code === 'NOT_FOUND'
          ? 'No order is visible for this key yet. The original request may still complete. Check again or retry the same checkout; your key is retained.'
          : 'Order outcome is still unknown. Check again or retry the same checkout. ' + failure.message);
      }
    });
  }

  private send() {
    const attempt = this.attempt();
    if (!attempt || this.busy()) return;
    this.busy.set(true);
    this.message.set('Sending the original checkout request…');
    this.pending = this.api.confirm(attempt.payload, attempt.key).subscribe({
      next: (response) => this.accept(response),
      error: (error: unknown) => {
        this.busy.set(false);
        const failure = clientError(error);
        const body = failure.body;
        if (body?.code === 'QUOTE_USED' && body.details.quoteId === attempt.payload.quoteId) {
          // Preserve the attempt until the existing order is read successfully.
          this.attempt.set({ ...attempt, resolvedOrderId: body.details.orderId });
          this.persist(this.attempt()!);
          this.openExisting(body.details.orderId);
        } else if (failure.kind === 'invalid-request' || (failure.status < 500 && body &&
          ['VALIDATION_ERROR', 'CART_INVALID', 'DISCOUNT_EXCEEDS_SUBTOTAL', 'QUOTE_EXPIRED', 'MENU_CHANGED'].includes(body.code)) ||
          (body?.code === 'NOT_FOUND' && body.details.resourceType === 'quote')) {
          if (this.release()) this.message.set(this.describe(error) + ' Your cart is retained. Review again before confirming.');
        } else {
          this.message.set('Order outcome is unknown. Keep this tab open. Check by key or retry the same checkout; do not start another order. ' + failure.message);
        }
      }
    });
  }

  private openExisting(id: string) {
    this.busy.set(true);
    this.pending = this.api.order(id).subscribe({
      next: (response) => this.accept(response),
      error: (error: unknown) => {
        this.busy.set(false);
        this.message.set('This quote already has an order. Retry to open that same order. ' + clientError(error).message);
      }
    });
  }

  private accept(response: OrderResponse) {
    if (response.order.quoteId !== this.attempt()?.payload.quoteId) {
      this.busy.set(false);
      this.message.set('The response did not match the pending quote. Your original key is retained; check again.'); return;
    }
    this.sync.observe({ ordersRevision: response.ordersRevision });
    this.finish(response.order.id);
  }

  private finish(id: string) {
    const attempt = this.attempt();
    if (!attempt) return;
    this.persist({ ...attempt, resolvedOrderId: id });
    // Save the cleared cart before removing recovery data, so a crash cannot restore a submitted cart.
    const savedCart = this.cart.completeCheckout(attempt.cart);
    if (savedCart) {
      try { this.storage().removeItem(ATTEMPT_STORAGE_KEY); }
      catch { this.storageNotice.set('The order is confirmed, but saved recovery data could not be removed. Reload may reopen this same order.'); }
    }
    this.attempt.set(null);
    this.quote.set(null);
    this.busy.set(false);
    this.cart.lockCheckout(false);
    this.completedOrderId.set(id);
    this.message.set('Order confirmed.');
    void this.router.navigate(['/orders', id]);
  }

  private release() {
    try { this.storage().removeItem(ATTEMPT_STORAGE_KEY); }
    catch {
      this.message.set('The request was rejected, but its saved recovery record could not be cleared. Restore storage and retry.');
      this.storageNotice.set('Recovery storage cannot be updated. Keep this tab open.');
      return false;
    }
    this.attempt.set(null);
    this.quote.set(null);
    this.cart.lockCheckout(false);
    return true;
  }

  private persist(attempt: Attempt) {
    try { this.storage().setItem(ATTEMPT_STORAGE_KEY, JSON.stringify(attemptSchema.parse(attempt))); }
    catch { this.storageNotice.set('Checkout recovery cannot be saved. Keep this tab open: reloading or closing it may lose the request key and prevent safe recovery.'); }
  }

  private describe(error: unknown) {
    const failure = clientError(error);
    if (failure.body?.code === 'CART_INVALID') return failure.body.details.issues.map((issue) => `Line ${issue.lineIndex + 1}: ${issue.message}`).join(' ');
    if (failure.body?.code === 'MENU_CHANGED') return 'The menu changed after review.';
    if (failure.body?.code === 'QUOTE_EXPIRED') return 'The reviewed quote expired.';
    return failure.message;
  }
}
