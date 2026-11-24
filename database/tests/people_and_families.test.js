import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { F, P, SQLSTATE, createTestDb, expectDbError, inRollback, insertPerson } from './helpers.js';

let db;
before(async () => { db = await createTestDb(); });
after(async () => { await db?.end(); });

test('a person needs a name in at least one language', async () => {
  await inRollback(db, async () => {
    await insertPerson(db, { full_name_bn: 'শুধু বাংলা নাম', full_name_en: null });
    await expectDbError(db, `INSERT INTO people (full_name_bn, full_name_en) VALUES ('  ', NULL)`, [],
      { constraint: 'people_name_required' });
  });
});

test('death date requires deceased status and cannot precede birth', async () => {
  await inRollback(db, async () => {
    await expectDbError(db,
      `INSERT INTO people (full_name_en, living_status, death) VALUES ('X', 'living', make_fuzzy_date('exact', 1950))`,
      [], { constraint: 'people_death_implies_deceased' });
    await expectDbError(db,
      `INSERT INTO people (full_name_en, living_status, birth, death)
       VALUES ('X', 'deceased', make_fuzzy_date('exact', 1950), make_fuzzy_date('exact', 1940))`,
      [], { constraint: 'people_death_not_before_birth' });
    // Approximate birth overlapping an exact death is plausible and allowed.
    await db.query(
      `INSERT INTO people (full_name_en, living_status, birth, death)
       VALUES ('X', 'deceased', make_fuzzy_date('about', 1880), make_fuzzy_date('exact', 1879))`);
  });
});

test('living people are private by default; deceased visible to members', async () => {
  const { rows } = await db.query(
    `SELECT id, effective_privacy FROM people WHERE id = ANY ($1)`, [[P.tanvir, P.karim]]);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r.effective_privacy]));
  assert.equal(byId[P.tanvir], 'restricted');
  assert.equal(byId[P.karim], 'members');

  await inRollback(db, async () => {
    const id = await insertPerson(db, { living_status: 'unknown' });
    let r = await db.query('SELECT effective_privacy FROM people WHERE id = $1', [id]);
    assert.equal(r.rows[0].effective_privacy, 'restricted');
    await db.query(`UPDATE people SET privacy_level = 'family' WHERE id = $1`, [id]);
    r = await db.query('SELECT effective_privacy FROM people WHERE id = $1', [id]);
    assert.equal(r.rows[0].effective_privacy, 'family');
  });
});

test('one canonical person record appears in multiple family lineages', async () => {
  const { rows } = await db.query(
    `SELECT f.id AS family_id, fm.membership_type, fm.is_primary
     FROM family_members fm JOIN families f ON f.id = fm.family_id
     WHERE fm.person_id = $1 ORDER BY fm.is_primary DESC`, [P.fatema]);
  assert.deepEqual(rows, [
    { family_id: F.sarkar, membership_type: 'lineage', is_primary: true },
    { family_id: F.munshi, membership_type: 'marriage', is_primary: false },
  ]);
  const count = await db.query(`SELECT count(*)::int AS n FROM people WHERE full_name_en = 'Fatema Begum'`);
  assert.equal(count.rows[0].n, 1, 'Fatema must exist exactly once');
});

test('a person has at most one primary family and one membership per family', async () => {
  await inRollback(db, async () => {
    await expectDbError(db,
      `UPDATE family_members SET is_primary = true WHERE person_id = $1 AND family_id = $2`,
      [P.fatema, F.munshi], { constraint: 'family_members_one_primary' });
    await expectDbError(db,
      `INSERT INTO family_members (family_id, person_id) VALUES ($1, $2)`,
      [F.munshi, P.karim], { constraint: 'family_members_unique' });
  });
});

test('family root is automatically a lineage member and cannot be removed', async () => {
  await inRollback(db, async () => {
    const root = await insertPerson(db, { full_name_en: 'New Root' });
    const { rows } = await db.query(
      `INSERT INTO families (name_en, root_person_id) VALUES ('New Lineage', $1) RETURNING id`, [root]);
    const fam = rows[0].id;
    const m = await db.query(
      'SELECT membership_type, is_primary FROM family_members WHERE family_id = $1 AND person_id = $2', [fam, root]);
    assert.deepEqual(m.rows, [{ membership_type: 'lineage', is_primary: true }]);

    await expectDbError(db, 'DELETE FROM family_members WHERE family_id = $1 AND person_id = $2',
      [fam, root], { code: SQLSTATE.ROOT_MEMBERSHIP });
    // Deleting the whole family cascades its memberships without tripping the guard.
    await db.query('DELETE FROM families WHERE id = $1', [fam]);
  });
});

