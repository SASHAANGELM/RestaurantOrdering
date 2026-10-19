import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatTooltip } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { ItemImage } from '../../shared/item-image';
import { ClearCartButton } from './clear-cart-button';
import { CartStore } from './cart.store';
import { quantityValue } from './cart.model';

@Component({
  selector: 'app-cart-summary', imports: [CurrencyPipe, MatButton, MatTooltip, RouterLink, ItemImage, ClearCartButton], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (cart.lines().length) {
    <footer class="cart-summary" role="region" aria-label="Cart summary"><div class="summary-inner">
      <div class="summary-content"><div class="summary-images" aria-hidden="true">@for (item of dishes().slice(0, 3); track item.id) { <app-item-image class="circle" [src]="item.imageUrl" [name]="item.name" /> }</div>
        <div class="summary-copy" aria-live="polite"><strong>{{ count() }} {{ count() === 1 ? 'item' : 'items' }} in your cart</strong><span class="dish-names" [title]="names()">{{ names() }}</span>@if (problem(); as message) { <span class="cart-problem">{{ message }}</span> }</div>
      </div>
      <div class="summary-actions"><strong>{{ cart.estimate().totalMinor === null ? 'Check total' : ((cart.estimate().totalMinor ?? 0) / 100 | currency) }}</strong><a mat-flat-button routerLink="/cart" aria-label="View cart" matTooltip="View cart"><i class="ti ti-shopping-cart" aria-hidden="true"></i><span class="cart-link-text">View cart</span></a><app-clear-cart-button /></div>
    </div></footer><div class="summary-space" aria-hidden="true"></div>
  }`,
  styles: [`
    .cart-summary { position: fixed; inset: auto 0 0; z-index: 10; background: white; border-top: 1px solid #d7e2e9; box-shadow: 0 -4px 20px #142f4410; }
    .summary-inner { max-width: 90rem; min-height: 79px; margin: auto; padding: .75rem 2.75rem .75rem 1.25rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
    .summary-content { display: flex; align-items: center; gap: 1rem; min-width: 0; } .summary-images { display: flex; flex-shrink: 0; padding-right: .5rem; } .summary-images app-item-image { margin-right: -.5rem; border: 2px solid white; border-radius: 50%; }
    .summary-copy { display: grid; gap: .2rem; min-width: 0; } .summary-copy span { font-size: .8rem; } .dish-names { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #526775; }
    .summary-actions { display: flex; align-items: center; gap: .5rem; flex-shrink: 0; } .cart-problem { color: #923e2a; } .summary-space { height: 100px; }
    @media (max-width: 650px) { .summary-inner { gap: .4rem; padding: .65rem 2.5rem .65rem .65rem; flex-wrap: wrap; } .summary-content { flex: 1; gap: .65rem; } .summary-content { flex-basis: 100%; } .summary-actions { width: 100%; justify-content: flex-end; } .summary-actions > strong { margin-right: auto; } .summary-space { height: 150px; } .summary-actions { gap: .2rem; } .summary-copy { font-size: .85rem; } .cart-link-text { display: none; } .summary-actions a { min-width: 2.75rem; padding: 0 .65rem; } .summary-actions a .ti { margin: 0; } }
  `]
})
export class CartSummary {
  readonly cart = inject(CartStore);
  readonly dishes = computed(() => [...new Map(this.cart.lines().map(line => [line.item.id, line.item])).values()]);
  readonly names = computed(() => {
    const items = this.dishes();
    return items.length <= 3 ? items.map(item => item.name).join(', ') : `${items.slice(0, 2).map(item => item.name).join(', ')} and ${items.length - 2} items more`;
  });
  readonly count = computed(() => this.cart.lines().reduce((sum, line) => { try { return sum + quantityValue(line.quantityText); } catch { return sum; } }, 0));
  readonly problem = computed(() => {
    if (this.cart.checkoutLocked()) return 'Checkout pending. Open cart to resolve.';
    if (this.cart.estimate().error) return this.cart.estimate().error;
    if (this.cart.resolved.error() || this.cart.resolved.stale()) return 'Availability could not be checked. Open cart to retry.';
    const changes = this.cart.entries().flatMap(line => line.inputIssue ? [line.inputIssue] : line.changes);
    if (changes.length) return changes.find(change => /cannot be ordered|Pricing mode changed/.test(change)) ?? changes[0];
    return this.cart.storageNotice();
  });
}
