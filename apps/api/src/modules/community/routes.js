// Community: posts, comments, reactions, groups, events, reports.
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import { requireVerified } from '../../middleware/auth.js';
import { idParams, uuid, validate } from '../../middleware/validate.js';
import { notify } from '../notifications/service.js';

export const communityRouter = Router();
communityRouter.use(requireVerified);

const POST_TYPES = ['discussion', 'photo', 'video', 'buy_sell', 'help_request', 'achievement', 'celebration'];
const REACTIONS = ['like', 'love', 'celebrate', 'support', 'sad'];

const POST_SELECT = `
  p.id, p.post_type, p.title, p.body, p.video_url, p.price_bdt, p.is_resolved, p.status, p.group_id,
  p.created_at, p.updated_at, p.author_id,
  u.display_name_bn AS author_name_bn, u.display_name_en AS author_name_en,
  g.name_bn AS group_name_bn, g.name_en AS group_name_en,
  (SELECT count(*) FROM comments c WHERE c.post_id = p.id AND c.status = 'visible') AS comment_count,
  (SELECT coalesce(jsonb_object_agg(reaction, n), '{}') FROM
     (SELECT reaction, count(*) AS n FROM reactions r WHERE r.post_id = p.id GROUP BY reaction) x) AS reactions,
  (SELECT reaction FROM reactions r WHERE r.post_id = p.id AND r.user_id = $1) AS my_reaction`;

// Posts in closed groups are visible to group members (and moderators) only.
const VISIBLE_POST = `(p.status = 'visible' OR ($2 AND p.status = 'hidden'))
  AND (p.group_id IS NULL OR g.visibility = 'open' OR $2
       OR EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = p.group_id AND gm.user_id = $1))`;

// ---------------------------------------------------------------------- posts
communityRouter.get('/posts',
  validate({ query: z.object({
    type: z.enum(POST_TYPES).optional(),
    groupId: uuid.optional(),
    authorId: uuid.optional(),
    before: z.string().datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }) }),
  async (req, res) => {
    const { type, groupId, authorId, before, limit } = req.valid.query;
    const params = [req.viewer.id, req.viewer.isModerator];
    const where = [VISIBLE_POST];
    if (type) { params.push(type); where.push(`p.post_type = $${params.length}`); }
    if (groupId) { params.push(groupId); where.push(`p.group_id = $${params.length}`); }
    if (authorId) { params.push(authorId); where.push(`p.author_id = $${params.length}`); }
    if (before) { params.push(before); where.push(`p.created_at < $${params.length}`); }
    params.push(limit);
    const { rows } = await query(
      `SELECT ${POST_SELECT} FROM posts p
       LEFT JOIN users u ON u.id = p.author_id LEFT JOIN groups g ON g.id = p.group_id
       WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC LIMIT $${params.length}`, params);
    res.json({ items: rows, nextBefore: rows.length === limit ? rows.at(-1).created_at : null });
  });

const postBody = z.object({
  post_type: z.enum(POST_TYPES).default('discussion'),
  title: z.string().trim().max(200).optional().nullable(),
  body: z.string().trim().min(1).max(10000),
  group_id: uuid.optional().nullable(),
  price_bdt: z.number().min(0).max(1e9).optional().nullable(),
  video_url: z.string().url().max(500).optional().nullable(),
});

