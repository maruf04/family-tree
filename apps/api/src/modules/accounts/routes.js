// Accounts are created by moderators/admins; there is no public registration.
// The temporary password is returned once, never stored, never logged.
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../../db.js';
import { badRequest, conflict, forbidden, notFound } from '../../errors.js';
import { authAdmin, temporaryPassword, usernameEmail } from '../../lib/authAdmin.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { idParams, text, uuid, validate } from '../../middleware/validate.js';

export const accountsRouter = Router();

accountsRouter.post('/', requireRole('moderator'),
  validate({ body: z.object({
    username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,29}$/, 'Invalid username'),
    display_name_bn: text(120), display_name_en: text(120),
    person_id: uuid.nullable().optional(),
    role: z.enum(['member', 'moderator', 'admin']).default('member'),
  }).refine((b) => b.display_name_bn || b.display_name_en, { message: 'Name required', path: ['display_name_bn'] }) }),
  async (req, res) => {
    const b = req.valid.body;
    if (b.role !== 'member' && !req.viewer.isAdmin) throw forbidden('admin_only');
    if ((await query('SELECT 1 FROM users WHERE username = $1', [b.username])).rowCount) throw conflict('username_taken', 'Username is already in use');
    if (b.person_id && (await query('SELECT 1 FROM users WHERE person_id = $1', [b.person_id])).rowCount) {
      throw conflict('person_has_account', 'This person already has an account');
    }
    const password = temporaryPassword();
    const id = await authAdmin().create(usernameEmail(b.username), password);
    try {
      await tx(req, (db) => db.query(
        `INSERT INTO users (id, username, display_name_bn, display_name_en, person_id, role, membership_status,
                            verified_at, verified_by, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, 'verified', now(), $7, true)`,
        [id, b.username, b.display_name_bn ?? null, b.display_name_en ?? null, b.person_id ?? null, b.role, req.viewer.id]));
    } catch (err) {
      // Never leave a login behind that has no account.
      await authAdmin().remove(id).catch((e) => console.error(`[${req.id}] could not remove login ${id}:`, e.message));
      throw err;
    }
    res.set('Cache-Control', 'no-store').status(201).json({ id, username: b.username, temporaryPassword: password });
  });

accountsRouter.post('/:id/reset-password', requireRole('moderator'), validate({ params: idParams }), async (req, res) => {
  const { rows } = await query('SELECT id, username, email, role FROM users WHERE id = $1', [req.valid.params.id]);
  if (!rows[0]) throw notFound('User');
  if (rows[0].id === req.viewer.id) throw badRequest('use_change_password', 'Change your own password from your account page');
  if (rows[0].role !== 'member' && !req.viewer.isAdmin) throw forbidden('admin_only');
  const password = temporaryPassword();
  // Flag first: a temporary password must never work without the forced change.
  await tx(req, (db) => db.query('UPDATE users SET must_change_password = true WHERE id = $1', [rows[0].id]));
  await authAdmin().setPassword(rows[0].id, password);
  res.set('Cache-Control', 'no-store').json({ username: rows[0].username ?? rows[0].email, temporaryPassword: password });
});

// Slow down password guessing through a stolen session.
const attempts = new Map();
function limitAttempts(userId) {
  const now = Date.now();
  const recent = (attempts.get(userId) ?? []).filter((t) => now - t < 15 * 60_000);
  if (recent.length >= 8) throw conflict('too_many_attempts', 'Too many attempts; try again later');
  attempts.set(userId, [...recent, now]);
}

accountsRouter.post('/me/password', requireAuth,
  validate({ body: z.object({ current_password: z.string().min(1).max(200), new_password: z.string().min(8).max(72) }) }),
  async (req, res) => {
    const { current_password: current, new_password: next } = req.valid.body;
    limitAttempts(req.viewer.id);
    if (current === next) throw badRequest('same_password', 'Choose a different password');
    if (!(await authAdmin().verifyPassword(req.viewer.id, current))) throw badRequest('wrong_password', 'Current password is wrong');
    await authAdmin().setPassword(req.viewer.id, next);
    await tx(req, (db) => db.query('UPDATE users SET must_change_password = false WHERE id = $1', [req.viewer.id]));
    res.status(204).end();
  });

