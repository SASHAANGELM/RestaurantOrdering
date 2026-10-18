import { resolve } from 'node:path';
import { loadConfig } from './config/config';
import { startServer } from './server';

async function main() {
  const config = loadConfig(process.env);
  const runtime = await startServer(config, { migrationsFolder: resolve(__dirname, 'drizzle') });
  const onSignal = () => {
    void runtime.shutdown().catch((error: unknown) => {
      console.error({ event: 'shutdown.failed', error });
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  console.info({ event: 'server.listening', address: runtime.server.address() });
}

void main().catch((error: unknown) => {
  console.error({ event: 'startup.failed', error });
  process.exitCode = 1;
});
