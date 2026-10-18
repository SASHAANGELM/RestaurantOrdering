import { computed, DestroyRef, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { io, type Socket } from 'socket.io-client';
import { type Subscription } from 'rxjs';
import {
  menuChangedSchema, ordersChangedSchema, syncStateSchema,
  type ClientToServerEvents, type ServerToClientEvents, type SyncState
} from '@restaurant-ordering/contracts';
import { ApiClient, clientError, ClientError } from './api-client';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export const SOCKET_FACTORY = new InjectionToken<() => AppSocket>('Socket factory', {
  providedIn: 'root', factory: () => () => io({ autoConnect: false, path: '/socket.io' })
});

/** Application lifetime only: routes never own sockets or browser listeners. */
@Injectable({ providedIn: 'root' })
export class RealtimeSync {
  private readonly api = inject(ApiClient);
  private readonly socket = inject(SOCKET_FACTORY)();
  private readonly revisions = signal<SyncState>({ menuRevision: 0, ordersRevision: 0 });
  readonly highest = this.revisions.asReadonly();
  private readonly connection = signal<'connecting' | 'connected' | 'disconnected'>('connecting');
  private readonly online = signal(navigator.onLine);
  readonly connectionState = computed(() => !this.online() || this.failure()?.kind === 'network' ? 'disconnected' : this.connection());
  private readonly menuModified = signal<string | null>(null);
  readonly menuUpdatedAt = this.menuModified.asReadonly();
  private readonly menuWaiting = signal(false);
  private readonly menuReads = new Set<symbol>();
  private readonly menuReadCount = signal(0);
  readonly waitingForMenu = computed(() => this.menuWaiting() || this.menuReadCount() > 0);
  beginMenuRead(token: symbol) { this.menuReads.add(token); this.menuReadCount.set(this.menuReads.size); }
  endMenuRead(token: symbol) { this.menuReads.delete(token); this.menuReadCount.set(this.menuReads.size); }
  private readonly checking = signal(false);
  readonly syncing = this.checking.asReadonly();
  private readonly failure = signal<ClientError | null>(null);
  readonly error = this.failure.asReadonly();
  private readonly checked = signal<number | null>(null);
  readonly lastChecked = this.checked.asReadonly();
  private readonly checks = signal(0);
  readonly successfulChecks = this.checks.asReadonly();
  private pending?: Subscription;

  observe(state: Partial<SyncState>) {
    if ((state.menuRevision ?? -1) > this.revisions().menuRevision && state.menuUpdatedAt === undefined) this.menuWaiting.set(true);
    if (state.menuUpdatedAt !== undefined && (state.menuRevision ?? -1) >= this.revisions().menuRevision) { this.menuModified.set(state.menuUpdatedAt); this.menuWaiting.set(false); }
    this.revisions.update((current) => {
      const next = {
        menuRevision: Math.max(current.menuRevision, state.menuRevision ?? 0),
        ordersRevision: Math.max(current.ordersRevision, state.ordersRevision ?? 0)
      };
      return next.menuRevision === current.menuRevision && next.ordersRevision === current.ordersRevision ? current : next;
    });
  }

  /** Read only. Reconciliation must never submit a user mutation. */
  check = () => {
    if (!this.online() || !navigator.onLine) { this.wentOffline(); return; }
    if (this.checking()) return;
    this.checking.set(true);
    this.pending = this.api.sync().subscribe({
      next: (state) => { this.observe(state); this.failure.set(null); this.checked.set(Date.now()); this.checks.update((value) => value + 1); },
      error: (error: unknown) => { this.failure.set(clientError(error)); this.checking.set(false); },
      complete: () => this.checking.set(false)
    });
  };

  private readonly wentOffline = () => {
    this.online.set(false); this.connection.set('disconnected');
    this.pending?.unsubscribe(); this.checking.set(false);
    this.failure.set(new ClientError('Offline. Displayed content is retained.', 'network'));
    this.socket.disconnect();
  };
  private readonly wentOnline = () => { this.online.set(true); this.failure.set(null); this.connection.set('connecting'); this.socket.connect(); this.check(); };

  constructor() {
    const connected = () => { if (this.online()) { this.connection.set('connected'); this.check(); } };
    const disconnected = () => this.connection.set('disconnected');
    const sync = (payload: unknown) => {
      const result = syncStateSchema.safeParse(payload);
      if (result.success) this.observe(result.data);
      else this.check();
    };
    const menu = (payload: unknown) => {
      const result = menuChangedSchema.safeParse(payload);
      if (result.success) this.observe({ menuRevision: result.data.menuRevision });
      else this.check();
    };
    const orders = (payload: unknown) => {
      const result = ordersChangedSchema.safeParse(payload);
      if (result.success) this.observe({ ordersRevision: result.data.ordersRevision });
      else this.check();
    };
    this.socket.on('connect', connected);
    this.socket.on('disconnect', disconnected);
    this.socket.on('connect_error', disconnected);
    this.socket.on('sync.state', sync);
    this.socket.on('menu.changed', menu);
    this.socket.on('orders.changed', orders);
    window.addEventListener('focus', this.check);
    window.addEventListener('offline', this.wentOffline);
    window.addEventListener('online', this.wentOnline);
    const timer = window.setInterval(this.check, 15_000);
    inject(DestroyRef).onDestroy(() => {
      window.clearInterval(timer);
      window.removeEventListener('focus', this.check);
      window.removeEventListener('offline', this.wentOffline);
      window.removeEventListener('online', this.wentOnline);
      this.pending?.unsubscribe();
      this.socket.off('connect', connected);
      this.socket.off('disconnect', disconnected);
      this.socket.off('connect_error', disconnected);
      this.socket.off('sync.state', sync);
      this.socket.off('menu.changed', menu);
      this.socket.off('orders.changed', orders);
      this.socket.disconnect();
    });
    if (this.online()) this.socket.connect();
    else this.wentOffline();
    this.check();
  }
}
