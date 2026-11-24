import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { P, SQLSTATE, createTestDb, expectDbError, inRollback, insertPerson } from './helpers.js';

let db;
before(async () => { db = await createTestDb(); });
after(async () => { await db?.end(); });

const addParent = (parent, child, type = 'biological') =>
  db.query('INSERT INTO parent_child (parent_id, child_id, relationship_type) VALUES ($1, $2, $3)',
    [parent, child, type]);

// ---------------------------------------------------------------- parent_child

test('a person cannot be their own parent', async () => {
  await inRollback(db, async () => {
    await expectDbError(db, 'INSERT INTO parent_child (parent_id, child_id) VALUES ($1, $1)',
      [P.karim], { constraint: 'parent_child_not_self' });
  });
});

test('duplicate parent-child relationships are rejected', async () => {
  await inRollback(db, async () => {
    await expectDbError(db, 'INSERT INTO parent_child (parent_id, child_id, relationship_type) VALUES ($1, $2, $3)',
      [P.karim, P.nurul, 'adoptive'], { constraint: 'parent_child_unique' });
  });
});

test('circular ancestry is rejected, directly and across many generations', async () => {
  await inRollback(db, async () => {
    // Child as parent of their own parent.
    await expectDbError(db, 'INSERT INTO parent_child (parent_id, child_id) VALUES ($1, $2)',
      [P.nurul, P.karim], { code: SQLSTATE.CYCLE });
    // Sixth-generation descendant as parent of the root ancestor.
    await expectDbError(db, 'INSERT INTO parent_child (parent_id, child_id) VALUES ($1, $2)',
      [P.ayan, P.rahim], { code: SQLSTATE.CYCLE });
    // Through the cousin-marriage path (Habib descends from Rahim twice).
    await expectDbError(db, 'INSERT INTO parent_child (parent_id, child_id) VALUES ($1, $2)',
      [P.habib, P.jabbar], { code: SQLSTATE.CYCLE });
  });
});

test('re-pointing an existing edge cannot create a cycle either', async () => {
  await inRollback(db, async () => {
    // Re-point "Nusrat -> Ayan" to "Ayan -> Shafiqul". Ayan still descends from
    // Shafiqul through his father Tanvir, so this would close a loop.
    await expectDbError(db,
      `UPDATE parent_child SET parent_id = $1, child_id = $2 WHERE parent_id = $3 AND child_id = $1`,
      [P.ayan, P.shafiqul, P.nusrat], { code: SQLSTATE.CYCLE });
  });
});

test('at most two biological parents, of different recorded sex', async () => {
  await inRollback(db, async () => {
    const extra = await insertPerson(db, { full_name_en: 'Extra Parent', sex: 'female' });
    await expectDbError(db, 'INSERT INTO parent_child (parent_id, child_id) VALUES ($1, $2)',
      [extra, P.nurul], { code: SQLSTATE.TOO_MANY_BIO_PARENTS });

    // Fatema has only a known father; a second male biological parent is rejected.
    const man = await insertPerson(db, { full_name_en: 'Another Man', sex: 'male' });
    await expectDbError(db, 'INSERT INTO parent_child (parent_id, child_id) VALUES ($1, $2)',
      [man, P.fatema], { code: SQLSTATE.SAME_SEX_BIO_PARENTS });
  });
});

test('adoptive parents are allowed in addition to biological parents', async () => {
  await inRollback(db, async () => {
    const guardian = await insertPerson(db, { full_name_en: 'Adoptive Mother', sex: 'female' });
    await addParent(guardian, P.kamal, 'adoptive');
    const { rows } = await db.query(
      `SELECT relationship_type, count(*)::int AS n FROM parent_child WHERE child_id = $1
       GROUP BY 1 ORDER BY 1`, [P.kamal]);
    assert.deepEqual(rows, [{ relationship_type: 'biological', n: 2 }, { relationship_type: 'adoptive', n: 1 }]);
  });
});

