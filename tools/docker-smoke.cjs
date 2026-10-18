const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

// A unique Compose project owns its network, random loopback port, and disposable
// named volume. Never attach to the default stack or a development database.
const project = `restaurant-smoke-${randomUUID().slice(0, 8)}`;
const environment = { ...process.env, FRONTEND_PORT: '127.0.0.1:', SEED_MODE: 'small' };
const composeArgs = ['compose', '--project-name', project, '--file', 'compose.yaml'];
function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: resolve(__dirname, '..'), env: environment,
    stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8', timeout: 900_000
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr ?? result.status}`);
  return result.stdout?.trim();
}
function compose(args, capture = false) { return run('docker', [...composeArgs, ...args], capture); }

try {
  assert.deepEqual(compose(['config', '--services'], true).split(/\s+/).sort(), ['backend', 'frontend']);
  compose(['up', '--build', '--detach', '--wait', '--wait-timeout', '120']);
  const address = compose(['port', 'frontend', '8080'], true);
  assert.match(address, /^127\.0\.0\.1:\d+$/);
  environment.DOCKER_SMOKE_URL = `http://${address}`;
  environment.DOCKER_SMOKE_PROJECT = project;
  run('pnpm', ['exec', 'playwright', 'test', '--config', 'apps/frontend-e2e/playwright.docker.config.ts']);
} catch (error) {
  process.exitCode = 1;
  console.error(error);
  try { compose(['logs', '--no-color', '--tail', '100']); } catch (logsError) { console.error(logsError); }
} finally {
  try { compose(['down', '--volumes', '--rmi', 'all', '--remove-orphans', '--timeout', '15']); }
  catch (error) { process.exitCode = 1; console.error(error); }
}
