-- =============================================================================
-- 0008 Village directory: places, institutions, businesses
-- =============================================================================

CREATE TYPE place_type AS ENUM (
  'landmark', 'homestead', 'mosque', 'temple', 'school', 'market', 'graveyard', 'pond',
  'river', 'field', 'road', 'bridge', 'government', 'health', 'other'
);

CREATE TABLE places (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_type       place_type NOT NULL DEFAULT 'other',
  name_bn          text,
  name_en          text,
  description_bn   text,
  description_en   text,
  latitude         numeric(9, 6) CHECK (latitude BETWEEN -90 AND 90),
  longitude        numeric(9, 6) CHECK (longitude BETWEEN -180 AND 180),
  address          text,
  photo_id         uuid REFERENCES media_assets (id) ON DELETE SET NULL,
  family_id        uuid REFERENCES families (id) ON DELETE SET NULL,   -- e.g. a bari
  privacy_level    privacy_level NOT NULL DEFAULT 'members',
  created_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT places_name_required
    CHECK (nullif(btrim(name_bn), '') IS NOT NULL OR nullif(btrim(name_en), '') IS NOT NULL),
  CONSTRAINT places_coordinates_pair CHECK ((latitude IS NULL) = (longitude IS NULL))
);
CREATE INDEX places_type_idx ON places (place_type);

CREATE TYPE institution_type AS ENUM (
  'primary_school', 'high_school', 'college', 'madrasa', 'mosque', 'temple', 'church',
  'clinic', 'club', 'library', 'ngo', 'cooperative', 'government', 'other'
);

CREATE TABLE institutions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_type  institution_type NOT NULL,
  name_bn           text,
  name_en           text,
  description_bn    text,
  description_en    text,
  established       fuzzy_date,
  head_name         text,       -- headmaster / imam / president
  contact_phone     text,
  website           text,
  place_id          uuid REFERENCES places (id) ON DELETE SET NULL,
  photo_id          uuid REFERENCES media_assets (id) ON DELETE SET NULL,
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT institutions_name_required
    CHECK (nullif(btrim(name_bn), '') IS NOT NULL OR nullif(btrim(name_en), '') IS NOT NULL)
);
CREATE INDEX institutions_type_idx ON institutions (institution_type);

CREATE TYPE business_type AS ENUM (
  'grocery', 'market_stall', 'pharmacy', 'restaurant', 'tailor', 'agriculture', 'fishery',
  'poultry', 'transport', 'electronics', 'service', 'other'
);

CREATE TABLE businesses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_type     business_type NOT NULL DEFAULT 'other',
  name_bn           text,
  name_en           text,
  description_bn    text,
  description_en    text,
  owner_person_id   uuid REFERENCES people (id) ON DELETE SET NULL,
  owner_user_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  contact_phone     text,
  opening_hours     text,
  place_id          uuid REFERENCES places (id) ON DELETE SET NULL,
  photo_id          uuid REFERENCES media_assets (id) ON DELETE SET NULL,
  is_active         boolean NOT NULL DEFAULT true,
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT businesses_name_required
    CHECK (nullif(btrim(name_bn), '') IS NOT NULL OR nullif(btrim(name_en), '') IS NOT NULL)
);
CREATE INDEX businesses_type_idx ON businesses (business_type) WHERE is_active;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['places', 'institutions', 'businesses'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
                   t || '_set_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_row_change()',
                   t || '_audit', t);
    PERFORM app_enable_default_deny(t::regclass);
  END LOOP;
END $$;
