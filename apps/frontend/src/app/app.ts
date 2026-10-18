import { DatePipe } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, inject, Injector, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatToolbar } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { RealtimeSync } from './core/realtime-sync';

@Component({
  selector: 'app-root', imports: [DatePipe, MatButton, MatToolbar, RouterLink, RouterLinkActive, RouterOutlet], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#main-content">Skip to content</a>
    <mat-toolbar class="app-toolbar">
      <a class="brand" routerLink="/menu" aria-label="Restaurant Ordering home"><span class="brand-mark" aria-hidden="true">R</span> Restaurant Ordering</a>
      <nav aria-label="Main navigation">
        <a mat-button routerLink="/menu" routerLinkActive="active" ariaCurrentWhenActive="page"><i class="ti ti-tools-kitchen-2" aria-hidden="true"></i> Menu</a>
        <a mat-button routerLink="/cart" routerLinkActive="active" ariaCurrentWhenActive="page"><i class="ti ti-shopping-cart" aria-hidden="true"></i> Cart</a>
        <a mat-button routerLink="/setup" routerLinkActive="active" ariaCurrentWhenActive="page"><i class="ti ti-settings" aria-hidden="true"></i> Setup</a>
        <a mat-button routerLink="/orders" routerLinkActive="active" ariaCurrentWhenActive="page"><i class="ti ti-receipt" aria-hidden="true"></i> Orders</a>
      </nav>
    </mat-toolbar>
    <button class="connection-indicator" [class.connected]="sync.connectionState() === 'connected'" [class.connecting]="sync.connectionState() === 'connecting'" (click)="showConnection()" aria-haspopup="dialog" aria-label="Connection details" [title]="connectionLabel()">
      <i [class]="'ti ' + (sync.connectionState() === 'connected' ? 'ti-wifi' : 'ti-wifi-off')" aria-hidden="true"></i><span class="sr-only">{{ connectionLabel() }}</span>
    </button>
    <div class="sync-banner" role="status" aria-live="polite">
      @if (sync.menuUpdatedAt(); as updated) { <span>Menu updated <time [attr.datetime]="updated">{{ updated | date:'medium' }}</time>.</span> }
      @if (dialogError()) { {{ dialogError() }} }
      @else if (sync.connectionState() === 'disconnected') { Offline. Displayed content is retained; waiting to reconnect. }
      @else if (sync.syncing() || sync.waitingForMenu()) { Checking for menu updates… }
      @else if (sync.connectionState() === 'connecting') { Waiting for live updates… }
      @else if (sync.error()) { Update check failed. Open connection details to retry. }
      @else if (!sync.menuUpdatedAt()) { Menu loaded. Waiting for the first menu update. }
    </div>
    <main id="main-content" tabindex="-1"><router-outlet (activate)="focusContent()" /></main>
    <footer>Restaurant Ordering <span>Made for a smooth service.</span></footer>
  `,
  styles: `
    .app-toolbar { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 1rem; padding: 1rem max(1.25rem, calc((100vw - 90rem) / 2)); min-height: 5rem; height: auto; background: white; border-bottom: 1px solid #d7e2e9; }
    .brand { display: flex; align-items: center; gap: .65rem; text-decoration: none; color: inherit; font-size: 1.05rem; font-weight: 650; white-space: normal; line-height: 1.3; }
    .brand-mark { display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: .5rem; background: #2c6c93; color: white; font-family: Georgia, serif; }
    nav { display: flex; gap: .35rem; flex-wrap: wrap; } nav .active { background: #e3eff7; color: #2c6c93; }
    .sync-banner { max-width: 90rem; min-height: 3rem; margin: auto; padding: .75rem 1.25rem; color: #526775; font-size: .8rem; } .sync-banner span { margin-right: .4rem; }
    main { max-width: 90rem; min-height: 60vh; padding: 2rem 1.25rem 4rem; margin: auto; }
    footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem; padding: 1.5rem; border-top: 1px solid #d7e2e9; color: #526775; font-size: .8rem; }
    .connection-indicator { position: fixed; left: 8px; bottom: 12px; z-index: 30; width: 16px; height: 16px; padding: 0; border: 0; border-radius: 3px; background: #a63329; color: white; cursor: pointer; display: grid; place-items: center; }
    .connection-indicator .ti { font-size: 14px; margin: 0; } .connection-indicator.connected { background: #28723d; } .connection-indicator.connecting { background: #976222; }
    .skip-link { position: absolute; left: 1rem; top: -5rem; padding: 1rem; z-index: 100; background: white; } .skip-link:focus { top: .5rem; }
    @media (max-width: 600px) { .sync-banner { min-height: 4.5rem; } .app-toolbar { padding: .85rem 1rem; gap: .75rem; } .brand { font-size: .95rem; } nav { width: 100%; justify-content: space-between; gap: 0; } }
  `
})
export class App {
  readonly sync = inject(RealtimeSync);
  readonly dialogError = signal<string | null>(null);
  private readonly injector = inject(Injector);
  connectionLabel() { return this.sync.connectionState() === 'connected' ? 'Connected' : this.sync.connectionState() === 'connecting' ? 'Connecting' : 'Offline'; }
  async showConnection() {
    this.dialogError.set(null);
    try { const { openConnectionDialog } = await import('./shared/connection-dialog'); openConnectionDialog(this.injector); }
    catch { this.dialogError.set('Connection details could not load. Please try again when connected.'); }
  }
  focusContent() { afterNextRender(() => document.querySelector<HTMLElement>('main h1')?.focus(), { injector: this.injector }); }
}
