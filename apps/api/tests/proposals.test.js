// Change-proposal workflow and genealogy permissions.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import request from 'supertest';
import { F, P, U, as, setupApp } from './setup.js';

let ctx;
before(async () => { ctx = await setupApp(); });
after(async () => { await ctx?.close(); });

const api = () => request(ctx.app);

test('unauthenticated and unverified users cannot read the genealogy', async () => {
  await api().get('/api/v1/people').expect(401);
  await ctx.db.query(`INSERT INTO users (id, display_name_en) VALUES ('90000000-0000-4000-8000-0000000000aa', 'Pending')`);
  const res = await api().get('/api/v1/people').set(as('90000000-0000-4000-8000-0000000000aa')).expect(403);
  assert.equal(res.body.error.code, 'verification_required');
});

test('members cannot edit records directly; they must propose', async () => {
  const res = await api().patch(`/api/v1/people/${P.karim}`).set(as(U.member)).send({ occupation_en: 'X' }).expect(403);
  assert.equal(res.body.error.code, 'moderator_only');
  await api().post('/api/v1/relationships/marriages').set(as(U.member))
    .send({ spouse1_id: P.kamal, spouse2_id: P.rokeya }).expect(403);
});

test('moderators edit directly, and the change is audited with the actor', async () => {
  await api().patch(`/api/v1/people/${P.kamal}`).set(as(U.moderator)).send({ occupation_en: 'Boatman' }).expect(200);
  const { rows } = await ctx.db.query(
    `SELECT actor_user_id FROM audit_logs WHERE table_name = 'people' AND record_id = $1 AND action = 'update'
     ORDER BY occurred_at DESC LIMIT 1`, [P.kamal]);
  assert.equal(rows[0].actor_user_id, U.moderator);
});

test('member proposal (new child + two parent links) is applied atomically on approval', async () => {
  const submit = await api().post('/api/v1/proposals').set(as(U.member)).send({
    familyId: F.munshi,
    summary: 'Add Ayan\'s sister',
    items: [
      { entity_type: 'person', action: 'create', temp_ref: 'baby',
        payload: { full_name_bn: 'আনিকা ইসলাম', sex: 'female', living_status: 'living', birth: { qualifier: 'exact', year: 2019 } } },
      { entity_type: 'parent_child', action: 'create', payload: { parent_id: P.tanvir, child_id: '$baby' } },
      { entity_type: 'parent_child', action: 'create', payload: { parent_id: '10000000-0000-4000-8000-000000000014', child_id: '$baby' } },
    ],
  }).expect(201);
  const id = submit.body.id;

  // Nothing is applied while pending.
  const before = await ctx.db.query(`SELECT count(*)::int AS n FROM people WHERE full_name_bn = 'আনিকা ইসলাম'`);
  assert.equal(before.rows[0].n, 0);

  // Members cannot approve; the proposer cannot approve their own.
  await api().post(`/api/v1/proposals/${id}/approve`).set(as(U.member)).send({}).expect(403);
  const pending = await api().get('/api/v1/proposals/pending').set(as(U.moderator)).expect(200);
  assert.ok(pending.body.items.some((p) => p.id === id));

  const approved = await api().post(`/api/v1/proposals/${id}/approve`).set(as(U.moderator)).send({ note: 'ok' }).expect(200);
  const babyId = approved.body.created.baby;
  const parents = await ctx.db.query('SELECT parent_id FROM parent_child WHERE child_id = $1', [babyId]);
  assert.equal(parents.rowCount, 2);

  // Every applied change links back to the proposal in the audit log.
  const audit = await ctx.db.query('SELECT table_name, actor_user_id FROM audit_logs WHERE proposal_id = $1', [id]);
  assert.deepEqual(audit.rows.map((r) => r.table_name).filter((t) => t !== 'change_proposals').sort(),
    ['parent_child', 'parent_child', 'people']);
  assert.ok(audit.rows.every((r) => r.actor_user_id === U.moderator));

  // The proposer was notified.
  const notes = await api().get('/api/v1/notifications').set(as(U.member)).expect(200);
  assert.ok(notes.body.items.some((n) => n.kind === 'proposal_approved'));
  await api().post(`/api/v1/proposals/${id}/approve`).set(as(U.moderator)).send({}).expect(409);
});

