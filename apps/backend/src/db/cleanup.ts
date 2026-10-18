import { sql } from 'drizzle-orm';
import { timestampSchema } from '@restaurant-ordering/contracts';
import type { DatabaseConnection } from './connection';

/** Keep consumed quotes for order recovery, even after their review expiry. */
export function cleanupExpiredQuotes(connection: DatabaseConnection, now = new Date().toISOString()): number {
  const cutoff = new Date(timestampSchema.parse(now)).toISOString();
  return connection.db.run(sql`
    DELETE FROM checkout_quotes
    WHERE expires_at <= ${cutoff}
      AND NOT EXISTS (SELECT 1 FROM orders WHERE orders.quote_id = checkout_quotes.id)
  `).changes;
}
