import { describe, expect, it } from 'vitest';
import { apiErrorSchema, confirmOrderSchema, type ApiErrorDetails } from '@restaurant-ordering/contracts';

describe('server contract boundary', () => {
  it('rejects client totals and serializes typed quote recovery details', () => {
    const quoteId = '11111111-1111-4111-8111-111111111111';
    expect(confirmOrderSchema.parse({ quoteId })).toEqual({ quoteId });
    expect(confirmOrderSchema.safeParse({ quoteId, totalMinor: 1 }).success).toBe(false);
    const details: ApiErrorDetails<'QUOTE_USED'> = { quoteId, orderId: '22222222-2222-4222-8222-222222222222' };
    const payload = { error: { code: 'QUOTE_USED', message: 'This quote already created an order.', requestId: quoteId, details } };
    expect(apiErrorSchema.parse(JSON.parse(JSON.stringify(payload)))).toEqual(payload);
  });
});
