import { CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { OrderSummary } from '@restaurant-ordering/contracts';
import { ItemImageStack } from '../../shared/item-image-stack';
import { OrderStatusControl } from './order-status-control';

@Component({
  selector: 'li[app-order-row]',
  imports: [CurrencyPipe, DatePipe, TitleCasePipe, RouterLink, ItemImageStack, OrderStatusControl],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'order-row status-' + order().status" },
  template: `
    <app-item-image-stack [items]="order().itemImages ?? []" />
    <div class="order-copy"><a [routerLink]="['/orders', order().id]">Order {{ order().id.slice(0, 8) }}</a>
      <p class="muted">Placed {{ order().createdAt | date:'medium' }}</p></div>
    @if (editableStatus()) {
      <app-order-status-control [order]="order()" (changed)="changed.emit()" />
    } @else {
      <span [class]="'status-badge status-' + order().status">{{ order().status | titlecase }}</span>
    }
    <span>{{ order().totalMinor / 100 | currency:order().currency }}</span>
  `,
  styles: [`.order-copy { flex: 1; min-width: 10rem; }`]
})
export class OrderRow {
  readonly order = input.required<OrderSummary>();
  readonly editableStatus = input(false);
  readonly changed = output<void>();
}
