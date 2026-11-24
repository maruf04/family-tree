// Administration: users & roles, membership verification, reports,
// moderation, audit log. Moderators handle members; only admins change roles
// (also enforced by a database trigger).
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../../db.js';
import { badRequest, conflict, forbidden, notFound } from '../../errors.js';
import { requireRole } from '../../middleware/auth.js';
import { idParams, uuid, validate } from '../../middleware/validate.js';
import { notify } from '../notifications/service.js';

export const adminRouter = Router();
adminRouter.use(requireRole('moderator'));

adminRouter.get('/summary', async (_req, res) => {
  const { rows } = await query(
    `SELECT (SELECT count(*) FROM change_proposals WHERE status = 'pending')      AS pending_proposals,
            (SELECT count(*) FROM verification_requests WHERE status = 'pending') AS pending_verifications,
            (SELECT count(*) FROM news_articles WHERE status = 'submitted')       AS pending_news,
            (SELECT count(*) FROM reports WHERE status = 'open')                  AS open_reports,
            (SELECT count(*) FROM users WHERE membership_status = 'pending')      AS pending_users`);
  res.json(rows[0]);
});

// ---------------------------------------------------------------------- users
adminRouter.get('/users',
  validate({ query: z.object({ status: z.enum(['pending', 'verified', 'rejected', 'suspended']).optional(), q: z.string().max(100).optional() }) }),
  async (req, res) => {
    const params = [];
    const where = ['true'];
    if (req.valid.query.status) { params.push(req.valid.query.status); where.push(`u.membership_status = $${params.length}`); }
    if (req.valid.query.q) {
      params.push(`%${req.valid.query.q}%`);
      where.push(`(u.display_name_bn ILIKE $${params.length} OR u.display_name_en ILIKE $${params.length} OR u.email::text ILIKE $${params.length})`);
    }
    const { rows } = await query(
      `SELECT u.id, u.email, u.phone, u.display_name_bn, u.display_name_en, u.role, u.membership_status,
              u.verified_at, u.person_id, u.created_at
       FROM users u WHERE ${where.join(' AND ')}
       ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END, u.created_at DESC LIMIT 200`, params);
    res.json({ items: rows });
  });

adminRouter.patch('/users/:id',
  validate({ params: idParams, body: z.object({
    role: z.enum(['member', 'moderator', 'admin']).optional(),
    membership_status: z.enum(['pending', 'verified', 'rejected', 'suspended']).optional(),
    person_id: uuid.optional().nullable(),
  }) }),
  async (req, res) => {
    const b = req.valid.body;
    if (b.role && !req.viewer.isAdmin) throw forbidden('admin_only', 'Only admins can change roles');
    const sets = [];
    const params = [];
    if (b.role) { params.push(b.role); sets.push(`role = $${params.length}`); }
    if (b.membership_status) {
      params.push(b.membership_status);
      sets.push(`membership_status = $${params.length}`);
      if (b.membership_status === 'verified') {
        params.push(req.viewer.id);
        sets.push(`verified_at = coalesce(verified_at, now()), verified_by = coalesce(verified_by, $${params.length})`);
      }
    }
    if (b.person_id !== undefined) { params.push(b.person_id); sets.push(`person_id = $${params.length}`); }
    if (!sets.length) throw badRequest('validation_failed', 'Nothing to change');
    params.push(req.valid.params.id);
    const { rowCount } = await tx(req, (db) => db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params));
    if (!rowCount) throw notFound('User');
    res.json({ id: req.valid.params.id });
  });

// --------------------------------------------------------------- verification
adminRouter.get('/verification-requests',
  validate({ query: z.object({ status: z.enum(['pending', 'approved', 'rejected', 'withdrawn']).default('pending') }) }),
  async (req, res) => {
    const { rows } = await query(
      `SELECT vr.*, u.display_name_bn, u.display_name_en, u.email, u.phone,
              p.full_name_bn AS claimed_person_name_bn, p.full_name_en AS claimed_person_name_en,
              f.name_bn AS claimed_family_name_bn, f.name_en AS claimed_family_name_en,
              vu.display_name_bn AS voucher_name_bn, vu.display_name_en AS voucher_name_en
       FROM verification_requests vr
       JOIN users u ON u.id = vr.user_id
       LEFT JOIN people p ON p.id = vr.claimed_person_id
       LEFT JOIN families f ON f.id = vr.claimed_family_id
       LEFT JOIN users vu ON vu.id = vr.vouched_by
       WHERE vr.status = $1 ORDER BY vr.created_at`, [req.valid.query.status]);
    res.json({ items: rows });
  });

adminRouter.post('/verification-requests/:id/review',
  validate({ params: idParams, body: z.object({
    decision: z.enum(['approve', 'reject']), note: z.string().trim().max(2000).optional().nullable(),
    link_person: z.boolean().default(true),
  }) }),
  async (req, res) => {
    const { decision, note, link_person: linkPerson } = req.valid.body;
    await tx(req, async (db) => {
      const { rows } = await db.query('SELECT * FROM verification_requests WHERE id = $1 FOR UPDATE', [req.valid.params.id]);
      const vr = rows[0];
      if (!vr) throw notFound('Verification request');
      if (vr.status !== 'pending') throw conflict('not_pending', `Request is ${vr.status}`);
      await db.query(
        `UPDATE verification_requests SET status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4 WHERE id = $1`,
        [vr.id, decision === 'approve' ? 'approved' : 'rejected', req.viewer.id, note ?? null]);
      if (decision === 'approve') {
        await db.query(
          `UPDATE users SET membership_status = 'verified', verified_at = now(), verified_by = $2,
                  person_id = CASE WHEN $3 AND person_id IS NULL THEN $4::uuid ELSE person_id END
           WHERE id = $1`, [vr.user_id, req.viewer.id, linkPerson, vr.claimed_person_id]);
      } else {
        await db.query(`UPDATE users SET membership_status = 'rejected' WHERE id = $1 AND membership_status = 'pending'`, [vr.user_id]);
      }
      await notify(db, vr.user_id, decision === 'approve'
        ? { kind: 'verification', titleBn: 'আপনার সদস্যপদ যাচাই সম্পন্ন হয়েছে। স্বাগতম!', titleEn: 'Your membership has been verified. Welcome!', link: '/' }
        : { kind: 'verification', titleBn: 'আপনার যাচাইয়ের অনুরোধ গৃহীত হয়নি', titleEn: 'Your verification request was not accepted', link: '/verify' });
    });
    res.json({ id: req.valid.params.id });
  });

