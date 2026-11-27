// Private file storage (Supabase Storage). Files live in a private bucket;
// uploads use short-lived signed upload URLs, downloads short-lived signed
// URLs issued only after a permission check. The service-role key never
// leaves the server.
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { query, tx } from '../../db.js';
import { AppError, notFound } from '../../errors.js';
import { requireVerified } from '../../middleware/auth.js';
import { idParams, validate } from '../../middleware/validate.js';

export const mediaRouter = Router();
mediaRouter.use(requireVerified);

let supabase;
function storage() {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    throw new AppError(503, 'storage_not_configured', 'File storage is not configured yet');
  }
  supabase ??= createClient(config.supabase.url, config.supabase.serviceRoleKey, { auth: { persistSession: false } });
  return supabase.storage.from(config.supabase.storageBucket);
}

const ALLOWED_TYPES = /^(image\/(jpeg|png|webp|gif)|application\/pdf|audio\/(mpeg|mp4|ogg|wav)|video\/(mp4|webm))$/;
const MAX_BYTES = 50 * 1024 * 1024;

mediaRouter.post('/uploads',
  validate({ body: z.object({
    fileName: z.string().trim().min(1).max(200),
    mimeType: z.string().regex(ALLOWED_TYPES, 'Unsupported file type'),
    byteSize: z.number().int().min(1).max(MAX_BYTES),
    caption_bn: z.string().max(500).optional().nullable(),
    caption_en: z.string().max(500).optional().nullable(),
    privacy_level: z.enum(['public', 'members', 'family', 'restricted']).default('members'),
  }) }),
  async (req, res) => {
    const b = req.valid.body;
    const ext = (b.fileName.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? 'bin').toLowerCase();
    const objectPath = `${req.viewer.id}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
    const { data, error } = await storage().createSignedUploadUrl(objectPath);
    if (error) throw new AppError(502, 'storage_error', error.message);
    const id = await tx(req, async (db) => (await db.query(
      `INSERT INTO media_assets (bucket, object_path, mime_type, byte_size, caption_bn, caption_en, privacy_level, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [config.supabase.storageBucket, objectPath, b.mimeType, b.byteSize, b.caption_bn ?? null, b.caption_en ?? null,
        b.privacy_level, req.viewer.id])).rows[0].id);
    res.status(201).json({ id, uploadUrl: data.signedUrl, token: data.token, path: objectPath });
  });

mediaRouter.get('/:id/url', validate({ params: idParams }), async (req, res) => {
  const { rows } = await query('SELECT object_path, privacy_level, uploaded_by FROM media_assets WHERE id = $1', [req.valid.params.id]);
  const m = rows[0];
  const allowed = m && (req.viewer.isModerator || m.uploaded_by === req.viewer.id || ['public', 'members'].includes(m.privacy_level));
  if (!allowed) throw notFound('File');
  const { data, error } = await storage().createSignedUrl(m.object_path, 3600);
  if (error) throw new AppError(502, 'storage_error', error.message);
  res.json({ url: data.signedUrl, expiresIn: 3600 });
});
