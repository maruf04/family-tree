// Test harness: rebuilds the test database from migrations + sample seed, then
// runs each test inside a transaction that is rolled back afterwards.
import assert from 'node:assert/strict';
import pg from 'pg';
import { loadEnv, loadSeeds, migrate } from '../scripts/lib.js';

loadEnv();

// Fixed ids from seeds/dev_sample_genealogy.sql
export const P = {
  rahim: '10000000-0000-4000-8000-000000000001',
  rahima: '10000000-0000-4000-8000-000000000002',
  karim: '10000000-0000-4000-8000-000000000003',
  jabbar: '10000000-0000-4000-8000-000000000004',
  jamila: '10000000-0000-4000-8000-000000000005',
  ayesha: '10000000-0000-4000-8000-000000000006',
  salma: '10000000-0000-4000-8000-000000000007',
  kulsum: '10000000-0000-4000-8000-000000000008',
  gani: '10000000-0000-4000-8000-000000000010',
  fatema: '10000000-0000-4000-8000-000000000011',
  ruksana: '10000000-0000-4000-8000-000000000012',
  nusrat: '10000000-0000-4000-8000-000000000014',
  abdurRahman: '10000000-0000-4000-8000-000000000020',
  rokeya: '10000000-0000-4000-8000-000000000021',
  nurul: '10000000-0000-4000-8000-000000000022',
  hasina: '10000000-0000-4000-8000-000000000023',
  sultan: '10000000-0000-4000-8000-000000000024',
  kamal: '10000000-0000-4000-8000-000000000025',
  morium: '10000000-0000-4000-8000-000000000026',
  habib: '10000000-0000-4000-8000-000000000027',
  shafiqul: '10000000-0000-4000-8000-000000000028',
  tanvir: '10000000-0000-4000-8000-000000000030',
  ayan: '10000000-0000-4000-8000-000000000032',
};
export const F = {
  munshi: '20000000-0000-4000-8000-000000000001',
  sarkar: '20000000-0000-4000-8000-000000000002',
};
export const U = {
  admin: '90000000-0000-4000-8000-000000000001',
  member: '90000000-0000-4000-8000-000000000003',
  moderator: '90000000-0000-4000-8000-000000000004',
};

function testDatabaseUrl() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see .env.example).');
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to wipe "${dbName}": TEST_DATABASE_URL must point at a database ending in _test.`);
  }
  return url;
}

/** Wipe the test database, apply all migrations and load the sample genealogy. */
export async function createTestDb() {
  const client = new pg.Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await migrate(client, { log: () => {} });
  await loadSeeds(client, { log: () => {} });
  return client;
}

/** Run fn inside a transaction that is always rolled back. */
export async function inRollback(client, fn) {
  await client.query('BEGIN');
  try {
    return await fn(client);
  } finally {
    await client.query('ROLLBACK');
  }
}

/** Assert a statement fails with a SQLSTATE (and optionally a constraint name). */
export async function expectDbError(client, sql, params, { code, constraint } = {}) {
  await client.query('SAVEPOINT expect_error');
  let error;
  try {
    await client.query(sql, params);
  } catch (err) {
    error = err;
  }
  await client.query('ROLLBACK TO SAVEPOINT expect_error');
  assert.ok(error, `expected statement to fail: ${sql}`);
  if (code) assert.equal(error.code, code, `wrong SQLSTATE: ${error.message}`);
  if (constraint) assert.equal(error.constraint, constraint, `wrong constraint: ${error.message}`);
  return error;
}

export async function insertPerson(client, fields = {}) {
  const { rows } = await client.query(
    `INSERT INTO people (full_name_bn, full_name_en, sex, living_status, birth)
     VALUES ($1, $2, $3, $4, fuzzy_date_from_jsonb($5)) RETURNING id`,
    [
      fields.full_name_bn ?? null,
      fields.full_name_en ?? 'Test Person',
      fields.sex ?? 'unknown',
      fields.living_status ?? 'unknown',
      fields.birth ? JSON.stringify(fields.birth) : null,
    ],
  );
  return rows[0].id;
}

// PostgreSQL SQLSTATEs used in assertions
export const SQLSTATE = {
  CHECK: '23514',
  UNIQUE: '23505',
  FOREIGN_KEY: '23503',
  RESTRICT: '23001',
  CYCLE: 'VH001',
  TOO_MANY_BIO_PARENTS: 'VH002',
  PARENT_AND_SPOUSE: 'VH003',
  MERGED_PERSON: 'VH004',
  SAME_SEX_BIO_PARENTS: 'VH005',
  ROOT_MEMBERSHIP: 'VH006',
  ADMIN_ONLY: 'VH101',
  LAST_ADMIN: 'VH102',
  AUDIT_IMMUTABLE: 'VH900',
};
