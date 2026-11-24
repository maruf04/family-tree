-- =============================================================================
-- 0003 Genealogy: people, family lineages, relationships, sources
-- =============================================================================
-- The genealogy is a GRAPH:
--   people          one canonical record per real human being (never duplicated)
--   parent_child    directed edges parent -> child (biological / adoptive / foster)
--   marriages       undirected edges between two people; any number per person,
--                   concurrent or sequential, ongoing or ended
--   families        named lineages, each rooted at its earliest known ancestor
--   family_members  explicit membership of people in lineages
--
-- Key rules:
--   * A child is linked to its ACTUAL parents through parent_child. Which
--     marriage a child "belongs to" is derived from the child's other parent;
--     it is never stored separately, so it can never disagree with the parents.
--   * A marriage never merges lineages or changes family membership.
--   * Repeated ancestors (e.g. cousin marriage) are normal; traversals must
--     de-duplicate rather than assume a tree.
-- =============================================================================

CREATE TYPE person_sex             AS ENUM ('male', 'female', 'unknown');
CREATE TYPE living_status          AS ENUM ('living', 'deceased', 'unknown');
CREATE TYPE record_verification    AS ENUM ('unverified', 'verified', 'disputed');
CREATE TYPE relationship_certainty AS ENUM ('confirmed', 'probable', 'uncertain');
CREATE TYPE parent_child_type      AS ENUM ('biological', 'adoptive', 'foster');
CREATE TYPE marriage_status        AS ENUM ('ongoing', 'separated', 'divorced', 'widowed', 'annulled', 'unknown');
CREATE TYPE family_membership_type AS ENUM ('lineage', 'marriage', 'adoption', 'other');
CREATE TYPE family_role            AS ENUM ('contributor', 'manager');
CREATE TYPE source_type AS ENUM (
  'oral_history', 'document', 'photograph', 'book', 'grave_marker',
  'government_record', 'land_record', 'religious_record', 'family_record',
  'newspaper', 'website', 'other'
);

-- =============================================================================
-- people
-- =============================================================================
CREATE TABLE people (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name_bn         text,
  full_name_en         text,
  nickname_bn          text,              -- daak naam
  nickname_en          text,
  sex                  person_sex NOT NULL DEFAULT 'unknown',
  birth                fuzzy_date,        -- NULL = unknown
  death                fuzzy_date,
  living_status        living_status NOT NULL DEFAULT 'unknown',
  birth_place_bn       text,
  birth_place_en       text,
  death_place_bn       text,
  death_place_en       text,
  burial_place_bn      text,
  burial_place_en      text,
  occupation_bn        text,
  occupation_en        text,
  biography_bn         text,
  biography_en         text,
  photo_id             uuid REFERENCES media_assets (id) ON DELETE SET NULL,
  -- NULL = automatic: deceased people default to 'members', living or
  -- unknown-status people to 'restricted' (living people are private by default).
  privacy_level        privacy_level,
  effective_privacy    privacy_level GENERATED ALWAYS AS (
                         coalesce(privacy_level,
                                  CASE WHEN living_status = 'deceased'
                                       THEN 'members'::privacy_level
                                       ELSE 'restricted'::privacy_level END)
                       ) STORED,
  verification_status  record_verification NOT NULL DEFAULT 'unverified',
  verified_by          uuid REFERENCES users (id) ON DELETE SET NULL,
  verified_at          timestamptz,
  -- When two records are found to be the same human, the duplicate points at
  -- the surviving record so old links can be redirected.
  merged_into_id       uuid REFERENCES people (id) ON DELETE RESTRICT,
  research_notes       text,              -- internal notes for managers
  -- Matching key for search / duplicate detection (never displayed).
  name_search          text GENERATED ALWAYS AS (
                         normalize_person_name(coalesce(full_name_bn, '') || ' ' || coalesce(full_name_en, '') || ' ' ||
                                               coalesce(nickname_bn, '') || ' ' || coalesce(nickname_en, ''))
                       ) STORED,
  created_by           uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by           uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT people_name_required
    CHECK (nullif(btrim(full_name_bn), '') IS NOT NULL OR nullif(btrim(full_name_en), '') IS NOT NULL),
  CONSTRAINT people_death_implies_deceased
    CHECK (death IS NULL OR living_status = 'deceased'),
  CONSTRAINT people_death_not_before_birth
    CHECK (fuzzy_dates_may_be_ordered(birth, death)),
  CONSTRAINT people_not_merged_into_self
    CHECK (merged_into_id IS DISTINCT FROM id),
  CONSTRAINT people_verified_has_timestamp
    CHECK (verification_status <> 'verified' OR verified_at IS NOT NULL)
);

