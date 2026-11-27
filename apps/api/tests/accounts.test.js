// Managed accounts and what outsiders can see. Supabase is replaced by a fake.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import request from 'supertest';
import { P, U, as, setupApp } from './setup.js';

let ctx;
const logins = new Map();
before(async () => {
  ctx = await setupApp();
  const { setAuthAdmin } = await import('../src/lib/authAdmin.js');
  setAuthAdmin({
    async create(email, password) { const id = randomUUID(); logins.set(id, { email, password }); return id; },
    async setPassword(id, password) { logins.get(id).password = password; },
    async remove(id) { logins.delete(id); },
    async verifyPassword(id, password) { return logins.get(id)?.password === password; },
  });
});
after(async () => { await ctx?.close(); });
const api = () => request(ctx.app);
const create = (by, body) => api().post('/api/v1/accounts').set(as(by)).send({ display_name_bn: 'নাম', ...body });

test('a temporary password gives no access until it is changed', async () => {
  const { body } = await create(U.moderator, { username: 'Karim.1', person_id: P.tanvir }).expect(201);
  assert.equal(body.username, 'karim.1');
  assert.match(body.temporaryPassword, /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  const blocked = await api().get('/api/v1/people').set(as(body.id)).expect(403);
  assert.equal(blocked.body.error.code, 'password_change_required');
  for (const path of ['/api/v1/history/events', '/api/v1/home']) {
    const res = await api().get(path).set(as(body.id)).expect(200);
    assert.ok(!res.body.latestPosts && !(res.body.items?.length), `${path} must stay public-only`);
  }
  const change = (current_password, new_password) => api().post('/api/v1/accounts/me/password').set(as(body.id)).send({ current_password, new_password });
  assert.equal((await change('wrong', 'new-password-1').expect(400)).body.error.code, 'wrong_password');
  await change(body.temporaryPassword, 'short').expect(400);
  await change(body.temporaryPassword, body.temporaryPassword).expect(400);
  await change(body.temporaryPassword, 'new-password-1').expect(204);
  await api().get('/api/v1/people').set(as(body.id)).expect(200);
});

test('who may create and reset accounts', async () => {
  await create(U.member, { username: 'nope' }).expect(403);
  await create(U.moderator, { username: 'newmod', role: 'moderator' }).expect(403);
  const mod = await create(U.admin, { username: 'newmod', role: 'moderator' }).expect(201);
  await api().post(`/api/v1/accounts/${mod.body.id}/reset-password`).set(as(U.moderator)).expect(403);
  const reset = await api().post(`/api/v1/accounts/${mod.body.id}/reset-password`).set(as(U.admin)).expect(200);
  assert.equal(logins.get(mod.body.id).password, reset.body.temporaryPassword);
  await api().post(`/api/v1/accounts/${U.admin}/reset-password`).set(as(U.admin)).expect(400);
});

test('duplicates are refused and never leave an orphan login behind', async () => {
  const before = logins.size;
  assert.equal((await create(U.admin, { username: 'newmod' }).expect(409)).body.error.code, 'username_taken');
  assert.equal((await create(U.admin, { username: 'other', person_id: P.tanvir }).expect(409)).body.error.code, 'person_has_account');
  await create(U.admin, { username: 'ghost', person_id: randomUUID() }).expect(409);
  assert.equal(logins.size, before);
});

test('passwords never reach the database or its audit log', async () => {
  const { body } = await create(U.admin, { username: 'secretcheck' }).expect(201);
  const { rows } = await ctx.db.query(
    `SELECT count(*)::int AS n FROM audit_logs WHERE new_data::text LIKE '%' || $1 || '%'`, [body.temporaryPassword]);
  assert.equal(rows[0].n, 0);
});

test('password guessing is limited', async () => {
  const { body } = await create(U.admin, { username: 'guessme' }).expect(201);
  let last;
  for (let i = 0; i < 9; i += 1) last = await api().post('/api/v1/accounts/me/password').set(as(body.id)).send({ current_password: `x${i}`, new_password: 'long-enough-1' });
  assert.equal(last.body.error.code, 'too_many_attempts');
});

test('self-registration is closed unless switched on', async () => {
  const { config } = await import('../src/config.js');
  config.allowRegistration = false;
  try {
    const res = await api().post('/api/v1/auth/profile').set(as(randomUUID())).send({ display_name_bn: 'x' }).expect(403);
    assert.equal(res.body.error.code, 'registration_closed');
  } finally { config.allowRegistration = true; }
});

test('outsiders see only the name and totals', async () => {
  const { body } = await api().get('/api/v1/home').expect(200);
  assert.deepEqual(Object.keys(body).sort(), ['hasSampleData', 'stats', 'village']);
  assert.deepEqual(Object.keys(body.village).sort(), ['name_bn', 'name_en', 'tagline_bn', 'tagline_en']);
  assert.deepEqual(Object.keys(body.stats).sort(), ['families', 'generations', 'members', 'people']);
  for (const path of ['people', 'families', 'community/posts', 'community/events', 'affairs/news', 'affairs/announcements/active', 'directory/places', 'directory/residents', 'history/documents', 'proposals/mine', 'admin/users', 'accounts', 'import', 'notifications']) {
    const res = await api().get(`/api/v1/${path}`);
    assert.ok([401, 404].includes(res.status), `${path} answered ${res.status} to an outsider`);
  }
});
