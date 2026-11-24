// Shared helpers for the migration runner, seed loader and database tests.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATABASE_DIR = path.resolve(here, '..');
export const MIGRATIONS_DIR = path.join(DATABASE_DIR, 'migrations');
export const SEEDS_DIR = path.join(DATABASE_DIR, 'seeds');

/** Load the repository-root .env (if present) without overriding real env vars. */
export function loadEnv() {
  const envFile = path.resolve(DATABASE_DIR, '..', '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

/** Migration files look like 0001_description.sql and are applied in lexical order. */
export function listMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((file) => {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      return {
        version: file.slice(0, 4),
        name: file.replace(/\.sql$/, ''),
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
    });
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      name       text NOT NULL,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
}

/**
 * Apply all pending migrations. Each migration runs in its own transaction, so a
 * failing file leaves the database exactly as it was before that file.
 * Already-applied migrations whose contents changed are reported as an error:
 * never edit an applied migration, add a new one instead.
 */
export async function migrate(client, { log = console.log } = {}) {
  await ensureMigrationsTable(client);
  // Serialise concurrent runners (e.g. two deploys at once).
  await client.query('SELECT pg_advisory_lock(hashtext($1))', ['schema_migrations']);
  try {
    const { rows } = await client.query('SELECT version, checksum FROM schema_migrations');
    const applied = new Map(rows.map((r) => [r.version, r.checksum]));
    let count = 0;

    for (const m of listMigrations()) {
      if (applied.has(m.version)) {
        if (applied.get(m.version) !== m.checksum) {
          throw new Error(
            `Migration ${m.name} was modified after it was applied. ` +
              'Revert the edit and create a new migration instead.',
          );
        }
        continue;
      }
      log(`→ applying ${m.name}`);
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
          [m.version, m.name, m.checksum],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        err.message = `Migration ${m.name} failed: ${err.message}`;
        throw err;
      }
      count += 1;
    }
    log(count ? `✓ ${count} migration(s) applied` : '✓ database is up to date');
    return count;
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['schema_migrations']);
  }
}

export async function migrationStatus(client) {
  await ensureMigrationsTable(client);
  const { rows } = await client.query('SELECT version, checksum, applied_at FROM schema_migrations');
  const applied = new Map(rows.map((r) => [r.version, r]));
  return listMigrations().map((m) => {
    const row = applied.get(m.version);
    let state = 'pending';
    if (row) state = row.checksum === m.checksum ? 'applied' : 'MODIFIED';
    return { name: m.name, state, appliedAt: row?.applied_at ?? null };
  });
}

// Fictional development data, in load order. `present` detects an earlier load.
export const SEEDS = [
  { file: 'dev_sample_genealogy.sql',
    present: `SELECT 1 FROM people WHERE id = '10000000-0000-4000-8000-000000000001'` },
  { file: 'dev_sample_content.sql', present: 'SELECT 1 FROM village_profile' },
];

export async function loadSeeds(client, { log = console.log } = {}) {
  for (const seed of SEEDS) {
    if ((await client.query(seed.present)).rowCount) {
      log(`· ${seed.file} already loaded, skipping`);
      continue;
    }
    const sql = readFileSync(path.join(SEEDS_DIR, seed.file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      err.message = `${seed.file}: ${err.message}`;
      throw err;
    }
    log(`✓ ${seed.file} loaded (fictional development data)`);
  }
}

export async function withClient(connectionString, fn) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
