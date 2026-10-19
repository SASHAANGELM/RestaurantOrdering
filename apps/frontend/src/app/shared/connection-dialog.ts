import { BusyButton } from './busy-button';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, type Injector } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { RealtimeSync } from '../core/realtime-sync';

@Component({
  selector: 'app-connection-dialog',
  imports: [BusyButton, DatePipe, MatButton, MatDialogModule],
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
      <button [appBusy]="sync.syncing()" mat-button (click)="sync.check()" [disabled]="sync.syncing()"><i class="ti ti-refresh" aria-hidden="true"></i> Check for updates</button>
      <button mat-flat-button mat-dialog-close><i class="ti ti-x" aria-hidden="true"></i> Close</button>
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
