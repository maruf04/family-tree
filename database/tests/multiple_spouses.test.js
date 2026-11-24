// THE critical genealogy test: a person with three spouses and children from
// each marriage. All spouses must be retrievable together, and every child must
// be grouped under the spouse who is actually their parent.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { P, createTestDb, inRollback, insertPerson } from './helpers.js';

let db;
before(async () => { db = await createTestDb(); });
after(async () => { await db?.end(); });

const name = async (id) =>
  (await db.query('SELECT full_name_en FROM people WHERE id = $1', [id])).rows[0].full_name_en;

/** { coParentName | '(unknown)': [childName, ...] } for a person. */
async function childrenBySpouse(personId) {
  const { rows } = await db.query(
    `SELECT coalesce(cp.full_name_en, '(unknown)') AS co_parent,
            c.full_name_en AS child, x.relationship_type
     FROM person_children_by_coparent($1) x
     JOIN people c ON c.id = x.child_id
     LEFT JOIN people cp ON cp.id = x.co_parent_id
     ORDER BY 1, 2`, [personId]);
  const groups = {};
  for (const r of rows) (groups[r.co_parent] ??= []).push(r.child);
  return groups;
}

test('all three of Abdul Karim\'s marriages are retrieved together, in recorded order', async () => {
  const { rows } = await db.query(
    `SELECT s.full_name_en AS spouse, m.status,
            CASE WHEN m.spouse1_id = $1 THEN m.spouse1_order ELSE m.spouse2_order END AS nth,
            fuzzy_date_to_jsonb(m.start_date) AS start_date
     FROM marriages m
     JOIN people s ON s.id = CASE WHEN m.spouse1_id = $1 THEN m.spouse2_id ELSE m.spouse1_id END
     WHERE $1 IN (m.spouse1_id, m.spouse2_id)
     ORDER BY nth`, [P.karim]);
  assert.deepEqual(rows, [
    { spouse: 'Ayesha Begum', status: 'widowed', nth: 1, start_date: { qualifier: 'about', year: 1900 } },
    { spouse: 'Fatema Begum', status: 'widowed', nth: 2, start_date: { qualifier: 'exact', year: 1912 } },
    { spouse: 'Salma Begum', status: 'divorced', nth: 3,
      start_date: { qualifier: 'between', year: 1925, year_to: 1930 } },
  ]);
});

test('children are grouped under the spouse who is their actual parent', async () => {
  assert.deepEqual(await childrenBySpouse(P.karim), {
    'Ayesha Begum': ['Abdur Rahman', 'Rokeya Begum'],
    'Fatema Begum': ['Hasina Akter', 'Nurul Islam', 'Sultan Ahmed'],
    'Salma Begum': ['Kamal Hossain'],
  });
});

test('every group carries the marriage between the two parents', async () => {
  const { rows } = await db.query(
    `SELECT x.child_id, x.co_parent_id, m.spouse1_id, m.spouse2_id
     FROM person_children_by_coparent($1) x
     JOIN marriages m ON m.id = x.marriage_id`, [P.karim]);
  assert.equal(rows.length, 6, 'all six children are tied to a marriage');
  for (const r of rows) {
    assert.deepEqual(new Set([r.spouse1_id, r.spouse2_id]), new Set([P.karim, r.co_parent_id]),
      `child ${await name(r.child_id)} is attached to the wrong marriage`);
  }
});

test('no child is connected to a spouse who is not their parent', async () => {
  const wives = [P.ayesha, P.fatema, P.salma];
  const { rows } = await db.query(
    `SELECT child_id, array_agg(parent_id ORDER BY parent_id) AS parents
     FROM parent_child WHERE child_id IN (SELECT child_id FROM parent_child WHERE parent_id = $1)
     GROUP BY child_id`, [P.karim]);
  for (const r of rows) {
    const mothers = r.parents.filter((p) => wives.includes(p));
    assert.equal(mothers.length, 1, `${await name(r.child_id)} must have exactly one of the wives as parent`);
    assert.ok(r.parents.includes(P.karim));
  }
  // Seen from each wife: only her own children.
  assert.deepEqual(await childrenBySpouse(P.ayesha), { 'Abdul Karim': ['Abdur Rahman', 'Rokeya Begum'] });
  assert.deepEqual(await childrenBySpouse(P.salma), { 'Abdul Karim': ['Kamal Hossain'] });
});

