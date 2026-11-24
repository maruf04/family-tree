// Account profile, membership verification requests, development login.
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { query, tx, withTransaction } from '../../db.js';
import { conflict, notFound, unauthorized } from '../../errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { uuid, validate } from '../../middleware/validate.js';
import { presentPerson } from '../genealogy/privacy.js';
import { fetchPersonSummaries } from '../genealogy/sql.js';
import { notifyModerators } from '../notifications/service.js';

export const authRouter = Router();

authRouter.get('/me', async (req, res) => {
  if (!req.auth) throw unauthorized();
  if (!req.viewer) return res.json({ auth: req.auth, user: null });
  const { rows } = await query(
    `SELECT id, email, phone, display_name_bn, display_name_en, role, membership_status, verified_at,
            preferred_language, person_id, created_at,
            (SELECT count(*) FROM notifications n WHERE n.user_id = u.id AND n.read_at IS NULL) AS unread_notifications
     FROM users u WHERE id = $1`, [req.viewer.id]);
  const user = rows[0];
  const person = user.person_id
    ? presentPerson((await fetchPersonSummaries({ query }, [user.person_id])).get(user.person_id), req.viewer)
    : null;
  res.json({ auth: req.auth, user, person });
});

const profileBody = z.object({
  display_name_bn: z.string().trim().max(120).optional().nullable(),
  display_name_en: z.string().trim().max(120).optional().nullable(),
  preferred_language: z.enum(['bn', 'en']).optional(),
});

// Create the application profile after Supabase sign-up (status: pending).
authRouter.post('/profile',
  validate({ body: profileBody.refine((b) => b.display_name_bn || b.display_name_en, { message: 'Name required', path: ['display_name_bn'] }) }),
  async (req, res) => {
    if (!req.auth) throw unauthorized();
    if (req.viewer) throw conflict('profile_exists', 'Profile already exists');
    const b = req.valid.body;
    await withTransaction({ userId: req.auth.id, requestId: req.id }, (db) => db.query(
      `INSERT INTO users (id, email, phone, display_name_bn, display_name_en, preferred_language)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.auth.id, req.auth.email, req.auth.phone, b.display_name_bn ?? null, b.display_name_en ?? null, b.preferred_language ?? 'bn']));
    res.status(201).json({ id: req.auth.id });
  });

authRouter.patch('/profile', requireAuth, validate({ body: profileBody }), async (req, res) => {
  const b = req.valid.body;
  const cols = Object.keys(b);
  if (cols.length) {
    const params = cols.map((c) => b[c]);
    params.push(req.viewer.id);
    await tx(req, (db) => db.query(
      `UPDATE users SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${params.length}`, params));
  }
  res.json({ id: req.viewer.id });
});

authRouter.get('/verification-requests', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT id, status, claimed_person_id, claimed_family_id, father_name, mother_name, neighbourhood,
            current_residence, relationship_details, review_note, reviewed_at, created_at
     FROM verification_requests WHERE user_id = $1 ORDER BY created_at DESC`, [req.viewer.id]);
  res.json({ items: rows });
});

authRouter.post('/verification-requests', requireAuth,
  validate({ body: z.object({
    claimed_person_id: uuid.optional().nullable(), claimed_family_id: uuid.optional().nullable(),
    father_name: z.string().trim().max(200).optional().nullable(), mother_name: z.string().trim().max(200).optional().nullable(),
    neighbourhood: z.string().trim().max(200).optional().nullable(), current_residence: z.string().trim().max(300).optional().nullable(),
    relationship_details: z.string().trim().max(3000).optional().nullable(),
  }) }),
  async (req, res) => {
    if (req.viewer.verified) throw conflict('already_verified', 'You are already a verified member');
    const b = req.valid.body;
    const id = await tx(req, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO verification_requests (user_id, claimed_person_id, claimed_family_id, father_name, mother_name,
                                            neighbourhood, current_residence, relationship_details)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [req.viewer.id, b.claimed_person_id ?? null, b.claimed_family_id ?? null, b.father_name ?? null,
          b.mother_name ?? null, b.neighbourhood ?? null, b.current_residence ?? null, b.relationship_details ?? null]);
      await notifyModerators(db, {
        kind: 'verification_requested', titleBn: 'নতুন সদস্য যাচাইয়ের অনুরোধ', titleEn: 'New membership verification request',
        link: '/admin',
      });
      return rows[0].id;
    });
    res.status(201).json({ id });
  });

// Development login: lists accounts that can be used with "Bearer dev:<id>".
authRouter.get('/dev-users', async (_req, res) => {
  if (!config.devAuth) throw notFound();
  const { rows } = await query(
    `SELECT id, display_name_bn, display_name_en, role, membership_status FROM users
     ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END, display_name_en`);
  res.json({ items: rows });
});

authRouter.get('/config', (_req, res) => {
  res.json({ devAuth: config.devAuth, supabase: Boolean(config.supabase.url) });
});