CREATE INDEX people_name_search_trgm ON people USING gin (name_search gin_trgm_ops);
CREATE INDEX people_birth_year_idx   ON people (((birth).year));
CREATE INDEX people_merged_into_idx  ON people (merged_into_id) WHERE merged_into_id IS NOT NULL;

CREATE TRIGGER people_set_updated_at BEFORE UPDATE ON people
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER people_audit AFTER INSERT OR UPDATE OR DELETE ON people
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

ALTER TABLE users
  ADD CONSTRAINT users_person_fk FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE SET NULL;
ALTER TABLE verification_requests
  ADD CONSTRAINT verification_claimed_person_fk
  FOREIGN KEY (claimed_person_id) REFERENCES people (id) ON DELETE SET NULL;

-- Shared guard: relationships may not reference a record that was merged away.
CREATE FUNCTION assert_people_not_merged(VARIADIC person_ids uuid[]) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  merged uuid;
BEGIN
  SELECT id INTO merged FROM people
  WHERE id = ANY (person_ids) AND merged_into_id IS NOT NULL
  LIMIT 1;
  IF merged IS NOT NULL THEN
    RAISE EXCEPTION 'person % has been merged into another record', merged
      USING ERRCODE = 'VH004';
  END IF;
END $$;

-- =============================================================================
-- families (lineages)
-- =============================================================================
CREATE TABLE families (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_bn              text,
  name_en              text,
  homestead_name_bn    text,              -- bari name, e.g. "... বাড়ি"
  homestead_name_en    text,
  description_bn       text,
  description_en       text,
  -- Earliest known ancestor. Changes (via proposal) when an older ancestor is found.
  root_person_id       uuid NOT NULL REFERENCES people (id) ON DELETE RESTRICT,
  -- Optional: a branch (e.g. one bari) of a larger clan/lineage.
  parent_family_id     uuid REFERENCES families (id) ON DELETE SET NULL,
  cover_photo_id       uuid REFERENCES media_assets (id) ON DELETE SET NULL,
  verification_status  record_verification NOT NULL DEFAULT 'unverified',
  created_by           uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by           uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT families_name_required
    CHECK (nullif(btrim(name_bn), '') IS NOT NULL OR nullif(btrim(name_en), '') IS NOT NULL),
  CONSTRAINT families_one_lineage_per_root UNIQUE (root_person_id),
  CONSTRAINT families_not_own_branch CHECK (parent_family_id IS DISTINCT FROM id)
);

CREATE INDEX families_parent_family_idx ON families (parent_family_id);
CREATE INDEX families_name_trgm ON families
  USING gin ((normalize_person_name(coalesce(name_bn, '') || ' ' || coalesce(name_en, '') || ' ' ||
                                    coalesce(homestead_name_bn, '') || ' ' || coalesce(homestead_name_en, '')))
             gin_trgm_ops);

CREATE TRIGGER families_set_updated_at BEFORE UPDATE ON families
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER families_audit AFTER INSERT OR UPDATE OR DELETE ON families
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

ALTER TABLE verification_requests
  ADD CONSTRAINT verification_claimed_family_fk
  FOREIGN KEY (claimed_family_id) REFERENCES families (id) ON DELETE SET NULL;

