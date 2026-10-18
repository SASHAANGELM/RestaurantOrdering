import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CartPanel } from './cart-panel';

@Component({
  selector: 'app-cart-page', imports: [CartPanel], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="page-heading"><div><p class="eyebrow">Your order, your way</p><h1 tabindex="-1">Cart</h1></div></div><app-cart-panel />`,
  styles: [`:host { display: block; max-width: 85rem; margin: auto; }`]
})
export class CartPage {}
