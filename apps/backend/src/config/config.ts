import { isIP } from 'node:net';
import { z } from 'zod';
import { DEFAULT_DATABASE_PATH } from '../db/connection';

const integerSetting = (minimum: number, maximum: number, fallback: number) =>
  z.string().regex(/^[0-9]+$/).transform(Number).pipe(z.int().min(minimum).max(maximum)).default(fallback);

const configSchema = z.object({
  HOST: z.string().min(1).max(253).refine((host) => isIP(host) !== 0 ||
    /^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host), 'Expected an IP address or hostname.').default('127.0.0.1'),
  PORT: integerSetting(1, 65_535, 3000),
  DATABASE_PATH: z.string().trim().min(1).refine((path) => !path.includes('\0'), 'Path must not contain NUL.').default(DEFAULT_DATABASE_PATH),
  SEED_MODE: z.enum(['none', 'small', 'large']).default('small'),
  JSON_BODY_LIMIT_BYTES: integerSetting(1, 1_048_576, 65_536),
  SHUTDOWN_TIMEOUT_MS: integerSetting(1, 60_000, 10_000)
});

export function loadConfig(environment: NodeJS.ProcessEnv) {
  const result = configSchema.safeParse(environment);
  if (!result.success) {
    // Report setting names and rules, never their potentially sensitive values.
    throw new Error(`Invalid backend configuration: ${result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  }
  const config = result.data;
  return {
    host: config.HOST, port: config.PORT, databasePath: config.DATABASE_PATH, seedMode: config.SEED_MODE,
    jsonBodyLimitBytes: config.JSON_BODY_LIMIT_BYTES, shutdownTimeoutMs: config.SHUTDOWN_TIMEOUT_MS
  };
}

export type BackendConfig = ReturnType<typeof loadConfig>;