-- =============================================================================
-- family_members
-- =============================================================================
CREATE TABLE family_members (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id        uuid NOT NULL REFERENCES families (id) ON DELETE CASCADE,
  person_id        uuid NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  membership_type  family_membership_type NOT NULL DEFAULT 'lineage',
  -- The lineage a person is primarily listed under (at most one per person).
  is_primary       boolean NOT NULL DEFAULT false,
  notes            text,
  created_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT family_members_unique UNIQUE (family_id, person_id)
);

CREATE UNIQUE INDEX family_members_one_primary ON family_members (person_id) WHERE is_primary;
CREATE INDEX family_members_person_idx ON family_members (person_id);

CREATE TRIGGER family_members_set_updated_at BEFORE UPDATE ON family_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER family_members_audit AFTER INSERT OR UPDATE OR DELETE ON family_members
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE FUNCTION family_members_validate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM assert_people_not_merged(NEW.person_id);
  RETURN NEW;
END $$;

CREATE TRIGGER family_members_validate BEFORE INSERT OR UPDATE OF person_id ON family_members
  FOR EACH ROW EXECUTE FUNCTION family_members_validate();

-- The root ancestor is always a lineage member of their family.
CREATE FUNCTION families_ensure_root_member() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO family_members (family_id, person_id, membership_type, is_primary, created_by)
  VALUES (NEW.id, NEW.root_person_id, 'lineage',
          NOT EXISTS (SELECT 1 FROM family_members
                      WHERE person_id = NEW.root_person_id AND is_primary),
          NEW.created_by)
  ON CONFLICT (family_id, person_id) DO NOTHING;
  RETURN NULL;
END $$;

CREATE TRIGGER families_ensure_root_member
  AFTER INSERT OR UPDATE OF root_person_id ON families
  FOR EACH ROW EXECUTE FUNCTION families_ensure_root_member();

CREATE FUNCTION family_members_protect_root() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- During a cascading family delete the family row is already gone, so this passes.
  IF EXISTS (SELECT 1 FROM families
             WHERE id = OLD.family_id AND root_person_id = OLD.person_id) THEN
    RAISE EXCEPTION 'cannot remove the root ancestor from their own family'
      USING ERRCODE = 'VH006';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER family_members_protect_root
  BEFORE DELETE OR UPDATE OF family_id, person_id ON family_members
  FOR EACH ROW EXECUTE FUNCTION family_members_protect_root();

-- =============================================================================
-- parent_child
-- =============================================================================
CREATE TABLE parent_child (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id            uuid NOT NULL REFERENCES people (id) ON DELETE RESTRICT,
  child_id             uuid NOT NULL REFERENCES people (id) ON DELETE RESTRICT,
  relationship_type    parent_child_type NOT NULL DEFAULT 'biological',
  certainty            relationship_certainty NOT NULL DEFAULT 'confirmed',
  notes                text,
  verification_status  record_verification NOT NULL DEFAULT 'unverified',
  created_by           uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by           uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parent_child_not_self CHECK (parent_id <> child_id),
  CONSTRAINT parent_child_unique UNIQUE (parent_id, child_id)
);

CREATE INDEX parent_child_child_idx ON parent_child (child_id);

CREATE TRIGGER parent_child_set_updated_at BEFORE UPDATE ON parent_child
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER parent_child_audit AFTER INSERT OR UPDATE OR DELETE ON parent_child
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE FUNCTION parent_child_validate() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  other_bio_parents int;
  other_bio_same_sex boolean;
