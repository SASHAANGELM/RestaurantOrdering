import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import type { MenuItem } from '@restaurant-ordering/contracts';
import { CartStore } from './cart.store';
import { OpenPriceDialog } from './open-price-dialog';

@Component({
  selector: 'app-menu-item-row',
  imports: [RouterLink, CurrencyPipe, MatButton], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <img class="dish-image" [src]="displayImage()" [alt]="item().name" width="640" height="420" loading="lazy" decoding="async" (error)="imageFailedFor.set(imageUrl())" />
    <div class="item-copy"><strong><a class="item-link" [routerLink]="['/items', item().id]">{{ item().name }}</a></strong><p class="muted description">{{ item().description }}</p>
      <span>{{ item().pricingMode === 'open' ? 'Open price' : ((item().priceMinor ?? 0) / 100 | currency) }}</span>
      @if (!item().available) { <span class="unavailable">Unavailable</span> }</div>
    <div class="actions"><button mat-flat-button class="add-button" [disabled]="(!item().available && !inCart()) || cart.checkoutLocked()" [attr.aria-label]="'Add ' + item().name + ' to cart'" (click)="add()"><i class="ti ti-shopping-cart-plus" aria-hidden="true"></i>{{ inCart() ? 'Edit in cart' : 'Add to cart' }}</button></div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; min-width: 0; }
    :host(.unavailable-card) .dish-image, :host(.unavailable-card) .item-copy { opacity: .5; }
    .dish-image { width: 100%; height: 10rem; flex-shrink: 0; object-fit: cover; background: #edf3f7; }
    .item-copy { padding: 1rem 1rem .5rem; min-width: 0; flex: 1; } strong { overflow-wrap: anywhere; display: block; line-height: 1.35; }
    .description { font-size: .8rem; margin: .4rem 0 .65rem; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .actions { padding: .5rem 1rem 1rem; } .add-button { width: 100%; }
    .item-link { color: inherit; text-decoration: none; } .item-link:hover { text-decoration: underline; }
    .unavailable { display: block; font-size: .75rem; color: #923e2a; margin-top: .25rem; }
    .feedback { font-size: .75rem; margin: 0; padding: 0 1rem .5rem; }
  `]
})
export class MenuItemRow {
  readonly item = input.required<MenuItem>();
  readonly cart = inject(CartStore);
  private readonly dialog = inject(MatDialog);
  readonly imageFailedFor = signal<string | null>(null);
  readonly imageUrl = computed(() => (this.item().imageUrl || '/api/images/salad.jpg').replace(/^\/images\//, '/api/images/'));
  readonly displayImage = computed(() => this.imageFailedFor() === this.imageUrl() ? '/api/images/salad.jpg' : this.imageUrl());
  readonly inCart = computed(() => this.cart.lines().some((line) => line.item.id === this.item().id));
  add() {
    this.dialog.open(OpenPriceDialog, { data: { item: this.item() }, ariaLabelledBy: 'open-price-title', width: '30rem',
      maxWidth: 'calc(100vw - 2rem)', restoreFocus: true, autoFocus: 'first-tabbable' });
  }
}
