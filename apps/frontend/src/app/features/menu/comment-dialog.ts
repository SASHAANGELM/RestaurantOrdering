import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { CartStore } from './cart.store';
import { MatInput } from '@angular/material/input';

@Component({
  selector: 'app-comment-dialog', imports: [ReactiveFormsModule, MatButton, MatDialogModule, MatFormFieldModule, MatInput], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h2 mat-dialog-title>Kitchen comment</h2><mat-dialog-content><mat-form-field appearance="outline"><mat-label>Comment for the kitchen</mat-label><textarea matInput [formControl]="comment" maxlength="500" rows="4" placeholder="For example, no mustard"></textarea><mat-hint>{{ comment.value.length }}/500</mat-hint></mat-form-field></mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button mat-dialog-close>Cancel</button><button mat-flat-button [disabled]="cart.checkoutLocked()" (click)="save()">Save comment</button></mat-dialog-actions>`,
  styles: ['mat-form-field { width: 100%; margin-top: .5rem; }']
})
export class CommentDialog {
  readonly data = inject<{ id: string; comment?: string }>(MAT_DIALOG_DATA);
  readonly cart = inject(CartStore);
  private readonly dialog = inject(MatDialogRef<CommentDialog>);
  save() { if (!this.cart.checkoutLocked()) { this.cart.edit(this.data.id, 'comment', this.comment.value.trim()); this.dialog.close(true); } }
  readonly comment = new FormControl(this.data.comment ?? '', { nonNullable: true });
}
