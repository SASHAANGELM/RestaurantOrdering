import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, MenuChanged, OrdersChanged, ServerToClientEvents } from '@restaurant-ordering/contracts';
import type { DatabaseConnection } from '../../db/connection';
import { readSyncState } from './sync';

export interface Notifications {
  menuChanged: (notification: MenuChanged) => void;
  ordersChanged: (notification: OrdersChanged) => void;
}

export function attachRealtime(server: HttpServer, connection: DatabaseConnection,
  recoveryMs: number, isShuttingDown: () => boolean) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
    path: '/socket.io',
    serveClient: false,
    transports: ['polling', 'websocket'],
    allowRequest: (_request, callback) => callback(null, !isShuttingDown()),
    connectionStateRecovery: recoveryMs === 0 ? undefined : {
      maxDisconnectionDuration: recoveryMs, skipMiddlewares: false
    }
  });
  io.use((_socket, next) => next(isShuttingDown() ? new Error('Service temporarily unavailable.') : undefined));
  io.on('connection', (socket) => {
    try {
      // Always send persisted state, even when in-memory packet recovery succeeds.
      socket.emit('sync.state', readSyncState(connection));
    } catch (error) {
      console.error({ event: 'sync.failed', error });
      socket.disconnect(true);
    }
  });
  // No client domain-event handlers: all writes go through validated HTTP routes.
  return {
    menuChanged(notification: MenuChanged) { io.emit('menu.changed', notification); },
    ordersChanged(notification: OrdersChanged) { io.emit('orders.changed', notification); },
    close: () => new Promise<void>((resolve, reject) => {
      void io.close((error?: NodeJS.ErrnoException) => {
        // The lifecycle also closes HTTP to stop intake before draining work.
        if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
        else resolve();
      }).catch(reject);
    }),
    forceClose() { io.disconnectSockets(true); io.engine.close(); }
  };
}
