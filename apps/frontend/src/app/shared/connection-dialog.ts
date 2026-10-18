import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, type Injector } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { RealtimeSync } from '../core/realtime-sync';

@Component({
  selector: 'app-connection-dialog',
  imports: [DatePipe, MatButton, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title id="connection-title">Connection details</h2>
    <mat-dialog-content>
      <p>Live updates: {{ sync.connectionState() }}.</p>
      <p>Updates are checked on reconnect, when this window receives focus, and every 15 seconds.</p>
      <p>Your displayed content stays available during a disconnection.</p>
      @if (sync.lastChecked(); as checked) { <p>Last successful check: {{ checked | date:'mediumTime' }}</p> }
      <p role="status">{{ sync.syncing() ? 'Checking for updates…' : sync.error()?.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="sync.check()" [disabled]="sync.syncing()">Check for updates</button>
      <button mat-flat-button mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `
})
export class ConnectionDialog { readonly sync = inject(RealtimeSync); }

export function openConnectionDialog(injector: Injector) {
  const dialog = injector.get(MatDialog);
  if (!dialog.getDialogById('connection-details')) {
    dialog.open(ConnectionDialog, { id: 'connection-details', ariaLabelledBy: 'connection-title', width: '28rem',
      autoFocus: 'first-tabbable', restoreFocus: true });
  }
}
