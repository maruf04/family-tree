import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { F, P, SQLSTATE, U, createTestDb, expectDbError, inRollback } from './helpers.js';

let db;
before(async () => { db = await createTestDb(); });
after(async () => { await db?.end(); });

// ------------------------------------------------------------------- audit log

test('every genealogy change is audited with actor, proposal and changed fields', async () => {
  await inRollback(db, async () => {
    const proposal = (await db.query(
      `INSERT INTO change_proposals (proposer_id, family_id, summary) VALUES ($1, $2, 'Fix occupation')
       RETURNING id`, [U.member, F.munshi])).rows[0].id;
    await db.query(`SELECT set_config('app.user_id', $1, true), set_config('app.proposal_id', $2, true)`,
      [U.moderator, proposal]);
    await db.query(`UPDATE people SET occupation_en = 'Trader' WHERE id = $1`, [P.karim]);

    const { rows } = await db.query(
      `SELECT action, actor_user_id, proposal_id, changed_fields,
              old_data ->> 'occupation_en' AS old_occ, new_data ->> 'occupation_en' AS new_occ
       FROM audit_logs WHERE table_name = 'people' AND record_id = $1 AND action = 'update'`, [P.karim]);
    assert.deepEqual(rows, [{
      action: 'update', actor_user_id: U.moderator, proposal_id: proposal,
      changed_fields: ['occupation_en'],   // updated_at is deliberately ignored
      old_occ: 'Farmer and trader', new_occ: 'Trader',
    }]);
  });
});

test('no-op updates are not audited; deletes are', async () => {
  await inRollback(db, async () => {
    const before = (await db.query('SELECT count(*)::int AS n FROM audit_logs')).rows[0].n;
    await db.query('UPDATE people SET occupation_en = occupation_en WHERE id = $1', [P.karim]);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM audit_logs')).rows[0].n, before);

    await db.query('DELETE FROM source_links WHERE person_id = $1', [P.karim]);
    const { rows } = await db.query(
      `SELECT old_data ->> 'person_id' AS person FROM audit_logs
       WHERE table_name = 'source_links' AND action = 'delete'`);
    assert.deepEqual(rows, [{ person: P.karim }]);
  });
});

test('audit log is append-only', async () => {
  await inRollback(db, async () => {
    await expectDbError(db, 'UPDATE audit_logs SET action = $1', ['tampered'], { code: SQLSTATE.AUDIT_IMMUTABLE });
    await expectDbError(db, 'DELETE FROM audit_logs', [], { code: SQLSTATE.AUDIT_IMMUTABLE });
    await expectDbError(db, 'TRUNCATE audit_logs', [], { code: SQLSTATE.AUDIT_IMMUTABLE });
  });
});

