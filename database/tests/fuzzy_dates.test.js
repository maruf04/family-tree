import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { SQLSTATE, createTestDb, expectDbError, inRollback } from './helpers.js';

let db;
before(async () => { db = await createTestDb(); });
after(async () => { await db?.end(); });

const asJson = async (expr) =>
  (await db.query(`SELECT fuzzy_date_to_jsonb(${expr}) AS v`)).rows[0].v;

test('approximate year is stored without inventing month or day', async () => {
  assert.deepEqual(await asJson(`make_fuzzy_date('about', 1880)`), { qualifier: 'about', year: 1880 });
});

test('supports exact, partial, before, after and between dates', async () => {
  assert.deepEqual(await asJson(`make_fuzzy_date('exact', 1971, 12, 16)`),
    { qualifier: 'exact', year: 1971, month: 12, day: 16 });
  assert.deepEqual(await asJson(`make_fuzzy_date('exact', 1920, 3)`),
    { qualifier: 'exact', year: 1920, month: 3 });
  assert.deepEqual(await asJson(`make_fuzzy_date('before', 1900)`), { qualifier: 'before', year: 1900 });
  assert.deepEqual(await asJson(`make_fuzzy_date('after', 1947)`), { qualifier: 'after', year: 1947 });
  assert.deepEqual(await asJson(`make_fuzzy_date('between', 1880, NULL, NULL, 1885)`),
    { qualifier: 'between', year: 1880, year_to: 1885 });
});

test('round-trips through JSON (API / proposal format)', async () => {
  const input = { qualifier: 'between', year: 1925, year_to: 1930 };
  const { rows } = await db.query(
    'SELECT fuzzy_date_to_jsonb(fuzzy_date_from_jsonb($1)) AS v', [JSON.stringify(input)]);
  assert.deepEqual(rows[0].v, input);
});

test('unknown date is NULL', async () => {
  const { rows } = await db.query(
    `SELECT fuzzy_date_from_jsonb(NULL) IS NULL AS a,
            fuzzy_date_from_jsonb('null'::jsonb) IS NULL AS b,
            ROW(NULL,NULL,NULL,NULL,NULL,NULL,NULL)::fuzzy_date_parts::fuzzy_date IS NULL AS c`);
  assert.deepEqual(rows[0], { a: true, b: true, c: true });
});

test('rejects impossible or inconsistent dates', async () => {
  await inRollback(db, async () => {
    const bad = [
      `make_fuzzy_date('exact', 1923, 2, 29)`,                 // not a leap year
      `make_fuzzy_date('exact', 1920, 13)`,                     // month 13
      `make_fuzzy_date('exact', 1920, NULL, 5)`,                // day without month
      `make_fuzzy_date('between', 1890, NULL, NULL, 1880)`,     // reversed range
      `make_fuzzy_date('between', 1890)`,                       // range without end
      `make_fuzzy_date('about', 1890, NULL, NULL, 1895)`,       // end on non-range
      `make_fuzzy_date(NULL, 1890)`,                            // missing qualifier
      `make_fuzzy_date('exact', 999)`,                          // out of supported range
    ];
    for (const expr of bad) {
      await expectDbError(db, `SELECT ${expr}`, [], { code: SQLSTATE.CHECK });
    }
  });
});

test('accepts 29 February in a leap year', async () => {
  assert.deepEqual(await asJson(`make_fuzzy_date('exact', 1924, 2, 29)`),
    { qualifier: 'exact', year: 1924, month: 2, day: 29 });
});

test('date ranges reflect precision and qualifier', async () => {
  const { rows } = await db.query(`
    SELECT fuzzy_date_range(make_fuzzy_date('exact', 1920, 3))::text       AS month,
           fuzzy_date_range(make_fuzzy_date('about', 1880))::text          AS about,
           fuzzy_date_range(make_fuzzy_date('before', 1900))::text         AS before,
           fuzzy_date_range(make_fuzzy_date('between', 1880, NULL, NULL, 1885))::text AS between`);
  assert.deepEqual(rows[0], {
    month: '[1920-03-01,1920-04-01)',
    about: '[1870-01-01,1891-01-01)',
    before: '(,1900-01-01)',
    between: '[1880-01-01,1886-01-01)',
  });
});

test('ordering check tolerates uncertainty but catches clear contradictions', async () => {
  const { rows } = await db.query(`
    SELECT fuzzy_dates_may_be_ordered(make_fuzzy_date('about', 1880), make_fuzzy_date('exact', 1875)) AS about_overlap,
           fuzzy_dates_may_be_ordered(make_fuzzy_date('exact', 1900), make_fuzzy_date('exact', 1890)) AS contradiction,
           fuzzy_dates_may_be_ordered(NULL, make_fuzzy_date('exact', 1890))                        AS unknown_start`);
  assert.deepEqual(rows[0], { about_overlap: true, contradiction: false, unknown_start: true });
});
