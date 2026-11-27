import { Router } from 'express';
import { z } from 'zod';
import { requireRole, requireVerified } from '../../middleware/auth.js';
import { idParams, uuid, validate } from '../../middleware/validate.js';
import {
  applyDirectly, approveProposal, getProposal, listProposals, rejectProposal, submitProposal, withdrawProposal,
} from './service.js';

export const proposalsRouter = Router();
proposalsRouter.use(requireVerified);

const itemSchema = z.object({
  entity_type: z.string(),
  action: z.enum(['create', 'update', 'delete']),
  target_id: uuid.optional().nullable(),
  temp_ref: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/).optional().nullable(),
  payload: z.record(z.string(), z.any()).default({}),
});

proposalsRouter.post('/',
  validate({
    body: z.object({
      familyId: uuid.optional().nullable(),
      summary: z.string().trim().min(3).max(300),
      rationale: z.string().trim().max(5000).optional().nullable(),
      items: z.array(itemSchema).min(1).max(30),
    }),
  }),
  async (req, res) => {
    const id = await submitProposal(req.viewer, req.id, req.valid.body);
    res.status(201).json({ id });
  });

// Moderators/admins: apply a set of changes atomically, without review.
proposalsRouter.post('/apply', requireRole('moderator'),
  validate({ body: z.object({ items: z.array(itemSchema).min(1).max(30) }) }),
  async (req, res) => res.status(201).json(await applyDirectly(req.viewer, req.id, req.valid.body.items)));

proposalsRouter.get('/mine', async (req, res) => {
  res.json({ items: await listProposals({ proposerId: req.viewer.id }) });
});

proposalsRouter.get('/pending', requireRole('moderator'),
  validate({ query: z.object({ familyId: uuid.optional() }) }),
  async (req, res) => res.json({ items: await listProposals({ status: 'pending', familyId: req.valid.query.familyId }) }));

proposalsRouter.get('/reviewed', requireRole('moderator'), async (req, res) => {
  const [approved, rejected] = await Promise.all([
    listProposals({ status: 'approved', limit: 30 }), listProposals({ status: 'rejected', limit: 30 }),
  ]);
  res.json({ items: [...approved, ...rejected].sort((a, b) => b.reviewed_at - a.reviewed_at) });
});

proposalsRouter.get('/:id', validate({ params: idParams }),
  async (req, res) => res.json(await getProposal(req.viewer, req.valid.params.id)));

const reviewBody = z.object({ note: z.string().trim().max(2000).optional().nullable() });

proposalsRouter.post('/:id/approve', requireRole('moderator'), validate({ params: idParams, body: reviewBody }),
  async (req, res) => res.json(await approveProposal(req.viewer, req.id, req.valid.params.id, req.valid.body.note)));

proposalsRouter.post('/:id/reject', requireRole('moderator'), validate({ params: idParams, body: reviewBody }),
  async (req, res) => res.json(await rejectProposal(req.viewer, req.id, req.valid.params.id, req.valid.body.note)));

proposalsRouter.post('/:id/withdraw', validate({ params: idParams }),
  async (req, res) => res.json(await withdrawProposal(req.viewer, req.id, req.valid.params.id)));
