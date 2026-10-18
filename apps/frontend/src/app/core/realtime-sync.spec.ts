import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeSync, SOCKET_FACTORY } from './realtime-sync';
import { FakeSocket } from './testing/fake-socket';

const id = '11111111-1111-4111-8111-111111111111';

describe('application realtime synchronization', () => {
  let socket: FakeSocket;
  let sync: RealtimeSync;
  let http: HttpTestingController;
  beforeEach(() => {
    vi.useFakeTimers();
    socket = new FakeSocket();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: SOCKET_FACTORY, useValue: () => socket }] });
    http = TestBed.inject(HttpTestingController);
    sync = TestBed.inject(RealtimeSync);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); vi.useRealTimers(); vi.restoreAllMocks(); });

  function finish(menuRevision = 0, ordersRevision = 0) {
    http.expectOne('/api/sync').flush({ menuRevision, ordersRevision });
  }

  it('registers one listener per event before connecting and reuses the root instance', () => {
    expect(TestBed.inject(RealtimeSync)).toBe(sync);
    expect(socket.connects).toBe(1);
    expect(socket.listenerCount).toBe(6);
    expect(sync.syncing()).toBe(true);
    finish();
    expect(sync.syncing()).toBe(false);
    socket.receive('connect');
    expect(sync.connectionState()).toBe('connected');
    finish();
    socket.receive('disconnect');
    expect(sync.connectionState()).toBe('disconnected');
  });

  it('tracks only highest revisions, tolerates duplicate/older events and validates payloads', () => {
    finish(2, 3);
    const event = { eventId: id, menuRevision: 5, entityId: id, entityType: 'item', change: 'updated' };
    socket.receive('menu.changed', event);
    const highest = sync.highest();
    socket.receive('menu.changed', event);
    socket.receive('sync.state', { menuRevision: 1, ordersRevision: 1 });
    socket.receive('orders.changed', { eventId: id, ordersRevision: 7, orderId: id, orderRevision: 2, change: 'status-changed' });
    expect(highest).toEqual({ menuRevision: 5, ordersRevision: 3 });
    expect(sync.highest()).toEqual({ menuRevision: 5, ordersRevision: 7 });
    socket.receive('sync.state', { menuRevision: -1 });
    finish(0, 0);
    expect(sync.highest()).toEqual({ menuRevision: 5, ordersRevision: 7 });
  });

  it('checks on reconnect, focus, and exactly the 15-second schedule; coalesces overlapping reads', async () => {
    finish();
    socket.receive('connect');
    window.dispatchEvent(new Event('focus'));
    sync.check();
    finish(1, 0);
    await vi.advanceTimersByTimeAsync(14_999);
    http.expectNone('/api/sync');
    await vi.advanceTimersByTimeAsync(1);
    finish(2, 1);
    window.dispatchEvent(new Event('focus'));
    finish(3, 2);
    socket.receive('disconnect');
    socket.receive('connect');
    finish(4, 3);
    expect(sync.highest()).toEqual({ menuRevision: 4, ordersRevision: 3 });
  });

  it('retains revisions on failures and recovers on a subsequent successful check', () => {
    finish(4, 2);
    sync.check();
    http.expectOne('/api/sync').error(new ProgressEvent('error'));
    expect(sync.error()?.kind).toBe('network');
    expect(sync.highest()).toEqual({ menuRevision: 4, ordersRevision: 2 });
    sync.check();
    finish(5, 3);
    expect(sync.error()).toBeNull();
    expect(sync.lastChecked()).not.toBeNull();
  });

  it('keeps waiting feedback until every outstanding menu resource finishes', () => {
    finish(); const items = Symbol('items'); const categories = Symbol('categories');
    sync.beginMenuRead(items); sync.beginMenuRead(categories);
    sync.observe({ menuRevision: 1, menuUpdatedAt: '2026-10-18T10:00:00.000Z' });
    sync.endMenuRead(categories); expect(sync.waitingForMenu()).toBe(true);
    sync.endMenuRead(items); expect(sync.waitingForMenu()).toBe(false);
  });

  it('reacts immediately to browser offline/online and does not trust a late socket connect', () => {
    finish(1, 0); socket.receive('connect'); finish(1, 0);
    window.dispatchEvent(new Event('offline'));
    expect(sync.connectionState()).toBe('disconnected'); expect(sync.error()?.message).toContain('Offline');
    expect(socket.disconnects).toBe(1); socket.receive('connect');
    expect(sync.connectionState()).toBe('disconnected'); sync.check(); http.expectNone('/api/sync');
    window.dispatchEvent(new Event('online')); expect(sync.connectionState()).toBe('connecting');
    finish(2, 0); socket.receive('connect'); finish(2, 0);
    expect(sync.connectionState()).toBe('connected'); expect(sync.error()).toBeNull();
  });

  it('marks failed sync offline even while the socket is connected, and retains actual menu timestamps', () => {
    finish(1, 0); socket.receive('connect');
    http.expectOne('/api/sync').flush({ menuRevision: 1, ordersRevision: 0, menuUpdatedAt: '2026-10-18T10:00:00.000Z' });
    expect(sync.menuUpdatedAt()).toBe('2026-10-18T10:00:00.000Z');
    sync.check(); http.expectOne('/api/sync').error(new ProgressEvent('error'));
    expect(sync.connectionState()).toBe('disconnected');
    sync.check(); http.expectOne('/api/sync').flush({ menuRevision: 1, ordersRevision: 0, menuUpdatedAt: '2026-10-18T10:00:00.000Z' });
    expect(sync.connectionState()).toBe('connected');
    sync.observe({ menuRevision: 0, menuUpdatedAt: '2026-10-18T09:00:00.000Z' });
    expect(sync.menuUpdatedAt()).toBe('2026-10-18T10:00:00.000Z');
  });

  it('removes every owned listener/timer and cancels HTTP at application teardown', async () => {
    const focusRemoval = vi.spyOn(window, 'removeEventListener');
    const pending = http.expectOne('/api/sync');
    TestBed.resetTestingModule();
    expect(pending.cancelled).toBe(true);
    expect(socket.listenerCount).toBe(0);
    expect(socket.disconnects).toBe(1);
    expect(focusRemoval).toHaveBeenCalledWith('focus', sync.check);
    const requests = vi.spyOn(sync, 'check');
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(requests).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