BEGIN
  -- Self-parenting is reported by the parent_child_not_self CHECK constraint.
  IF NEW.parent_id = NEW.child_id THEN
    RETURN NEW;
  END IF;

  -- Serialise structural edits: two concurrent transactions must not be able
  -- to create a cycle together (A->B in one, B->A in the other).
  PERFORM pg_advisory_xact_lock(hashtext('genealogy.parent_child'));
  PERFORM assert_people_not_merged(NEW.parent_id, NEW.child_id);

  -- Circular ancestry: the child must not already be an ancestor of the parent.
  -- UNION (not UNION ALL) de-duplicates, so repeated ancestors and multiple
  -- paths are handled and the walk always terminates.
  IF EXISTS (
    WITH RECURSIVE ancestors (id) AS (
      SELECT pc.parent_id FROM parent_child pc
      WHERE pc.child_id = NEW.parent_id AND pc.id <> NEW.id
      UNION
      SELECT pc.parent_id FROM parent_child pc
      JOIN ancestors a ON pc.child_id = a.id
      WHERE pc.id <> NEW.id
    )
    SELECT 1 FROM ancestors WHERE id = NEW.child_id
  ) THEN
    RAISE EXCEPTION 'circular ancestry: % is already an ancestor of %', NEW.child_id, NEW.parent_id
      USING ERRCODE = 'VH001';
  END IF;

  -- A parent cannot also be married to their own child.
  IF EXISTS (SELECT 1 FROM marriages m
             WHERE (m.spouse1_id = NEW.parent_id AND m.spouse2_id = NEW.child_id)
                OR (m.spouse1_id = NEW.child_id  AND m.spouse2_id = NEW.parent_id)) THEN
    RAISE EXCEPTION 'a person cannot be both parent and spouse of the same person'
      USING ERRCODE = 'VH003';
  END IF;

  IF NEW.relationship_type = 'biological' THEN
    SELECT count(*),
           bool_or(p.sex <> 'unknown' AND p.sex = (SELECT sex FROM people WHERE id = NEW.parent_id))
      INTO other_bio_parents, other_bio_same_sex
    FROM parent_child pc
    JOIN people p ON p.id = pc.parent_id
    WHERE pc.child_id = NEW.child_id
      AND pc.relationship_type = 'biological'
      AND pc.id <> NEW.id;

    IF other_bio_parents >= 2 THEN
      RAISE EXCEPTION 'person % already has two biological parents', NEW.child_id
        USING ERRCODE = 'VH002';
    END IF;
    IF other_bio_same_sex THEN
      RAISE EXCEPTION 'two biological parents of % have the same recorded sex', NEW.child_id
        USING ERRCODE = 'VH005';
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- =============================================================================
-- marriages
-- =============================================================================
CREATE TABLE marriages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Unordered pair; spouse1/spouse2 carry no meaning (display uses each person's sex).
  spouse1_id           uuid NOT NULL REFERENCES people (id) ON DELETE RESTRICT,
  spouse2_id           uuid NOT NULL REFERENCES people (id) ON DELETE RESTRICT,
  status               marriage_status NOT NULL DEFAULT 'ongoing',
  start_date           fuzzy_date,
  end_date             fuzzy_date,
  -- "1st/2nd/3rd wife/husband" as recorded, from each spouse's perspective.
  -- Used to order spouses when dates are unknown.
  spouse1_order        smallint CHECK (spouse1_order > 0),
  spouse2_order        smallint CHECK (spouse2_order > 0),
  place_bn             text,
  place_en             text,
  certainty            relationship_certainty NOT NULL DEFAULT 'confirmed',
  notes                text,
  verification_status  record_verification NOT NULL DEFAULT 'unverified',
  created_by           uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by           uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marriages_not_self CHECK (spouse1_id <> spouse2_id),
  CONSTRAINT marriages_end_date_needs_ended_status
    CHECK (end_date IS NULL OR status IN ('divorced', 'widowed', 'annulled')),
  CONSTRAINT marriages_end_not_before_start
    CHECK (fuzzy_dates_may_be_ordered(start_date, end_date))
);

-- A couple can have only one marriage that is not dissolved; a divorced or
-- annulled couple may remarry (a new row). Concurrent marriages to DIFFERENT
-- people are allowed (historically common), so no per-person limit exists.
CREATE UNIQUE INDEX marriages_one_active_per_couple
  ON marriages (least(spouse1_id, spouse2_id), greatest(spouse1_id, spouse2_id))
  WHERE status NOT IN ('divorced', 'annulled');
