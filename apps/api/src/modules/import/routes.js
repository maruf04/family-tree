import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../middleware/auth.js';
import { text, validate } from '../../middleware/validate.js';
import { importFamily, importedFamilies } from './service.js';

export const importRouter = Router();
importRouter.use(requireRole('moderator'));

importRouter.get('/', async (_req, res) => res.json({ families: await importedFamilies() }));

importRouter.post('/',
  validate({ body: z.object({
    people: z.string().min(1).max(2_000_000),
    marriages: z.string().max(1_000_000).optional().nullable(),
    root: z.string().trim().min(1).max(50),
    familyNameBn: text(200), familyNameEn: text(200),
    apply: z.boolean().default(false),
  }) }),
  async (req, res) => res.json(await importFamily(req.viewer, req.id, req.valid.body)));
