// Reusable SQL fragments for person records.

/** Columns for a person card. Use with `FROM people p` and PERSON_JOINS. */
export const PERSON_SUMMARY = `
  p.id, p.full_name_bn, p.full_name_en, p.nickname_bn, p.nickname_en, p.sex,
  fuzzy_date_to_jsonb(p.birth) AS birth, fuzzy_date_to_jsonb(p.death) AS death,
  p.living_status, p.verification_status, p.effective_privacy, p.photo_id,
  pf.primary_family, pf.family_ids`;

/** Full profile columns (summary + details). */
export const PERSON_DETAIL = `${PERSON_SUMMARY},
  p.birth_place_bn, p.birth_place_en, p.death_place_bn, p.death_place_en,
  p.burial_place_bn, p.burial_place_en, p.occupation_bn, p.occupation_en,
  p.biography_bn, p.biography_en, p.privacy_level, p.research_notes, p.merged_into_id,
  p.created_at, p.updated_at`;

export const PERSON_JOINS = `
  LEFT JOIN LATERAL (
    SELECT
      (SELECT json_build_object('id', f.id, 'name_bn', f.name_bn, 'name_en', f.name_en)
       FROM family_members fm JOIN families f ON f.id = fm.family_id
       WHERE fm.person_id = p.id AND fm.is_primary LIMIT 1) AS primary_family,
      coalesce((SELECT array_agg(fm.family_id) FROM family_members fm WHERE fm.person_id = p.id), '{}') AS family_ids
  ) pf ON true`;

/** Fetch person summaries by id → Map(id → row). */
export async function fetchPersonSummaries(db, ids) {
  if (!ids.length) return new Map();
  const { rows } = await db.query(
    `SELECT ${PERSON_SUMMARY} FROM people p ${PERSON_JOINS} WHERE p.id = ANY ($1::uuid[])`, [ids]);
  return new Map(rows.map((r) => [r.id, r]));
}
