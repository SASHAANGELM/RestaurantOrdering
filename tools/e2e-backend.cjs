const { buildSync } = require('esbuild');
const { resolve } = require('node:path');

// Bundle only the fixture and workspace imports. Native dependencies stay local.
const outfile = resolve('tmp/e2e/backend.cjs');
buildSync({ entryPoints: ['apps/backend/src/testing/e2e-server.ts'], outfile,
  bundle: true, packages: 'external', platform: 'node', format: 'cjs', target: 'node24' });
require(outfile);
