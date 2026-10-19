import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

@Component({
  selector: 'app-confirm-dialog', imports: [MatButton, MatDialogModule], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h2 mat-dialog-title>{{ data.title }}</h2><mat-dialog-content><p>{{ data.message }}</p></mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button [mat-dialog-close]="false" cdkFocusInitial>Cancel</button><button mat-flat-button class="danger-button" [mat-dialog-close]="true">{{ data.action }}</button></mat-dialog-actions>`
})
export class ConfirmDialog {
  readonly data = inject<{ title: string; message: string; action: string }>(MAT_DIALOG_DATA);
}
