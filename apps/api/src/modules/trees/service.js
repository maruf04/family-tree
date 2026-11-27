// Family-tree graphs for React Flow.
//
// Response shape (positions are computed by the client layout):
//   { rootId, view, depth,
//     nodes: [{ id, type: 'person', position: {x:0,y:0},
//               data: { person, generation, role, hasMoreParents, hasMoreChildren } }],
//     edges: [{ id, source, target, type: 'marriage',    data: { marriageId, status, ... } },
//             { id, source, target, type: 'parentChild', data: { relationshipType, certainty } }] }
//
// Descendant view: the root, ALL of each descendant's spouses (and any
// unmarried co-parents), and every child linked to its actual parents. The
// client groups children under the couple using the parentChild edges, so a
// child can never be drawn under the wrong spouse.
// Ancestor view: parents, grandparents… plus the root's siblings and spouses.
// Generations: descendants are positive (downwards), ancestors negative (upwards).
import { notFound } from '../../errors.js';
import { query } from '../../db.js';
import { presentPerson } from '../genealogy/privacy.js';
import { fetchPersonSummaries } from '../genealogy/sql.js';

async function assertPerson(id) {
  const { rowCount } = await query('SELECT 1 FROM people WHERE id = $1', [id]);
  if (!rowCount) throw notFound('Person');
}

function marriageEdge(m) {
  return {
    id: `m-${m.id}`,
    source: m.spouse1_id,
    target: m.spouse2_id,
    type: 'marriage',
    data: {
      marriageId: m.id,
      status: m.status,
      startDate: m.start_date,
      endDate: m.end_date,
      spouse1Order: m.spouse1_order,
      spouse2Order: m.spouse2_order,
    },
  };
}

function parentChildEdge(pc) {
  return {
    id: `pc-${pc.id}`,
    source: pc.parent_id,
    target: pc.child_id,
    type: 'parentChild',
    data: { relationshipType: pc.relationship_type, certainty: pc.certainty },
  };
}

const MARRIAGE_COLUMNS = `m.id, m.spouse1_id, m.spouse2_id, m.status, m.spouse1_order, m.spouse2_order,
  fuzzy_date_to_jsonb(m.start_date) AS start_date, fuzzy_date_to_jsonb(m.end_date) AS end_date`;

async function relationshipCounts(ids) {
  const { rows } = await query(
    `SELECT p.id,
            (SELECT count(*) FROM parent_child WHERE child_id = p.id)  AS parents,
            (SELECT count(*) FROM parent_child WHERE parent_id = p.id) AS children
     FROM unnest($1::uuid[]) AS p (id)`, [ids]);
  return new Map(rows.map((r) => [r.id, r]));
}

async function buildNodes(viewer, nodeInfo) {
  const ids = [...nodeInfo.keys()];
  const [people, counts] = await Promise.all([fetchPersonSummaries({ query }, ids), relationshipCounts(ids)]);
  return ids.map((id) => {
    const info = nodeInfo.get(id);
    const c = counts.get(id);
    return {
      id,
      type: 'person',
      position: { x: 0, y: 0 },
      data: {
        person: presentPerson(people.get(id), viewer),
        generation: info.generation,
        role: info.role,
        parentCount: c.parents,
        childCount: c.children,
        hasMoreParents: false,
        hasMoreChildren: false,
      },
    };
  });
}

