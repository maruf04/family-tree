// People: search, profiles, ancestors/descendants lists, spouses.
import { notFound } from '../../errors.js';
import { query } from '../../db.js';
import { presentPerson } from '../genealogy/privacy.js';
import { PERSON_DETAIL, PERSON_JOINS, PERSON_SUMMARY, fetchPersonSummaries } from '../genealogy/sql.js';

export async function searchPeople(viewer, { q, familyId, limit, offset }) {
  const params = [];
  const where = ['p.merged_into_id IS NULL'];
  let order = 'fuzzy_date_sort_key(p.birth) NULLS LAST, coalesce(p.full_name_bn, p.full_name_en)';
  if (q) {
    params.push(q);
    const n = `normalize_person_name($${params.length})`;
    where.push(`(${n} <% p.name_search OR p.name_search LIKE '%' || ${n} || '%')`);
    order = `word_similarity(${n}, p.name_search) DESC, ${order}`;
  }
  if (familyId) {
    params.push(familyId);
    where.push(`EXISTS (SELECT 1 FROM family_members fm WHERE fm.person_id = p.id AND fm.family_id = $${params.length})`);
  }
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT ${PERSON_SUMMARY}, count(*) OVER () AS total
     FROM people p ${PERSON_JOINS}
     WHERE ${where.join(' AND ')}
     ORDER BY ${order}
     LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return {
    total: rows[0]?.total ?? 0,
    items: rows.map(({ total: _t, ...r }) => presentPerson(r, viewer)),
  };
}

export async function findPossibleDuplicates(viewer, { name, birthYear }) {
  const { rows } = await query('SELECT person_id, score FROM find_similar_people($1, $2, 8)', [name, birthYear ?? null]);
  const people = await fetchPersonSummaries({ query }, rows.map((r) => r.person_id));
  return rows.map((r) => ({ score: r.score, person: presentPerson(people.get(r.person_id), viewer) }));
}

async function loadPersonRow(id) {
  const { rows } = await query(`SELECT ${PERSON_DETAIL} FROM people p ${PERSON_JOINS} WHERE p.id = $1`, [id]);
  if (!rows[0]) throw notFound('Person');
  return rows[0];
}

export async function getSpouses(viewer, personId) {
  const { rows } = await query(
    `SELECT m.id AS marriage_id, m.status, fuzzy_date_to_jsonb(m.start_date) AS start_date,
            fuzzy_date_to_jsonb(m.end_date) AS end_date, m.place_bn, m.place_en, m.certainty,
            m.verification_status, m.notes,
            CASE WHEN m.spouse1_id = $1 THEN m.spouse2_id ELSE m.spouse1_id END AS spouse_id,
            CASE WHEN m.spouse1_id = $1 THEN m.spouse1_order ELSE m.spouse2_order END AS order_for_person,
            CASE WHEN m.spouse1_id = $1 THEN m.spouse2_order ELSE m.spouse1_order END AS order_for_spouse
     FROM marriages m
     WHERE $1 IN (m.spouse1_id, m.spouse2_id)
     ORDER BY order_for_person NULLS LAST, fuzzy_date_sort_key(m.start_date) NULLS LAST, m.created_at`, [personId]);
  const people = await fetchPersonSummaries({ query }, rows.map((r) => r.spouse_id));
  return rows.map(({ spouse_id: spouseId, ...m }) => ({ ...m, spouse: presentPerson(people.get(spouseId), viewer) }));
}

/** Children grouped under the co-parent (spouse) who is actually their other parent. */
export async function getChildrenBySpouse(viewer, personId, spouses) {
  const { rows } = await query(
    `SELECT x.child_id, x.relationship_type, x.co_parent_id, x.co_parent_relationship_type, x.marriage_id
     FROM person_children_by_coparent($1) x
     JOIN people c ON c.id = x.child_id
     ORDER BY fuzzy_date_sort_key(c.birth) NULLS LAST, coalesce(c.full_name_bn, c.full_name_en)`, [personId]);
  const people = await fetchPersonSummaries({ query }, [...new Set(rows.flatMap((r) => [r.child_id, r.co_parent_id]).filter(Boolean))]);

  const groups = new Map();
  for (const r of rows) {
    const key = r.co_parent_id ?? 'unknown';
    if (!groups.has(key)) {
      groups.set(key, {
        co_parent: r.co_parent_id ? presentPerson(people.get(r.co_parent_id), viewer) : null,
        marriage_id: r.marriage_id,
        children: [],
      });
    }
    groups.get(key).children.push({
      relationship_type: r.relationship_type,
      co_parent_relationship_type: r.co_parent_relationship_type,
      person: presentPerson(people.get(r.child_id), viewer),
    });
  }
  // Spouses without children still get an (empty) group, so every spouse is shown.
  for (const s of spouses) {
    if (!groups.has(s.spouse.id)) groups.set(s.spouse.id, { co_parent: s.spouse, marriage_id: s.marriage_id, children: [] });
  }
  const spouseOrder = new Map(spouses.map((s, i) => [s.spouse.id, i]));
  return [...groups.entries()]
    .sort(([a], [b]) => (spouseOrder.get(a) ?? (a === 'unknown' ? 1e6 : 1e5)) - (spouseOrder.get(b) ?? (b === 'unknown' ? 1e6 : 1e5)))
    .map(([, g]) => g);
}

