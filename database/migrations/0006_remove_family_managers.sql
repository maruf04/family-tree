-- =============================================================================
-- 0006 Remove per-family managers
-- =============================================================================
-- Decision: there are no family managers or family contributors. Moderators
-- (chosen carefully by admins) manage every family tree, and admins can do
-- everything moderators can. The only genealogy permission check is:
--
--   user_has_role(user_id, 'moderator')   -- verified moderator or admin
--
-- Members submit change proposals; any moderator or admin reviews them.
-- =============================================================================

DROP FUNCTION can_manage_family(uuid, uuid);
DROP TABLE family_managers;     -- also drops its triggers and indexes
DROP TYPE family_role;

COMMENT ON COLUMN change_proposals.family_id IS
  'Family the proposal concerns, for filtering and display. Any moderator or admin may review it.';
COMMENT ON COLUMN people.research_notes IS
  'Internal research notes, visible to moderators and admins only.';
COMMENT ON TYPE privacy_level IS
  'public: no login needed; members: verified members; family: members of the record''s families '
  'plus moderators/admins; restricted: the person themself plus moderators/admins.';
