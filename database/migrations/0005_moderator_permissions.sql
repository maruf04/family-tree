-- =============================================================================
-- 0005 Role hierarchy: member < moderator < admin
-- =============================================================================
--   member     browses the site and uses every member feature (posting,
--              commenting, events, submitting change proposals...)
--   moderator  can change everything: edit/approve any family's records,
--              moderate all content, verify members
--   admin      everything a moderator can, plus "super moderator" powers:
--              assigning roles and managing moderators/admins
-- Per-family managers (family_managers) still exist for delegating review of
-- one family to a trusted member.
--
-- user_role enum values are declared in hierarchy order, so roles compare
-- directly: role >= 'moderator' means moderator or admin.
-- =============================================================================

-- Verified user holding at least the given role.
CREATE FUNCTION user_has_role(p_user_id uuid, p_min_role user_role) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_user_id AND membership_status = 'verified' AND role >= p_min_role
  )
$$;

-- Moderators and admins manage every family; managers only their assigned
-- families (and branches of them).
CREATE OR REPLACE FUNCTION can_manage_family(p_user_id uuid, p_family_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT user_has_role(p_user_id, 'moderator')
      OR (user_has_role(p_user_id, 'member') AND EXISTS (
            WITH RECURSIVE lineage (id) AS (
              SELECT p_family_id
              UNION
              SELECT f.parent_family_id FROM families f
              JOIN lineage l ON f.id = l.id
              WHERE f.parent_family_id IS NOT NULL
            )
            SELECT 1 FROM family_managers fm
            JOIN lineage l ON l.id = fm.family_id
            WHERE fm.user_id = p_user_id AND fm.role = 'manager'
          ))
$$;

-- -----------------------------------------------------------------------------
-- Guard admin-level changes on users (defence in depth; the API checks too).
-- Applies whenever app.user_id is set, i.e. to every request made through the
-- API. Without it (migrations, seeds, operator scripts) only the last-admin
-- rule applies.
-- -----------------------------------------------------------------------------
CREATE FUNCTION users_guard_privileged_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  actor uuid := app_current_user_id();
BEGIN
  IF actor IS NOT NULL AND NOT user_has_role(actor, 'admin') THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'only an admin can delete user accounts' USING ERRCODE = 'VH101';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'only an admin can change user roles' USING ERRCODE = 'VH101';
    END IF;
    -- Moderators may verify/suspend members, but not other moderators or admins.
    IF NEW.membership_status IS DISTINCT FROM OLD.membership_status
       AND OLD.role >= 'moderator' THEN
      RAISE EXCEPTION 'only an admin can change the status of a moderator or admin'
        USING ERRCODE = 'VH101';
    END IF;
  END IF;

  -- Never leave the platform without a verified admin.
  IF OLD.role = 'admin' AND OLD.membership_status = 'verified'
     AND (TG_OP = 'DELETE' OR NEW.role <> 'admin' OR NEW.membership_status <> 'verified')
     AND NOT EXISTS (SELECT 1 FROM users
                     WHERE id <> OLD.id AND role = 'admin' AND membership_status = 'verified') THEN
    RAISE EXCEPTION 'cannot remove the last verified admin' USING ERRCODE = 'VH102';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER users_guard_privileged_changes
  BEFORE UPDATE OF role, membership_status OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION users_guard_privileged_changes();

-- The proposal-review routing index already covers family_id; moderators
-- list all pending proposals, which needs a plain status index.
CREATE INDEX change_proposals_pending_idx ON change_proposals (created_at) WHERE status = 'pending';
