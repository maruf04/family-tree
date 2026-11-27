// "How is B related to A?" — blood relationships through the nearest common
// ancestor, plus one step through marriage (spouse, in-laws).
//
// The result carries what Bangla kinship terms need, beyond English ones:
//   side    'paternal' | 'maternal'  (চাচা vs মামা, দাদা vs নানা)
//   sex     B's sex                  (ভাই vs বোন)
//   viaSex  sex of the connecting relative on B's side (চাচাতো vs ফুপাতো)
import { notFound } from '../../errors.js';
import { query } from '../../db.js';
import { presentPerson } from '../genealogy/privacy.js';
import { fetchPersonSummaries } from '../genealogy/sql.js';

const MAX_DEPTH = 12;

/** Breadth-first walk up the tree: id → { depth, next } where `next` is one step closer to the start. */
async function ancestorsOf(id) {
  const { rows } = await query(
    `WITH RECURSIVE a (id, depth, next) AS (
       SELECT $1::uuid, 0, NULL::uuid
       UNION ALL
       SELECT pc.parent_id, a.depth + 1, a.id FROM parent_child pc JOIN a ON pc.child_id = a.id
       WHERE a.depth < $2
     )
     SELECT DISTINCT ON (id) id, depth, next FROM a ORDER BY id, depth`, [id, MAX_DEPTH]);
  return new Map(rows.map((r) => [r.id, r]));
}

async function bloodRelation(aId, bId) {
  if (aId === bId) return { key: 'self', dA: 0, dB: 0 };
  const [ancA, ancB] = await Promise.all([ancestorsOf(aId), ancestorsOf(bId)]);
  let best = null;
  for (const [id, a] of ancA) {
    const b = ancB.get(id);
    if (!b) continue;
    const score = a.depth + b.depth;
    if (!best || score < best.score) best = { id, score, dA: a.depth, dB: b.depth };
  }
  if (!best) return null;

  // Path from the common ancestor down to each person.
  const pathDown = (anc, from) => {
    const path = [];
    for (let cur = anc.get(from); cur; cur = cur.next ? anc.get(cur.next) : null) path.push(cur.id);
    return path; // [common ancestor, ..., person]
  };
  const pathA = pathDown(ancA, best.id);
  const pathB = pathDown(ancB, best.id);
  const commonAncestors = [...ancA.keys()].filter((id) => {
    const b = ancB.get(id);
    return b && ancA.get(id).depth === best.dA && b.depth === best.dB;
  });

  const { dA, dB } = best;
  let key;
  if (dA === 0) key = 'descendant';          // B descends from A
  else if (dB === 0) key = 'ancestor';       // B is A's ancestor
  else if (dA === 1 && dB === 1) key = 'sibling';
  else if (dA === 1) key = 'nibling';        // B is A's sibling's descendant
  else if (dB === 1) key = 'pibling';        // B is A's parent's/grandparent's sibling
  else key = 'cousin';
  return { key, dA, dB, pathA, pathB, commonAncestors };
}

async function sexOf(ids) {
  const { rows } = await query('SELECT id, sex FROM people WHERE id = ANY ($1::uuid[])', [ids.filter(Boolean)]);
  return new Map(rows.map((r) => [r.id, r.sex]));
}

async function describeBlood(aId, bId) {
  const rel = await bloodRelation(aId, bId);
  if (!rel) return null;
  if (rel.key === 'self') return { kind: 'self', key: 'self' };
  // A's side: the first person above A on the path (A's father or mother).
  const aParent = rel.pathA.length >= 2 ? rel.pathA[rel.pathA.length - 2] : null;
  // B's side: the child of the common ancestor on B's path.
  const bVia = rel.pathB.length >= 2 ? rel.pathB[1] : null;
  const sexes = await sexOf([bId, aParent, bVia]);
  const aParentSex = sexes.get(aParent);
  return {
    kind: 'blood',
    key: rel.key,
    generationsA: rel.dA,
    generationsB: rel.dB,
    greats: Math.max(0, Math.max(rel.dA, rel.dB) - 2),
    degree: Math.min(rel.dA, rel.dB) - 1,      // cousins: 1 = first cousin
    removed: Math.abs(rel.dA - rel.dB),
    sex: sexes.get(bId) ?? 'unknown',
    side: rel.key === 'descendant' ? null : aParentSex === 'male' ? 'paternal' : aParentSex === 'female' ? 'maternal' : null,
    viaSex: sexes.get(bVia) ?? 'unknown',
    commonAncestorIds: rel.commonAncestors,
  };
}

async function spousesOf(id) {
  const { rows } = await query(
    `SELECT CASE WHEN spouse1_id = $1 THEN spouse2_id ELSE spouse1_id END AS id
     FROM marriages WHERE $1 IN (spouse1_id, spouse2_id)`, [id]);
  return rows.map((r) => r.id);
}

export async function describeRelationship(viewer, aId, bId) {
  const { rows } = await query('SELECT id FROM people WHERE id = ANY ($1::uuid[])', [[aId, bId]]);
  if (rows.length < (aId === bId ? 1 : 2)) throw notFound('Person');

  let result = await describeBlood(aId, bId);
  if (!result) {
    const spousesA = await spousesOf(aId);
    if (spousesA.includes(bId)) {
      const s = await sexOf([bId]);
      result = { kind: 'spouse', key: 'spouse', sex: s.get(bId) };
    }
  }
  if (!result) {
    // B is married to one of A's blood relatives (e.g. a son's wife).
    for (const s of await spousesOf(bId)) {
      const viaRelative = await describeBlood(aId, s);
      if (viaRelative && viaRelative.kind === 'blood') {
        const sx = await sexOf([bId]);
        result = { kind: 'spouse_of_relative', key: 'spouse_of_relative', sex: sx.get(bId), via: viaRelative, viaPersonId: s };
        break;
      }
    }
  }
  if (!result) {
    // B is a blood relative of one of A's spouses (e.g. a wife's brother).
    for (const s of await spousesOf(aId)) {
      const rel = await describeBlood(s, bId);
      if (rel && rel.kind === 'blood') {
        result = { kind: 'relative_of_spouse', key: 'relative_of_spouse', sex: rel.sex, via: rel, viaPersonId: s };
        break;
      }
    }
  }
  result ??= { kind: 'none', key: 'none' };

  const ids = [aId, bId, result.viaPersonId, ...(result.commonAncestorIds ?? []), ...(result.via?.commonAncestorIds ?? [])];
  const people = await fetchPersonSummaries({ query }, [...new Set(ids.filter(Boolean))]);
  const present = (id) => (id ? presentPerson(people.get(id), viewer) : null);
  return {
    ...result,
    personA: present(aId),
    personB: present(bId),
    viaPerson: present(result.viaPersonId),
    commonAncestors: (result.commonAncestorIds ?? result.via?.commonAncestorIds ?? []).map(present),
  };
}