test('a person can root only one lineage', async () => {
  await inRollback(db, async () => {
    await expectDbError(db, `INSERT INTO families (name_en, root_person_id) VALUES ('Dup', $1)`,
      [P.rahim], { constraint: 'families_one_lineage_per_root' });
  });
});

test('marriage between lineages does not change family membership', async () => {
  await inRollback(db, async () => {
    const before = (await db.query('SELECT count(*)::int AS n FROM family_members')).rows[0].n;
    // A Munshi-lineage man marries a Sarkar-lineage woman.
    const sarkarDaughter = await insertPerson(db, { full_name_en: 'Sarkar Daughter', sex: 'female' });
    await db.query(`INSERT INTO family_members (family_id, person_id, is_primary) VALUES ($1, $2, true)`,
      [F.sarkar, sarkarDaughter]);
    await db.query('INSERT INTO marriages (spouse1_id, spouse2_id) VALUES ($1, $2)', [P.kamal, sarkarDaughter]);
    const afterCount = (await db.query('SELECT count(*)::int AS n FROM family_members')).rows[0].n;
    assert.equal(afterCount, before + 1, 'only the explicit membership was added');
    const fams = await db.query('SELECT family_id FROM family_members WHERE person_id = $1', [sarkarDaughter]);
    assert.deepEqual(fams.rows, [{ family_id: F.sarkar }]);
  });
});

test('duplicate detection finds spelling variants across scripts', async () => {
  const variants = ['মোঃ আবদুল করীম', 'আব্দুল করিম', 'Md. Abdul Karim', 'abdul karim'];
  for (const name of variants) {
    const { rows } = await db.query('SELECT person_id FROM find_similar_people($1, 1882)', [name]);
    assert.equal(rows[0]?.person_id, P.karim, `"${name}" should match Abdul Karim`);
  }
  // Birth year far outside the tolerance filters the candidate out.
  const far = await db.query(`SELECT person_id FROM find_similar_people('আব্দুল করিম', 1990)`);
  assert.ok(!far.rows.some((r) => r.person_id === P.karim));
  // Unrelated name does not match.
  const none = await db.query(`SELECT person_id FROM find_similar_people('ফাতেমা বেগম', NULL)`);
  assert.ok(!none.rows.some((r) => r.person_id === P.karim));
});

test('merged-away records cannot gain new relationships', async () => {
  await inRollback(db, async () => {
    const dup = await insertPerson(db, { full_name_en: 'Abdul Karim (duplicate)' });
    await db.query('UPDATE people SET merged_into_id = $1 WHERE id = $2', [P.karim, dup]);
    await expectDbError(db, 'INSERT INTO parent_child (parent_id, child_id) VALUES ($1, $2)',
      [dup, P.ayan], { code: SQLSTATE.MERGED_PERSON });
    await expectDbError(db, 'INSERT INTO marriages (spouse1_id, spouse2_id) VALUES ($1, $2)',
      [dup, P.salma], { code: SQLSTATE.MERGED_PERSON });
  });
});

test('source links cite exactly one record', async () => {
  await inRollback(db, async () => {
    const src = (await db.query(
      `INSERT INTO sources (source_type, title_en) VALUES ('document', 'Land deed') RETURNING id`)).rows[0].id;
    await db.query('INSERT INTO source_links (source_id, family_id) VALUES ($1, $2)', [src, F.munshi]);
    await expectDbError(db, 'INSERT INTO source_links (source_id) VALUES ($1)', [src],
      { constraint: 'source_links_exactly_one_target' });
    await expectDbError(db, 'INSERT INTO source_links (source_id, person_id, family_id) VALUES ($1, $2, $3)',
      [src, P.karim, F.munshi], { constraint: 'source_links_exactly_one_target' });
  });
});
