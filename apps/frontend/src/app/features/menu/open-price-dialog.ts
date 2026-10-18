import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogActions, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import type { MenuItem } from '@restaurant-ordering/contracts';
import { CartStore } from './cart.store';

@Component({
  selector: 'app-open-price-dialog', changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatButton, MatDialogTitle, MatDialogContent, MatDialogActions, MatFormFieldModule, MatInput],
  template: `
    <h2 mat-dialog-title id="open-price-title">Set open price</h2>
    <mat-dialog-content><p>{{ data.item.name }}</p>
      <mat-form-field><mat-label>Unit price (USD)</mat-label><input matInput inputmode="decimal" maxlength="32" [formControl]="price" /></mat-form-field>
      <mat-form-field><mat-label>Quantity</mat-label><input matInput inputmode="numeric" maxlength="2" [formControl]="quantity" /></mat-form-field>
      @if (message()) { <p role="alert">{{ message() }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions><button mat-button (click)="dialog.close()">Cancel</button><button mat-flat-button (click)="add()">Add to cart</button></mat-dialog-actions>
  `,
  styles: ['mat-form-field { display: block; }']
})
export class OpenPriceDialog {
  readonly data = inject<{ item: MenuItem; quantity: string }>(MAT_DIALOG_DATA);
  readonly dialog = inject(MatDialogRef<OpenPriceDialog>);
  readonly cart = inject(CartStore);
  readonly price = new FormControl('', { nonNullable: true });
  readonly quantity = new FormControl(this.data.quantity, { nonNullable: true });
  readonly message = signal<string | null>(null);
  add() {
    const error = this.cart.add(this.data.item, this.quantity.value, this.price.value);
    this.message.set(error);
    if (!error) this.dialog.close(true);
  }
}
