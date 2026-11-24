-- =============================================================================
-- 0009 Community: groups, posts, comments, reactions, events
-- =============================================================================

CREATE TYPE content_status AS ENUM ('visible', 'hidden', 'removed');

-- -----------------------------------------------------------------------------
-- Groups
-- -----------------------------------------------------------------------------
CREATE TYPE group_visibility AS ENUM ('open', 'closed');
CREATE TYPE group_member_role AS ENUM ('member', 'admin');

CREATE TABLE groups (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_bn          text,
  name_en          text,
  description_bn   text,
  description_en   text,
  visibility       group_visibility NOT NULL DEFAULT 'open',
  cover_photo_id   uuid REFERENCES media_assets (id) ON DELETE SET NULL,
  created_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT groups_name_required
    CHECK (nullif(btrim(name_bn), '') IS NOT NULL OR nullif(btrim(name_en), '') IS NOT NULL)
);

CREATE TABLE group_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role        group_member_role NOT NULL DEFAULT 'member',
  joined_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_members_unique UNIQUE (group_id, user_id)
);
CREATE INDEX group_members_user_idx ON group_members (user_id);

-- -----------------------------------------------------------------------------
-- Posts
-- -----------------------------------------------------------------------------
CREATE TYPE post_type AS ENUM (
  'discussion', 'photo', 'video', 'buy_sell', 'help_request', 'achievement', 'celebration'
);

CREATE TABLE posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  group_id      uuid REFERENCES groups (id) ON DELETE CASCADE,
  post_type     post_type NOT NULL DEFAULT 'discussion',
  title         text,
  body          text NOT NULL CHECK (btrim(body) <> ''),
  video_url     text,
  price_bdt     numeric(12, 2) CHECK (price_bdt >= 0),   -- buy/sell
  is_resolved   boolean NOT NULL DEFAULT false,          -- help request answered / item sold
  status        content_status NOT NULL DEFAULT 'visible',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posts_price_only_for_buy_sell CHECK (price_bdt IS NULL OR post_type = 'buy_sell')
);
CREATE INDEX posts_feed_idx   ON posts (created_at DESC) WHERE status = 'visible';
CREATE INDEX posts_type_idx   ON posts (post_type, created_at DESC) WHERE status = 'visible';
CREATE INDEX posts_group_idx  ON posts (group_id, created_at DESC);
CREATE INDEX posts_author_idx ON posts (author_id, created_at DESC);

CREATE TABLE post_media (
  post_id    uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  media_id   uuid NOT NULL REFERENCES media_assets (id) ON DELETE CASCADE,
  position   smallint NOT NULL DEFAULT 1,
  PRIMARY KEY (post_id, media_id)
);

CREATE TABLE comments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id            uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  author_id          uuid REFERENCES users (id) ON DELETE SET NULL,
  parent_comment_id  uuid REFERENCES comments (id) ON DELETE CASCADE,
  body               text NOT NULL CHECK (btrim(body) <> ''),
  status             content_status NOT NULL DEFAULT 'visible',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_post_idx ON comments (post_id, created_at);

CREATE TYPE reaction_type AS ENUM ('like', 'love', 'celebrate', 'support', 'sad');

CREATE TABLE reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  post_id     uuid REFERENCES posts (id) ON DELETE CASCADE,
  comment_id  uuid REFERENCES comments (id) ON DELETE CASCADE,
  reaction    reaction_type NOT NULL DEFAULT 'like',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reactions_one_target CHECK (num_nonnulls(post_id, comment_id) = 1)
);
-- One reaction per user per target.
CREATE UNIQUE INDEX reactions_user_post    ON reactions (user_id, post_id)    WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX reactions_user_comment ON reactions (user_id, comment_id) WHERE comment_id IS NOT NULL;
CREATE INDEX reactions_post_idx ON reactions (post_id) WHERE post_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Events and gatherings
-- -----------------------------------------------------------------------------
CREATE TYPE event_status AS ENUM ('scheduled', 'cancelled', 'completed');
CREATE TYPE attendance_status AS ENUM ('going', 'interested', 'not_going');

CREATE TABLE events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_bn         text,
  title_en         text,
  description_bn   text,
  description_en   text,
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz,
  location_text    text,
  place_id         uuid REFERENCES places (id) ON DELETE SET NULL,
  group_id         uuid REFERENCES groups (id) ON DELETE SET NULL,
  organizer_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  status           event_status NOT NULL DEFAULT 'scheduled',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_title_required
    CHECK (nullif(btrim(title_bn), '') IS NOT NULL OR nullif(btrim(title_en), '') IS NOT NULL),
  CONSTRAINT events_ends_after_start CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX events_starts_idx ON events (starts_at) WHERE status = 'scheduled';

CREATE TABLE event_attendees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status      attendance_status NOT NULL DEFAULT 'going',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_attendees_unique UNIQUE (event_id, user_id)
);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['groups', 'posts', 'comments', 'events', 'event_attendees'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
                   t || '_set_updated_at', t);
  END LOOP;
  -- Moderation-relevant content is audited.
  FOREACH t IN ARRAY ARRAY['groups', 'posts', 'comments', 'events'] LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_row_change()',
                   t || '_audit', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['groups', 'group_members', 'posts', 'post_media', 'comments', 'reactions',
                           'events', 'event_attendees'] LOOP
    PERFORM app_enable_default_deny(t::regclass);
  END LOOP;
END $$;
