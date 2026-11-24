// Layout tests on real API responses (fictional sample data).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SIZES, layoutAncestors, layoutDescendants, mergeGraphs } from './layout.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./__fixtures__/${name}.json`, import.meta.url)));
const P = {
  rahim: '10000000-0000-4000-8000-000000000001', karim: '10000000-0000-4000-8000-000000000003',
  jabbar: '10000000-0000-4000-8000-000000000004', ayesha: '10000000-0000-4000-8000-000000000006',
  salma: '10000000-0000-4000-8000-000000000007', fatema: '10000000-0000-4000-8000-000000000011',
  abdurRahman: '10000000-0000-4000-8000-000000000020', rokeya: '10000000-0000-4000-8000-000000000021',
  nurul: '10000000-0000-4000-8000-000000000022', hasina: '10000000-0000-4000-8000-000000000023',
  sultan: '10000000-0000-4000-8000-000000000024', kamal: '10000000-0000-4000-8000-000000000025',
  morium: '10000000-0000-4000-8000-000000000026', habib: '10000000-0000-4000-8000-000000000027',
};

function assertNoOverlap(nodes) {
  const cards = nodes.filter((n) => n.type !== 'union');
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      const a = cards[i].position;
      const b = cards[j].position;
      const overlap = Math.abs(a.x - b.x) < SIZES.CARD_W && Math.abs(a.y - b.y) < SIZES.CARD_H;
      assert.ok(!overlap, `cards overlap: ${cards[i].id} and ${cards[j].id}`);
    }
  }
}

const descendants = () => layoutDescendants(fixture('rahim-descendants'));

test('all three of Karim\'s spouses are on his row, side by side, in recorded order', () => {
  const { nodes } = descendants();
  const at = (id) => nodes.find((n) => n.id === id).position;
  const karim = at(P.karim);
  const wives = [P.ayesha, P.fatema, P.salma].map(at);
  for (const w of wives) assert.equal(w.y, karim.y, 'spouse on the same generation row');
  assert.ok(karim.x < wives[0].x && wives[0].x < wives[1].x && wives[1].x < wives[2].x, 'ordered 1st, 2nd, 3rd wife');
});

test('each child hangs from the union of Karim and their actual mother', () => {
  const { edges } = descendants();
  const unionOf = (child) => edges.find((e) => e.type === 'family' && e.target === child)?.source;
  const expected = {
    [P.abdurRahman]: P.ayesha, [P.rokeya]: P.ayesha,
    [P.nurul]: P.fatema, [P.hasina]: P.fatema, [P.sultan]: P.fatema,
    [P.kamal]: P.salma,
  };
  for (const [child, mother] of Object.entries(expected)) {
    assert.equal(unionOf(child), `u:${P.karim}|${mother}`, `child ${child} under wrong union`);
  }
});

test('children of different marriages are grouped left-to-right by marriage', () => {
  const { nodes } = descendants();
  const x = (id) => nodes.find((n) => n.id === id).position.x;
  const ayeshaKids = [P.abdurRahman, P.rokeya].map(x);
  const fatemaKids = [P.nurul, P.hasina, P.sultan].map(x);
  const salmaKids = [P.kamal].map(x);
  assert.ok(Math.max(...ayeshaKids) < Math.min(...fatemaKids));
  assert.ok(Math.max(...fatemaKids) < Math.min(...salmaKids));
});

test('every marriage has its own rail and colour; adoption is marked on the edge', () => {
  const { edges } = descendants();
  const marriages = edges.filter((e) => e.type === 'marriage' && e.source === P.karim);
  assert.equal(marriages.length, 3);
  assert.equal(new Set(marriages.map((m) => m.data.railY)).size, 3, 'distinct rails');
  assert.equal(new Set(marriages.map((m) => m.data.colorIndex)).size, 3, 'distinct colours');
  assert.equal(edges.find((e) => e.target === P.sultan).data.relationshipType, 'adoptive');
});

test('a six-generation tree with a cousin marriage has no overlapping cards', () => {
  assertNoOverlap(descendants().nodes);
});

test('a person reached twice (cousin marriage) is drawn once plus a reference card', () => {
  const { nodes } = descendants();
  const real = nodes.filter((n) => n.type === 'person' && n.id === P.morium);
  const refs = nodes.filter((n) => n.type === 'personRef' && n.data.personId === P.morium);
  assert.equal(real.length, 1);
  assert.equal(refs.length, 1);
  assert.equal(new Set(nodes.map((n) => n.id)).size, nodes.length, 'node ids are unique');
});

test('collapsing a person hides their descendants and reports the count', () => {
  const full = descendants();
  const collapsed = layoutDescendants(fixture('rahim-descendants'), { collapsed: new Set([P.karim]) });
  assert.ok(!collapsed.nodes.some((n) => n.id === P.nurul));
  const karim = collapsed.nodes.find((n) => n.id === P.karim);
  assert.equal(karim.data.collapsed, true);
  assert.equal(karim.data.hiddenCount, 6);
  // Spouses remain visible while collapsed.
  assert.ok(collapsed.nodes.some((n) => n.id === P.salma));
  assert.ok(collapsed.nodes.length < full.nodes.length);
});

test('ancestor view: parents above the child, repeated ancestor drawn once', () => {
  const { nodes, edges } = layoutAncestors(fixture('habib-ancestors'));
  const y = (id) => nodes.find((n) => n.id === id)?.position.y;
  assert.ok(y(P.abdurRahman) < y(P.habib));
  assert.ok(y(P.karim) < y(P.abdurRahman));
  assert.equal(nodes.filter((n) => n.type === 'person' && n.id === P.rahim).length, 1);
  assert.ok(nodes.some((n) => n.type === 'personRef' && n.data.personId === P.rahim), 'second path shown as reference');
  assert.ok(edges.some((e) => e.type === 'marriage'));
  assertNoOverlap(nodes);
});

test('ancestor view shows siblings and spouses on the root row without overlap', () => {
  const { nodes } = layoutAncestors(fixture('rahman-ancestors'));
  const rahman = nodes.find((n) => n.id === P.abdurRahman).position;
  const rokeya = nodes.find((n) => n.id === P.rokeya).position;
  const morium = nodes.find((n) => n.id === P.morium);
  assert.equal(rokeya.y, rahman.y);
  assert.ok(rokeya.x < rahman.x, 'siblings to the left');
  assert.ok(morium && morium.position.x > rahman.x, 'spouse to the right');
  assertNoOverlap(nodes);
});

test('merging a lazily loaded subtree adds nodes without duplicates', () => {
  const base = fixture('rahim-descendants');
  const extra = { ...base, nodes: base.nodes.slice(0, 3).map((n) => ({ ...n, data: { ...n.data, hasMoreChildren: false } })), edges: base.edges.slice(0, 2) };
  const merged = mergeGraphs(base, extra);
  assert.equal(merged.nodes.length, base.nodes.length);
  assert.equal(merged.edges.length, base.edges.length);
});
