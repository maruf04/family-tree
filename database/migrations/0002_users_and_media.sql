-- =============================================================================
-- 0002 Users, membership verification, media assets
-- =============================================================================
-- Authentication itself is handled by Supabase Auth. `users` holds the
-- application profile; users.id is the same UUID as Supabase auth.users.id.
--
-- Roles:
--   users.role                 global role: member | moderator | admin
--   family_managers.role       per-family role: contributor | manager (see 0003)
-- So "family contributor" and "family manager" are always scoped to specific
-- families, never global.
-- =============================================================================

CREATE TYPE user_role AS ENUM ('member', 'moderator', 'admin');

-- Lifecycle of a user's village membership.
CREATE TYPE membership_status AS ENUM ('pending', 'verified', 'rejected', 'suspended');

CREATE TYPE app_language AS ENUM ('bn', 'en');

CREATE TABLE users (
  id                  uuid PRIMARY KEY,               -- = Supabase auth.users.id
  email               citext UNIQUE,
  phone               text UNIQUE,
  display_name_bn     text,
  display_name_en     text,
  role                user_role NOT NULL DEFAULT 'member',
  membership_status   membership_status NOT NULL DEFAULT 'pending',
  verified_at         timestamptz,
  verified_by         uuid REFERENCES users (id) ON DELETE SET NULL,
  preferred_language  app_language NOT NULL DEFAULT 'bn',
  -- The user's own canonical record in the genealogy (FK added in 0003).
  person_id           uuid UNIQUE,
  last_seen_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_verified_has_timestamp
    CHECK (membership_status <> 'verified' OR verified_at IS NOT NULL)
);

CREATE INDEX users_membership_status_idx ON users (membership_status);

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- Role and verification changes must be traceable.
CREATE TRIGGER users_audit AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- On Supabase, tie profiles to auth accounts. Skipped on plain PostgreSQL.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth')
     AND to_regclass('auth.users') IS NOT NULL THEN
    ALTER TABLE users
      ADD CONSTRAINT users_auth_user_fk
      FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Membership verification
-- -----------------------------------------------------------------------------
CREATE TYPE verification_request_status AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');

CREATE TABLE verification_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status                verification_request_status NOT NULL DEFAULT 'pending',
  -- What the applicant claims; reviewers check it against the genealogy.
  claimed_person_id     uuid,   -- "this person record is me" (FK in 0003)
  claimed_family_id     uuid,   -- (FK in 0003)
  father_name           text,
  mother_name           text,
  neighbourhood         text,   -- para / mahalla within the village
  current_residence     text,
  relationship_details  text,   -- free text, e.g. "grandson of ..."
  vouched_by            uuid REFERENCES users (id) ON DELETE SET NULL,
  reviewed_by           uuid REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at           timestamptz,
  review_note           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verification_reviewed_consistency
    CHECK ((status IN ('approved', 'rejected')) = (reviewed_at IS NOT NULL)),
  CONSTRAINT verification_not_self_vouched CHECK (vouched_by IS DISTINCT FROM user_id)
);

-- At most one open request per user.
CREATE UNIQUE INDEX verification_requests_one_pending
  ON verification_requests (user_id) WHERE status = 'pending';
CREATE INDEX verification_requests_status_idx ON verification_requests (status, created_at);

CREATE TRIGGER verification_requests_set_updated_at BEFORE UPDATE ON verification_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER verification_requests_audit AFTER INSERT OR UPDATE OR DELETE ON verification_requests
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- -----------------------------------------------------------------------------
-- Media assets: metadata for files in (private) Supabase Storage buckets.
-- Files are served only through short-lived signed URLs issued by the API
-- after a permission check; object paths are never exposed as public URLs.
-- -----------------------------------------------------------------------------
CREATE TABLE media_assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket        text NOT NULL,
  object_path   text NOT NULL,
  mime_type     text NOT NULL,
  byte_size     bigint CHECK (byte_size >= 0),
  width         integer CHECK (width > 0),
  height        integer CHECK (height > 0),
  caption_bn    text,
  caption_en    text,
  privacy_level privacy_level NOT NULL DEFAULT 'members',
  uploaded_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_assets_object_unique UNIQUE (bucket, object_path)
);

CREATE INDEX media_assets_uploaded_by_idx ON media_assets (uploaded_by);

CREATE TRIGGER media_assets_set_updated_at BEFORE UPDATE ON media_assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

SELECT app_enable_default_deny('users');
SELECT app_enable_default_deny('verification_requests');
SELECT app_enable_default_deny('media_assets');
