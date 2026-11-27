// News moderation, membership verification, community and content CRUD.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import request from 'supertest';
import { P, U, as, setupApp } from './setup.js';

let ctx;
before(async () => { ctx = await setupApp(); });
after(async () => { await ctx?.close(); });
const api = () => request(ctx.app);
const NEW_USER = '90000000-0000-4000-8000-0000000000bb';

test('member news is hidden until a moderator publishes it', async () => {
  const { body } = await api().post('/api/v1/affairs/news').set(as(U.member))
    .send({ category_slug: 'local', title_bn: 'সংবাদ', body_bn: 'বিস্তারিত', publish: true }).expect(201);
  assert.equal(body.status, 'submitted', 'members cannot publish directly');
  const listed = async () => (await api().get('/api/v1/affairs/news').set(as(U.member))).body.items.some((n) => n.id === body.id);
  assert.equal(await listed(), false);
  await api().post(`/api/v1/affairs/news/${body.id}/review`).set(as(U.member)).send({ decision: 'publish' }).expect(403);
  await api().post(`/api/v1/affairs/news/${body.id}/review`).set(as(U.moderator)).send({ decision: 'publish' }).expect(200);
  assert.equal(await listed(), true);
  await api().post(`/api/v1/affairs/news/${body.id}/review`).set(as(U.moderator)).send({ decision: 'reject' }).expect(409);
});

test('rejected news stays unpublished', async () => {
  const { body } = await api().post('/api/v1/affairs/news').set(as(U.member)).send({ category_slug: 'local', title_bn: 'ক', body_bn: 'খ' }).expect(201);
  await api().post(`/api/v1/affairs/news/${body.id}/review`).set(as(U.moderator)).send({ decision: 'reject', note: 'no source' }).expect(200);
  const { rows } = await ctx.db.query('SELECT status, published_at FROM news_articles WHERE id = $1', [body.id]);
  assert.deepEqual(rows[0], { status: 'rejected', published_at: null });
});

test('register → verification request → approval links the claimed person', async () => {
  await api().get('/api/v1/community/posts').set(as(NEW_USER)).expect(403);
  await api().post('/api/v1/auth/profile').set(as(NEW_USER)).send({ display_name_bn: 'তানভীর' }).expect(201);
  const { body } = await api().post('/api/v1/auth/verification-requests').set(as(NEW_USER)).send({ claimed_person_id: P.tanvir, father_name: 'শফিকুল' }).expect(201);
  await api().post('/api/v1/auth/verification-requests').set(as(NEW_USER)).send({}).expect(409);
  await api().post(`/api/v1/admin/verification-requests/${body.id}/review`).set(as(U.member)).send({ decision: 'approve' }).expect(403);
  await api().post(`/api/v1/admin/verification-requests/${body.id}/review`).set(as(U.moderator)).send({ decision: 'approve' }).expect(200);
  const me = await api().get('/api/v1/auth/me').set(as(NEW_USER)).expect(200);
  assert.equal(me.body.user.membership_status, 'verified');
  assert.equal(me.body.person.id, P.tanvir);
  assert.equal(me.body.person.redacted, false, 'people see their own details');
});

test('content: public history without login, members-only otherwise, moderators write', async () => {
  const guest = await api().get('/api/v1/history/events').expect(200);
  assert.equal(guest.body.items.length, 0, 'sample events are members-level');
  await api().get('/api/v1/directory/places').expect(401);
  const event = { title_bn: 'ঘটনা', event_date: { qualifier: 'about', year: 1900 }, privacy_level: 'public' };
  await api().post('/api/v1/history/events').set(as(U.member)).send(event).expect(403);
  const { body } = await api().post('/api/v1/history/events').set(as(U.moderator)).send(event).expect(201);
  const shown = await api().get(`/api/v1/history/events/${body.id}`).expect(200);
  assert.deepEqual(shown.body.event_date, { qualifier: 'about', year: 1900 });
});

test('members edit only their own businesses', async () => {
  const { body } = await api().post('/api/v1/directory/businesses').set(as(U.member)).send({ name_bn: 'দোকান', business_type: 'grocery' }).expect(201);
  await api().patch(`/api/v1/directory/businesses/${body.id}`).set(as(U.member)).send({ name_bn: 'নতুন দোকান' }).expect(200);
  await api().patch(`/api/v1/directory/businesses/${body.id}`).set(as(NEW_USER)).send({ name_bn: 'x' }).expect(403);
});

test('reactions are one per member; moderators can remove posts, others cannot', async () => {
  const { body } = await api().post('/api/v1/community/posts').set(as(U.member)).send({ body: 'পোস্ট' }).expect(201);
  for (const reaction of ['like', 'love']) await api().put(`/api/v1/community/posts/${body.id}/reaction`).set(as(U.admin)).send({ reaction }).expect(204);
  const post = await api().get(`/api/v1/community/posts/${body.id}`).set(as(U.admin)).expect(200);
  assert.deepEqual(post.body.reactions, { love: 1 });
  await api().delete(`/api/v1/community/posts/${body.id}`).set(as(NEW_USER)).expect(403);
  await api().delete(`/api/v1/community/posts/${body.id}`).set(as(U.moderator)).expect(204);
  await api().get(`/api/v1/community/posts/${body.id}`).set(as(U.member)).expect(404);
});

test('moderators edit the village profile; members cannot', async () => {
  await api().patch('/api/v1/home/village').set(as(U.member)).send({ name_bn: 'ক' }).expect(403);
  await api().patch('/api/v1/home/village').set(as(U.moderator)).send({ name_bn: 'নতুন নাম', established: { qualifier: 'about', year: 1850 }, upazila: null }).expect(204);
  const { body } = await api().get('/api/v1/home').set(as(U.member)).expect(200);
  assert.equal(body.village.name_bn, 'নতুন নাম');
  assert.deepEqual(body.village.established, { qualifier: 'about', year: 1850 });
  assert.equal(body.village.upazila, null);
  assert.equal(body.hasSampleData, true, 'renaming the village must not hide the sample-data notice');
});

test('dev login tokens are refused in production', async () => {
  const { config } = await import('../src/config.js');
  config.devAuth = false;
  try {
    await api().get('/api/v1/people').set(as(U.admin)).expect(401);
    await api().get('/api/v1/auth/dev-users').expect(404);
  } finally { config.devAuth = true; }
});