test('row level security is enabled on every application table', async () => {
  const { rows } = await db.query(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`);
  assert.deepEqual(rows, [], `tables without RLS: ${rows.map((r) => r.relname).join(', ')}`);
});

// ------------------------------------------------------------------ permissions

// Moderator-or-above is the single permission for editing any family tree.
const canEditGenealogy = async (user) =>
  (await db.query(`SELECT user_has_role($1, 'moderator') AS ok`, [user])).rows[0].ok;

test('admins and moderators can edit every family tree; members cannot', async () => {
  assert.equal(await canEditGenealogy(U.admin), true);
  assert.equal(await canEditGenealogy(U.moderator), true);
  assert.equal(await canEditGenealogy(U.member), false);
});

test('there are no per-family manager roles', async () => {
  const { rows } = await db.query(
    `SELECT to_regclass('family_managers') AS tbl, to_regtype('family_role') AS typ,
            to_regprocedure('can_manage_family(uuid, uuid)') AS fn`);
  assert.deepEqual(rows[0], { tbl: null, typ: null, fn: null });
});

test('unverified or suspended accounts lose editing rights', async () => {
  await inRollback(db, async () => {
    await db.query(`UPDATE users SET membership_status = 'suspended' WHERE id = $1`, [U.moderator]);
    assert.equal(await canEditGenealogy(U.moderator), false);
    // Suspending an admin requires another verified admin to remain.
    await db.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [U.member]);
    await db.query(`UPDATE users SET membership_status = 'suspended' WHERE id = $1`, [U.admin]);
    assert.equal(await canEditGenealogy(U.admin), false);
  });
});

// ------------------------------------------------------------ role hierarchy

test('roles are ordered member < moderator < admin', async () => {
  const { rows } = await db.query(
    `SELECT u.k, user_has_role(u.id, 'member') AS m, user_has_role(u.id, 'moderator') AS mod,
            user_has_role(u.id, 'admin') AS adm
     FROM (VALUES ('member', $1::uuid), ('moderator', $2::uuid), ('admin', $3::uuid)) AS u (k, id)`,
    [U.member, U.moderator, U.admin]);
  assert.deepEqual(rows, [
    { k: 'member', m: true, mod: false, adm: false },
    { k: 'moderator', m: true, mod: true, adm: false },
    { k: 'admin', m: true, mod: true, adm: true },
  ]);
});

const actAs = (user) => db.query(`SELECT set_config('app.user_id', $1, true)`, [user]);

test('only admins can change roles', async () => {
  await inRollback(db, async () => {
    await actAs(U.moderator);
    await expectDbError(db, `UPDATE users SET role = 'moderator' WHERE id = $1`, [U.member],
      { code: SQLSTATE.ADMIN_ONLY });
    await expectDbError(db, `UPDATE users SET role = 'admin' WHERE id = $1`, [U.moderator],
      { code: SQLSTATE.ADMIN_ONLY });
    await actAs(U.admin);
    await db.query(`UPDATE users SET role = 'moderator' WHERE id = $1`, [U.member]);
  });
});

test('moderators can verify or suspend members, but not moderators or admins', async () => {
  await inRollback(db, async () => {
    await actAs(U.moderator);
    await db.query(`UPDATE users SET membership_status = 'suspended' WHERE id = $1`, [U.member]);
    await expectDbError(db, `UPDATE users SET membership_status = 'suspended' WHERE id = $1`, [U.admin],
      { code: SQLSTATE.ADMIN_ONLY });
    await expectDbError(db, `DELETE FROM users WHERE id = $1`, [U.member], { code: SQLSTATE.ADMIN_ONLY });
  });
});

test('the last verified admin cannot be demoted, suspended or deleted', async () => {
  await inRollback(db, async () => {
    await actAs(U.admin);
    await expectDbError(db, `UPDATE users SET role = 'moderator' WHERE id = $1`, [U.admin],
      { code: SQLSTATE.LAST_ADMIN });
    await expectDbError(db, `UPDATE users SET membership_status = 'suspended' WHERE id = $1`, [U.admin],
      { code: SQLSTATE.LAST_ADMIN });
    // With a second admin, stepping down is fine.
    await db.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [U.moderator]);
    await db.query(`UPDATE users SET role = 'moderator' WHERE id = $1`, [U.admin]);
  });
});

// ---------------------------------------------------------------- proposals

test('proposal review state must be consistent', async () => {
  await inRollback(db, async () => {
    const id = (await db.query(
      `INSERT INTO change_proposals (proposer_id, family_id, summary) VALUES ($1, $2, 'Add child')
       RETURNING id`, [U.member, F.munshi])).rows[0].id;
    // Approved without review timestamp / application.
    await expectDbError(db, `UPDATE change_proposals SET status = 'approved' WHERE id = $1`, [id],
      { code: SQLSTATE.CHECK });
    // Proposer reviewing their own proposal.
    await expectDbError(db,
      `UPDATE change_proposals SET status = 'rejected', reviewed_by = $2, reviewed_at = now() WHERE id = $1`,
      [id, U.member], { constraint: 'change_proposals_no_self_review' });
    // Proper approval.
    await db.query(
      `UPDATE change_proposals SET status = 'approved', reviewed_by = $2, reviewed_at = now(), applied_at = now()
       WHERE id = $1`, [id, U.moderator]);
  });
});

test('proposal items: create has no target, update/delete require one', async () => {
  await inRollback(db, async () => {
    const id = (await db.query(
      `INSERT INTO change_proposals (proposer_id, family_id, summary) VALUES ($1, $2, 'Add child')
       RETURNING id`, [U.member, F.munshi])).rows[0].id;
    // Valid multi-item proposal: new person + link to an existing parent via temp_ref.
    await db.query(
      `INSERT INTO change_proposal_items (proposal_id, position, entity_type, action, temp_ref, payload) VALUES
         ($1, 1, 'person', 'create', 'new_child', '{"full_name_bn": "নতুন শিশু"}'),
         ($1, 2, 'parent_child', 'create', NULL, $2)`,
      [id, JSON.stringify({ parent_id: P.tanvir, child_id: '$new_child' })]);
    await expectDbError(db,
      `INSERT INTO change_proposal_items (proposal_id, position, entity_type, action, target_id)
       VALUES ($1, 3, 'person', 'create', $2)`, [id, P.karim], { constraint: 'change_proposal_items_target' });
    await expectDbError(db,
      `INSERT INTO change_proposal_items (proposal_id, position, entity_type, action)
       VALUES ($1, 3, 'person', 'update')`, [id], { constraint: 'change_proposal_items_target' });
    await expectDbError(db,
      `INSERT INTO change_proposal_items (proposal_id, position, entity_type, action, payload)
       VALUES ($1, 3, 'person', 'create', '[]')`, [id], { constraint: 'change_proposal_items_payload_object' });
  });
});