CREATE INDEX marriages_spouse1_idx ON marriages (spouse1_id);
CREATE INDEX marriages_spouse2_idx ON marriages (spouse2_id);

CREATE TRIGGER marriages_set_updated_at BEFORE UPDATE ON marriages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER marriages_audit AFTER INSERT OR UPDATE OR DELETE ON marriages
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE FUNCTION marriages_validate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM assert_people_not_merged(NEW.spouse1_id, NEW.spouse2_id);
  IF EXISTS (SELECT 1 FROM parent_child pc
             WHERE (pc.parent_id = NEW.spouse1_id AND pc.child_id = NEW.spouse2_id)
                OR (pc.parent_id = NEW.spouse2_id AND pc.child_id = NEW.spouse1_id)) THEN
    RAISE EXCEPTION 'a person cannot be both parent and spouse of the same person'
      USING ERRCODE = 'VH003';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER marriages_validate BEFORE INSERT OR UPDATE OF spouse1_id, spouse2_id ON marriages
  FOR EACH ROW EXECUTE FUNCTION marriages_validate();

-- Created after `marriages` because the function body checks that table.
CREATE TRIGGER parent_child_validate
  BEFORE INSERT OR UPDATE OF parent_id, child_id, relationship_type ON parent_child
  FOR EACH ROW EXECUTE FUNCTION parent_child_validate();

-- =============================================================================
-- family_managers (per-family roles)
-- =============================================================================
CREATE TABLE family_managers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    uuid NOT NULL REFERENCES families (id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role         family_role NOT NULL DEFAULT 'manager',
  assigned_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT family_managers_unique UNIQUE (family_id, user_id)
);

CREATE INDEX family_managers_user_idx ON family_managers (user_id);

CREATE TRIGGER family_managers_set_updated_at BEFORE UPDATE ON family_managers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER family_managers_audit AFTER INSERT OR UPDATE OR DELETE ON family_managers
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- =============================================================================
-- sources and source_links (citations for genealogical claims)
-- =============================================================================
CREATE TABLE sources (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type          source_type NOT NULL,
  title_bn             text,
  title_en             text,
  description_bn       text,
  description_en       text,
  author               text,              -- author, or interviewer for oral history
  informant_person_id  uuid REFERENCES people (id) ON DELETE SET NULL,  -- who told the oral history
  source_date          fuzzy_date,        -- when the source was created/recorded
  citation             text,              -- formal citation / reference number
  repository           text,              -- where the original is kept
  url                  text,
  media_id             uuid REFERENCES media_assets (id) ON DELETE SET NULL,
  created_by           uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sources_title_required
    CHECK (nullif(btrim(title_bn), '') IS NOT NULL OR nullif(btrim(title_en), '') IS NOT NULL)
);

CREATE TRIGGER sources_set_updated_at BEFORE UPDATE ON sources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sources_audit AFTER INSERT OR UPDATE OR DELETE ON sources
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- Each link cites a source for exactly one record. Real foreign keys (rather
-- than a polymorphic entity_type/entity_id pair) keep referential integrity;
-- later migrations add columns for history records and extend the check.
CREATE TABLE source_links (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id        uuid NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
  person_id        uuid REFERENCES people (id) ON DELETE CASCADE,
  family_id        uuid REFERENCES families (id) ON DELETE CASCADE,
  parent_child_id  uuid REFERENCES parent_child (id) ON DELETE CASCADE,
  marriage_id      uuid REFERENCES marriages (id) ON DELETE CASCADE,
  claim            text,      -- which fact it supports, e.g. 'birth', 'death', 'name'
  citation_detail  text,      -- page number, interview timestamp, ...
  notes            text,
  created_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT source_links_exactly_one_target
    CHECK (num_nonnulls(person_id, family_id, parent_child_id, marriage_id) = 1)
);

