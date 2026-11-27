// Spreadsheet import: one family, checked first, then applied.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import request from 'supertest';
import { parseCsv, readDate, readLiving, readSex } from '../src/modules/import/parse.js';
import { U, as, setupApp } from './setup.js';

let ctx;
before(async () => { ctx = await setupApp(); });
after(async () => { await ctx?.close(); });

const HEAD = '﻿কোড,নাম (বাংলা),নাম (ইংরেজি),ডাক নাম,লিঙ্গ,জন্ম,মৃত্যু,জীবিত,বাবার কোড,মায়ের কোড,সম্পর্ক,পেশা,জন্মস্থান,জীবনী\r\n';
const PEOPLE = `${HEAD}১,প্রপিতামহ,,,পুরুষ,~১৮৫০,,না,,,,,,
2,আদি মাতা,,,নারী,,,না,,,,,,
3,দাদা,,,পুরুষ,1880,14/08/1952,,1,2,,কৃষক,,"প্রথম লাইন
দ্বিতীয় ""লাইন"""
4,প্রথম স্ত্রী,,,নারী,,,না,,,,,,
5,দ্বিতীয় স্ত্রী,,,নারী,,,না,,,,,,
6,প্রথম ঘরের ছেলে,,,পুরুষ,1905..1910,,না,3,4,,,,
7,দ্বিতীয় ঘরের মেয়ে,,,নারী,1920-05,,না,3,5,,,,
8,দত্তক ছেলে,,,পুরুষ,,,না,3,5,দত্তক,,,
9,জামাই,,,পুরুষ,,,না,,,,,,
10,মেয়ের ঘরের নাতি,,,পুরুষ,1950,,হ্যাঁ,9,7,,,,
`;
const MARRIAGES = `স্বামীর কোড,স্ত্রীর কোড,কততম স্ত্রী,অবস্থা,বিবাহের তারিখ,সমাপ্তির তারিখ
1,2,১,,,
3,4,1,মৃত্যুতে সমাপ্ত,~1900,1912
3,5,2,,1915,
9,7,,,,
`;
const send = (body, user = U.moderator) => request(ctx.app).post('/api/v1/import').set(as(user))
  .send({ people: PEOPLE, marriages: MARRIAGES, root: '1', familyNameBn: 'পরীক্ষা বাড়ী', ...body });
const total = async () => (await ctx.db.query('SELECT count(*)::int AS n FROM people')).rows[0].n;

test('dates are read exactly and never guessed', () => {
  assert.equal(readDate(''), null);
  assert.deepEqual(readDate('~১৮৫০'), { qualifier: 'about', year: 1850 });
  assert.deepEqual(readDate('1952-08'), { qualifier: 'exact', year: 1952, month: 8 });
  assert.deepEqual(readDate('14/08/1952'), { qualifier: 'exact', year: 1952, month: 8, day: 14 });
  assert.deepEqual(readDate('1880..1885'), { qualifier: 'between', year: 1880, year_to: 1885 });
  assert.deepEqual(readDate('<1900'), { qualifier: 'before', year: 1900 });
  for (const bad of ['80', 'ছোটবেলায়', '1952/8', '1880-1885']) assert.throws(() => readDate(bad), undefined, bad);
});

test('everyday words are understood in either Unicode spelling of য়', () => {
  for (const word of ['মেয়ে', 'মে\u09DFে', 'মে\u09AF\u09BCে', 'নারী', 'Female ']) assert.equal(readSex(word), 'female', word);
  assert.equal(readSex('ছেলে'), 'male');
  assert.equal(readLiving('প্র\u09DFাত'), 'deceased');
});

test('CSV: quotes, line breaks, semicolons, BOM and true line numbers', () => {
  assert.deepEqual(parseCsv('﻿a;b\r\n"x;1";"q""q"\r\n\r\n;;\n"l1\nl2";z'), [
    { line: 1, cells: ['a', 'b'] }, { line: 2, cells: ['x;1', 'q"q'] }, { line: 5, cells: ['l1\nl2', 'z'] }]);
});

test('members cannot import; a check changes nothing', async () => {
  await send({}, U.member).expect(403);
  const before = await total();
  const { body } = await send({}).expect(200);
  assert.deepEqual(body.errors, []);
  assert.equal(body.applied, false);
  assert.deepEqual(body.counts, { people: 10, peopleExisting: 0, parents: 10, marriages: 4, members: 7 });
  assert.equal(await total(), before);
});

test('import builds the family: both wives together, children under their own mother', async () => {
  const { body } = await send({ apply: true }).expect(200);
  assert.deepEqual([body.applied, body.errors], [true, []]);
  const { rows } = await ctx.db.query(`SELECT id FROM people WHERE import_code = '3'`);
  const profile = await request(ctx.app).get(`/api/v1/people/${rows[0].id}`).set(as(U.moderator)).expect(200);
  assert.deepEqual(profile.body.children_by_spouse.map((g) => [g.co_parent.full_name_bn, g.children.map((c) => `${c.person.full_name_bn}/${c.relationship_type}`)]), [
    ['প্রথম স্ত্রী', ['প্রথম ঘরের ছেলে/biological']],
    ['দ্বিতীয় স্ত্রী', ['দ্বিতীয় ঘরের মেয়ে/biological', 'দত্তক ছেলে/adoptive']],
  ]);
  assert.equal(profile.body.person.biography_bn, 'প্রথম লাইন\nদ্বিতীয় "লাইন"');
  assert.deepEqual(profile.body.person.death, { qualifier: 'exact', year: 1952, month: 8, day: 14 });
});

