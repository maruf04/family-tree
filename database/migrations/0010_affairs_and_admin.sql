-- =============================================================================
-- 0010 Village affairs (news, announcements) and administration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- News
-- -----------------------------------------------------------------------------
CREATE TABLE news_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9_-]{1,40}$'),
  name_bn     text NOT NULL,
  name_en     text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0
);

INSERT INTO news_categories (slug, name_bn, name_en, sort_order) VALUES
  ('local',          'স্থানীয় সংবাদ',     'Local news',               1),
  ('infrastructure', 'অবকাঠামো উন্নয়ন',  'Infrastructure',           2),
  ('problems',       'সমস্যা ও অভিযোগ',   'Community problems',       3),
  ('events',         'স্থানীয় অনুষ্ঠান',   'Local events',             4),
  ('government',     'সরকারি প্রকল্প',     'Government projects',      5);

-- Members submit; moderators publish or reject.
CREATE TYPE news_status AS ENUM ('draft', 'submitted', 'published', 'rejected', 'archived');

CREATE TABLE news_articles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id      uuid NOT NULL REFERENCES news_categories (id) ON DELETE RESTRICT,
  title_bn         text,
  title_en         text,
  summary_bn       text,
  summary_en       text,
  body_bn          text,
  body_en          text,
  cover_photo_id   uuid REFERENCES media_assets (id) ON DELETE SET NULL,
  author_id        uuid REFERENCES users (id) ON DELETE SET NULL,
  status           news_status NOT NULL DEFAULT 'submitted',
  is_featured      boolean NOT NULL DEFAULT false,
  submitted_at     timestamptz,
  published_at     timestamptz,
  reviewed_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  review_note      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT news_title_required
    CHECK (nullif(btrim(title_bn), '') IS NOT NULL OR nullif(btrim(title_en), '') IS NOT NULL),
  CONSTRAINT news_body_required
    CHECK (nullif(btrim(body_bn), '') IS NOT NULL OR nullif(btrim(body_en), '') IS NOT NULL),
  CONSTRAINT news_published_has_timestamp CHECK (status <> 'published' OR published_at IS NOT NULL)
);
CREATE INDEX news_published_idx ON news_articles (published_at DESC) WHERE status = 'published';
CREATE INDEX news_submitted_idx ON news_articles (submitted_at) WHERE status = 'submitted';

-- -----------------------------------------------------------------------------
-- Announcements
-- -----------------------------------------------------------------------------
CREATE TYPE announcement_priority AS ENUM ('normal', 'important', 'urgent');

CREATE TABLE announcements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_bn     text,
  title_en     text,
  body_bn      text,
  body_en      text,
  priority     announcement_priority NOT NULL DEFAULT 'normal',
  starts_at    timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz,
  created_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcements_title_required
    CHECK (nullif(btrim(title_bn), '') IS NOT NULL OR nullif(btrim(title_en), '') IS NOT NULL),
  CONSTRAINT announcements_expiry CHECK (expires_at IS NULL OR expires_at > starts_at)
);
CREATE INDEX announcements_active_idx ON announcements (starts_at DESC);

-- -----------------------------------------------------------------------------
-- Reports and moderation
-- -----------------------------------------------------------------------------
CREATE TYPE report_reason AS ENUM ('spam', 'harassment', 'misinformation', 'privacy', 'inappropriate', 'other');
CREATE TYPE report_status AS ENUM ('open', 'resolved', 'dismissed');

CREATE TABLE reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id       uuid REFERENCES users (id) ON DELETE SET NULL,
  post_id           uuid REFERENCES posts (id) ON DELETE CASCADE,
  comment_id        uuid REFERENCES comments (id) ON DELETE CASCADE,
  news_article_id   uuid REFERENCES news_articles (id) ON DELETE CASCADE,
  reported_user_id  uuid REFERENCES users (id) ON DELETE CASCADE,
  person_id         uuid REFERENCES people (id) ON DELETE CASCADE,   -- wrong/private genealogy info
  reason            report_reason NOT NULL,
  details           text,
  status            report_status NOT NULL DEFAULT 'open',
  resolved_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  resolved_at       timestamptz,
  resolution_note   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reports_one_target
    CHECK (num_nonnulls(post_id, comment_id, news_article_id, reported_user_id, person_id) = 1),
  CONSTRAINT reports_resolution CHECK ((status = 'open') = (resolved_at IS NULL))
);
CREATE INDEX reports_open_idx ON reports (created_at) WHERE status = 'open';

CREATE TYPE moderation_action_type AS ENUM (
  'hide', 'restore', 'remove', 'warn_user', 'suspend_user', 'reinstate_user',
  'approve_news', 'reject_news', 'resolve_report', 'dismiss_report'
);

CREATE TABLE moderation_actions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id      uuid REFERENCES users (id) ON DELETE SET NULL,
  action            moderation_action_type NOT NULL,
  post_id           uuid REFERENCES posts (id) ON DELETE SET NULL,
  comment_id        uuid REFERENCES comments (id) ON DELETE SET NULL,
  news_article_id   uuid REFERENCES news_articles (id) ON DELETE SET NULL,
  target_user_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  report_id         uuid REFERENCES reports (id) ON DELETE SET NULL,
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_actions_time_idx ON moderation_actions (created_at DESC);

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind        text NOT NULL,              -- e.g. 'proposal_approved', 'comment', 'verification'
  title_bn    text NOT NULL,
  title_en    text NOT NULL,
  link        text,                       -- in-app path, e.g. /people/<id>
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['news_articles', 'announcements'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
                   t || '_set_updated_at', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['news_categories', 'news_articles', 'announcements', 'reports', 'moderation_actions'] LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_row_change()',
                   t || '_audit', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['news_categories', 'news_articles', 'announcements', 'reports',
                           'moderation_actions', 'notifications'] LOOP
    PERFORM app_enable_default_deny(t::regclass);
  END LOOP;
END $$;