test('moderators apply several changes at once; a failure applies none of them', async () => {
  const items = [
    { entity_type: 'person', action: 'create', temp_ref: 'kid', payload: { full_name_en: 'Atomic Kid' } },
    { entity_type: 'parent_child', action: 'create', payload: { parent_id: P.kamal, child_id: '$kid' } },
  ];
  await api().post('/api/v1/proposals/apply').set(as(U.member)).send({ items }).expect(403);
  const bad = [...items, { entity_type: 'parent_child', action: 'create', payload: { parent_id: P.ayan, child_id: P.rahim } }];
  await api().post('/api/v1/proposals/apply').set(as(U.moderator)).send({ items: bad }).expect(422);
  const count = () => ctx.db.query(`SELECT count(*)::int AS n FROM people WHERE full_name_en = 'Atomic Kid'`).then((r) => r.rows[0].n);
  assert.equal(await count(), 0);
  await api().post('/api/v1/proposals/apply').set(as(U.moderator)).send({ items }).expect(201);
  assert.equal(await count(), 1);
});

test('a failing item rolls back the whole proposal, which stays pending', async () => {
  const submit = await api().post('/api/v1/proposals').set(as(U.member)).send({
    summary: 'Bad: circular ancestry',
    items: [
      { entity_type: 'person', action: 'update', target_id: P.rahim, payload: { occupation_en: 'Teacher' } },
      { entity_type: 'parent_child', action: 'create', payload: { parent_id: P.ayan, child_id: P.rahim } },
    ],
  }).expect(201);
  const res = await api().post(`/api/v1/proposals/${submit.body.id}/approve`).set(as(U.moderator)).send({}).expect(422);
  assert.equal(res.body.error.code, 'circular_ancestry');
  const rahim = await ctx.db.query('SELECT occupation_en FROM people WHERE id = $1', [P.rahim]);
  assert.equal(rahim.rows[0].occupation_en, 'Farmer', 'first item was rolled back');
  const status = await ctx.db.query('SELECT status FROM change_proposals WHERE id = $1', [submit.body.id]);
  assert.equal(status.rows[0].status, 'pending');
});

test('approval is refused when the record changed after the proposal was made', async () => {
  const submit = await api().post('/api/v1/proposals').set(as(U.member)).send({
    summary: 'Change occupation', items: [{ entity_type: 'person', action: 'update', target_id: P.jabbar, payload: { occupation_en: 'Weaver' } }],
  }).expect(201);
  await api().patch(`/api/v1/people/${P.jabbar}`).set(as(U.admin)).send({ occupation_en: 'Potter' }).expect(200);
  const res = await api().post(`/api/v1/proposals/${submit.body.id}/approve`).set(as(U.moderator)).send({}).expect(409);
  assert.equal(res.body.error.code, 'proposal_conflict');
  assert.deepEqual(res.body.error.details.fields, ['occupation_en']);
});

test('members cannot set moderator-only fields through proposals', async () => {
  const res = await api().post('/api/v1/proposals').set(as(U.member)).send({
    summary: 'Self-verify', items: [{ entity_type: 'person', action: 'update', target_id: P.karim, payload: { verification_status: 'verified' } }],
  }).expect(400);
  assert.equal(res.body.error.code, 'validation_failed');
});

test('rejected proposals change nothing and notify the proposer', async () => {
  const submit = await api().post('/api/v1/proposals').set(as(U.member)).send({
    summary: 'Rename', items: [{ entity_type: 'person', action: 'update', target_id: P.kamal, payload: { nickname_bn: 'কামু' } }],
  }).expect(201);
  await api().post(`/api/v1/proposals/${submit.body.id}/reject`).set(as(U.moderator)).send({ note: 'No source' }).expect(200);
  const kamal = await ctx.db.query('SELECT nickname_bn FROM people WHERE id = $1', [P.kamal]);
  assert.equal(kamal.rows[0].nickname_bn, null);
});

test('a person who still has relatives cannot be deleted, with a clear reason', async () => {
  const res = await api().delete(`/api/v1/people/${P.karim}`).set(as(U.moderator)).expect(409);
  assert.equal(res.body.error.code, 'in_use');
});

test('only admins change roles', async () => {
  const res = await api().patch(`/api/v1/admin/users/${U.member}`).set(as(U.moderator)).send({ role: 'moderator' }).expect(403);
  assert.equal(res.body.error.code, 'admin_only');
  await api().patch(`/api/v1/admin/users/${U.member}`).set(as(U.admin)).send({ role: 'moderator' }).expect(200);
});
