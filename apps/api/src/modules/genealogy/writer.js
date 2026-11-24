// Whitelisted create/update/delete of genealogy records. Used both for
// moderator edits and for applying approved change proposals, so every write
// path shares the same validation and SQL. Column names come only from the
// ENTITIES whitelist; values are always bound parameters.
import { z } from 'zod';
import { badRequest, notFound } from '../../errors.js';
import { fuzzyDate } from '../../middleware/validate.js';

const ENUMS = {
  sex: ['male', 'female', 'unknown'],
  living: ['living', 'deceased', 'unknown'],
  privacy: ['public', 'members', 'family', 'restricted'],
  verification: ['unverified', 'verified', 'disputed'],
  certainty: ['confirmed', 'probable', 'uncertain'],
  parentChild: ['biological', 'adoptive', 'foster'],
  marriageStatus: ['ongoing', 'separated', 'divorced', 'widowed', 'annulled', 'unknown'],
  membership: ['lineage', 'marriage', 'adoption', 'other'],
  sourceType: ['oral_history', 'document', 'photograph', 'book', 'grave_marker', 'government_record',
    'land_record', 'religious_record', 'family_record', 'newspaper', 'website', 'other'],
};

const T = (max = 300) => ({ kind: 'text', max });
const LONG = { kind: 'text', max: 50000 };
const FUZZY = { kind: 'fuzzy' };
const REF = { kind: 'ref' };
const BOOL = { kind: 'bool' };
const INT = { kind: 'int' };
const E = (values) => ({ kind: 'enum', values });

export const ENTITIES = {
  person: {
    table: 'people', createdBy: true, updatedBy: true,
    fields: {
      full_name_bn: T(), full_name_en: T(), nickname_bn: T(100), nickname_en: T(100),
      sex: E(ENUMS.sex), birth: FUZZY, death: FUZZY, living_status: E(ENUMS.living),
      birth_place_bn: T(), birth_place_en: T(), death_place_bn: T(), death_place_en: T(),
      burial_place_bn: T(), burial_place_en: T(), occupation_bn: T(), occupation_en: T(),
      biography_bn: LONG, biography_en: LONG, privacy_level: E(ENUMS.privacy), photo_id: REF,
      verification_status: { ...E(ENUMS.verification), moderatorOnly: true },
      research_notes: { ...LONG, moderatorOnly: true },
    },
    requireOneOf: ['full_name_bn', 'full_name_en'],
  },
  family: {
    table: 'families', createdBy: true, updatedBy: true,
    fields: {
      name_bn: T(), name_en: T(), homestead_name_bn: T(), homestead_name_en: T(),
      description_bn: LONG, description_en: LONG, root_person_id: REF, parent_family_id: REF,
      verification_status: { ...E(ENUMS.verification), moderatorOnly: true },
    },
    requireOneOf: ['name_bn', 'name_en'],
    required: ['root_person_id'],
  },
  family_member: {
    table: 'family_members', createdBy: true,
    fields: { family_id: REF, person_id: REF, membership_type: E(ENUMS.membership), is_primary: BOOL, notes: T(1000) },
    required: ['family_id', 'person_id'],
  },
  parent_child: {
    table: 'parent_child', createdBy: true, updatedBy: true,
    fields: {
      parent_id: REF, child_id: REF, relationship_type: E(ENUMS.parentChild),
      certainty: E(ENUMS.certainty), notes: T(1000),
      verification_status: { ...E(ENUMS.verification), moderatorOnly: true },
    },
    required: ['parent_id', 'child_id'],
  },
  marriage: {
    table: 'marriages', createdBy: true, updatedBy: true,
    fields: {
      spouse1_id: REF, spouse2_id: REF, status: E(ENUMS.marriageStatus), start_date: FUZZY, end_date: FUZZY,
      spouse1_order: INT, spouse2_order: INT, place_bn: T(), place_en: T(),
      certainty: E(ENUMS.certainty), notes: T(1000),
      verification_status: { ...E(ENUMS.verification), moderatorOnly: true },
    },
    required: ['spouse1_id', 'spouse2_id'],
  },
  source: {
    table: 'sources', createdBy: true,
    fields: {
      source_type: E(ENUMS.sourceType), title_bn: T(), title_en: T(), description_bn: LONG, description_en: LONG,
      author: T(), informant_person_id: REF, source_date: FUZZY, citation: T(1000), repository: T(), url: T(1000),
    },
    requireOneOf: ['title_bn', 'title_en'],
    required: ['source_type'],
  },
  source_link: {
    table: 'source_links', createdBy: true, noUpdate: true,
    fields: {
      source_id: REF, person_id: REF, family_id: REF, parent_child_id: REF, marriage_id: REF,
      claim: T(100), citation_detail: T(500), notes: T(1000),
    },
    required: ['source_id'],
  },
};

const UUID_OR_TEMP = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\$[a-z][a-z0-9_]{0,40})$/i;

function fieldSchema(field) {
  switch (field.kind) {
    case 'text':
      return z.string().trim().max(field.max).nullable().transform((v) => (v === '' ? null : v));
    case 'fuzzy': return fuzzyDate;
    case 'ref': return z.string().regex(UUID_OR_TEMP, 'Expected an id').nullable();
    case 'bool': return z.boolean();
    case 'int': return z.number().int().min(1).max(50).nullable();
    case 'enum': return z.enum(field.values);
    default: throw new Error(`unknown field kind ${field.kind}`);
  }
}

