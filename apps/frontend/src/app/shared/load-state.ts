import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { type ClientError } from '../core/api-client';

@Component({
  selector: 'app-load-state',
  imports: [MatButton, MatProgressBarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <mat-progress-bar mode="indeterminate" aria-label="Refreshing content" />
      <p role="status">Refreshing content…</p>
    }
    @if (stale()) { <p role="status">Showing saved content. Updates are pending.</p> }
    @if (error(); as failure) {
      <div role="alert" class="error-panel">
        <p>{{ failure.message }}</p>
        @if (failure.body; as body) { <p class="muted">Reference: {{ body.requestId }}</p> }
        <button mat-stroked-button (click)="retry.emit()">Try again</button>
      </div>
    }
  `
})
export class LoadState {
  readonly loading = input(false);
  readonly stale = input(false);
  readonly error = input<ClientError | null>(null);
  readonly retry = output<void>();
}
