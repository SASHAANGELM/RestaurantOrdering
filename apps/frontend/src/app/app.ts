import { DatePipe } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, inject, Injector, signal, ElementRef, viewChild } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatToolbar } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { RealtimeSync } from './core/realtime-sync';

@Component({
  selector: 'app-root', imports: [DatePipe, MatButton, MatToolbar, RouterLink, RouterLinkActive, RouterOutlet], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#main-content">Skip to content</a>
    <mat-toolbar class="app-toolbar">
      <button mat-button class="icon-button mobile-only" aria-label="Open navigation" title="Open navigation" aria-haspopup="dialog" (click)="openNavigation()"><i class="ti ti-menu-2" aria-hidden="true"></i></button>
      <a class="brand" title="Restaurant Ordering home" routerLink="/menu" aria-label="Restaurant Ordering home"><span class="brand-mark" aria-hidden="true">R</span><span class="brand-name">Restaurant Ordering</span></a>
      <nav class="desktop-navigation" aria-label="Main navigation">
        <a mat-button routerLink="/menu" routerLinkActive="active" ariaCurrentWhenActive="page"><i class="ti ti-tools-kitchen-2" aria-hidden="true"></i> Menu</a>
        <a mat-button routerLink="/cart" routerLinkActive="active" ariaCurrentWhenActive="page"><i class="ti ti-shopping-cart" aria-hidden="true"></i> Cart</a>
        <a mat-button routerLink="/orders" routerLinkActive="active" ariaCurrentWhenActive="page"><i class="ti ti-receipt" aria-hidden="true"></i> Orders</a>
        <a mat-button routerLink="/setup" routerLinkActive="active" ariaCurrentWhenActive="page"><i class="ti ti-settings" aria-hidden="true"></i> Settings</a>
      </nav>
      <a mat-button class="icon-button mobile-only header-cart" routerLink="/cart" aria-label="Cart" title="Cart"><i class="ti ti-shopping-cart" aria-hidden="true"></i></a>
    </mat-toolbar>
    <dialog #navigationDrawer class="navigation-drawer" tabindex="-1" (keydown.escape)="closeNavigation()" aria-labelledby="drawer-title" (click)="closeBackdrop($event)">
      <div class="drawer-heading"><a class="brand" routerLink="/menu" (click)="closeNavigation()"><span class="brand-mark" aria-hidden="true">R</span><span id="drawer-title">Restaurant Ordering</span></a><button mat-button class="icon-button" aria-label="Close navigation" title="Close navigation" (click)="closeNavigation()"><i class="ti ti-x" aria-hidden="true"></i></button></div>
      <nav aria-label="Mobile navigation">
        <a mat-button routerLink="/menu" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="closeNavigation()"><i class="ti ti-tools-kitchen-2" aria-hidden="true"></i> Menu</a>
        <a mat-button routerLink="/cart" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="closeNavigation()"><i class="ti ti-shopping-cart" aria-hidden="true"></i> Cart</a>
        <a mat-button routerLink="/orders" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="closeNavigation()"><i class="ti ti-receipt" aria-hidden="true"></i> Orders</a>
        <a mat-button routerLink="/setup" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="closeNavigation()"><i class="ti ti-settings" aria-hidden="true"></i> Settings</a>
      </nav>
    </dialog>
    <button class="connection-indicator" [class.connected]="sync.connectionState() === 'connected'" [class.connecting]="sync.connectionState() === 'connecting'" (click)="showConnection()" aria-haspopup="dialog" aria-label="Connection details" [title]="connectionLabel()">
      <span class="sr-only">{{ connectionLabel() }}</span>
    </button>
    <main id="main-content" tabindex="-1"><router-outlet (activate)="focusContent()" /></main>
    <div class="sync-banner" role="status" aria-live="polite">
      @if (sync.lastChecked(); as updated) { <span>Last checked <time [attr.datetime]="checkedTimestamp(updated)">{{ updated | date:'medium' }}</time>.</span> }
      @if (dialogError()) { {{ dialogError() }} }
      @else if (sync.connectionState() === 'disconnected') { Offline. Displayed content is retained; waiting to reconnect. }
      @else if (sync.syncing() || sync.waitingForMenu()) { Checking for menu updates… }
      @else if (sync.connectionState() === 'connecting') { Waiting for live updates… }
      @else if (sync.error()) { Update check failed. Open connection details to retry. }
      @else if (!sync.lastChecked()) { Waiting for the first backend check. }
    </div>
  `,
  styles: `
    .app-toolbar { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 1rem; padding: 1rem max(1.25rem, calc((100vw - 90rem) / 2)); min-height: 5rem; height: auto; background: white; border-bottom: 1px solid #d7e2e9; }
    .brand { display: flex; align-items: center; gap: .65rem; text-decoration: none; color: inherit; font-size: 1.05rem; font-weight: 650; white-space: normal; line-height: 1.3; }
    .brand-mark { display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: .5rem; background: #2c6c93; color: white; font-family: Georgia, serif; }
    nav { display: flex; gap: .35rem; flex-wrap: wrap; } nav .active { background: #e3eff7; color: #2c6c93; }
    .sync-banner { max-width: 90rem; min-height: 3rem; margin: auto; padding: .75rem 1.25rem; color: #526775; font-size: .8rem; } .sync-banner span { margin-right: .4rem; }
    main { max-width: 90rem; min-height: 60vh; padding: 2rem 1.25rem 4rem; margin: auto; }
    .connection-indicator { position: fixed; right: 16px; bottom: 16px; z-index: 30; width: 16px; height: 16px; padding: 0; border: 0; border-radius: 50%; background: #a63329; color: white; cursor: pointer; display: grid; place-items: center; }
    .connection-indicator.connected { background: #e77923; animation: connection-pulse 2s ease-out infinite; }
    @keyframes connection-pulse { 0% { box-shadow: 0 0 0 0 #e7792360; } 100% { box-shadow: 0 0 0 9px #e7792300; } } .connection-indicator.connecting { background: #976222; }
    .skip-link { position: absolute; left: 1rem; top: -5rem; padding: 1rem; z-index: 100; background: white; } .skip-link:focus { top: .5rem; }
    .mobile-only { display: none; }
    .navigation-drawer { position: fixed; inset: 0 auto 0 0; margin: 0; height: 100dvh; max-height: none; width: min(22rem, 90vw); max-width: none; padding: 1.25rem; border: 0; background: white; color: #20303c; box-shadow: 4px 0 30px #0002; }
    .navigation-drawer::backdrop { background: #0007; } .drawer-heading { display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin-bottom: 2rem; } .drawer-heading .brand { font-size: .95rem; }
    .navigation-drawer nav { display: flex; flex-direction: column; gap: .5rem; } .navigation-drawer nav a { width: 100%; justify-content: flex-start; min-height: 3rem; }
    @media (max-width: 650px) { .app-toolbar { padding: .65rem .75rem; gap: .5rem; flex-wrap: nowrap; min-height: 4rem; justify-content: flex-start; } .mobile-only { display: inline-flex; } .desktop-navigation, .brand-name { display: none; } .header-cart { margin-left: auto; } }

  `
})
export class App {
  private readonly navigationDrawer = viewChild<ElementRef<HTMLDialogElement>>('navigationDrawer');
  openNavigation() { this.navigationDrawer()?.nativeElement.showModal(); }
  closeNavigation() { this.navigationDrawer()?.nativeElement.close(); }
  closeBackdrop(event: MouseEvent) { if (event.target === this.navigationDrawer()?.nativeElement) { const bounds = this.navigationDrawer()!.nativeElement.getBoundingClientRect(); if (event.clientX > bounds.right || event.clientX < bounds.left) this.closeNavigation(); } }
  readonly sync = inject(RealtimeSync);
  readonly dialogError = signal<string | null>(null);
  private readonly injector = inject(Injector);
  checkedTimestamp(value: number) { return new Date(value).toISOString(); }
  connectionLabel() { return this.sync.connectionState() === 'connected' ? 'Connected' : this.sync.connectionState() === 'connecting' ? 'Connecting' : 'Offline'; }
  async showConnection() {
    this.dialogError.set(null);
    try { const { openConnectionDialog } = await import('./shared/connection-dialog'); openConnectionDialog(this.injector); }
    catch { this.dialogError.set('Connection details could not load. Please try again when connected.'); }
  }
  focusContent() { afterNextRender(() => document.querySelector<HTMLElement>('main h1')?.focus(), { injector: this.injector }); }
}