/**
 * Validate a payload for an entity/action. Moderator-only fields are rejected
 * for everyone else (members cannot mark their own proposal "verified").
 */
export function parsePayload(entity, action, payload, { isModerator = false } = {}) {
  const cfg = ENTITIES[entity];
  if (!cfg) throw badRequest('invalid_entity', `Unknown entity ${entity}`);
  if (action === 'delete') return {};
  if (action === 'update' && cfg.noUpdate) throw badRequest('invalid_action', `${entity} cannot be updated`);

  const shape = {};
  for (const [name, field] of Object.entries(cfg.fields)) {
    if (field.moderatorOnly && !isModerator) continue;
    shape[name] = fieldSchema(field).optional();
  }
  const result = z.object(shape).strict().safeParse(payload ?? {});
  if (!result.success) {
    throw badRequest('validation_failed', 'Invalid record data', result.error.issues.map((i) => ({
      path: i.path.join('.'), message: i.message,
    })));
  }
  const data = result.data;
  if (action === 'create') {
    for (const name of cfg.required ?? []) {
      if (data[name] == null) throw badRequest('validation_failed', `${name} is required`, [{ path: name, message: 'Required' }]);
    }
    if (cfg.requireOneOf && cfg.requireOneOf.every((n) => !data[n])) {
      throw badRequest('validation_failed', 'A Bangla or English name is required',
        [{ path: cfg.requireOneOf[0], message: 'Required' }]);
    }
  } else if (!Object.keys(data).length) {
    throw badRequest('validation_failed', 'Nothing to change');
  }
  return data;
}

/** Replace "$temp_ref" values with ids created earlier in the same proposal. */
export function resolveRefs(entity, data, refs = {}) {
  const out = { ...data };
  for (const [name, field] of Object.entries(ENTITIES[entity].fields)) {
    const value = out[name];
    if (field.kind === 'ref' && typeof value === 'string' && value.startsWith('$')) {
      const id = refs[value.slice(1)];
      if (!id) throw badRequest('unknown_reference', `Unknown reference ${value}`);
      out[name] = id;
    }
  }
  return out;
}

function bind(field, value, params) {
  if (field.kind === 'fuzzy') {
    params.push(value == null ? null : JSON.stringify(value));
    return `fuzzy_date_from_jsonb($${params.length}::jsonb)`;
  }
  params.push(value);
  return `$${params.length}`;
}

export async function createRecord(db, entity, data, userId) {
  const cfg = ENTITIES[entity];
  const cols = [];
  const vals = [];
  const params = [];
  for (const [name, value] of Object.entries(data)) {
    cols.push(name);
    vals.push(bind(cfg.fields[name], value, params));
  }
  if (cfg.createdBy) { cols.push('created_by'); vals.push(bind({}, userId ?? null, params)); }
  if (cfg.updatedBy) { cols.push('updated_by'); vals.push(bind({}, userId ?? null, params)); }
  if (entity === 'person' && data.verification_status === 'verified') {
    cols.push('verified_at', 'verified_by');
    vals.push('now()', bind({}, userId ?? null, params));
  }
  const { rows } = await db.query(
    `INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING id`, params);
  return rows[0].id;
}

export async function updateRecord(db, entity, id, data, userId) {
  const cfg = ENTITIES[entity];
  const sets = [];
  const params = [];
  for (const [name, value] of Object.entries(data)) {
    sets.push(`${name} = ${bind(cfg.fields[name], value, params)}`);
  }
  if (cfg.updatedBy) sets.push(`updated_by = ${bind({}, userId ?? null, params)}`);
  if (entity === 'person' && 'verification_status' in data) {
    sets.push(data.verification_status === 'verified'
      ? `verified_at = coalesce(verified_at, now()), verified_by = coalesce(verified_by, ${bind({}, userId ?? null, params)})`
      : 'verified_at = NULL, verified_by = NULL');
  }
  params.push(id);
  const { rowCount } = await db.query(
    `UPDATE ${cfg.table} SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  if (!rowCount) throw notFound(entity);
  return id;
}

export async function deleteRecord(db, entity, id) {
  const { rowCount } = await db.query(`DELETE FROM ${ENTITIES[entity].table} WHERE id = $1`, [id]);
  if (!rowCount) throw notFound(entity);
  return id;
}

/** Current state of a record (for proposal conflict detection). */
export async function snapshotRecord(db, entity, id) {
  const { rows } = await db.query(`SELECT to_jsonb(t) AS row FROM ${ENTITIES[entity].table} t WHERE id = $1`, [id]);
  if (!rows[0]) throw notFound(entity);
  return rows[0].row;
}

/** Comparable form of a field value (fuzzy dates lose their null members). */
export function normalizeValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value).filter(([, v]) => v != null).sort(([a], [b]) => a.localeCompare(b));
    return entries.length ? JSON.stringify(Object.fromEntries(entries)) : 'null';
  }
  return JSON.stringify(value ?? null);
}
