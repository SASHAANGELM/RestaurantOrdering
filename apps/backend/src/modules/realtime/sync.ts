import { syncStateSchema, type SyncState } from '@restaurant-ordering/contracts';
import type { DatabaseConnection } from '../../db/connection';

// Both streams come from one SQLite snapshot, including across independent writers.
export function readSyncState(connection: DatabaseConnection): SyncState {
  const row = connection.sqlite.prepare(`
    SELECT menu_revision AS menuRevision, orders_revision AS ordersRevision,
      (SELECT max(updated_at) FROM (SELECT updated_at FROM categories UNION ALL SELECT updated_at FROM menu_items)) AS menuUpdatedAt
    FROM app_state WHERE id = 1
  `).get();
  return syncStateSchema.parse(row);
}
