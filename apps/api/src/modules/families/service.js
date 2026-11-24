import { notFound } from '../../errors.js';
import { query } from '../../db.js';
import { presentPerson } from '../genealogy/privacy.js';
import { PERSON_JOINS, PERSON_SUMMARY, fetchPersonSummaries } from '../genealogy/sql.js';

const FAMILY_COLUMNS = `
  f.id, f.name_bn, f.name_en, f.homestead_name_bn, f.homestead_name_en,
  f.description_bn, f.description_en, f.root_person_id, f.parent_family_id,
  f.verification_status, f.cover_photo_id, f.created_at,
  (SELECT count(*) FROM family_members fm WHERE fm.family_id = f.id) AS member_count`;

export async function listFamilies(viewer, { q, limit, offset }) {
  const params = [];
  let where = 'true';
  if (q) {
    params.push(q);
    where = `normalize_person_name(coalesce(f.name_bn, '') || ' ' || coalesce(f.name_en, '') || ' ' ||
               coalesce(f.homestead_name_bn, '') || ' ' || coalesce(f.homestead_name_en, ''))
             LIKE '%' || normalize_person_name($1) || '%'`;
  }
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT ${FAMILY_COLUMNS}, count(*) OVER () AS total
     FROM families f WHERE ${where}
     ORDER BY coalesce(f.name_bn, f.name_en)
     LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  const roots = await fetchPersonSummaries({ query }, rows.map((r) => r.root_person_id));
  return {
    total: rows[0]?.total ?? 0,
    items: rows.map(({ total: _t, ...f }) => ({ ...f, root_person: presentPerson(roots.get(f.root_person_id), viewer) })),
  };
}

export async function getFamily(viewer, id) {
  const { rows } = await query(`SELECT ${FAMILY_COLUMNS} FROM families f WHERE f.id = $1`, [id]);
  const family = rows[0];
  if (!family) throw notFound('Family');

  const [roots, branches, parent, stats, places] = await Promise.all([
    fetchPersonSummaries({ query }, [family.root_person_id]),
    query('SELECT id, name_bn, name_en FROM families WHERE parent_family_id = $1 ORDER BY name_bn', [id]),
    family.parent_family_id
      ? query('SELECT id, name_bn, name_en FROM families WHERE id = $1', [family.parent_family_id])
      : { rows: [] },
    query(
      `WITH RECURSIVE d (id, generation) AS (
         SELECT $1::uuid, 1
         UNION
         SELECT pc.child_id, d.generation + 1 FROM parent_child pc JOIN d ON pc.parent_id = d.id
         WHERE d.generation < 40
       )
       SELECT max(generation) AS generations,
              (SELECT min((p.birth).year) FROM family_members fm JOIN people p ON p.id = fm.person_id
               WHERE fm.family_id = $2) AS earliest_year
       FROM d`, [family.root_person_id, id]),
    query('SELECT id, name_bn, name_en, place_type, latitude, longitude FROM places WHERE family_id = $1', [id]),
  ]);
  return {
    ...family,
    root_person: presentPerson(roots.get(family.root_person_id), viewer),
    parent_family: parent.rows[0] ?? null,
    branches: branches.rows,
    generations: stats.rows[0].generations,
    earliest_year: stats.rows[0].earliest_year,
    places: places.rows,
  };
}

export async function listFamilyMembers(viewer, id, { limit, offset }) {
  const { rowCount } = await query('SELECT 1 FROM families WHERE id = $1', [id]);
  if (!rowCount) throw notFound('Family');
  const { rows } = await query(
    `SELECT ${PERSON_SUMMARY}, fm.membership_type, fm.is_primary, count(*) OVER () AS total
     FROM family_members fm JOIN people p ON p.id = fm.person_id ${PERSON_JOINS}
     WHERE fm.family_id = $1
     ORDER BY fuzzy_date_sort_key(p.birth) NULLS LAST, coalesce(p.full_name_bn, p.full_name_en)
     LIMIT $2 OFFSET $3`, [id, limit, offset]);
  return {
    total: rows[0]?.total ?? 0,
    items: rows.map(({ total: _t, membership_type: membershipType, is_primary: isPrimary, ...p }) => ({
      membership_type: membershipType, is_primary: isPrimary, person: presentPerson(p, viewer),
    })),
  };
}

export async function getFamilyRoot(id) {
  const { rows } = await query('SELECT root_person_id FROM families WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('Family');
  return rows[0].root_person_id;
}
