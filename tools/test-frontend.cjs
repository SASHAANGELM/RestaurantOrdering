const { globSync } = require('node:fs');
const { spawnSync } = require('node:child_process');

// Angular's builder rejects empty test suites before Vitest can handle them.
// Run the real Angular/Vitest target as soon as feature specs exist.
const specs = globSync(['apps/frontend/src/**/*.spec.ts', 'apps/frontend/src/**/*.test.ts']);
if (specs.length === 0) {
  console.info('No frontend unit tests yet (T01 scaffold). Feature tests use the Angular/Vitest builder.');
} else {
  const result = spawnSync('pnpm', ['nx', 'run', 'frontend:test-angular'], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
