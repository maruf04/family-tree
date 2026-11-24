-- =============================================================================
-- 0004 Change proposals (review workflow for genealogy edits)
-- =============================================================================
-- Members never edit approved genealogy records directly. They submit a
-- proposal containing one or more ordered items (create/update/delete of a
-- person, relationship, membership, source...). A manager of the relevant
-- family (or an admin) approves it, and the API applies every item in ONE
-- transaction with app.proposal_id set, so each resulting audit_logs row links
-- back to the proposal. If any item fails, nothing is applied.
--
-- Items can refer to records created earlier in the same proposal through
-- temp_ref, e.g. item 1 creates a person with temp_ref 'new_child', item 2
-- creates parent_child with payload {"parent_id": "<uuid>", "child_id": "$new_child"}.
-- =============================================================================

CREATE TYPE proposal_status AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');
CREATE TYPE proposal_entity AS ENUM (
  'person', 'family', 'family_member', 'parent_child', 'marriage', 'source', 'source_link'
);
CREATE TYPE proposal_action AS ENUM ('create', 'update', 'delete');

CREATE TABLE change_proposals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposer_id   uuid REFERENCES users (id) ON DELETE SET NULL,
  -- Routes the proposal to that family's managers. NULL = admins review
  -- (e.g. proposing a brand-new family).
  family_id     uuid REFERENCES families (id) ON DELETE SET NULL,
  summary       text NOT NULL CHECK (btrim(summary) <> ''),
  rationale     text,              -- why / what evidence supports the change
  status        proposal_status NOT NULL DEFAULT 'pending',
  reviewed_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at   timestamptz,
  review_note   text,
  applied_at    timestamptz,       -- set when an approval has been applied
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT change_proposals_review_consistency
    CHECK ((status IN ('approved', 'rejected')) = (reviewed_at IS NOT NULL)),
  CONSTRAINT change_proposals_applied_only_when_approved
    CHECK ((status = 'approved') = (applied_at IS NOT NULL)),
  CONSTRAINT change_proposals_no_self_review
    CHECK (reviewed_by IS NULL OR reviewed_by IS DISTINCT FROM proposer_id)
);

CREATE INDEX change_proposals_pending_family_idx
  ON change_proposals (family_id, created_at) WHERE status = 'pending';
CREATE INDEX change_proposals_proposer_idx ON change_proposals (proposer_id, created_at DESC);

CREATE TRIGGER change_proposals_set_updated_at BEFORE UPDATE ON change_proposals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER change_proposals_audit AFTER INSERT OR UPDATE OR DELETE ON change_proposals
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE TABLE change_proposal_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id    uuid NOT NULL REFERENCES change_proposals (id) ON DELETE CASCADE,
  position       smallint NOT NULL CHECK (position > 0),
  entity_type    proposal_entity NOT NULL,
  action         proposal_action NOT NULL,
  target_id      uuid,      -- existing record (update/delete)
  temp_ref       text,      -- name for a record this item creates
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,   -- proposed field values
  base_snapshot  jsonb,     -- target's state when proposed (conflict detection)
  result_id      uuid,      -- record created/changed when applied
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT change_proposal_items_position_unique UNIQUE (proposal_id, position),
  CONSTRAINT change_proposal_items_temp_ref_unique UNIQUE (proposal_id, temp_ref),
  CONSTRAINT change_proposal_items_target
    CHECK ((action = 'create') = (target_id IS NULL)),
  CONSTRAINT change_proposal_items_temp_ref_only_on_create
    CHECK (temp_ref IS NULL OR (action = 'create' AND temp_ref ~ '^[a-z][a-z0-9_]{0,40}$')),
  CONSTRAINT change_proposal_items_payload_object
    CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX change_proposal_items_target_idx ON change_proposal_items (target_id) WHERE target_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Permission helpers (authoritative checks also live in the API service layer)
-- -----------------------------------------------------------------------------

-- Admins manage every family; managers only the families assigned to them.
-- A manager of a parent lineage also manages its branches.
CREATE FUNCTION can_manage_family(p_user_id uuid, p_family_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = p_user_id
      AND u.membership_status = 'verified'
      AND (
        u.role = 'admin'
        OR EXISTS (
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
        )
      )
  )
$$;

SELECT app_enable_default_deny('change_proposals');
SELECT app_enable_default_deny('change_proposal_items');
