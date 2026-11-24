#!/usr/bin/env node
// Saves a full copy of the live database into backups/ (never committed).
// The free Supabase plan has no automatic backups. Usage: npm run backup
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { DATABASE_DIR, isLocalDatabase, loadEnv, requireEnv } from './lib.js';

loadEnv();
const url = requireEnv(process.argv.includes('--local') ? 'DATABASE_URL' : 'PRODUCTION_DATABASE_URL');
const { hostname, port, username, password, pathname } = new URL(url);
const dir = path.resolve(DATABASE_DIR, '..', 'backups');
mkdirSync(dir, { recursive: true, mode: 0o700 });
const file = path.join(dir, `bari-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}.dump`);

// Connection details go through the environment so the password never shows in the process list.
const result = spawnSync('pg_dump', ['--format=custom', '--schema=public', '--no-owner', '--no-privileges', `--file=${file}`], {
  stdio: ['ignore', 'inherit', 'inherit'],
  env: {
    ...process.env, PGHOST: hostname, PGPORT: port || '5432', PGUSER: decodeURIComponent(username), PGPASSWORD: decodeURIComponent(password),
    PGDATABASE: pathname.slice(1), PGSSLMODE: isLocalDatabase(url) ? 'prefer' : 'require',
  },
});
if (result.status !== 0) {
  console.error(result.error ? `✗ ${result.error.message}` : '✗ Backup failed');
  process.exit(1);
}
chmodSync(file, 0o600);
console.log(`✓ ${path.relative(process.cwd(), file)} (${Math.ceil(statSync(file).size / 1024)} KB). Keep a copy somewhere safe and private.`);