communityRouter.post('/posts', validate({ body: postBody }), async (req, res) => {
  const b = req.valid.body;
  if (b.price_bdt != null && b.post_type !== 'buy_sell') throw badRequest('validation_failed', 'Price is only for buy/sell posts');
  if (b.group_id) {
    const { rows } = await query(
      `SELECT g.visibility, EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = g.id AND gm.user_id = $2) AS member
       FROM groups g WHERE g.id = $1`, [b.group_id, req.viewer.id]);
    if (!rows[0]) throw notFound('Group');
    if (!rows[0].member) throw forbidden('group_members_only', 'Join the group to post in it');
  }
  const id = await tx(req, async (db) => (await db.query(
    `INSERT INTO posts (author_id, post_type, title, body, group_id, price_bdt, video_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [req.viewer.id, b.post_type, b.title ?? null, b.body, b.group_id ?? null, b.price_bdt ?? null, b.video_url ?? null])).rows[0].id);
  res.status(201).json({ id });
});

async function loadPost(req, id) {
  const { rows } = await query(
    `SELECT ${POST_SELECT} FROM posts p
     LEFT JOIN users u ON u.id = p.author_id LEFT JOIN groups g ON g.id = p.group_id
     WHERE p.id = $3 AND ${VISIBLE_POST}`, [req.viewer.id, req.viewer.isModerator, id]);
  if (!rows[0]) throw notFound('Post');
  return rows[0];
}

communityRouter.get('/posts/:id', validate({ params: idParams }), async (req, res) => {
  const post = await loadPost(req, req.valid.params.id);
  const { rows: comments } = await query(
    `SELECT c.id, c.body, c.parent_comment_id, c.created_at, c.author_id, c.status,
            u.display_name_bn AS author_name_bn, u.display_name_en AS author_name_en
     FROM comments c LEFT JOIN users u ON u.id = c.author_id
     WHERE c.post_id = $1 AND (c.status = 'visible' OR $2)
     ORDER BY c.created_at`, [post.id, req.viewer.isModerator]);
  res.json({ ...post, comments });
});

communityRouter.patch('/posts/:id',
  validate({ params: idParams, body: postBody.pick({ title: true, body: true, price_bdt: true }).partial()
    .extend({ is_resolved: z.boolean().optional() }) }),
  async (req, res) => {
    const post = await loadPost(req, req.valid.params.id);
    if (post.author_id !== req.viewer.id) throw forbidden();
    const b = req.valid.body;
    const cols = Object.keys(b);
    if (!cols.length) throw badRequest('validation_failed', 'Nothing to change');
    const params = cols.map((c) => b[c]);
    params.push(post.id);
    await tx(req, (db) => db.query(
      `UPDATE posts SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${params.length}`, params));
    res.json({ id: post.id });
  });

// Authors delete their own posts; moderators remove any post (recorded as a moderation action).
communityRouter.delete('/posts/:id', validate({ params: idParams }), async (req, res) => {
  const post = await loadPost(req, req.valid.params.id);
  const isAuthor = post.author_id === req.viewer.id;
  if (!isAuthor && !req.viewer.isModerator) throw forbidden();
  await tx(req, async (db) => {
    await db.query(`UPDATE posts SET status = 'removed' WHERE id = $1`, [post.id]);
    if (!isAuthor) {
      await db.query(`INSERT INTO moderation_actions (moderator_id, action, post_id) VALUES ($1, 'remove', $2)`,
        [req.viewer.id, post.id]);
    }
  });
  res.status(204).end();
});

// ------------------------------------------------------------------- comments
communityRouter.post('/posts/:id/comments',
  validate({ params: idParams, body: z.object({ body: z.string().trim().min(1).max(3000), parent_comment_id: uuid.optional().nullable() }) }),
  async (req, res) => {
    const post = await loadPost(req, req.valid.params.id);
    const id = await tx(req, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO comments (post_id, author_id, body, parent_comment_id) VALUES ($1, $2, $3, $4) RETURNING id`,
        [post.id, req.viewer.id, req.valid.body.body, req.valid.body.parent_comment_id ?? null]);
      if (post.author_id && post.author_id !== req.viewer.id) {
        await notify(db, post.author_id, {
          kind: 'comment', titleBn: 'আপনার পোস্টে নতুন মন্তব্য', titleEn: 'New comment on your post',
          link: `/community/posts/${post.id}`,
        });
      }
      return rows[0].id;
    });
    res.status(201).json({ id });
  });

