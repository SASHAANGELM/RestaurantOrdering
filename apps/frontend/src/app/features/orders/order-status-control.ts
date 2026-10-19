import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { ORDER_STATUS_TRANSITIONS, type OrderStatus, type OrderSummary } from '@restaurant-ordering/contracts';
import { ApiClient, clientError } from '../../core/api-client';
import { RealtimeSync } from '../../core/realtime-sync';
import { ConfirmDialog } from '../../shared/confirm-dialog';

@Component({
  selector: 'app-order-status-control', imports: [MatButton], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<select [class]="'status-badge status-' + current().status" [attr.aria-label]="'Status for order ' + current().id.slice(0, 8)" [disabled]="busy() || confirming() || blocked() || !transitions().length" (change)="choose($event)">
    <option [value]="current().status" selected>{{ label(current().status) }}</option>
    @for (status of transitions(); track status) { <option [value]="status">{{ label(status) }}</option> }
  </select>
  @if (busy()) { <span role="status">Updating status…</span> }
  @if (error()) { <p class="error-panel" role="alert">{{ error() }} Refresh status before trying again.</p><button mat-button [disabled]="busy()" (click)="refreshStatus()">Refresh status</button> }`,
  styles: [`:host { display: block; max-width: 22rem; } select { font: inherit; cursor: pointer; max-width: 100%; } select:disabled { cursor: default; opacity: .75; } p { font-size: .85rem; }`]
})
export class OrderStatusControl {
  readonly order = input.required<OrderSummary>(); readonly changed = output<void>();
  readonly busy = signal(false); readonly confirming = signal(false); readonly blocked = signal(false); readonly error = signal('');
  private readonly latest = signal<OrderSummary | null>(null);
  readonly current = computed(() => {
    const input = this.order(); const latest = this.latest();
    return latest?.id === input.id && latest.revision > input.revision ? latest : input;
  });
  readonly transitions = computed(() => ORDER_STATUS_TRANSITIONS[this.current().status]);
  private readonly api = inject(ApiClient); private readonly sync = inject(RealtimeSync); private readonly dialog = inject(MatDialog); private readonly destroy = inject(DestroyRef);
  label(status: OrderStatus) { return status.charAt(0).toUpperCase() + status.slice(1); }
  choose(event: Event) {
    const select = event.target as HTMLSelectElement; const status = select.value as OrderStatus; const order = this.current();
    select.value = order.status;
    if (this.busy() || this.blocked() || this.confirming() || !this.transitions().includes(status)) return;
    if (status !== 'cancelled') { this.update(order, status); return; }
    this.confirming.set(true);
    this.dialog.open(ConfirmDialog, { data: { title: 'Cancel order?', message: 'This order will be cancelled. This cannot be undone.', action: 'Cancel order' }, width: '26rem' })
      .afterClosed().pipe(takeUntilDestroyed(this.destroy)).subscribe(confirmed => { this.confirming.set(false); if (confirmed) this.update(order, status); });
  }
  private update(order: OrderSummary, status: OrderStatus) {
    this.busy.set(true); this.error.set('');
    this.api.updateOrderStatus(order.id, { expectedRevision: order.revision, status }).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: result => { this.latest.set(result.order); this.busy.set(false); this.sync.observe({ ordersRevision: result.ordersRevision }); this.changed.emit(); },
      error: (error: unknown) => { this.busy.set(false); this.blocked.set(true); this.error.set(clientError(error).message); }
    });
  }
  refreshStatus() {
    if (this.busy()) return;
    const id = this.current().id; this.busy.set(true);
    this.api.order(id).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: result => { this.latest.set(result.order); this.busy.set(false); this.blocked.set(false); this.error.set(''); this.sync.observe({ ordersRevision: result.ordersRevision }); this.changed.emit(); },
      error: (error: unknown) => { this.busy.set(false); this.error.set(clientError(error).message); }
    });
  }
}
