import { Router } from 'express';
import { query } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';
import { idParams, validate } from '../../middleware/validate.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT id, kind, title_bn, title_en, link, read_at, created_at FROM notifications
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.viewer.id]);
  res.json({ items: rows });
});

notificationsRouter.post('/read-all', async (req, res) => {
  await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.viewer.id]);
  res.status(204).end();
});

notificationsRouter.post('/:id/read', validate({ params: idParams }), async (req, res) => {
  await query('UPDATE notifications SET read_at = coalesce(read_at, now()) WHERE id = $1 AND user_id = $2',
    [req.valid.params.id, req.viewer.id]);
  res.status(204).end();
});
