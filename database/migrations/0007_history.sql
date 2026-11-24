-- =============================================================================
-- 0007 Village profile and historical archive
-- =============================================================================

-- -----------------------------------------------------------------------------
-- village_profile: a single row describing the village (home page intro).
-- -----------------------------------------------------------------------------
CREATE TABLE village_profile (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_bn           text NOT NULL,
  name_en           text,
  tagline_bn        text,
  tagline_en        text,
  introduction_bn   text,
  introduction_en   text,
  established       fuzzy_date,
  union_name        text,     -- local government union
  upazila           text,
  district          text,
  latitude          numeric(9, 6) CHECK (latitude BETWEEN -90 AND 90),
  longitude         numeric(9, 6) CHECK (longitude BETWEEN -180 AND 180),
  cover_photo_id    uuid REFERENCES media_assets (id) ON DELETE SET NULL,
  updated_by        uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
-- Exactly one row.
CREATE UNIQUE INDEX village_profile_singleton ON village_profile ((true));

CREATE TRIGGER village_profile_set_updated_at BEFORE UPDATE ON village_profile
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER village_profile_audit AFTER INSERT OR UPDATE OR DELETE ON village_profile
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- -----------------------------------------------------------------------------
-- Long-form history: origin story, culture, traditions, lifestyle...
-- -----------------------------------------------------------------------------
CREATE TYPE history_article_category AS ENUM (
  'origin', 'founders', 'culture', 'tradition', 'lifestyle', 'religion', 'festival', 'food', 'other'
);

CREATE TABLE history_articles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category         history_article_category NOT NULL,
  title_bn         text,
  title_en         text,
  summary_bn       text,
  summary_en       text,
  body_bn          text,
  body_en          text,
  cover_photo_id   uuid REFERENCES media_assets (id) ON DELETE SET NULL,
  sort_order       integer NOT NULL DEFAULT 0,
  privacy_level    privacy_level NOT NULL DEFAULT 'members',
  created_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT history_articles_title_required
    CHECK (nullif(btrim(title_bn), '') IS NOT NULL OR nullif(btrim(title_en), '') IS NOT NULL)
);
CREATE INDEX history_articles_category_idx ON history_articles (category, sort_order);

-- -----------------------------------------------------------------------------
-- Timeline events
-- -----------------------------------------------------------------------------
CREATE TYPE historical_event_category AS ENUM (
  'founding', 'settlement', 'religious', 'education', 'infrastructure', 'disaster',
  'war', 'political', 'cultural', 'economic', 'other'
);

CREATE TABLE historical_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category         historical_event_category NOT NULL DEFAULT 'other',
  title_bn         text,
  title_en         text,
  description_bn   text,
  description_en   text,
  event_date       fuzzy_date,
  end_date         fuzzy_date,
  place_bn         text,
  place_en         text,
  is_featured      boolean NOT NULL DEFAULT false,   -- shown in the home page timeline preview
  privacy_level    privacy_level NOT NULL DEFAULT 'members',
  created_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historical_events_title_required
    CHECK (nullif(btrim(title_bn), '') IS NOT NULL OR nullif(btrim(title_en), '') IS NOT NULL),
  CONSTRAINT historical_events_end_after_start CHECK (fuzzy_dates_may_be_ordered(event_date, end_date))
);
CREATE INDEX historical_events_date_idx ON historical_events ((fuzzy_date_sort_key(event_date)));

CREATE TABLE historical_event_people (
  event_id    uuid NOT NULL REFERENCES historical_events (id) ON DELETE CASCADE,
  person_id   uuid NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  role_bn     text,
  role_en     text,
  PRIMARY KEY (event_id, person_id)
);
CREATE INDEX historical_event_people_person_idx ON historical_event_people (person_id);

-- -----------------------------------------------------------------------------
-- Documents, photographs, oral histories
-- -----------------------------------------------------------------------------
CREATE TYPE historical_document_type AS ENUM (
  'land_deed', 'letter', 'certificate', 'government_record', 'religious_record',
  'manuscript', 'newspaper', 'map', 'other'
);

CREATE TABLE historical_documents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type      historical_document_type NOT NULL DEFAULT 'other',
  title_bn           text,
  title_en           text,
  description_bn     text,
  description_en     text,
  document_date      fuzzy_date,
  transcription      text,
  repository         text,          -- where the original is kept
  media_id           uuid REFERENCES media_assets (id) ON DELETE SET NULL,
  privacy_level      privacy_level NOT NULL DEFAULT 'members',
  created_by         uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historical_documents_title_required
    CHECK (nullif(btrim(title_bn), '') IS NOT NULL OR nullif(btrim(title_en), '') IS NOT NULL)
);

CREATE TABLE historical_photos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_bn           text,
  title_en           text,
  description_bn     text,
  description_en     text,
  photo_date         fuzzy_date,
  photographer       text,
  media_id           uuid NOT NULL REFERENCES media_assets (id) ON DELETE RESTRICT,
  privacy_level      privacy_level NOT NULL DEFAULT 'members',
  created_by         uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE historical_photo_people (
  photo_id    uuid NOT NULL REFERENCES historical_photos (id) ON DELETE CASCADE,
  person_id   uuid NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  PRIMARY KEY (photo_id, person_id)
);
CREATE INDEX historical_photo_people_person_idx ON historical_photo_people (person_id);

CREATE TABLE oral_histories (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_bn            text,
  title_en            text,
  narrator_person_id  uuid REFERENCES people (id) ON DELETE SET NULL,
  narrator_name       text,           -- when the narrator has no person record
  interviewer         text,
  recorded_date       fuzzy_date,
  summary_bn          text,
  summary_en          text,
  transcript          text,
  media_id            uuid REFERENCES media_assets (id) ON DELETE SET NULL,  -- audio/video
  privacy_level       privacy_level NOT NULL DEFAULT 'members',
  created_by          uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oral_histories_title_required
    CHECK (nullif(btrim(title_bn), '') IS NOT NULL OR nullif(btrim(title_en), '') IS NOT NULL)
);

-- Sources can now cite history records too.
ALTER TABLE source_links
  ADD COLUMN historical_event_id    uuid REFERENCES historical_events (id) ON DELETE CASCADE,
  ADD COLUMN historical_document_id uuid REFERENCES historical_documents (id) ON DELETE CASCADE,
  DROP CONSTRAINT source_links_exactly_one_target,
  ADD CONSTRAINT source_links_exactly_one_target CHECK (
    num_nonnulls(person_id, family_id, parent_child_id, marriage_id,
                 historical_event_id, historical_document_id) = 1);

-- Shared triggers
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['history_articles', 'historical_events', 'historical_documents',
                           'historical_photos', 'oral_histories'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
                   t || '_set_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_row_change()',
                   t || '_audit', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['village_profile', 'history_articles', 'historical_events', 'historical_event_people',
                           'historical_documents', 'historical_photos', 'historical_photo_people',
                           'oral_histories'] LOOP
    PERFORM app_enable_default_deny(t::regclass);
  END LOOP;
END $$;
