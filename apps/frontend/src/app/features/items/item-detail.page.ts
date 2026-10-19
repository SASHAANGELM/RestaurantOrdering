import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator } from '@angular/material/paginator';
import { ActivatedRoute } from '@angular/router';
import { ApiClient, clientError } from '../../core/api-client';
import { Breadcrumbs } from '../../shared/breadcrumbs';
import { ItemImage } from '../../shared/item-image';
import { LoadState } from '../../shared/load-state';
import { PageHeading } from '../../shared/page-heading';
import { SetupEditor } from '../setup/setup-editor';
import { OrderRow } from '../orders/order-row';
import { ItemDetailStore } from './item-detail.store';

@Component({
  selector: 'app-item-detail-page', providers: [ItemDetailStore],
  imports: [CurrencyPipe, DatePipe, MatButton, MatPaginator, PageHeading, Breadcrumbs, ItemImage, LoadState, OrderRow],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-breadcrumbs [items]="[{label: 'Settings', path: '/setup'}, {label: 'Items', path: '/setup/items'}, {label: store.current()?.item?.name ?? 'Item details'}]" />
    <app-page-heading [title]="store.current()?.item?.name ?? 'Item details'" refreshLabel="Refresh item" [busy]="store.detail.loading() || store.history.loading()" (refresh)="store.reload()">
      @if (store.current(); as detail) { <button mat-stroked-button [disabled]="openingEditor() || !!detail.item.archivedAt || store.detail.stale()" (click)="edit()"><i class="ti ti-edit" aria-hidden="true"></i> Edit</button> }
    </app-page-heading>
    @if (editError()) { <p class="error-panel" role="alert">{{ editError() }}</p> }
    <app-load-state [loading]="store.detail.loading()" [stale]="store.detail.stale()" [error]="store.detail.error()" (retry)="store.detail.reload()" />
    @if (store.current(); as detail) {
      <section class="item-details" aria-label="Item details">
        <app-item-image class="hero" [src]="detail.item.imageUrl" [name]="detail.item.name" />
        <div><p role="status" [class]="'item-status ' + (detail.item.archivedAt ? 'archived' : detail.item.available ? 'available' : 'unavailable')"><i [class]="'ti ' + (detail.item.archivedAt ? 'ti-archive' : detail.item.available ? 'ti-eye' : 'ti-eye-off')" aria-hidden="true"></i> {{ detail.item.archivedAt ? 'Archived' : detail.item.available ? 'Available' : 'Unavailable' }}</p>
          <dl><dt>Category</dt><dd>{{ detail.category.name }}{{ detail.category.archivedAt ? ' (archived)' : '' }}</dd>
            <dt>Price</dt><dd>{{ detail.item.pricingMode === 'open' ? 'Open price — entered when ordering' : (detail.item.priceMinor / 100 | currency) }}</dd>
            <dt>Updated</dt><dd>{{ detail.item.updatedAt | date:'medium' }}</dd></dl>
          <p class="description">{{ detail.item.description || 'No description provided.' }}</p>
          @if (detail.category.archivedAt) { <p class="error-panel">This category is archived. This item cannot be ordered.</p> }
          @if (detail.item.archivedAt) { <p class="muted">Restore this item in Settings to make it unavailable, then enable availability when ready.</p> }
          @else if (!detail.item.available) { <p class="muted">This item is currently unavailable for ordering.</p> }
        </div>
      </section>
      <section aria-labelledby="related-orders"><h2 id="related-orders">Related orders</h2>
        <p class="muted">Orders containing this item, including earlier names and prices.</p>
        <app-load-state [loading]="store.history.loading()" [stale]="store.history.stale()" [error]="store.history.error()" (retry)="store.history.reload()" />
        @if (store.related(); as history) {
          <p class="muted">{{ history.total }} orders · Page {{ history.page }}</p>
          <ul class="data-list">@for (order of history.orders; track order.id) {
            <li app-order-row [order]="order"></li>
          } @empty { <li>{{ history.page > 1 ? 'No orders on this page.' : 'No orders contain this item yet.' }}</li> }</ul>
          <mat-paginator aria-label="Related order pages" [length]="history.total" [pageSize]="history.pageSize" [pageIndex]="history.page - 1" [pageSizeOptions]="[10, 25, 50, 100]" (page)="store.orderPage($event.pageIndex + 1, $event.pageSize)" />
          @if (!history.orders.length && history.page > 1) { <button mat-button (click)="store.orderPage(1, history.pageSize)">Return to first order page</button> }
        }
      </section>
    }
  `,
  styles: [`
    .item-heading { display: flex; align-items: center; gap: .75rem; margin-bottom: 1rem; } h1 { margin: 0; overflow-wrap: anywhere; }
    .item-details { display: grid; grid-template-columns: minmax(12rem, 24rem) minmax(0, 1fr); gap: 2rem; margin-block: 1.5rem 2.5rem; }
    dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .75rem 1rem; } dt { font-weight: 600; } dd { margin: 0; overflow-wrap: anywhere; }
    .description { white-space: pre-wrap; overflow-wrap: anywhere; } .item-status { display: inline-flex; align-items: center; gap: .4rem; border-radius: 1rem; padding: .4rem .75rem; font-weight: 600; } .available { color: #17623a; background: #e2f2e8; } .unavailable { color: #8a5100; background: #fff0d5; } .archived { color: #5f4a79; background: #eee7f6; } mat-paginator { background: transparent; }
    .data-list a { overflow-wrap: anywhere; }
    @media (max-width: 650px) { .item-details { grid-template-columns: minmax(0, 1fr); gap: 1rem; } }
  `]
})
export class ItemDetailPage {
  readonly store = inject(ItemDetailStore);
  readonly openingEditor = signal(false); readonly editError = signal('');
  private readonly api = inject(ApiClient); private readonly dialog = inject(MatDialog); private readonly destroy = inject(DestroyRef);
  edit() {
    const detail = this.store.current();
    if (!detail || detail.item.archivedAt || this.openingEditor() || this.dialog.getDialogById('setup-editor')) return;
    this.openingEditor.set(true); this.editError.set('');
    this.api.setupCategories(true).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: result => {
        this.openingEditor.set(false);
        if (this.store.current()?.item.id !== detail.item.id) return;
        this.dialog.open(SetupEditor, { id: 'setup-editor', ariaLabelledBy: 'setup-editor-title', width: '36rem', maxWidth: 'calc(100vw - 2rem)',
          autoFocus: 'input[formControlName="name"]', restoreFocus: true,
          data: { kind: 'item', entity: detail.item, categories: result.categories } }).afterClosed().pipe(takeUntilDestroyed(this.destroy))
          .subscribe(saved => { if (saved) this.store.reload(); });
      },
      error: (error: unknown) => { this.openingEditor.set(false); this.editError.set(clientError(error).message); }
    });
  }
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);
  constructor() { effect(() => this.store.select(this.params()?.get('id') ?? null)); }
}