export async function descendantTree(viewer, rootId, { depth, includeSpouses }) {
  await assertPerson(rootId);
  const { rows: desc } = await query(
    `WITH RECURSIVE d (id, generation) AS (
       SELECT $1::uuid, 0
       UNION
       SELECT pc.child_id, d.generation + 1 FROM parent_child pc JOIN d ON pc.parent_id = d.id
       WHERE d.generation < $2
     )
     SELECT id, min(generation) AS generation FROM d GROUP BY id`, [rootId, depth]);

  const nodeInfo = new Map(desc.map((r) => [r.id, { generation: r.generation, role: r.id === rootId ? 'root' : 'descendant' }]));
  const descendantIds = desc.map((r) => r.id);
  const edges = [];

  if (includeSpouses) {
    // Every marriage of every descendant: all spouses appear together.
    const { rows: marriages } = await query(
      `SELECT ${MARRIAGE_COLUMNS} FROM marriages m
       WHERE m.spouse1_id = ANY ($1::uuid[]) OR m.spouse2_id = ANY ($1::uuid[])`, [descendantIds]);
    for (const m of marriages) {
      for (const [self, other] of [[m.spouse1_id, m.spouse2_id], [m.spouse2_id, m.spouse1_id]]) {
        if (nodeInfo.has(self) && !nodeInfo.has(other)) {
          nodeInfo.set(other, { generation: nodeInfo.get(self).generation, role: 'spouse' });
        }
      }
      edges.push(marriageEdge(m));
    }
    // Unmarried co-parents of descendants' children.
    const { rows: coParents } = await query(
      `SELECT DISTINCT other.parent_id, mine.parent_id AS descendant_id
       FROM parent_child mine
       JOIN parent_child other ON other.child_id = mine.child_id AND other.parent_id <> mine.parent_id
       WHERE mine.parent_id = ANY ($1::uuid[]) AND mine.child_id = ANY ($1::uuid[])`, [descendantIds]);
    for (const r of coParents) {
      if (!nodeInfo.has(r.parent_id)) {
        nodeInfo.set(r.parent_id, { generation: nodeInfo.get(r.descendant_id).generation, role: 'coParent' });
      }
    }
  }

  const allIds = [...nodeInfo.keys()];
  const { rows: pcs } = await query(
    `SELECT id, parent_id, child_id, relationship_type, certainty FROM parent_child
     WHERE child_id = ANY ($1::uuid[]) AND child_id <> $2 AND parent_id = ANY ($3::uuid[])`,
    [descendantIds, rootId, allIds]);
  edges.push(...pcs.map(parentChildEdge));

  const nodes = await buildNodes(viewer, nodeInfo);
  for (const n of nodes) {
    // Children exist beyond the requested depth → the client can lazy-load them.
    if (n.data.role !== 'spouse' && n.data.role !== 'coParent' && n.data.generation >= depth && n.data.childCount > 0) {
      n.data.hasMoreChildren = true;
    }
    n.data.hasMoreParents = n.id === rootId && n.data.parentCount > 0;
  }
  return { rootId, view: 'descendants', depth, nodes, edges };
}

export async function ancestorTree(viewer, rootId, { depth, includeSpouses }) {
  await assertPerson(rootId);
  const { rows: anc } = await query(
    `WITH RECURSIVE a (id, generation) AS (
       SELECT $1::uuid, 0
       UNION
       SELECT pc.parent_id, a.generation + 1 FROM parent_child pc JOIN a ON pc.child_id = a.id
       WHERE a.generation < $2
     )
     SELECT id, min(generation) AS generation FROM a GROUP BY id`, [rootId, depth]);

  const nodeInfo = new Map(anc.map((r) => [r.id, {
    generation: -r.generation, role: r.id === rootId ? 'root' : 'ancestor',
  }]));

  // Siblings (children of the root's parents).
  const { rows: siblings } = await query(
    `SELECT DISTINCT s.child_id FROM parent_child mine
     JOIN parent_child s ON s.parent_id = mine.parent_id AND s.child_id <> mine.child_id
     WHERE mine.child_id = $1`, [rootId]);
  for (const s of siblings) if (!nodeInfo.has(s.child_id)) nodeInfo.set(s.child_id, { generation: 0, role: 'sibling' });

  const edges = [];
  const ancestorIds = [...nodeInfo.keys()];
  // Marriages among ancestors (parents' marriages) and, optionally, the root's own spouses.
  const { rows: marriages } = await query(
    `SELECT ${MARRIAGE_COLUMNS} FROM marriages m
     WHERE (m.spouse1_id = ANY ($1::uuid[]) AND m.spouse2_id = ANY ($1::uuid[]))
        OR ($2 AND $3 IN (m.spouse1_id, m.spouse2_id))`, [ancestorIds, includeSpouses, rootId]);
  for (const m of marriages) {
    const other = m.spouse1_id === rootId ? m.spouse2_id : m.spouse2_id === rootId ? m.spouse1_id : null;
    if (other && !nodeInfo.has(other)) nodeInfo.set(other, { generation: 0, role: 'spouse' });
    edges.push(marriageEdge(m));
  }

  const allIds = [...nodeInfo.keys()];
  const { rows: pcs } = await query(
    `SELECT id, parent_id, child_id, relationship_type, certainty FROM parent_child
     WHERE parent_id = ANY ($1::uuid[]) AND child_id = ANY ($1::uuid[])`, [allIds]);
  // Keep only edges that point up the ancestry (or to siblings), not spouse-to-child links.
  edges.push(...pcs
    .filter((pc) => {
      const child = nodeInfo.get(pc.child_id);
      const parent = nodeInfo.get(pc.parent_id);
      return parent.generation < child.generation && child.role !== 'spouse';
    })
    .map(parentChildEdge));

  const nodes = await buildNodes(viewer, nodeInfo);
  for (const n of nodes) {
    if (n.data.role === 'ancestor' || n.data.role === 'root') {
      n.data.hasMoreParents = -n.data.generation >= depth && n.data.parentCount > 0;
    }
    n.data.hasMoreChildren = false;
  }
  return { rootId, view: 'ancestors', depth, nodes, edges };
}