communityRouter.delete('/comments/:id', validate({ params: idParams }), async (req, res) => {
  const { rows } = await query('SELECT id, author_id FROM comments WHERE id = $1', [req.valid.params.id]);
  if (!rows[0]) throw notFound('Comment');
  const isAuthor = rows[0].author_id === req.viewer.id;
  if (!isAuthor && !req.viewer.isModerator) throw forbidden();
  await tx(req, async (db) => {
    await db.query(`UPDATE comments SET status = 'removed' WHERE id = $1`, [rows[0].id]);
    if (!isAuthor) {
      await db.query(`INSERT INTO moderation_actions (moderator_id, action, comment_id) VALUES ($1, 'remove', $2)`,
        [req.viewer.id, rows[0].id]);
    }
  });
  res.status(204).end();
});

// ------------------------------------------------------------------ reactions
communityRouter.put('/posts/:id/reaction',
  validate({ params: idParams, body: z.object({ reaction: z.enum(REACTIONS) }) }),
  async (req, res) => {
    const post = await loadPost(req, req.valid.params.id);
    await query(
      `INSERT INTO reactions (user_id, post_id, reaction) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, post_id) WHERE post_id IS NOT NULL DO UPDATE SET reaction = EXCLUDED.reaction`,
      [req.viewer.id, post.id, req.valid.body.reaction]);
    res.status(204).end();
  });

communityRouter.delete('/posts/:id/reaction', validate({ params: idParams }), async (req, res) => {
  await query('DELETE FROM reactions WHERE user_id = $1 AND post_id = $2', [req.viewer.id, req.valid.params.id]);
  res.status(204).end();
});

// --------------------------------------------------------------------- groups
communityRouter.get('/groups', async (req, res) => {
  const { rows } = await query(
    `SELECT g.id, g.name_bn, g.name_en, g.description_bn, g.description_en, g.visibility, g.created_at,
            (SELECT count(*) FROM group_members gm WHERE gm.group_id = g.id) AS member_count,
            EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = g.id AND gm.user_id = $1) AS joined
     FROM groups g ORDER BY coalesce(g.name_bn, g.name_en)`, [req.viewer.id]);
  res.json({ items: rows });
});

communityRouter.post('/groups',
  validate({ body: z.object({
    name_bn: z.string().trim().max(150).optional().nullable(), name_en: z.string().trim().max(150).optional().nullable(),
    description_bn: z.string().trim().max(2000).optional().nullable(), description_en: z.string().trim().max(2000).optional().nullable(),
    visibility: z.enum(['open', 'closed']).default('open'),
  }).refine((b) => b.name_bn || b.name_en, { message: 'Name required', path: ['name_bn'] }) }),
  async (req, res) => {
    const b = req.valid.body;
    const id = await tx(req, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO groups (name_bn, name_en, description_bn, description_en, visibility, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [b.name_bn ?? null, b.name_en ?? null, b.description_bn ?? null, b.description_en ?? null, b.visibility, req.viewer.id]);
      await db.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'admin')`, [rows[0].id, req.viewer.id]);
      return rows[0].id;
    });
    res.status(201).json({ id });
  });

communityRouter.post('/groups/:id/join', validate({ params: idParams }), async (req, res) => {
  const { rows } = await query('SELECT visibility FROM groups WHERE id = $1', [req.valid.params.id]);
  if (!rows[0]) throw notFound('Group');
  if (rows[0].visibility === 'closed' && !req.viewer.isModerator) {
    throw forbidden('group_closed', 'This group is closed; ask a group admin to add you');
  }
  await query(`INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [req.valid.params.id, req.viewer.id]);
  res.status(204).end();
});

communityRouter.delete('/groups/:id/join', validate({ params: idParams }), async (req, res) => {
  await query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [req.valid.params.id, req.viewer.id]);
  res.status(204).end();
});

// --------------------------------------------------------------------- events
const EVENT_SELECT = `
  e.id, e.title_bn, e.title_en, e.description_bn, e.description_en, e.starts_at, e.ends_at,
  e.location_text, e.place_id, e.status, e.organizer_id,
  u.display_name_bn AS organizer_name_bn, u.display_name_en AS organizer_name_en,
  (SELECT count(*) FROM event_attendees a WHERE a.event_id = e.id AND a.status = 'going') AS going_count,
  (SELECT count(*) FROM event_attendees a WHERE a.event_id = e.id AND a.status = 'interested') AS interested_count,
  (SELECT status FROM event_attendees a WHERE a.event_id = e.id AND a.user_id = $1) AS my_status`;

