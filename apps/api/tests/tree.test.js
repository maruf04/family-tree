// API-level version of the most important requirement: a person with three
// spouses appears in ONE descendant-tree response with all spouses, and every
// child is connected to the correct parents.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import request from 'supertest';
import { P, U, as, setupApp } from './setup.js';

let ctx;
before(async () => { ctx = await setupApp(); });
after(async () => { await ctx?.close(); });

const tree = (id, q) => request(ctx.app).get(`/api/v1/people/${id}/tree`).query(q).set(as(U.member));

test('descendant tree contains all three spouses with typed edges', async () => {
  const res = await tree(P.karim, { view: 'descendants', depth: 1 }).expect(200);
  const byId = new Map(res.body.nodes.map((n) => [n.id, n]));
  for (const wife of [P.ayesha, P.fatema, P.salma]) {
    assert.equal(byId.get(wife)?.data.role, 'spouse');
    assert.equal(byId.get(wife).data.generation, 0, 'spouses share the root generation');
  }
  const marriages = res.body.edges.filter((e) => e.type === 'marriage' && [e.source, e.target].includes(P.karim));
  assert.equal(marriages.length, 3);
  assert.deepEqual(marriages.map((m) => m.data.status).sort(), ['divorced', 'widowed', 'widowed']);
  for (const n of res.body.nodes) assert.deepEqual(n.position, { x: 0, y: 0 });
});

test('every child is connected to Karim and exactly the right mother', async () => {
  const res = await tree(P.karim, { view: 'descendants', depth: 1 }).expect(200);
  const parentsOf = {};
  for (const e of res.body.edges.filter((x) => x.type === 'parentChild')) (parentsOf[e.target] ??= []).push(e.source);
  const expected = {
    [P.abdurRahman]: P.ayesha, [P.rokeya]: P.ayesha,
    [P.nurul]: P.fatema, [P.hasina]: P.fatema, [P.sultan]: P.fatema,
    [P.kamal]: P.salma,
  };
  for (const [child, mother] of Object.entries(expected)) {
    assert.deepEqual(new Set(parentsOf[child]), new Set([P.karim, mother]), `wrong parents for ${child}`);
  }
  const adoption = res.body.edges.find((e) => e.type === 'parentChild' && e.target === P.sultan);
  assert.equal(adoption.data.relationshipType, 'adoptive');
});

test('depth limit marks nodes with more descendants for lazy loading', async () => {
  const res = await tree(P.karim, { view: 'descendants', depth: 1 }).expect(200);
  const nurul = res.body.nodes.find((n) => n.id === P.nurul);
  assert.equal(nurul.data.hasMoreChildren, true);
  const salma = res.body.nodes.find((n) => n.id === P.salma);
  assert.equal(salma.data.hasMoreChildren, false, 'spouses are not expanded');
});

test('ancestor tree climbs to the root ancestor with siblings and parents\' marriages', async () => {
  const res = await tree(P.ayan, { view: 'ancestors', depth: 6 }).expect(200);
  const rahim = res.body.nodes.find((n) => n.id === P.rahim);
  assert.equal(rahim.data.generation, -5);
  const ayanParents = res.body.edges.filter((e) => e.type === 'parentChild' && e.target === P.ayan);
  assert.equal(ayanParents.length, 2);
  // Karim's three marriages are not all ancestry: only Karim-Fatema is on Ayan's line.
  const karimMarriages = res.body.edges.filter((e) => e.type === 'marriage' && [e.source, e.target].includes(P.karim));
  assert.equal(karimMarriages.length, 1);
});

test('repeated ancestors appear once in the ancestor tree', async () => {
  const res = await tree(P.habib, { view: 'ancestors', depth: 6 }).expect(200);
  const ids = res.body.nodes.map((n) => n.id);
  assert.equal(ids.filter((id) => id === P.rahim).length, 1);
  // ... but are connected along both paths (via Karim and via Jabbar).
  const fromRahim = res.body.edges.filter((e) => e.type === 'parentChild' && e.source === P.rahim).map((e) => e.target);
  assert.deepEqual(new Set(fromRahim), new Set([P.karim, P.jabbar]));
});

test('living people are redacted for ordinary members, not for moderators', async () => {
  const member = await tree(P.shafiqul, { view: 'descendants', depth: 1 }).expect(200);
  const tanvir = member.body.nodes.find((n) => n.id === P.tanvir).data.person;
  assert.equal(tanvir.redacted, true);
  assert.equal(tanvir.birth, null);
  assert.ok(tanvir.full_name_bn, 'names stay visible so the tree is navigable');

  const mod = await request(ctx.app).get(`/api/v1/people/${P.shafiqul}/tree`).query({ depth: 1 }).set(as(U.moderator)).expect(200);
  const tanvirMod = mod.body.nodes.find((n) => n.id === P.tanvir).data.person;
  assert.equal(tanvirMod.redacted, false);
  assert.deepEqual(tanvirMod.birth, { qualifier: 'exact', year: 1980 });
});

test('person profile groups children under the correct spouse', async () => {
  const res = await request(ctx.app).get(`/api/v1/people/${P.karim}`).set(as(U.member)).expect(200);
  const groups = res.body.children_by_spouse.map((g) => ({
    spouse: g.co_parent?.full_name_en, children: g.children.map((c) => c.person.full_name_en).sort(),
  }));
  assert.deepEqual(groups, [
    { spouse: 'Ayesha Begum', children: ['Abdur Rahman', 'Rokeya Begum'] },
    { spouse: 'Fatema Begum', children: ['Hasina Akter', 'Nurul Islam', 'Sultan Ahmed'] },
    { spouse: 'Salma Begum', children: ['Kamal Hossain'] },
  ]);
});

test('kinship: paternal uncle and cousins carry side/sex for Bangla terms', async () => {
  const uncle = await request(ctx.app).get(`/api/v1/people/${P.shafiqul}/relationship/${P.kamal}`).set(as(U.member)).expect(200);
  assert.equal(uncle.body.key, 'pibling');
  assert.equal(uncle.body.side, 'paternal');
  assert.equal(uncle.body.sex, 'male');   // চাচা
  const spouse = await request(ctx.app).get(`/api/v1/people/${P.karim}/relationship/${P.salma}`).set(as(U.member)).expect(200);
  assert.equal(spouse.body.kind, 'spouse');
});
