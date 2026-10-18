import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { CartStore } from './cart.store';

@Component({
  selector: 'app-clear-cart-dialog', imports: [MatDialogModule, MatButton], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h2 mat-dialog-title id="clear-cart-title">Clear your cart?</h2>
    <mat-dialog-content><p>Remove all items and reset the discount? This cannot be undone.</p>
      @if (cart.checkoutLocked()) { <p role="alert">Resolve the pending checkout before clearing your cart.</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button [disabled]="cart.checkoutLocked()" (click)="clear()"><i class="ti ti-trash" aria-hidden="true"></i> Clear cart</button></mat-dialog-actions>`
})
export class ClearCartDialog {
  readonly cart = inject(CartStore);
  private readonly dialog = inject(MatDialogRef<ClearCartDialog>);
  clear() { if (!this.cart.checkoutLocked()) { this.cart.clear(); this.dialog.close(true); } }
}

@Component({
  selector: 'app-clear-cart-button', imports: [MatButton], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button mat-stroked-button aria-label="Clear cart" [disabled]="cart.checkoutLocked() || !cart.lines().length" (click)="open()"><i class="ti ti-trash" aria-hidden="true"></i><span>Clear cart</span></button>`,
  styles: [`:host { display: inline-block; } @media (max-width: 520px) { :host-context(app-cart-summary) span { display: none; } :host-context(app-cart-summary) button { min-width: 2.5rem; padding: 0 .5rem; } }`]
})
export class ClearCartButton {
  readonly cart = inject(CartStore);
  private readonly dialog = inject(MatDialog);
  open() {
    if (!this.cart.lines().length || this.cart.checkoutLocked() || this.dialog.getDialogById('clear-cart')) return;
    this.dialog.open(ClearCartDialog, { id: 'clear-cart', ariaLabelledBy: 'clear-cart-title', width: '26rem', maxWidth: 'calc(100vw - 2rem)', restoreFocus: true });
  }
}
