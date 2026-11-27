// Spreadsheet import. Checking and importing run the SAME code in one
// transaction; a check (or any error) rolls everything back, so what the check
// reports is exactly what the import would do. Existing records are never
// changed or duplicated: rows already imported are recognised by their code.
import { pool, query } from '../../db.js';
import { badRequest, toAppError } from '../../errors.js';
import { createRecord } from '../genealogy/writer.js';
import {
  normalizeCode, readDate, readLiving, readMarriageStatus, readMarriages, readPeople, readRelation, readSex,
} from './parse.js';

const MAX_ROWS = 3000;

export async function importFamily(viewer, requestId, { people: peopleCsv, marriages: marriagesCsv, root, familyNameBn, familyNameEn, apply }) {
  const errors = [];
  const warnings = [];
  const fail = (file, line, code, detail) => errors.push({ file, line, code, detail });
  const read = (file, fn, csv) => {
    try { return fn(csv); } catch (err) {
      const [code, detail] = err.message.split(':');
      if (!['encoding', 'empty', 'columns'].includes(code)) throw err;
      fail(file, 1, code === 'columns' ? 'missing_columns' : `file_${code}`, detail?.trim());
      return [];
    }
  };
  const people = read('people', readPeople, peopleCsv);
  const marriages = marriagesCsv?.trim() ? read('marriages', readMarriages, marriagesCsv) : [];
  if (people.length + marriages.length > MAX_ROWS) throw badRequest('too_many_rows', `At most ${MAX_ROWS} rows at a time`);
  const counts = { people: 0, peopleExisting: 0, parents: 0, marriages: 0, members: 0 };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.user_id', $1, true), set_config('app.request_id', $2, true)`, [viewer.id, requestId ?? '']);
    // Two people uploading at once must not create anyone twice.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('family.import'))`);

    // One bad row must not hide the problems in the rows after it.
    const attempt = async (file, line, fn) => {
      await client.query('SAVEPOINT r');
      try {
        const result = await fn();
        await client.query('RELEASE SAVEPOINT r');
        return result;
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT r');
        const known = toAppError(err);
        if (!known) throw err;
        fail(file, line, known.code === 'constraint_violation' ? known.details?.constraint ?? known.code : known.code);
        return null;
      }
    };

    const { rows: existing } = await client.query('SELECT id, import_code, sex FROM people WHERE import_code IS NOT NULL');
    const byCode = new Map(existing.map((p) => [p.import_code, { id: p.id, sex: p.sex }]));
    const seen = new Set();

    // 1. People
    for (const r of people) {
      r.code = normalizeCode(r.code);
      if (!r.code) { fail('people', r.line, 'code_missing'); continue; }
      if (seen.has(r.code)) { fail('people', r.line, 'code_repeated', r.code); continue; }
      seen.add(r.code);
      if (byCode.has(r.code)) { counts.peopleExisting += 1; continue; }
      const sex = readSex(r.sex ?? '');
      const living = readLiving(r.living ?? '');
      if (!sex) { fail('people', r.line, 'sex_unknown_value', r.sex); continue; }
      if (!living) { fail('people', r.line, 'living_unknown_value', r.living); continue; }
      if (!r.full_name_bn && !r.full_name_en) { fail('people', r.line, 'name_missing'); continue; }
      const data = { sex, living_status: living };
      let badDate = false;
      for (const f of ['birth', 'death']) {
        try { const d = readDate(r[f]); if (d) data[f] = d; } catch { fail('people', r.line, 'date_unreadable', r[f]); badDate = true; }
      }
      if (badDate) continue;
      if (data.death && living === 'living') { fail('people', r.line, 'living_with_death'); continue; }
      if (data.death) data.living_status = 'deceased';
      for (const f of ['full_name_bn', 'full_name_en', 'nickname_bn', 'occupation_bn', 'birth_place_bn', 'biography_bn']) if (r[f]) data[f] = r[f];
      const { rows: similar } = await client.query(
        `SELECT p.full_name_bn, p.full_name_en FROM people p WHERE p.merged_into_id IS NULL AND p.import_code IS NULL
           AND (normalize_person_name(p.full_name_bn) = normalize_person_name($1) OR normalize_person_name(p.full_name_en) = normalize_person_name($2)) LIMIT 1`,
        [r.full_name_bn || null, r.full_name_en || null]);
      if (similar[0]) warnings.push({ file: 'people', line: r.line, code: 'similar_person', detail: similar[0].full_name_bn ?? similar[0].full_name_en });
      const id = await attempt('people', r.line, async () => {
        const personId = await createRecord(client, 'person', data, viewer.id);
        await client.query('UPDATE people SET import_code = $2 WHERE id = $1', [personId, r.code]);
        return personId;
      });
      if (id) { byCode.set(r.code, { id, sex }); counts.people += 1; }
    }

    // 2. Parents: each child is linked only to the parents named in their own row.
    for (const r of people) {
      const child = byCode.get(r.code);
      if (!child) continue;
      const relation = readRelation(r.relation ?? '');
      if (!relation) { fail('people', r.line, 'relation_unknown_value', r.relation); continue; }
      for (const [column, wanted] of [['father', 'male'], ['mother', 'female']]) {
        const code = normalizeCode(r[column]);
        if (!code) continue;
        const parent = byCode.get(code);
        if (!parent) { fail('people', r.line, `${column}_not_found`, code); continue; }
        if (parent.sex !== 'unknown' && parent.sex !== wanted) { fail('people', r.line, `${column}_wrong_sex`, code); continue; }
        if ((await client.query('SELECT 1 FROM parent_child WHERE parent_id = $1 AND child_id = $2', [parent.id, child.id])).rowCount) continue;
        const ok = await attempt('people', r.line, () => createRecord(client, 'parent_child', { parent_id: parent.id, child_id: child.id, relationship_type: relation }, viewer.id));
        if (ok) counts.parents += 1;
      }
    }

    // 3. Marriages
    for (const r of marriages) {
      const husband = byCode.get(normalizeCode(r.husband));
      const wife = byCode.get(normalizeCode(r.wife));
      if (!husband) { fail('marriages', r.line, 'husband_not_found', r.husband); continue; }
      if (!wife) { fail('marriages', r.line, 'wife_not_found', r.wife); continue; }
      if (husband.sex === 'female') { fail('marriages', r.line, 'husband_wrong_sex', r.husband); continue; }
      if (wife.sex === 'male') { fail('marriages', r.line, 'wife_wrong_sex', r.wife); continue; }
      const status = readMarriageStatus(r.status ?? '');
      if (!status) { fail('marriages', r.line, 'status_unknown_value', r.status); continue; }
      const data = { spouse1_id: husband.id, spouse2_id: wife.id, status };
      const order = normalizeCode(r.order);
      if (order) {
        if (!/^\d{1,2}$/.test(order) || +order < 1) { fail('marriages', r.line, 'order_unreadable', r.order); continue; }
        data.spouse1_order = +order;
      }
      try {
        const start = readDate(r.start); if (start) data.start_date = start;
        const end = readDate(r.end); if (end) data.end_date = end;
      } catch { fail('marriages', r.line, 'date_unreadable', `${r.start ?? ''} ${r.end ?? ''}`.trim()); continue; }
      if (data.end_date && !['divorced', 'widowed', 'annulled'].includes(status)) { fail('marriages', r.line, 'end_needs_ended_status'); continue; }
      // A couple already recorded is left alone, unless this row is a different marriage (a remarriage).
      const { rows: same } = await client.query(
        `SELECT status, fuzzy_date_to_jsonb(start_date) AS start FROM marriages
         WHERE least(spouse1_id, spouse2_id) = least($1::uuid, $2::uuid) AND greatest(spouse1_id, spouse2_id) = greatest($1::uuid, $2::uuid)`,
        [husband.id, wife.id]);
      if (same.some((m) => m.status === status && (m.start?.year ?? null) === (data.start_date?.year ?? null))) continue;
      const ok = await attempt('marriages', r.line, () => createRecord(client, 'marriage', data, viewer.id));
      if (ok) counts.marriages += 1;
    }

    // 4. The lineage: its root, descendants through the father's line, adopted children, and wives.
    let familyId = null;
    const rootPerson = byCode.get(normalizeCode(root ?? ''));
    if (!rootPerson) {
      fail('people', 0, 'root_not_found', root);
    } else {
      const { rows } = await client.query('SELECT id FROM families WHERE root_person_id = $1', [rootPerson.id]);
      familyId = rows[0]?.id ?? await attempt('people', 0, () => createRecord(client, 'family', {
        root_person_id: rootPerson.id, name_bn: familyNameBn || null, name_en: familyNameEn || null,
        homestead_name_bn: familyNameBn || null, homestead_name_en: familyNameEn || null,
      }, viewer.id));
      if (familyId) {
        const { rowCount } = await client.query(
          `WITH RECURSIVE line (id, kind) AS (
             SELECT $2::uuid, 'lineage'::family_membership_type
             UNION
             SELECT pc.child_id, CASE WHEN pc.relationship_type = 'biological' THEN l.kind ELSE 'adoption' END
             FROM line l JOIN people p ON p.id = l.id AND (p.sex = 'male' OR p.id = $2)
             JOIN parent_child pc ON pc.parent_id = p.id
           ), members (id, kind) AS (
             SELECT id, min(kind) FROM line GROUP BY id
             UNION ALL
             SELECT DISTINCT w.id, 'marriage'::family_membership_type
             FROM line l JOIN people p ON p.id = l.id AND p.sex = 'male'
             JOIN marriages m ON p.id IN (m.spouse1_id, m.spouse2_id)
             JOIN people w ON w.id IN (m.spouse1_id, m.spouse2_id) AND w.id <> p.id
             WHERE w.id NOT IN (SELECT id FROM line)
           )
           INSERT INTO family_members (family_id, person_id, membership_type, is_primary, created_by)
           SELECT $1, id, kind, NOT EXISTS (SELECT 1 FROM family_members f WHERE f.person_id = members.id AND f.is_primary), $3
           FROM members ON CONFLICT (family_id, person_id) DO NOTHING`, [familyId, rootPerson.id, viewer.id]);
        counts.members = rowCount;
      }
    }

    const commit = Boolean(apply) && errors.length === 0;
    await client.query(commit ? 'COMMIT' : 'ROLLBACK');
    return { applied: commit, errors, warnings, counts, rootId: commit ? rootPerson.id : null };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Families already present, so a second upload continues the same one. */
export async function importedFamilies() {
  const { rows } = await query(
    `SELECT f.id, f.name_bn, f.name_en, p.import_code AS root_code FROM families f JOIN people p ON p.id = f.root_person_id
     WHERE p.import_code IS NOT NULL ORDER BY f.created_at`);
  return rows;
}
