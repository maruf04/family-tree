// Village affairs: news (member submission → moderator review) and announcements.
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../../db.js';
import { badRequest, conflict, forbidden, notFound } from '../../errors.js';
import { crudRouter } from '../../lib/crud.js';
import { requireRole, requireVerified } from '../../middleware/auth.js';
import { idParams, validate } from '../../middleware/validate.js';
import { notify, notifyModerators } from '../notifications/service.js';

export const affairsRouter = Router();

affairsRouter.get('/news-categories', async (_req, res) => {
  const { rows } = await query('SELECT id, slug, name_bn, name_en FROM news_categories ORDER BY sort_order');
  res.json({ items: rows });
});

const NEWS_SELECT = `
  n.id, n.title_bn, n.title_en, n.summary_bn, n.summary_en, n.body_bn, n.body_en, n.status, n.is_featured,
  n.submitted_at, n.published_at, n.review_note, n.author_id, n.cover_photo_id,
  c.slug AS category_slug, c.name_bn AS category_name_bn, c.name_en AS category_name_en,
  u.display_name_bn AS author_name_bn, u.display_name_en AS author_name_en`;
const NEWS_JOINS = 'JOIN news_categories c ON c.id = n.category_id LEFT JOIN users u ON u.id = n.author_id';

affairsRouter.get('/news', requireVerified,
  validate({ query: z.object({ category: z.string().max(40).optional(), limit: z.coerce.number().int().min(1).max(50).default(20), offset: z.coerce.number().int().min(0).default(0) }) }),
  async (req, res) => {
    const { category, limit, offset } = req.valid.query;
    const params = [limit, offset];
    let where = `n.status = 'published'`;
    if (category) { params.push(category); where += ` AND c.slug = $${params.length}`; }
    const { rows } = await query(
      `SELECT ${NEWS_SELECT}, count(*) OVER () AS total FROM news_articles n ${NEWS_JOINS}
       WHERE ${where} ORDER BY n.is_featured DESC, n.published_at DESC LIMIT $1 OFFSET $2`, params);
    res.json({ total: rows[0]?.total ?? 0, items: rows.map(({ total: _t, ...r }) => r) });
  });

affairsRouter.get('/news/mine', requireVerified, async (req, res) => {
  const { rows } = await query(
    `SELECT ${NEWS_SELECT} FROM news_articles n ${NEWS_JOINS} WHERE n.author_id = $1 ORDER BY n.created_at DESC`,
    [req.viewer.id]);
  res.json({ items: rows });
});

affairsRouter.get('/news/pending', requireRole('moderator'), async (_req, res) => {
  const { rows } = await query(
    `SELECT ${NEWS_SELECT} FROM news_articles n ${NEWS_JOINS} WHERE n.status = 'submitted' ORDER BY n.submitted_at`);
  res.json({ items: rows });
});

affairsRouter.get('/news/:id', requireVerified, validate({ params: idParams }), async (req, res) => {
  const { rows } = await query(`SELECT ${NEWS_SELECT} FROM news_articles n ${NEWS_JOINS} WHERE n.id = $1`, [req.valid.params.id]);
  const article = rows[0];
  if (!article) throw notFound('News article');
  if (article.status !== 'published' && article.author_id !== req.viewer.id && !req.viewer.isModerator) throw notFound('News article');
  res.json(article);
});

const newsBody = z.object({
  category_slug: z.string().max(40),
  title_bn: z.string().trim().max(300).optional().nullable(), title_en: z.string().trim().max(300).optional().nullable(),
  summary_bn: z.string().trim().max(1000).optional().nullable(), summary_en: z.string().trim().max(1000).optional().nullable(),
  body_bn: z.string().trim().max(30000).optional().nullable(), body_en: z.string().trim().max(30000).optional().nullable(),
  publish: z.boolean().optional(),   // moderators may publish directly
}).refine((b) => b.title_bn || b.title_en, { message: 'Title required', path: ['title_bn'] })
  .refine((b) => b.body_bn || b.body_en, { message: 'Text required', path: ['body_bn'] });

