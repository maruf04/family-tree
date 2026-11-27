import { Router } from 'express';
import { z } from 'zod';
import { requireRole, requireVerified } from '../../middleware/auth.js';
import { idParams, pagination, uuid, validate } from '../../middleware/validate.js';
import { directCreate, directDelete, directUpdate } from '../genealogy/directEdit.js';
import { describeRelationship } from '../relationships/kinship.js';
import { ancestorTree, descendantTree } from '../trees/service.js';
import {
  findPossibleDuplicates, getPersonFamilyTrees, getPersonProfile, getSpouses, listLineage, searchPeople,
} from './service.js';

export const peopleRouter = Router();
peopleRouter.use(requireVerified);

const depthQuery = z.object({ depth: z.coerce.number().int().min(1).max(12).default(4) });
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

peopleRouter.get('/',
  validate({ query: pagination.extend({ q: z.string().trim().max(100).optional(), familyId: uuid.optional() }) }),
  async (req, res) => res.json(await searchPeople(req.viewer, req.valid.query)));

peopleRouter.get('/duplicates',
  validate({ query: z.object({ name: z.string().trim().min(2).max(200), birthYear: z.coerce.number().int().optional() }) }),
  async (req, res) => res.json({ items: await findPossibleDuplicates(req.viewer, req.valid.query) }));

peopleRouter.get('/:id', validate({ params: idParams }),
  async (req, res) => res.json(await getPersonProfile(req.viewer, req.valid.params.id)));

peopleRouter.get('/:id/ancestors', validate({ params: idParams, query: depthQuery }),
  async (req, res) => res.json({ items: await listLineage(req.viewer, req.valid.params.id, 'ancestors', req.valid.query.depth) }));

peopleRouter.get('/:id/descendants', validate({ params: idParams, query: depthQuery }),
  async (req, res) => res.json({ items: await listLineage(req.viewer, req.valid.params.id, 'descendants', req.valid.query.depth) }));

peopleRouter.get('/:id/spouses', validate({ params: idParams }),
  async (req, res) => res.json({ items: await getSpouses(req.viewer, req.valid.params.id) }));

peopleRouter.get('/:id/family-trees', validate({ params: idParams }),
  async (req, res) => res.json(await getPersonFamilyTrees(req.valid.params.id)));

// GET /people/:id/tree?view=descendants&depth=4&includeSpouses=true
peopleRouter.get('/:id/tree',
  validate({
    params: idParams,
    query: depthQuery.extend({
      view: z.enum(['ancestors', 'descendants']).default('descendants'),
      includeSpouses: bool.default(true),
    }),
  }),
  async (req, res) => {
    const { view, ...opts } = req.valid.query;
    const build = view === 'ancestors' ? ancestorTree : descendantTree;
    res.json(await build(req.viewer, req.valid.params.id, opts));
  });

peopleRouter.get('/:id/relationship/:otherId',
  validate({ params: z.object({ id: uuid, otherId: uuid }) }),
  async (req, res) => res.json(await describeRelationship(req.viewer, req.valid.params.id, req.valid.params.otherId)));

// Direct edits: moderators and admins only. Members submit /proposals instead.
peopleRouter.post('/', requireRole('moderator'), async (req, res) => {
  const id = await directCreate(req, 'person', req.body);
  res.status(201).json({ id });
});

peopleRouter.patch('/:id', requireRole('moderator'), validate({ params: idParams }), async (req, res) => {
  await directUpdate(req, 'person', req.valid.params.id, req.body);
  res.json({ id: req.valid.params.id });
});

peopleRouter.delete('/:id', requireRole('moderator'), validate({ params: idParams }), async (req, res) => {
  await directDelete(req, 'person', req.valid.params.id);
  res.status(204).end();
});
