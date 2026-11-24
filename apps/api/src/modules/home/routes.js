// Home page payload. Visitors see the village introduction, statistics and the
// public timeline; verified members also get community, news and events.
import { Router } from 'express';
import { query } from '../../db.js';
import { privacyClause } from '../../lib/crud.js';

export const homeRouter = Router();

homeRouter.get('/', async (req, res) => {
  const viewer = req.viewer;
  const [village, stats, timeline] = await Promise.all([
    query(`SELECT name_bn, name_en, tagline_bn, tagline_en, introduction_bn, introduction_en,
                  fuzzy_date_to_jsonb(established) AS established, union_name, upazila, district,
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
                  (SELECT count(*) FROM historical_events) AS historical_events`),
    query(`SELECT id, category, title_bn, title_en, fuzzy_date_to_jsonb(event_date) AS event_date
           FROM historical_events t
           WHERE is_featured AND ${privacyClause(viewer, 't.privacy_level')}
           ORDER BY fuzzy_date_sort_key(event_date) NULLS LAST LIMIT 8`),
  ]);

  const payload = { village: village.rows[0] ?? null, stats: stats.rows[0], timeline: timeline.rows };

  if (viewer?.verified) {
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
  }
  res.json(payload);
});
