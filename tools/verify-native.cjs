const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

// In-memory only: this command never creates or changes a development database.
const database = new Database(':memory:');
try {
  database.exec('CREATE TABLE compatibility_probe (value INTEGER NOT NULL) STRICT');
  database.prepare('INSERT INTO compatibility_probe (value) VALUES (?)').run(42);
  assert.equal(database.prepare('SELECT value FROM compatibility_probe').get().value, 42);
  console.info(JSON.stringify({
    node: process.version,
    abi: process.versions.modules,
    platform: process.platform,
    arch: process.arch,
    driver: require('better-sqlite3/package.json').version,
    sqlite: database.prepare('SELECT sqlite_version() AS version').get().version,
    result: 'passed'
  }, null, 2));
} finally {
  database.close();
}