test('a person with no known parents is valid (lineage root)', async () => {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM parent_child WHERE child_id = $1', [P.rahim]);
  assert.equal(rows[0].n, 0);
});

// ------------------------------------------------------------------- marriages

test('a person cannot marry themself', async () => {
  await inRollback(db, async () => {
    await expectDbError(db, 'INSERT INTO marriages (spouse1_id, spouse2_id) VALUES ($1, $1)',
      [P.karim], { constraint: 'marriages_not_self' });
  });
});

test('a couple cannot have two active marriages, in either spouse order', async () => {
  await inRollback(db, async () => {
    await expectDbError(db, `INSERT INTO marriages (spouse1_id, spouse2_id) VALUES ($1, $2)`,
      [P.fatema, P.karim], { constraint: 'marriages_one_active_per_couple' });
  });
});

test('a divorced couple may remarry', async () => {
  await inRollback(db, async () => {
    await db.query(`INSERT INTO marriages (spouse1_id, spouse2_id, status, start_date)
                    VALUES ($1, $2, 'ongoing', make_fuzzy_date('about', 1945))`, [P.karim, P.salma]);
    const { rows } = await db.query(
      `SELECT status FROM marriages
       WHERE least(spouse1_id, spouse2_id) = least($1::uuid, $2::uuid)
         AND greatest(spouse1_id, spouse2_id) = greatest($1::uuid, $2::uuid)
       ORDER BY fuzzy_date_sort_key(start_date)`, [P.karim, P.salma]);
    assert.deepEqual(rows.map((r) => r.status), ['divorced', 'ongoing']);
  });
});

test('concurrent marriages to different people are allowed', async () => {
  await inRollback(db, async () => {
    const wife4 = await insertPerson(db, { full_name_en: 'Fourth Wife', sex: 'female' });
    await db.query(`INSERT INTO marriages (spouse1_id, spouse2_id) VALUES ($1, $2)`, [P.shafiqul, wife4]);
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM marriages WHERE status = 'ongoing' AND $1 IN (spouse1_id, spouse2_id)`,
      [P.shafiqul]);
    assert.equal(rows[0].n, 2);
  });
});

test('ended marriages: end date requires an ended status and cannot precede the start', async () => {
  await inRollback(db, async () => {
    const a = await insertPerson(db, { sex: 'male' });
    const b = await insertPerson(db, { sex: 'female' });
    await expectDbError(db,
      `INSERT INTO marriages (spouse1_id, spouse2_id, status, end_date)
       VALUES ($1, $2, 'ongoing', make_fuzzy_date('exact', 1950))`,
      [a, b], { constraint: 'marriages_end_date_needs_ended_status' });
    await expectDbError(db,
      `INSERT INTO marriages (spouse1_id, spouse2_id, status, start_date, end_date)
       VALUES ($1, $2, 'divorced', make_fuzzy_date('exact', 1950), make_fuzzy_date('exact', 1940))`,
      [a, b], { constraint: 'marriages_end_not_before_start' });
    await db.query(
      `INSERT INTO marriages (spouse1_id, spouse2_id, status, start_date, end_date)
       VALUES ($1, $2, 'divorced', make_fuzzy_date('about', 1950), make_fuzzy_date('exact', 1955, 6))`, [a, b]);
  });
});

test('a parent and child cannot be married, and spouses cannot become parent/child', async () => {
  await inRollback(db, async () => {
    await expectDbError(db, 'INSERT INTO marriages (spouse1_id, spouse2_id) VALUES ($1, $2)',
      [P.fatema, P.nurul], { code: SQLSTATE.PARENT_AND_SPOUSE });
    await expectDbError(db, 'INSERT INTO parent_child (parent_id, child_id) VALUES ($1, $2)',
      [P.tanvir, P.nusrat], { code: SQLSTATE.PARENT_AND_SPOUSE });
  });
});

test('relationships to people still referenced cannot be silently deleted', async () => {
  await inRollback(db, async () => {
    await expectDbError(db, 'DELETE FROM people WHERE id = $1', [P.karim], { code: SQLSTATE.RESTRICT });
  });
});
