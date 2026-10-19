import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogActions, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import type { MenuItem } from '@restaurant-ordering/contracts';
import { UnitPriceField } from '../../shared/unit-price-field';
import { ItemImage } from '../../shared/item-image';
import { QuantityInput } from '../../shared/quantity-input';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { MatDialog } from '@angular/material/dialog';
import { CartStore } from './cart.store';

@Component({
  selector: 'app-open-price-dialog', changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, UnitPriceField, QuantityInput, ItemImage, ReactiveFormsModule, MatButton, MatDialogTitle, MatDialogContent, MatDialogActions, MatFormFieldModule, MatInput, MatSelectModule],
  template: `
    <h2 mat-dialog-title id="open-price-title">{{ selected() ? 'Edit in cart' : 'Add to cart' }}</h2>
    <mat-dialog-content><div class="dialog-item"><app-item-image [src]="data.item.imageUrl" [name]="data.item.name" /><strong>{{ data.item.name }}</strong></div>
      @if (existing().length && data.item.pricingMode === 'open') {
        <mat-form-field appearance="outline"><mat-label>Cart entry</mat-label><mat-select [value]="selectedId()" (selectionChange)="select($event.value)">
          @for (line of existing(); track line.id) { <mat-option [value]="line.id">{{ line.quantityText }} × {{ line.priceText }} USD</mat-option> }
          <mat-option value="">New price / cart line</mat-option>
        </mat-select></mat-form-field>
      }
      <div class="entry-controls">
        <app-unit-price-field [open]="data.item.pricingMode === 'open'" [priceMinor]="selected()?.item?.priceMinor ?? data.item.priceMinor ?? 0" [value]="price.value" [disabled]="cart.checkoutLocked()" (valueChange)="price.setValue($event)" />
        <div class="control-field"><span>Quantity</span><app-quantity-input [min]="0" [value]="quantity.value" [disabled]="cart.checkoutLocked()" (valueChange)="quantity.setValue($event)" /></div>
      </div>
      @if (!data.item.available) { <p role="status">This item is unavailable. You can remove it from your cart.</p> }
      @if (message()) { <p role="alert">{{ message() }}</p> }
      @if (selected() && selected()?.item?.pricingMode !== data.item.pricingMode) { <a mat-button routerLink="/cart" (click)="dialog.close()">Review changed pricing in Cart</a> }
      @if (commentOpen()) {
        <div class="comment-heading"><span>Comment for the kitchen</span><button mat-button class="icon-button" aria-label="Remove comment" title="Remove comment" [disabled]="cart.checkoutLocked()" (click)="removeComment()"><i class="ti ti-x" aria-hidden="true"></i></button></div>
        <mat-form-field appearance="outline"><mat-label>Comment for the kitchen</mat-label><textarea matInput [formControl]="comment" maxlength="500" rows="3" placeholder="For example, no mustard"></textarea></mat-form-field>
      } @else {
        @if (comment.value) { <p class="comment-preview">Comment: {{ comment.value }}</p> }
        <button mat-button [disabled]="cart.checkoutLocked()" (click)="commentOpen.set(true)"><i class="ti ti-message" aria-hidden="true"></i>{{ comment.value ? 'Edit comment' : 'Add comment' }}</button>
      }
      @if (selected()) { <button mat-button class="delete-button" [disabled]="cart.checkoutLocked()" (click)="remove()"><i class="ti ti-trash" aria-hidden="true"></i> Delete from cart</button> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialog.close()">Cancel</button>
      <button mat-flat-button [disabled]="cart.checkoutLocked()" (click)="add()"><i class="ti ti-shopping-cart" aria-hidden="true"></i>{{ selected() ? 'Edit in cart' : 'Add to cart' }}</button>
    </mat-dialog-actions>
  `,
  styles: [`mat-form-field { display: block; } .entry-controls { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: .75rem; margin-bottom: 1rem; align-items: start; } .entry-controls > div { min-width: 0; } .control-field { display: grid; gap: .4rem; } .control-field > span { font-size: .85rem; } .dialog-item { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; } .dialog-item strong { min-width: 0; overflow-wrap: anywhere; } .comment-heading { display: flex; align-items: center; justify-content: space-between; } .comment-preview { white-space: pre-wrap; overflow-wrap: anywhere; } .delete-button { display: block; color: #b3261e; margin-top: .75rem; }`]
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
  readonly commentOpen = signal(false);
  removeComment() { if (!this.cart.checkoutLocked()) { this.comment.setValue(''); this.commentOpen.set(false); } }
  select(id: string) { this.selectedId.set(id); this.quantity.setValue(this.selected()?.quantityText ?? '1'); this.price.setValue(this.selected()?.priceText ?? ''); this.comment.setValue(this.selected()?.comment ?? ''); this.commentOpen.set(false); this.message.set(null); }
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
    if (line && line.item.pricingMode !== this.data.item.pricingMode) { this.message.set('Pricing changed. Open Cart and select OK on the warning before updating this entry.'); return; }
    const error = line ? this.cart.updateLine(line.id, this.quantity.value, this.price.value, this.comment.value) : this.cart.add(this.data.item, this.quantity.value, this.price.value, this.comment.value);
    this.message.set(error);
    if (!error) this.dialog.close(true);
  }
}
