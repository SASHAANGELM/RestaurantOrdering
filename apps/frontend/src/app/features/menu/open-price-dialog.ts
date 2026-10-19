import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogActions, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { MenuItem } from '@restaurant-ordering/contracts';
import { QuantityInput } from '../../shared/quantity-input';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { MatDialog } from '@angular/material/dialog';
import { CartStore } from './cart.store';

@Component({
  selector: 'app-open-price-dialog', changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QuantityInput, CurrencyPipe, ReactiveFormsModule, MatButton, MatDialogTitle, MatDialogContent, MatDialogActions, MatFormFieldModule, MatInput, MatSelectModule],
  template: `
    <h2 mat-dialog-title id="open-price-title">{{ data.item.pricingMode === 'open' ? 'Set open price' : 'Set quantity' }}</h2>
    <mat-dialog-content><p><strong>{{ data.item.name }}</strong></p>
      @if (existing().length && data.item.pricingMode === 'open') {
        <mat-form-field appearance="outline"><mat-label>Cart entry</mat-label><mat-select [value]="selectedId()" (selectionChange)="select($event.value)">
          @for (line of existing(); track line.id) { <mat-option [value]="line.id">{{ line.quantityText }} × {{ line.priceText }} USD</mat-option> }
          <mat-option value="">New price / cart line</mat-option>
        </mat-select></mat-form-field>
      }
      @if (data.item.pricingMode === 'open') {
        <mat-form-field appearance="outline"><mat-label><i class="ti ti-currency-dollar" aria-hidden="true"></i> Unit price (USD)</mat-label><input matInput inputmode="decimal" maxlength="32" [formControl]="price" /></mat-form-field>
      } @else { <p>Unit price: {{ (selected()?.item?.priceMinor ?? data.item.priceMinor) / 100 | currency }}</p> }
      <p id="quantity-label">Quantity</p><app-quantity-input [min]="0" [value]="quantity.value" [disabled]="cart.checkoutLocked()" (valueChange)="quantity.setValue($event)" />
      @if (!data.item.available) { <p role="status">This item is unavailable. You can remove it from your cart.</p> }
      @if (message()) { <p role="alert">{{ message() }}</p> }
      <mat-form-field appearance="outline"><mat-label>Comment for the kitchen</mat-label><textarea matInput [formControl]="comment" maxlength="500" rows="3" placeholder="For example, no mustard"></textarea></mat-form-field>
      <p class="muted">Set quantity to zero to remove this item.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialog.close()">Cancel</button>
      <button mat-flat-button [disabled]="cart.checkoutLocked()" (click)="add()"><i class="ti ti-shopping-cart" aria-hidden="true"></i>{{ selected() ? 'Update cart' : 'Add to cart' }}</button>
    </mat-dialog-actions>
  `,
  styles: ['mat-form-field { display: block; }']
})
export class OpenPriceDialog {
  readonly data = inject<{ item: MenuItem; quantity?: string }>(MAT_DIALOG_DATA);
  readonly dialog = inject(MatDialogRef<OpenPriceDialog>);
  readonly cart = inject(CartStore);
  readonly existing = computed(() => this.cart.lines().filter((line) => line.item.id === this.data.item.id));
  readonly selectedId = signal(this.existing()[0]?.id ?? '');
  readonly selected = computed(() => this.existing().find((line) => line.id === this.selectedId()));
  readonly price = new FormControl(this.selected()?.priceText ?? '', { nonNullable: true });
  readonly quantity = new FormControl(this.selected()?.quantityText ?? this.data.quantity ?? '1', { nonNullable: true });
  readonly comment = new FormControl(this.selected()?.comment ?? '', { nonNullable: true });
  readonly message = signal<string | null>(null);
  select(id: string) { this.selectedId.set(id); this.quantity.setValue(this.selected()?.quantityText ?? '1'); this.price.setValue(this.selected()?.priceText ?? ''); this.comment.setValue(this.selected()?.comment ?? ''); this.message.set(null); }
  private readonly confirmation = inject(MatDialog);
  remove() {
    const line = this.selected();
    if (!line || this.cart.checkoutLocked()) return;
    this.confirmation.open(ConfirmDialog, { data: { title: 'Remove item?', message: `Remove ${line.item.name} from your cart?`, action: 'Remove' }, width: '26rem' }).afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed && !this.cart.checkoutLocked()) { this.cart.remove(line.id); this.dialog.close(true); }
    });
  }
  add() {
    if (this.cart.checkoutLocked()) return;
    const line = this.selected();
    if (this.quantity.value === '0') { if (line) this.remove(); else this.dialog.close(); return; }
    if (this.selectedId() && !line) { this.message.set('This cart line was removed. Close and reopen this dialog.'); return; }
    if (line && line.item.pricingMode !== this.data.item.pricingMode) { this.message.set('Pricing mode changed. Remove this entry and add the dish again.'); return; }
    const error = line ? this.cart.updateLine(line.id, this.quantity.value, this.price.value, this.comment.value) : this.cart.add(this.data.item, this.quantity.value, this.price.value, this.comment.value);
    this.message.set(error);
    if (!error) this.dialog.close(true);
  }
}
