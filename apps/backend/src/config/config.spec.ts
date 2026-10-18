import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('backend configuration', () => {
  it('provides local defaults and ignores unrelated process environment', () => {
    expect(loadConfig({ UNRELATED_SETTING: 'ignored' })).toEqual({
      host: '127.0.0.1', port: 3000, databasePath: 'data/restaurant.sqlite', seedMode: 'small',
      jsonBodyLimitBytes: 65_536, shutdownTimeoutMs: 10_000
    });
  });

  it('parses deployment overrides and IPv6 without touching a database', () => {
    expect(loadConfig({ HOST: '::1', PORT: '8080', DATABASE_PATH: '/data/demo.sqlite', SEED_MODE: 'none',
      JSON_BODY_LIMIT_BYTES: '1024', SHUTDOWN_TIMEOUT_MS: '500' })).toEqual({
      host: '::1', port: 8080, databasePath: '/data/demo.sqlite', seedMode: 'none',
      jsonBodyLimitBytes: 1024, shutdownTimeoutMs: 500
    });
    expect(loadConfig({ HOST: 'backend' }).host).toBe('backend');
    expect(loadConfig({ HOST: '0.0.0.0' }).host).toBe('0.0.0.0');
  });

  it.each([
    ['PORT', '0'], ['PORT', '65536'], ['PORT', '-1'], ['PORT', '1.5'], ['PORT', '3e3'], ['PORT', ''],
    ['HOST', ''], ['HOST', 'http://localhost'], ['HOST', 'bad host'],
    ['DATABASE_PATH', '  '], ['DATABASE_PATH', 'invalid\0path'], ['SEED_MODE', 'reset'],
    ['JSON_BODY_LIMIT_BYTES', '0'], ['JSON_BODY_LIMIT_BYTES', '1048577'],
    ['SHUTDOWN_TIMEOUT_MS', '0'], ['SHUTDOWN_TIMEOUT_MS', '60001']
  ])('rejects invalid %s before startup', (setting, value) => {
    expect(() => loadConfig({ [setting]: value })).toThrow(`Invalid backend configuration: ${setting}:`);
  });
});
