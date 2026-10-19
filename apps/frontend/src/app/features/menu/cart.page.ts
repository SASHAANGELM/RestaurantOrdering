import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PageHeading } from '../../shared/page-heading';
import { Breadcrumbs } from '../../shared/breadcrumbs';
import { CartStore } from './cart.store';
import { CartPanel } from './cart-panel';

@Component({
  selector: 'app-cart-page', imports: [CartPanel, PageHeading, Breadcrumbs], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-breadcrumbs [items]="[{label: 'Menu', path: '/menu'}, {label: 'Cart'}]" /><app-page-heading title="Cart" refreshLabel="Refresh cart" [busy]="cart.resolved.loading()" (refresh)="cart.resolved.reload()" /><app-cart-panel />`,
  styles: [`:host { display: block; max-width: 85rem; margin: auto; }`]
})
export class CartPage { readonly cart = inject(CartStore); }