CREATE INDEX source_links_source_idx       ON source_links (source_id);
CREATE INDEX source_links_person_idx       ON source_links (person_id)       WHERE person_id IS NOT NULL;
CREATE INDEX source_links_family_idx       ON source_links (family_id)       WHERE family_id IS NOT NULL;
CREATE INDEX source_links_parent_child_idx ON source_links (parent_child_id) WHERE parent_child_id IS NOT NULL;
CREATE INDEX source_links_marriage_idx     ON source_links (marriage_id)     WHERE marriage_id IS NOT NULL;

CREATE TRIGGER source_links_audit AFTER INSERT OR UPDATE OR DELETE ON source_links
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- =============================================================================
-- Query helpers used by the API
-- =============================================================================

-- Every child of a person, paired with the child's OTHER parent and the
-- marriage between the two parents (if one is recorded). The descendant tree
-- groups children under spouses with this, so a child is only ever shown under
-- the spouse who is actually their parent.
--   co_parent_id NULL  -> other parent unknown
--   marriage_id  NULL  -> parents not recorded as married
-- A child with more than one other parent (e.g. biological and adoptive) is
-- returned once per co-parent.
CREATE FUNCTION person_children_by_coparent(p_person_id uuid)
RETURNS TABLE (
  child_id                    uuid,
  relationship_type           parent_child_type,
  co_parent_id                uuid,
  co_parent_relationship_type parent_child_type,
  marriage_id                 uuid
)
LANGUAGE sql STABLE AS $$
  SELECT pc.child_id,
         pc.relationship_type,
         other.parent_id,
         other.relationship_type,
         (SELECT m.id FROM marriages m
          WHERE other.parent_id IS NOT NULL
            AND ((m.spouse1_id = p_person_id AND m.spouse2_id = other.parent_id)
              OR (m.spouse2_id = p_person_id AND m.spouse1_id = other.parent_id))
          -- a remarried couple: prefer the current marriage, then the latest
          ORDER BY (m.status IN ('divorced', 'annulled')),
                   fuzzy_date_sort_key(m.start_date) DESC NULLS LAST
          LIMIT 1)
  FROM parent_child pc
  LEFT JOIN parent_child other
    ON other.child_id = pc.child_id AND other.parent_id <> pc.parent_id
  WHERE pc.parent_id = p_person_id
$$;

-- Possible duplicates of a person about to be created. Matches spelling
-- variants in either script and optionally a birth year (+/- 15 years).
CREATE FUNCTION find_similar_people(p_name text, p_birth_year int DEFAULT NULL, p_limit int DEFAULT 10)
RETURNS TABLE (person_id uuid, full_name_bn text, full_name_en text, birth_year smallint, score real)
LANGUAGE sql STABLE AS $$
  WITH q AS (SELECT normalize_person_name(p_name) AS name)
  SELECT p.id, p.full_name_bn, p.full_name_en, (p.birth).year,
         greatest(similarity(normalize_person_name(p.full_name_bn), q.name),
                  similarity(normalize_person_name(p.full_name_en), q.name),
                  word_similarity(q.name, p.name_search)) AS score
  FROM people p, q
  WHERE p.merged_into_id IS NULL
    AND q.name IS NOT NULL
    AND q.name <% p.name_search
    AND (p_birth_year IS NULL OR (p.birth).year IS NULL
         OR abs((p.birth).year - p_birth_year) <= 15)
  ORDER BY score DESC
  LIMIT p_limit
$$;

SELECT app_enable_default_deny('people');
SELECT app_enable_default_deny('families');
SELECT app_enable_default_deny('family_members');
SELECT app_enable_default_deny('parent_child');
SELECT app_enable_default_deny('marriages');
SELECT app_enable_default_deny('family_managers');
SELECT app_enable_default_deny('sources');
SELECT app_enable_default_deny('source_links');