test('the adopted child is grouped with the adoptive couple and marked adoptive', async () => {
  const { rows } = await db.query(
    `SELECT relationship_type, co_parent_id, co_parent_relationship_type
     FROM person_children_by_coparent($1) WHERE child_id = $2`, [P.karim, P.sultan]);
  assert.deepEqual(rows, [{
    relationship_type: 'adoptive', co_parent_id: P.fatema, co_parent_relationship_type: 'adoptive',
  }]);
});

test('a child whose other parent is unknown is NOT assigned to any spouse', async () => {
  await inRollback(db, async () => {
    const child = await insertPerson(db, { full_name_en: 'Child Of Unknown Mother' });
    await db.query('INSERT INTO parent_child (parent_id, child_id) VALUES ($1, $2)', [P.karim, child]);
    const groups = await childrenBySpouse(P.karim);
    assert.deepEqual(groups['(unknown)'], ['Child Of Unknown Mother']);
    for (const wife of ['Ayesha Begum', 'Fatema Begum', 'Salma Begum']) {
      assert.ok(!groups[wife].includes('Child Of Unknown Mother'));
    }
  });
});

test('a child of an unmarried co-parent is grouped with that parent, without a marriage', async () => {
  await inRollback(db, async () => {
    const partner = await insertPerson(db, { full_name_en: 'Unmarried Partner', sex: 'female' });
    const child = await insertPerson(db, { full_name_en: 'Child Outside Marriage' });
    await db.query('INSERT INTO parent_child (parent_id, child_id) VALUES ($1, $3), ($2, $3)',
      [P.karim, partner, child]);
    const { rows } = await db.query(
      'SELECT co_parent_id, marriage_id FROM person_children_by_coparent($1) WHERE child_id = $2',
      [P.karim, child]);
    assert.deepEqual(rows, [{ co_parent_id: partner, marriage_id: null }]);
  });
});

test('repeated ancestors (cousin marriage) are found once, via two paths', async () => {
  // Habib's parents are first cousins, so Rahim & Rahima are reached twice.
  const { rows } = await db.query(
    `WITH RECURSIVE walk (id, depth, path) AS (
       SELECT parent_id, 1, ARRAY[child_id, parent_id] FROM parent_child WHERE child_id = $1
       UNION ALL
       SELECT pc.parent_id, w.depth + 1, w.path || pc.parent_id
       FROM parent_child pc JOIN walk w ON pc.child_id = w.id
       WHERE w.depth < 10 AND NOT pc.parent_id = ANY (w.path)
     )
     SELECT id, count(*)::int AS paths, min(depth) AS generation
     FROM walk GROUP BY id`, [P.habib]);
  const rahim = rows.find((r) => r.id === P.rahim);
  assert.equal(rahim.paths, 2, 'reached through both parents');
  assert.equal(rahim.generation, 3);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, 'de-duplicated result has unique ancestors');
});

test('descendants span six generations from the root ancestor', async () => {
  const { rows } = await db.query(
    `WITH RECURSIVE d (id, generation) AS (
       SELECT child_id, 1 FROM parent_child WHERE parent_id = $1
       UNION
       SELECT pc.child_id, d.generation + 1 FROM parent_child pc JOIN d ON pc.parent_id = d.id
       WHERE d.generation < 20
     )
     SELECT id, min(generation) AS generation FROM d GROUP BY id`, [P.rahim]);
  const ayan = rows.find((r) => r.id === P.ayan);
  assert.equal(ayan.generation, 5, 'Ayan is the 5th generation below Rahim (6 generations in total)');
  assert.ok(rows.some((r) => r.id === P.habib), 'cousin-marriage child is a descendant');
  assert.ok(rows.some((r) => r.id === P.sultan), 'adopted child is a descendant of the adoptive line');
});