export async function getPersonProfile(viewer, id) {
  const row = await loadPersonRow(id);
  const person = presentPerson(row, viewer);

  const [parentsRes, siblingsRes, familiesRes, sourcesRes, spouses, marriedInRes] = await Promise.all([
    query(`SELECT pc.id AS relationship_id, pc.parent_id, pc.relationship_type, pc.certainty
           FROM parent_child pc JOIN people p ON p.id = pc.parent_id
           WHERE pc.child_id = $1 ORDER BY p.sex`, [id]),
    query(`SELECT s.child_id AS sibling_id, count(*) AS shared_parents
           FROM parent_child mine
           JOIN parent_child s ON s.parent_id = mine.parent_id AND s.child_id <> mine.child_id
           JOIN people p ON p.id = s.child_id
           WHERE mine.child_id = $1
           GROUP BY s.child_id, p.birth
           ORDER BY fuzzy_date_sort_key(p.birth) NULLS LAST`, [id]),
    query(`SELECT f.id, f.name_bn, f.name_en, f.homestead_name_bn, f.homestead_name_en, f.root_person_id,
                  fm.membership_type, fm.is_primary
           FROM family_members fm JOIN families f ON f.id = fm.family_id
           WHERE fm.person_id = $1 ORDER BY fm.is_primary DESC, f.name_bn`, [id]),
    query(`SELECT sl.id, sl.claim, sl.citation_detail, s.id AS source_id, s.source_type, s.title_bn, s.title_en,
                  s.author, fuzzy_date_to_jsonb(s.source_date) AS source_date, s.citation, s.repository
           FROM source_links sl JOIN sources s ON s.id = sl.source_id
           WHERE sl.person_id = $1 ORDER BY sl.created_at`, [id]),
    getSpouses(viewer, id),
    // Someone known only through marriage (a son's wife, a daughter's husband):
    // not born or adopted into any recorded lineage, and no recorded parents.
    query(`SELECT EXISTS (SELECT 1 FROM marriages WHERE $1 IN (spouse1_id, spouse2_id))
              AND NOT EXISTS (SELECT 1 FROM parent_child WHERE child_id = $1)
              AND NOT EXISTS (SELECT 1 FROM family_members WHERE person_id = $1 AND membership_type IN ('lineage', 'adoption'))
              AS married_in`, [id]),
  ]);

  const people = await fetchPersonSummaries({ query }, [
    ...parentsRes.rows.map((r) => r.parent_id), ...siblingsRes.rows.map((r) => r.sibling_id),
  ]);
  const childGroups = await getChildrenBySpouse(viewer, id, spouses);

  return {
    person,
    married_in: marriedInRes.rows[0].married_in,
    parents: parentsRes.rows.map((r) => ({
      relationship_id: r.relationship_id, relationship_type: r.relationship_type, certainty: r.certainty,
      person: presentPerson(people.get(r.parent_id), viewer),
    })),
    siblings: siblingsRes.rows.map((r) => ({
      half: r.shared_parents < Math.min(2, parentsRes.rows.length),
      person: presentPerson(people.get(r.sibling_id), viewer),
    })),
    spouses,
    children_by_spouse: childGroups,
    families: familiesRes.rows,
    sources: sourcesRes.rows,
  };
}

/** Flat ancestor/descendant lists with generation numbers (repeated ancestors appear once). */
export async function listLineage(viewer, id, direction, depth) {
  await loadPersonRow(id);
  const [from, to] = direction === 'ancestors' ? ['child_id', 'parent_id'] : ['parent_id', 'child_id'];
  const { rows } = await query(
    `WITH RECURSIVE walk (id, generation) AS (
       SELECT ${to}, 1 FROM parent_child WHERE ${from} = $1
       UNION
       SELECT pc.${to}, w.generation + 1 FROM parent_child pc JOIN walk w ON pc.${from} = w.id
       WHERE w.generation < $2
     )
     SELECT id, min(generation) AS generation, count(*) AS paths FROM walk GROUP BY id
     ORDER BY generation`, [id, depth]);
  const people = await fetchPersonSummaries({ query }, rows.map((r) => r.id));
  return rows.map((r) => ({ generation: r.generation, paths: r.paths, person: presentPerson(people.get(r.id), viewer) }));
}

export async function getPersonFamilyTrees(id) {
  await loadPersonRow(id);
  const { rows } = await query(
    `SELECT f.id, f.name_bn, f.name_en, f.root_person_id, fm.membership_type, fm.is_primary
     FROM family_members fm JOIN families f ON f.id = fm.family_id
     WHERE fm.person_id = $1 ORDER BY fm.is_primary DESC`, [id]);
  const counts = await query(
    `SELECT (SELECT count(*) FROM parent_child WHERE child_id = $1) AS parents,
            (SELECT count(*) FROM parent_child WHERE parent_id = $1) AS children,
            (SELECT count(*) FROM marriages WHERE $1 IN (spouse1_id, spouse2_id)) AS spouses`, [id]);
  const c = counts.rows[0];
  return {
    has_ancestor_tree: c.parents > 0,
    has_descendant_tree: c.children > 0 || c.spouses > 0,
    families: rows,
  };
}
