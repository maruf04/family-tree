// Route builder for simple bilingual content tables (history, directory,
// announcements). Columns come only from the `fields` whitelist; values are
// bound parameters. Fuzzy dates travel as JSON ({qualifier, year, ...}).
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import { requireRole, requireVerified } from '../middleware/auth.js';
import { fuzzyDate, idParams, pagination, validate } from '../middleware/validate.js';

/** SQL condition for rows a viewer may see, by privacy_level. */
export function privacyClause(viewer, column = 'privacy_level') {
  if (viewer?.isModerator) return 'true';
  if (viewer?.verified) return `${column} IN ('public', 'members')`;
  return `${column} = 'public'`;
}

const FIELD_SCHEMAS = {
  text: () => z.string().trim().max(500).nullable().transform((v) => (v === '' ? null : v)),
  long: () => z.string().trim().max(50000).nullable().transform((v) => (v === '' ? null : v)),
  fuzzy: () => fuzzyDate,
  uuid: () => z.string().uuid().nullable(),
  number: () => z.number().nullable(),
  int: () => z.number().int().nullable(),
  bool: () => z.boolean(),
  timestamp: () => z.string().datetime({ offset: true }).nullable(),
};

function fieldSchema(def) {
  if (Array.isArray(def)) return z.enum(def);
  return FIELD_SCHEMAS[def]();
}

/**
 * @param {object} o
 * @param {string} o.table
 * @param {object} o.fields       column → 'text'|'long'|'fuzzy'|'uuid'|'number'|'int'|'bool'|'timestamp'|[enum values]
 * @param {string[]} [o.requireOneOf]  e.g. ['title_bn', 'title_en']
 * @param {string[]} [o.required]
 * @param {string[]} [o.filters]  enum/uuid columns filterable via ?column=value
 * @param {string} o.orderBy
 * @param {boolean} [o.privacy]   table has privacy_level
 * @param {boolean} [o.publicRead] unauthenticated users may read (public rows only)
 * @param {'moderator'|'verified'} [o.writeRole]
 * @param {boolean} [o.ownerEdit] creators may edit/delete their own rows
 * @param {string} [o.extraSelect] extra jsonb_build_object pairs, e.g. "'place_name_bn', pl.name_bn"
 * @param {string} [o.joins]
 */
export function crudRouter(o) {
  const router = Router();
  const fuzzyCols = Object.entries(o.fields).filter(([, d]) => d === 'fuzzy').map(([k]) => k);
  const fuzzyJson = fuzzyCols.map((c) => `'${c}', fuzzy_date_to_jsonb(t.${c})`);
  const extras = [...fuzzyJson, ...(o.extraSelect ? [o.extraSelect] : [])];
  const select = `to_jsonb(t) ${extras.length ? `|| jsonb_build_object(${extras.join(', ')})` : ''} AS row`;
  const readGuard = o.publicRead ? (_req, _res, next) => next() : requireVerified;
  const writeGuard = o.writeRole === 'verified' ? requireVerified : requireRole('moderator');

  const filterShape = Object.fromEntries((o.filters ?? []).map((f) => [f, z.string().max(60).optional()]));
  router.get('/', readGuard, validate({ query: pagination.extend(filterShape) }), async (req, res) => {
    const params = [];
    const where = [o.privacy ? privacyClause(req.viewer, 't.privacy_level') : 'true'];
    for (const f of o.filters ?? []) {
      if (req.valid.query[f]) { params.push(req.valid.query[f]); where.push(`t.${f}::text = $${params.length}`); }
    }
    params.push(req.valid.query.limit, req.valid.query.offset);
    const { rows } = await query(
      `SELECT ${select}, count(*) OVER () AS total FROM ${o.table} t ${o.joins ?? ''}
       WHERE ${where.join(' AND ')} ORDER BY ${o.orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    res.json({ total: rows[0]?.total ?? 0, items: rows.map((r) => r.row) });
  });

  router.get('/:id', readGuard, validate({ params: idParams }), async (req, res) => {
    const { rows } = await query(
      `SELECT ${select} FROM ${o.table} t ${o.joins ?? ''}
       WHERE t.id = $1 AND ${o.privacy ? privacyClause(req.viewer, 't.privacy_level') : 'true'}`, [req.valid.params.id]);
    if (!rows[0]) throw notFound();
    res.json(rows[0].row);
  });

  const shape = Object.fromEntries(Object.entries(o.fields).map(([k, d]) => [k, fieldSchema(d).optional()]));
  if (o.privacy) shape.privacy_level = z.enum(['public', 'members', 'family', 'restricted']).optional();
  const bodySchema = z.object(shape).strict();

  function bind(col, value, params) {
    if (fuzzyCols.includes(col)) {
      params.push(value == null ? null : JSON.stringify(value));
      return `fuzzy_date_from_jsonb($${params.length}::jsonb)`;
    }
    params.push(value);
    return `$${params.length}`;
  }

  async function assertCanEdit(req, id) {
    if (req.viewer.isModerator) return;
    if (!o.ownerEdit) throw forbidden('moderator_only');
    const { rows } = await query(`SELECT created_by FROM ${o.table} WHERE id = $1`, [id]);
    if (!rows[0]) throw notFound();
    if (rows[0].created_by !== req.viewer.id) throw forbidden();
  }

  router.post('/', writeGuard, validate({ body: bodySchema }), async (req, res) => {
    const data = req.valid.body;
    if (o.requireOneOf && o.requireOneOf.every((k) => !data[k])) {
      throw badRequest('validation_failed', 'A Bangla or English title/name is required', [{ path: o.requireOneOf[0], message: 'Required' }]);
    }
    for (const k of o.required ?? []) if (data[k] == null) throw badRequest('validation_failed', `${k} is required`, [{ path: k, message: 'Required' }]);
    const params = [];
    const cols = Object.keys(data);
    const vals = cols.map((c) => bind(c, data[c], params));
    cols.push('created_by');
    vals.push(bind('created_by', req.viewer.id, params));
    const id = await tx(req, async (db) => (await db.query(
      `INSERT INTO ${o.table} (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING id`, params)).rows[0].id);
    res.status(201).json({ id });
  });

  router.patch('/:id', writeGuard, validate({ params: idParams, body: bodySchema }), async (req, res) => {
    const { id } = req.valid.params;
    await assertCanEdit(req, id);
    const data = req.valid.body;
    if (!Object.keys(data).length) throw badRequest('validation_failed', 'Nothing to change');
    const params = [];
    const sets = Object.keys(data).map((c) => `${c} = ${bind(c, data[c], params)}`);
    params.push(id);
    const { rowCount } = await tx(req, (db) => db.query(
      `UPDATE ${o.table} SET ${sets.join(', ')} WHERE id = $${params.length}`, params));
    if (!rowCount) throw notFound();
    res.json({ id });
  });

  router.delete('/:id', writeGuard, validate({ params: idParams }), async (req, res) => {
    await assertCanEdit(req, req.valid.params.id);
    const { rowCount } = await tx(req, (db) => db.query(`DELETE FROM ${o.table} WHERE id = $1`, [req.valid.params.id]));
    if (!rowCount) throw notFound();
    res.status(204).end();
  });

  return router;
}