affairsRouter.post('/news', requireVerified, validate({ body: newsBody }), async (req, res) => {
  const b = req.valid.body;
  const { rows: cat } = await query('SELECT id FROM news_categories WHERE slug = $1', [b.category_slug]);
  if (!cat[0]) throw badRequest('validation_failed', 'Unknown category', [{ path: 'category_slug', message: 'Unknown' }]);
  const publishNow = Boolean(b.publish && req.viewer.isModerator);
  const id = await tx(req, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO news_articles (category_id, title_bn, title_en, summary_bn, summary_en, body_bn, body_en,
                                  author_id, status, submitted_at, published_at, reviewed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), $10, $11) RETURNING id`,
      [cat[0].id, b.title_bn ?? null, b.title_en ?? null, b.summary_bn ?? null, b.summary_en ?? null,
        b.body_bn ?? null, b.body_en ?? null, req.viewer.id, publishNow ? 'published' : 'submitted',
        publishNow ? new Date() : null, publishNow ? req.viewer.id : null]);
    if (!publishNow) {
      await notifyModerators(db, {
        kind: 'news_submitted', titleBn: 'নতুন সংবাদ অনুমোদনের অপেক্ষায়', titleEn: 'News article awaiting review',
        link: '/moderation',
      }, { exceptUserId: req.viewer.id });
    }
    return rows[0].id;
  });
  res.status(201).json({ id, status: publishNow ? 'published' : 'submitted' });
});

affairsRouter.post('/news/:id/review', requireRole('moderator'),
  validate({ params: idParams, body: z.object({ decision: z.enum(['publish', 'reject']), note: z.string().trim().max(2000).optional().nullable(), featured: z.boolean().optional() }) }),
  async (req, res) => {
    const { decision, note, featured } = req.valid.body;
    await tx(req, async (db) => {
      const { rows } = await db.query('SELECT id, status, author_id, title_bn, title_en FROM news_articles WHERE id = $1 FOR UPDATE', [req.valid.params.id]);
      const a = rows[0];
      if (!a) throw notFound('News article');
      if (a.status !== 'submitted') throw conflict('not_pending', `Article is ${a.status}`);
      await db.query(
        `UPDATE news_articles SET status = $2, reviewed_by = $3, review_note = $4,
                published_at = CASE WHEN $2 = 'published' THEN now() END, is_featured = coalesce($5, is_featured)
         WHERE id = $1`,
        [a.id, decision === 'publish' ? 'published' : 'rejected', req.viewer.id, note ?? null, featured ?? null]);
      await db.query(`INSERT INTO moderation_actions (moderator_id, action, news_article_id, note) VALUES ($1, $2, $3, $4)`,
        [req.viewer.id, decision === 'publish' ? 'approve_news' : 'reject_news', a.id, note ?? null]);
      await notify(db, a.author_id, decision === 'publish'
        ? { kind: 'news_published', titleBn: 'আপনার সংবাদ প্রকাশিত হয়েছে', titleEn: 'Your news article was published', link: `/affairs/news/${a.id}` }
        : { kind: 'news_rejected', titleBn: 'আপনার সংবাদ প্রকাশ করা হয়নি', titleEn: 'Your news article was not published', link: `/affairs/news/${a.id}` });
    });
    res.json({ id: req.valid.params.id });
  });

affairsRouter.delete('/news/:id', requireVerified, validate({ params: idParams }), async (req, res) => {
  const { rows } = await query('SELECT author_id, status FROM news_articles WHERE id = $1', [req.valid.params.id]);
  if (!rows[0]) throw notFound('News article');
  const ownDraft = rows[0].author_id === req.viewer.id && rows[0].status !== 'published';
  if (!ownDraft && !req.viewer.isModerator) throw forbidden();
  await tx(req, (db) => db.query(`UPDATE news_articles SET status = 'archived' WHERE id = $1`, [req.valid.params.id]));
  res.status(204).end();
});

// Active announcements first; moderators manage them.
affairsRouter.get('/announcements/active', requireVerified, async (_req, res) => {
  const { rows } = await query(
    `SELECT id, title_bn, title_en, body_bn, body_en, priority, starts_at, expires_at FROM announcements
     WHERE starts_at <= now() AND (expires_at IS NULL OR expires_at > now())
     ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'important' THEN 1 ELSE 2 END, starts_at DESC`);
  res.json({ items: rows });
});

affairsRouter.use('/announcements', requireVerified, crudRouter({
  table: 'announcements',
  fields: {
    title_bn: 'text', title_en: 'text', body_bn: 'long', body_en: 'long',
    priority: ['normal', 'important', 'urgent'], starts_at: 'timestamp', expires_at: 'timestamp',
  },
  requireOneOf: ['title_bn', 'title_en'],
  orderBy: 't.starts_at DESC',
}));