// -------------------------------------------------------------------- reports
adminRouter.get('/reports',
  validate({ query: z.object({ status: z.enum(['open', 'resolved', 'dismissed']).default('open') }) }),
  async (req, res) => {
    const { rows } = await query(
      `SELECT r.*, ru.display_name_bn AS reporter_name_bn, ru.display_name_en AS reporter_name_en,
              p.body AS post_body, c.body AS comment_body, n.title_bn AS news_title_bn,
              tu.display_name_bn AS reported_user_name_bn, pe.full_name_bn AS person_name_bn, pe.full_name_en AS person_name_en
       FROM reports r
       LEFT JOIN users ru ON ru.id = r.reporter_id
       LEFT JOIN posts p ON p.id = r.post_id
       LEFT JOIN comments c ON c.id = r.comment_id
       LEFT JOIN news_articles n ON n.id = r.news_article_id
       LEFT JOIN users tu ON tu.id = r.reported_user_id
       LEFT JOIN people pe ON pe.id = r.person_id
       WHERE r.status = $1 ORDER BY r.created_at`, [req.valid.query.status]);
    res.json({ items: rows });
  });

adminRouter.post('/reports/:id/resolve',
  validate({ params: idParams, body: z.object({
    decision: z.enum(['resolved', 'dismissed']), note: z.string().trim().max(2000).optional().nullable(),
    hide_content: z.boolean().default(false),
  }) }),
  async (req, res) => {
    const { decision, note, hide_content: hide } = req.valid.body;
    await tx(req, async (db) => {
      const { rows } = await db.query('SELECT * FROM reports WHERE id = $1 FOR UPDATE', [req.valid.params.id]);
      const r = rows[0];
      if (!r) throw notFound('Report');
      if (r.status !== 'open') throw conflict('not_pending', 'Report already handled');
      if (hide && r.post_id) await db.query(`UPDATE posts SET status = 'hidden' WHERE id = $1`, [r.post_id]);
      if (hide && r.comment_id) await db.query(`UPDATE comments SET status = 'hidden' WHERE id = $1`, [r.comment_id]);
      await db.query(
        `UPDATE reports SET status = $2, resolved_by = $3, resolved_at = now(), resolution_note = $4 WHERE id = $1`,
        [r.id, decision, req.viewer.id, note ?? null]);
      await db.query(
        `INSERT INTO moderation_actions (moderator_id, action, report_id, post_id, comment_id, note)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.viewer.id, decision === 'resolved' ? 'resolve_report' : 'dismiss_report', r.id, r.post_id, r.comment_id, note ?? null]);
    });
    res.json({ id: req.valid.params.id });
  });

adminRouter.post('/moderation',
  validate({ body: z.object({
    action: z.enum(['hide', 'restore', 'remove']), post_id: uuid.optional(), comment_id: uuid.optional(),
    note: z.string().trim().max(2000).optional().nullable(),
  }).refine((b) => Boolean(b.post_id) !== Boolean(b.comment_id), { message: 'Give exactly one of post_id or comment_id' }) }),
  async (req, res) => {
    const b = req.valid.body;
    const status = { hide: 'hidden', restore: 'visible', remove: 'removed' }[b.action];
    await tx(req, async (db) => {
      const table = b.post_id ? 'posts' : 'comments';
      const { rowCount } = await db.query(`UPDATE ${table} SET status = $2 WHERE id = $1`, [b.post_id ?? b.comment_id, status]);
      if (!rowCount) throw notFound();
      await db.query(
        `INSERT INTO moderation_actions (moderator_id, action, post_id, comment_id, note) VALUES ($1, $2, $3, $4, $5)`,
        [req.viewer.id, b.action, b.post_id ?? null, b.comment_id ?? null, b.note ?? null]);
    });
    res.status(204).end();
  });

// ------------------------------------------------------------------ audit log
adminRouter.get('/audit-logs',
  validate({ query: z.object({
    table: z.string().max(60).optional(), recordId: uuid.optional(), actorId: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }) }),
  async (req, res) => {
    const { table, recordId, actorId, limit } = req.valid.query;
    const params = [];
    const where = ['true'];
    if (table) { params.push(table); where.push(`a.table_name = $${params.length}`); }
    if (recordId) { params.push(recordId); where.push(`a.record_id = $${params.length}`); }
    if (actorId) { params.push(actorId); where.push(`a.actor_user_id = $${params.length}`); }
    params.push(limit);
    const { rows } = await query(
      `SELECT a.id, a.occurred_at, a.action, a.table_name, a.record_id, a.changed_fields, a.proposal_id,
              a.old_data, a.new_data,
              u.display_name_bn AS actor_name_bn, u.display_name_en AS actor_name_en
       FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE ${where.join(' AND ')} ORDER BY a.occurred_at DESC LIMIT $${params.length}`, params);
    res.json({ items: rows });
  });
