import { createServer, type Server } from 'node:http';
import type { Socket } from 'node:net';
import { createApp, type AppOptions } from './app';
import type { BackendConfig } from './config/config';
import type { DatabaseConnection } from './db/connection';
import { initializeDatabase } from './db/initialize';
import { attachRealtime } from './modules/realtime/server';

// Additional lifecycle hooks support transport failure/drain tests.
export interface SocketLifecycle {
  close: () => Promise<void>;
  forceClose: () => void;
}

export interface ServerOptions {
  migrationsFolder?: string;
  registerRoutes?: AppOptions['registerRoutes'];
  reportError?: AppOptions['reportError'];
  attachSockets?: (server: Server) => SocketLifecycle;
}

export async function startServer(config: BackendConfig, options: ServerOptions = {}) {
  let connection: DatabaseConnection;
  try {
    connection = initializeDatabase({
      filename: config.databasePath, seedMode: config.seedMode, migrationsFolder: options.migrationsFolder
    });
  } catch (error) {
    throw new Error('Backend database initialization failed; HTTP listener was not started.', { cause: error });
  }

  let stopping = false;
  let app: ReturnType<typeof createApp>;
  let server: Server;
  let realtime: ReturnType<typeof attachRealtime> | undefined;
  try {
    app = createApp({
      connection, jsonBodyLimitBytes: config.jsonBodyLimitBytes, isShuttingDown: () => stopping,
      registerRoutes: options.registerRoutes, reportError: options.reportError,
      notifications: {
        menuChanged: (notification) => realtime?.menuChanged(notification),
        ordersChanged: (notification) => realtime?.ordersChanged(notification)
      }
    });
    server = createServer(app);
  } catch (error) {
    connection.close();
    throw new Error('Backend app construction failed.', { cause: error });
  }
  const connections = new Set<Socket>();
  server.on('connection', (socket) => {
    connections.add(socket);
    socket.once('close', () => connections.delete(socket));
  });
  let sockets: SocketLifecycle | undefined;
  let shutdownPromise: Promise<void> | undefined;

  function shutdown(): Promise<void> {
    if (shutdownPromise) return shutdownPromise;
    stopping = true;
    shutdownPromise = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const httpClosed = new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error && (!('code' in error) || error.code !== 'ERR_SERVER_NOT_RUNNING')) reject(error);
            else resolve();
          });
        });
        const socketsClosed = Promise.resolve().then(() => Promise.all([realtime?.close(), sockets?.close()]));
        const deadline = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Backend shutdown exceeded SHUTDOWN_TIMEOUT_MS.')), config.shutdownTimeoutMs);
        });
        await Promise.race([Promise.all([httpClosed, socketsClosed]), deadline]);
      } catch (error) {
        try { realtime?.forceClose(); sockets?.forceClose(); }
        finally {
          // closeAllConnections excludes upgraded sockets; track and destroy those too.
          server.closeAllConnections();
          for (const socket of connections) socket.destroy();
        }
        throw error;
      } finally {
        clearTimeout(timer);
        connection.close();
      }
    })();
    return shutdownPromise;
  }

  try {
    realtime = attachRealtime(server, connection, config.socketRecoveryMs, () => stopping);
    sockets = options.attachSockets?.(server);
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => { reject(error); };
      server.once('error', onError);
      server.listen(config.port, config.host, () => {
        server.removeListener('error', onError);
        resolve();
      });
    });
  } catch (error) {
    await shutdown();
    throw new Error('Backend HTTP startup failed.', { cause: error });
  }
  return { app, server, connection, realtime, shutdown, isShuttingDown: () => stopping };
}
