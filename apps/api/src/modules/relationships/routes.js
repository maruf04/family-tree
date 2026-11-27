import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db.js';
import { requireRole, requireVerified } from '../../middleware/auth.js';
import { idParams, uuid, validate } from '../../middleware/validate.js';
import { directCreate, directDelete, directUpdate } from '../genealogy/directEdit.js';

export const relationshipsRouter = Router();
relationshipsRouter.use(requireVerified);

// Raw relationship edges for one person.
relationshipsRouter.get('/:personId', validate({ params: z.object({ personId: uuid }) }), async (req, res) => {
  const id = req.valid.params.personId;
  const [parents, children, marriages] = await Promise.all([
    query('SELECT id, parent_id, relationship_type, certainty FROM parent_child WHERE child_id = $1', [id]),
    query('SELECT id, child_id, relationship_type, certainty FROM parent_child WHERE parent_id = $1', [id]),
    query(`SELECT id, spouse1_id, spouse2_id, status, fuzzy_date_to_jsonb(start_date) AS start_date,
                  fuzzy_date_to_jsonb(end_date) AS end_date, spouse1_order, spouse2_order
           FROM marriages WHERE $1 IN (spouse1_id, spouse2_id)`, [id]),
  ]);
  res.json({ parents: parents.rows, children: children.rows, marriages: marriages.rows });
});

relationshipsRouter.post('/parent-child', requireRole('moderator'), async (req, res) => {
  res.status(201).json({ id: await directCreate(req, 'parent_child', req.body) });
});

relationshipsRouter.patch('/parent-child/:id', requireRole('moderator'), validate({ params: idParams }), async (req, res) => {
  await directUpdate(req, 'parent_child', req.valid.params.id, req.body);
  res.json({ id: req.valid.params.id });
});

relationshipsRouter.delete('/parent-child/:id', requireRole('moderator'), validate({ params: idParams }), async (req, res) => {
  await directDelete(req, 'parent_child', req.valid.params.id);
  res.status(204).end();
});

relationshipsRouter.post('/marriages', requireRole('moderator'), async (req, res) => {
  res.status(201).json({ id: await directCreate(req, 'marriage', req.body) });
});

relationshipsRouter.patch('/marriages/:id', requireRole('moderator'), validate({ params: idParams }), async (req, res) => {
  await directUpdate(req, 'marriage', req.valid.params.id, req.body);
  res.json({ id: req.valid.params.id });
});

relationshipsRouter.delete('/marriages/:id', requireRole('moderator'), validate({ params: idParams }), async (req, res) => {
  await directDelete(req, 'marriage', req.valid.params.id);
  res.status(204).end();
});
