import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import type { MenuItem } from '@restaurant-ordering/contracts';
import { CartStore } from './cart.store';
import { OpenPriceDialog } from './open-price-dialog';

@Component({
  selector: 'app-menu-item-row',
  imports: [CurrencyPipe, ReactiveFormsModule, MatButton], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="item-copy"><strong>{{ item().name }}</strong><p class="muted description">{{ item().description }}</p>
      <span>{{ item().pricingMode === 'open' ? 'Open price' : ((item().priceMinor ?? 0) / 100 | currency) }}</span>
      @if (!item().available) { <span class="unavailable">Unavailable</span> }</div>
    <div class="actions"><label [for]="'quantity-' + item().id">Quantity</label>
      <input [id]="'quantity-' + item().id" [attr.aria-label]="'Quantity for ' + item().name" inputmode="numeric" maxlength="2" [formControl]="quantity" />
      <button mat-stroked-button [disabled]="!item().available" [attr.aria-label]="'Add ' + item().name + ' to cart'" (click)="add()">Add</button></div>
    @if (message()) { <p class="feedback" role="status">{{ message() }}</p> }
  `,
  styles: [`
    :host { display: flex; width: 100%; min-width: 0; align-items: center; flex-wrap: wrap; gap: 1rem; }
    .item-copy { flex: 1 1 12rem; min-width: 0; } strong { overflow-wrap: anywhere; }
    .description { margin: .25rem 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .actions { display: flex; align-items: center; gap: .5rem; } input { width: 3.5rem; padding: .65rem .4rem; font: inherit; }
    .unavailable { margin-left: 1rem; color: #923e2a; } .feedback { flex-basis: 100%; margin: 0; }
  `]
})
export class MenuItemRow {
  readonly item = input.required<MenuItem>();
  readonly cart = inject(CartStore);
  private readonly dialog = inject(MatDialog);
  readonly quantity = new FormControl('1', { nonNullable: true });
  readonly message = signal<string | null>(null);
  add() {
    if (this.item().pricingMode === 'open') {
      this.dialog.open(OpenPriceDialog, { data: { item: this.item(), quantity: this.quantity.value },
        ariaLabelledBy: 'open-price-title', width: '28rem', maxWidth: 'calc(100vw - 2rem)', restoreFocus: true, autoFocus: 'first-tabbable' });
    } else {
      const error = this.cart.add(this.item(), this.quantity.value);
      this.message.set(error ?? 'Added to cart.');
    }
  }
}
