// Village directory: places (map), institutions, businesses, residents.
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db.js';
import { crudRouter } from '../../lib/crud.js';
import { requireVerified } from '../../middleware/auth.js';
import { pagination, validate } from '../../middleware/validate.js';

export const directoryRouter = Router();

const PLACE_TYPES = ['landmark', 'homestead', 'mosque', 'temple', 'school', 'market', 'graveyard', 'pond',
  'river', 'field', 'road', 'bridge', 'government', 'health', 'other'];

directoryRouter.use('/places', crudRouter({
  table: 'places',
  fields: {
    place_type: PLACE_TYPES, name_bn: 'text', name_en: 'text', description_bn: 'long', description_en: 'long',
    latitude: 'number', longitude: 'number', address: 'text', photo_id: 'uuid', family_id: 'uuid',
  },
  requireOneOf: ['name_bn', 'name_en'],
  filters: ['place_type'],
  orderBy: 'coalesce(t.name_bn, t.name_en)',
  privacy: true,
  joins: 'LEFT JOIN families pf ON pf.id = t.family_id',
  extraSelect: `'family_name_bn', pf.name_bn, 'family_name_en', pf.name_en`,
}));

directoryRouter.use('/institutions', crudRouter({
  table: 'institutions',
  fields: {
    institution_type: ['primary_school', 'high_school', 'college', 'madrasa', 'mosque', 'temple', 'church', 'clinic',
      'club', 'library', 'ngo', 'cooperative', 'government', 'other'],
    name_bn: 'text', name_en: 'text', description_bn: 'long', description_en: 'long', established: 'fuzzy',
    head_name: 'text', contact_phone: 'text', website: 'text', place_id: 'uuid', photo_id: 'uuid',
  },
  requireOneOf: ['name_bn', 'name_en'],
  required: ['institution_type'],
  filters: ['institution_type'],
  orderBy: 't.institution_type, coalesce(t.name_bn, t.name_en)',
  joins: 'LEFT JOIN places pl ON pl.id = t.place_id',
  extraSelect: `'place', CASE WHEN pl.id IS NULL THEN NULL ELSE jsonb_build_object('id', pl.id, 'latitude', pl.latitude, 'longitude', pl.longitude) END`,
}));

// Members may list their own business; they can edit only what they created.
directoryRouter.use('/businesses', crudRouter({
  table: 'businesses',
  fields: {
    business_type: ['grocery', 'market_stall', 'pharmacy', 'restaurant', 'tailor', 'agriculture', 'fishery',
      'poultry', 'transport', 'electronics', 'service', 'other'],
    name_bn: 'text', name_en: 'text', description_bn: 'long', description_en: 'long', owner_person_id: 'uuid',
    contact_phone: 'text', opening_hours: 'text', place_id: 'uuid', photo_id: 'uuid', is_active: 'bool',
  },
  requireOneOf: ['name_bn', 'name_en'],
  filters: ['business_type'],
  orderBy: 't.business_type, coalesce(t.name_bn, t.name_en)',
  writeRole: 'verified',
  ownerEdit: true,
  joins: 'LEFT JOIN people op ON op.id = t.owner_person_id LEFT JOIN places pl ON pl.id = t.place_id',
  extraSelect: `'owner', CASE WHEN op.id IS NULL THEN NULL ELSE jsonb_build_object('id', op.id, 'full_name_bn', op.full_name_bn, 'full_name_en', op.full_name_en) END,
                'place', CASE WHEN pl.id IS NULL THEN NULL ELSE jsonb_build_object('id', pl.id, 'name_bn', pl.name_bn, 'name_en', pl.name_en, 'latitude', pl.latitude, 'longitude', pl.longitude) END`,
}));

// Residents: verified members who have joined the platform (names only).
directoryRouter.get('/residents', requireVerified,
  validate({ query: pagination.extend({ q: z.string().trim().max(100).optional() }) }),
  async (req, res) => {
    const { q, limit, offset } = req.valid.query;
    const params = [];
    let where = `u.membership_status = 'verified'`;
    if (q) {
      params.push(q);
      where += ` AND normalize_person_name(coalesce(u.display_name_bn, '') || ' ' || coalesce(u.display_name_en, ''))
                 LIKE '%' || normalize_person_name($1) || '%'`;
    }
    params.push(limit, offset);
    const { rows } = await query(
      `SELECT u.id, u.display_name_bn, u.display_name_en, u.role, u.person_id, count(*) OVER () AS total,
              (SELECT json_build_object('id', f.id, 'name_bn', f.name_bn, 'name_en', f.name_en)
               FROM family_members fm JOIN families f ON f.id = fm.family_id
               WHERE fm.person_id = u.person_id AND fm.is_primary LIMIT 1) AS family
       FROM users u WHERE ${where}
       ORDER BY coalesce(u.display_name_bn, u.display_name_en)
       LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    res.json({ total: rows[0]?.total ?? 0, items: rows.map(({ total: _t, ...r }) => r) });
  });