test('the lineage follows the father: daughters belong, their children and husbands do not', async () => {
  const { rows } = await ctx.db.query(
    `SELECT p.import_code AS code, fm.membership_type AS type FROM family_members fm JOIN people p ON p.id = fm.person_id
     JOIN families f ON f.id = fm.family_id WHERE f.name_bn = 'পরীক্ষা বাড়ী' ORDER BY p.import_code::int`);
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.code, r.type])),
    { 1: 'lineage', 2: 'marriage', 3: 'lineage', 4: 'marriage', 5: 'marriage', 6: 'lineage', 7: 'lineage', 8: 'adoption' });
});

test('spouses: on the tree in both views, for sons and daughters alike, with a simple profile', async () => {
  const { rows } = await ctx.db.query('SELECT import_code AS code, id FROM people WHERE import_code IS NOT NULL');
  const id = Object.fromEntries(rows.map((r) => [r.code, r.id]));
  const get = (path) => request(ctx.app).get(`/api/v1/people/${path}`).set(as(U.moderator)).expect(200).then((r) => r.body);
  const roles = async (code, view) => Object.fromEntries((await get(`${id[code]}/tree?view=${view}&depth=6`)).nodes.map((n) => [rows.find((r) => r.id === n.id).code, n.data.role]));

  const whole = await roles('1', 'descendants');
  assert.deepEqual([whole['4'], whole['5'], whole['9']], ['spouse', 'spouse', 'spouse'], "sons' wives and the daughter's husband");
  assert.equal(whole['10'], 'descendant', "a daughter's child is on the tree");
  assert.equal((await roles('7', 'ancestors'))['9'], 'spouse', 'daughter: husband in the ancestor view');
  const son = await roles('3', 'ancestors');
  assert.deepEqual([son['4'], son['5']], ['spouse', 'spouse'], 'son: both wives in the ancestor view');

  const daughter = await get(id['7']);
  assert.deepEqual(daughter.children_by_spouse.map((g) => [g.co_parent.full_name_bn, g.children.map((c) => c.person.full_name_bn)]), [['জামাই', ['মেয়ের ঘরের নাতি']]]);
  const husband = await get(id['9']);
  assert.deepEqual([husband.married_in, husband.children_by_spouse[0].children.length], [true, 1]);
  assert.equal((await roles('9', 'descendants'))['7'], 'spouse', "the husband's own tree shows his wife");
  assert.equal((await get(id['4'])).married_in, true);
  for (const code of ['1', '3', '7', '8', '10']) assert.equal((await get(id[code])).married_in, false, code);
});

test('uploading the same sheet again creates nothing; new rows are added', async () => {
  const before = await total();
  const again = await send({ apply: true }).expect(200);
  assert.deepEqual(again.body.counts, { people: 0, peopleExisting: 10, parents: 0, marriages: 0, members: 0 });
  await send({ people: `${PEOPLE}11,নতুন নাতি,,,পুরুষ,,,হ্যাঁ,6,,,,,\n`, apply: true }).expect(200);
  assert.equal(await total(), before + 1);
});

test('every mistake is reported with its line, and nothing is imported', async () => {
  const before = await total();
  const people = `${HEAD}A1,ক,,,পুরুষ,,,না,,,,,,
A1,খ,,,পুরুষ,,,,,,,,,
A2,গ,,,জানি না,,,,,,,,,
A3,ঘ,,,নারী,গতকাল,,,,,,,,
A4,,,,নারী,,,,,,,,,
A5,ঙ,,,নারী,1950,1940,,,,,,,
A6,চ,,,পুরুষ,,,,ZZ,,,,,
A7,ছ,,,নারী,,,,A8,,,,,
A8,জ,,,নারী,,,,,,,,,
A9,ঝ,,,পুরুষ,,1990,হ্যাঁ,,,,,,
B1,ঞ,,,পুরুষ,,,,B2,,,,,
B2,ট,,,পুরুষ,,,,B1,,,,,
`;
  const { body } = await send({ people, marriages: 'স্বামীর কোড,স্ত্রীর কোড\nA8,A1\nA1,QQ\n', root: 'A1', apply: true }).expect(200);
  assert.equal(body.applied, false);
  assert.deepEqual(body.errors.map((e) => `${e.file[0]}${e.line}:${e.code}`).sort(), [
    'm2:husband_wrong_sex', 'm3:wife_not_found', 'p10:living_with_death'.replace('p10', 'p11'), 'p13:circular_ancestry',
    'p3:code_repeated', 'p4:sex_unknown_value', 'p5:date_unreadable', 'p6:name_missing', 'p7:people_death_not_before_birth',
    'p8:father_not_found', 'p9:father_wrong_sex'].sort());
  assert.equal(await total(), before);
});

test('wrong files are explained', async () => {
  const codes = async (body) => (await send(body).expect(200)).body.errors.map((e) => e.code);
  assert.ok((await codes({ people: 'x,y\n1,2\n' })).includes('missing_columns'));
  assert.ok((await codes({ people: 'কোড,লিঙ্গ\n1,�\n' })).includes('file_encoding'));
  assert.ok((await codes({ root: '999' })).includes('root_not_found'));
});