communityRouter.get('/events',
  validate({ query: z.object({ scope: z.enum(['upcoming', 'past']).default('upcoming'), limit: z.coerce.number().int().min(1).max(50).default(20) }) }),
  async (req, res) => {
    const upcoming = req.valid.query.scope === 'upcoming';
    const { rows } = await query(
      `SELECT ${EVENT_SELECT} FROM events e LEFT JOIN users u ON u.id = e.organizer_id
       WHERE ${upcoming ? `coalesce(e.ends_at, e.starts_at) >= now() AND e.status <> 'cancelled'` : 'coalesce(e.ends_at, e.starts_at) < now()'}
       ORDER BY e.starts_at ${upcoming ? 'ASC' : 'DESC'} LIMIT $2`, [req.viewer.id, req.valid.query.limit]);
    res.json({ items: rows });
  });

communityRouter.post('/events',
  validate({ body: z.object({
    title_bn: z.string().trim().max(200).optional().nullable(), title_en: z.string().trim().max(200).optional().nullable(),
    description_bn: z.string().trim().max(5000).optional().nullable(), description_en: z.string().trim().max(5000).optional().nullable(),
    starts_at: z.string().datetime({ offset: true }), ends_at: z.string().datetime({ offset: true }).optional().nullable(),
    location_text: z.string().trim().max(300).optional().nullable(), place_id: uuid.optional().nullable(),
  }).refine((b) => b.title_bn || b.title_en, { message: 'Title required', path: ['title_bn'] }) }),
  async (req, res) => {
    const b = req.valid.body;
    const id = await tx(req, async (db) => (await db.query(
      `INSERT INTO events (title_bn, title_en, description_bn, description_en, starts_at, ends_at, location_text, place_id, organizer_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [b.title_bn ?? null, b.title_en ?? null, b.description_bn ?? null, b.description_en ?? null, b.starts_at,
        b.ends_at ?? null, b.location_text ?? null, b.place_id ?? null, req.viewer.id])).rows[0].id);
    res.status(201).json({ id });
  });

communityRouter.put('/events/:id/rsvp',
  validate({ params: idParams, body: z.object({ status: z.enum(['going', 'interested', 'not_going']) }) }),
  async (req, res) => {
    const { rowCount } = await query('SELECT 1 FROM events WHERE id = $1', [req.valid.params.id]);
    if (!rowCount) throw notFound('Event');
    await query(
      `INSERT INTO event_attendees (event_id, user_id, status) VALUES ($1, $2, $3)
       ON CONFLICT (event_id, user_id) DO UPDATE SET status = EXCLUDED.status`,
      [req.valid.params.id, req.viewer.id, req.valid.body.status]);
    res.status(204).end();
  });

// -------------------------------------------------------------------- reports
communityRouter.post('/reports',
  validate({ body: z.object({
    target_type: z.enum(['post', 'comment', 'news_article', 'user', 'person']),
    target_id: uuid,
    reason: z.enum(['spam', 'harassment', 'misinformation', 'privacy', 'inappropriate', 'other']),
    details: z.string().trim().max(2000).optional().nullable(),
  }) }),
  async (req, res) => {
    const b = req.valid.body;
    const column = { post: 'post_id', comment: 'comment_id', news_article: 'news_article_id', user: 'reported_user_id', person: 'person_id' }[b.target_type];
    const id = await tx(req, async (db) => (await db.query(
      `INSERT INTO reports (reporter_id, ${column}, reason, details) VALUES ($1, $2, $3, $4) RETURNING id`,
      [req.viewer.id, b.target_id, b.reason, b.details ?? null])).rows[0].id);
    res.status(201).json({ id });
  });
