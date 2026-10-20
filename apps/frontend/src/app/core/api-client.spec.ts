import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { ApiClient, clientError } from './api-client';

const id = '11111111-1111-4111-8111-111111111111';

describe('HTTP client boundary', () => {
  let api: ApiClient;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ApiClient);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); vi.useRealTimers(); });

  it('encodes bounded query values at the frontend origin', async () => {
    const result = firstValueFrom(api.orders({ page: 2, pageSize: 25, status: 'ready' }));
    const request = http.expectOne((request) => request.url === '/api/orders');
    expect(request.request.params.get('status')).toBe('ready');
    expect(request.request.params.get('pageSize')).toBe('25');
    request.flush({ orders: [], page: 2, pageSize: 25, total: 0, ordersRevision: 3 });
    expect(await result).toMatchObject({ ordersRevision: 3 });
  });

  it('validates responses before exposing them to stores', async () => {
    const result = firstValueFrom(api.sync());
    const rejected = expect(result).rejects.toMatchObject({ kind: 'invalid-response' });
    http.expectOne('/api/sync').flush({ menuRevision: -1, ordersRevision: 0 });
    await rejected;
  });

  it('omits optional cleared filters rather than serializing undefined query values', async () => {
    const result = firstValueFrom(api.orders({ page: 1, pageSize: 10, status: undefined, itemId: undefined }));
    const request = http.expectOne('/api/orders?page=1&pageSize=10');
    expect(request.request.params.has('status')).toBe(false);
    expect(request.request.params.has('itemId')).toBe(false);
    request.flush({ orders: [], page: 1, pageSize: 10, total: 0, ordersRevision: 0 });
    await result;
  });

  it('preserves typed conflict details and the request reference', async () => {
    const result = firstValueFrom(api.updateOrderStatus(id, { status: 'ready', expectedRevision: 1 }));
    const rejected = expect(result).rejects.toMatchObject({ status: 409, kind: 'api', body: {
      code: 'REVISION_CONFLICT', requestId: id, details: { currentRevision: 2 }
    } });
    http.expectOne(`/api/orders/${id}/status`).flush({ error: {
      code: 'REVISION_CONFLICT', message: 'Refresh this order.', requestId: id,
      details: { entityType: 'order', entityId: id, expectedRevision: 1, currentRevision: 2 }
    } }, { status: 409, statusText: 'Conflict' });
    await rejected;
  });

  it('keeps the frozen confirmation payload/key and never retries mutations automatically', async () => {
    const result = firstValueFrom(api.confirm({ quoteId: id }, id));
    const rejected = expect(result).rejects.toMatchObject({ kind: 'network', status: 0 });
    const request = http.expectOne('/api/orders');
    expect(request.request.body).toEqual({ quoteId: id });
    expect(request.request.headers.get('Idempotency-Key')).toBe(id);
    request.error(new ProgressEvent('error'));
    await rejected;
    http.expectNone('/api/orders');
  });

  it('cancels HTTP when unsubscribed and times out hanging requests', async () => {
    const cancelled = api.catalog().subscribe();
    const request = http.expectOne('/api/menu/catalog');
    cancelled.unsubscribe();
    expect(request.cancelled).toBe(true);
    vi.useFakeTimers();
    const result = firstValueFrom(api.sync());
    const rejected = expect(result).rejects.toMatchObject({ kind: 'network' });
    const hanging = http.expectOne('/api/sync');
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    expect(hanging.cancelled).toBe(true);
  });

  it('rejects malformed requests without sending HTTP', async () => {
    await expect(firstValueFrom(api.order('invalid'))).rejects.toMatchObject({ kind: 'invalid-request' });
    await expect(firstValueFrom(api.orders({ page: 1, pageSize: 101 }))).rejects.toMatchObject({ kind: 'invalid-request' });
    http.expectNone(() => true);
  });

  it('does not expose unvalidated HTML/internal server error text', async () => {
    const result = firstValueFrom(api.sync());
    const rejected = expect(result).rejects.toMatchObject({ message: 'The server could not complete this request. Try again.' });
    http.expectOne('/api/sync').flush('secret stack trace', { status: 500, statusText: 'Error' });
    await rejected;
    expect(clientError(new Error('secret')).message).not.toContain('secret');
  });
});
