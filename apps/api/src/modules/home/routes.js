// Home page payload. Visitors see the village introduction, statistics and the
// public timeline; verified members also get community, news and events.
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../../db.js';
import { privacyClause } from '../../lib/crud.js';
import { requireRole } from '../../middleware/auth.js';
import { fuzzyDate, longText, text, validate } from '../../middleware/validate.js';

export const homeRouter = Router();

homeRouter.get('/', async (req, res) => {
  const viewer = req.viewer;
  const [village, stats, timeline] = await Promise.all([
    query(`SELECT name_bn, name_en, tagline_bn, tagline_en, introduction_bn, introduction_en,
                  fuzzy_date_to_jsonb(established) AS established, village_name_bn, village_name_en, union_name, upazila, district,
                  latitude, longitude, cover_photo_id
           FROM village_profile LIMIT 1`),
    query(`WITH RECURSIVE d (id, generation) AS (
             SELECT root_person_id, 1 FROM families
             UNION
             SELECT pc.child_id, d.generation + 1 FROM parent_child pc JOIN d ON pc.parent_id = d.id
             WHERE d.generation < 40
           )
           SELECT (SELECT count(*) FROM families) AS families,
                  (SELECT count(*) FROM people WHERE merged_into_id IS NULL) AS people,
                  (SELECT max(generation) FROM d) AS generations,
                  (SELECT min((birth).year) FROM people) AS earliest_year,
                  (SELECT count(*) FROM users WHERE membership_status = 'verified') AS members,
                  (SELECT count(*) FROM historical_events) AS historical_events,
                  -- fictional development data (database/seeds) is still loaded
                  EXISTS (SELECT 1 FROM people WHERE research_notes = 'FICTIONAL SAMPLE DATA')
                    OR EXISTS (SELECT 1 FROM places WHERE id = '50000000-0000-4000-8000-000000000001') AS has_sample_data`),
    query(`SELECT id, category, title_bn, title_en, fuzzy_date_to_jsonb(event_date) AS event_date
           FROM historical_events t
           WHERE is_featured AND ${privacyClause(viewer, 't.privacy_level')}
           ORDER BY fuzzy_date_sort_key(event_date) NULLS LAST LIMIT 8`),
  ]);

  const { has_sample_data: hasSampleData, ...counts } = stats.rows[0];
  const payload = { village: village.rows[0] ?? null, stats: counts, hasSampleData, timeline: timeline.rows };

  // Outsiders see only the name and totals: no history, introduction or location.
  if (!viewer?.verified) {
    const v = payload.village;
    return res.json({
      village: v && { name_bn: v.name_bn, name_en: v.name_en, tagline_bn: v.tagline_bn, tagline_en: v.tagline_en },
      stats: { families: counts.families, people: counts.people, generations: counts.generations, members: counts.members },
      hasSampleData,
    });
  }
  const [posts, news, events, announcements] = await Promise.all([
    query(`SELECT p.id, p.post_type, p.title, p.body, p.created_at, p.price_bdt,
                  u.display_name_bn AS author_name_bn, u.display_name_en AS author_name_en,
                  (SELECT count(*) FROM comments c WHERE c.post_id = p.id AND c.status = 'visible') AS comment_count,
                  (SELECT count(*) FROM reactions r WHERE r.post_id = p.id) AS reaction_count
           FROM posts p LEFT JOIN users u ON u.id = p.author_id LEFT JOIN groups g ON g.id = p.group_id
           WHERE p.status = 'visible' AND (p.group_id IS NULL OR g.visibility = 'open')
           ORDER BY p.created_at DESC LIMIT 4`),
    query(`SELECT n.id, n.title_bn, n.title_en, n.summary_bn, n.summary_en, n.published_at,
                  c.slug AS category_slug, c.name_bn AS category_name_bn, c.name_en AS category_name_en
           FROM news_articles n JOIN news_categories c ON c.id = n.category_id
           WHERE n.status = 'published' ORDER BY n.is_featured DESC, n.published_at DESC LIMIT 4`),
    query(`SELECT id, title_bn, title_en, starts_at, location_text FROM events
           WHERE status = 'scheduled' AND coalesce(ends_at, starts_at) >= now() ORDER BY starts_at LIMIT 4`),
    query(`SELECT id, title_bn, title_en, body_bn, body_en, priority FROM announcements
           WHERE starts_at <= now() AND (expires_at IS NULL OR expires_at > now())
           ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'important' THEN 1 ELSE 2 END LIMIT 3`),
  ]);
  Object.assign(payload, {
    latestPosts: posts.rows, news: news.rows, upcomingEvents: events.rows, announcements: announcements.rows,
  });
  res.json(payload);
});

// Moderators edit the village profile (a single row).
const villageBody = z.object({
  name_bn: z.string().trim().min(1).max(200),
  name_en: text(200), tagline_bn: text(300), tagline_en: text(300),
  introduction_bn: longText(5000), introduction_en: longText(5000),
  village_name_bn: text(200), village_name_en: text(200),
  established: fuzzyDate, union_name: text(200), upazila: text(200), district: text(200),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
}).strict().partial();

homeRouter.patch('/village', requireRole('moderator'), validate({ body: villageBody }), async (req, res) => {
  const cols = Object.keys(req.valid.body).filter((c) => req.valid.body[c] !== undefined);
  const params = cols.map((c) => (c === 'established' && req.valid.body[c] ? JSON.stringify(req.valid.body[c]) : req.valid.body[c]));
  const values = cols.map((c, i) => (c === 'established' ? `fuzzy_date_from_jsonb($${i + 1}::jsonb)` : `$${i + 1}`));
  params.push(req.viewer.id);
  const by = `$${params.length}`;
  await tx(req, async (db) => {
    const { rowCount } = await db.query(
      `UPDATE village_profile SET ${[...cols.map((c, i) => `${c} = ${values[i]}`), `updated_by = ${by}`].join(', ')}`, params);
    if (!rowCount) {
      await db.query(
        `INSERT INTO village_profile (${[...cols, 'updated_by'].join(', ')}) VALUES (${[...values, by].join(', ')})`, params);
    }
  });
  res.status(204).end();
});
