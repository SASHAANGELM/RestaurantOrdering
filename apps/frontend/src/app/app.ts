import { afterNextRender, ChangeDetectionStrategy, Component, inject, Injector, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatToolbar } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { RealtimeSync } from './core/realtime-sync';

@Component({
  selector: 'app-root',
  imports: [MatButton, MatToolbar, RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#main-content">Skip to content</a>
    <mat-toolbar class="app-toolbar">
      <a class="brand" routerLink="/menu" aria-label="Restaurant Ordering home"><span class="brand-mark" aria-hidden="true">R</span> Restaurant Ordering</a>
      <button mat-stroked-button (click)="showConnection()" aria-haspopup="dialog" aria-label="Connection details">
        <span class="connection-dot" [class.offline]="sync.connectionState() !== 'connected'" aria-hidden="true"></span>
        {{ sync.connectionState() === 'connected' ? 'Connected' : sync.connectionState() === 'connecting' ? 'Connecting' : 'Offline' }}
      </button>
    </mat-toolbar>
    <nav aria-label="Main navigation">
      <a mat-button routerLink="/menu" routerLinkActive="active" ariaCurrentWhenActive="page">Menu</a>
      <a mat-button routerLink="/setup" routerLinkActive="active" ariaCurrentWhenActive="page">Setup</a>
      <a mat-button routerLink="/orders" routerLinkActive="active" ariaCurrentWhenActive="page">Orders</a>
    </nav>
    <div class="sync-banner" role="status" aria-live="polite">
      @if (dialogError()) { {{ dialogError() }} }
      @else if (sync.connectionState() !== 'connected') {
        {{ sync.connectionState() === 'connecting' ? 'Connecting to live updates…' : 'Live updates disconnected. Displayed content is retained; reconnecting automatically.' }}
      } @else if (sync.syncing()) { Checking for updates… }
      @else if (sync.error()) { Update check failed. Open connection details to retry. }
      @else { Live updates connected. }
    </div>
    <main id="main-content" tabindex="-1"><router-outlet (activate)="focusContent()" /></main>
    <footer>Restaurant Ordering <span>Made for a smooth service.</span></footer>
  `,
  styles: `
    .app-toolbar { display: flex; justify-content: space-between; gap: 1rem; padding: 1rem max(1.25rem, calc((100vw - 72rem) / 2)); min-height: 5rem; height: auto; background: white; border-bottom: 1px solid #dce3db; }
    .brand { display: flex; align-items: center; gap: .65rem; text-decoration: none; color: inherit; font-size: 1.05rem; font-weight: 650; white-space: normal; line-height: 1.3; }
    .brand-mark { display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: .5rem; background: #23523c; color: white; font-family: Georgia, serif; }
    nav { display: flex; gap: .5rem; max-width: 72rem; margin: auto; padding: 1rem 1.25rem .5rem; }
    nav .active { background: #dcebdd; color: #163c28; }
    .sync-banner { max-width: 72rem; min-height: 3rem; margin: auto; padding: .75rem 1.25rem; color: #4b6052; font-size: .85rem; }
    main { max-width: 72rem; min-height: 60vh; padding: 2rem 1.25rem 4rem; margin: auto; }
    footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem; padding: 1.5rem; border-top: 1px solid #dce3db; color: #526256; font-size: .8rem; }
    .connection-dot { display: inline-block; width: .5rem; height: .5rem; margin-right: .3rem; border-radius: 50%; background: #28723d; }
    .connection-dot.offline { background: #976222; }
    .skip-link { position: absolute; left: 1rem; top: -5rem; padding: 1rem; z-index: 100; background: white; }
    .skip-link:focus { top: .5rem; }
    @media (max-width: 480px) { .app-toolbar { padding: 1rem; } .brand { max-width: 12rem; font-size: .9rem; } }
  `
})
export class App {
  readonly sync = inject(RealtimeSync);
  readonly dialogError = signal<string | null>(null);
  private readonly injector = inject(Injector);
  async showConnection() {
    this.dialogError.set(null);
    try {
      const { openConnectionDialog } = await import('./shared/connection-dialog');
      openConnectionDialog(this.injector);
    } catch {
      this.dialogError.set('Connection details could not load. Please try again when connected.');
    }
  }
  focusContent() {
    afterNextRender(() => document.querySelector<HTMLElement>('main h1')?.focus(), { injector: this.injector });
  }
}
