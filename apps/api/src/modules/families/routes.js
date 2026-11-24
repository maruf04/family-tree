import { Router } from 'express';
import { z } from 'zod';
import { requireRole, requireVerified } from '../../middleware/auth.js';
import { idParams, pagination, uuid, validate } from '../../middleware/validate.js';
import { directCreate, directDelete, directUpdate } from '../genealogy/directEdit.js';
import { descendantTree } from '../trees/service.js';
import { getFamily, getFamilyRoot, listFamilies, listFamilyMembers } from './service.js';

export const familiesRouter = Router();
familiesRouter.use(requireVerified);

familiesRouter.get('/', validate({ query: pagination.extend({ q: z.string().trim().max(100).optional() }) }),
  async (req, res) => res.json(await listFamilies(req.viewer, req.valid.query)));

familiesRouter.get('/:id', validate({ params: idParams }),
  async (req, res) => res.json(await getFamily(req.viewer, req.valid.params.id)));

familiesRouter.get('/:id/members', validate({ params: idParams, query: pagination.extend({ limit: z.coerce.number().int().min(1).max(500).default(200) }) }),
  async (req, res) => res.json(await listFamilyMembers(req.viewer, req.valid.params.id, req.valid.query)));

// The lineage tree: descendants of the family's root ancestor, with all spouses.
familiesRouter.get('/:id/tree',
  validate({ params: idParams, query: z.object({ depth: z.coerce.number().int().min(1).max(12).default(6) }) }),
  async (req, res) => {
    const rootId = await getFamilyRoot(req.valid.params.id);
    res.json(await descendantTree(req.viewer, rootId, { depth: req.valid.query.depth, includeSpouses: true }));
  });

familiesRouter.post('/', requireRole('moderator'), async (req, res) => {
  res.status(201).json({ id: await directCreate(req, 'family', req.body) });
});

familiesRouter.patch('/:id', requireRole('moderator'), validate({ params: idParams }), async (req, res) => {
  await directUpdate(req, 'family', req.valid.params.id, req.body);
  res.json({ id: req.valid.params.id });
});

familiesRouter.post('/:id/members', requireRole('moderator'), validate({ params: idParams }), async (req, res) => {
  const id = await directCreate(req, 'family_member', { ...req.body, family_id: req.valid.params.id });
  res.status(201).json({ id });
});

familiesRouter.delete('/:id/members/:memberId', requireRole('moderator'),
  validate({ params: z.object({ id: uuid, memberId: uuid }) }), async (req, res) => {
    await directDelete(req, 'family_member', req.valid.params.memberId);
    res.status(204).end();
  });
