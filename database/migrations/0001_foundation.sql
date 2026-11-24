-- =============================================================================
-- 0001 Foundation: extensions, shared helpers, historical (fuzzy) dates, audit log
-- =============================================================================
-- Conventions used by every migration:
--   * UUID primary keys (gen_random_uuid(), built into PostgreSQL 13+).
--   * Bilingual text is stored as paired columns: <field>_bn (Bangla, the
--     default language) and <field>_en (English). The UI falls back to the
--     other language when one is empty.
--   * created_at / updated_at timestamptz on mutable tables.
--   * Row Level Security is ENABLED with no policies (default deny) on every
--     table. The Express API connects as the table owner and performs
--     authorization itself; the Supabase anon/authenticated roles that the
--     browser uses can therefore never read these tables directly.
--   * Application-specific errors use SQLSTATE class 'VH' (Village Heritage)
--     so the API can translate them into friendly bilingual messages.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- fuzzy name search (works for Bangla script)
CREATE EXTENSION IF NOT EXISTS citext;    -- case-insensitive email

-- -----------------------------------------------------------------------------
-- Generic helpers
-- -----------------------------------------------------------------------------

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- The API sets these per transaction with SET LOCAL / set_config(..., true):
--   app.user_id      the authenticated user performing the change
--   app.proposal_id  the change proposal being applied (if any)
--   app.request_id   request correlation id for log tracing
CREATE FUNCTION app_current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

CREATE FUNCTION app_current_proposal_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.proposal_id', true), '')::uuid
$$;

-- Enable RLS with no policies (deny all) and revoke Supabase client-role grants.
-- Safe on plain PostgreSQL where the anon/authenticated roles do not exist.
CREATE FUNCTION app_enable_default_deny(tbl regclass) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  r text;
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON %s FROM %I', tbl, r);
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Name normalisation for search and duplicate detection
-- -----------------------------------------------------------------------------
-- Bangla names are spelled inconsistently in records (আব্দুল / আবদুল, করিম / করীম,
-- মোঃ / মোহাম্মদ prefixes). This produces a matching key only; it is never shown.
CREATE FUNCTION normalize_person_name(name text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT nullif(btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        translate(lower(normalize(coalesce(name, ''), NFC)), 'ীূ', 'িু'),
        -- common honorific / "Muhammad" prefixes in Bangla and English
        '(^|\s)(md|mohd|mohammad|mohammed|muhammad|muhammed|মোহাম্মদ|মোহাম্মাদ|মুহাম্মদ|মুহম্মদ|মোঃ|মো:|মো)(\.|\s|$)',
        ' ', 'g'),
      -- hasant (U+09CD), ZWNJ/ZWJ, punctuation, and visarga (U+0983) used as an abbreviation dot
      '[্‌‍.,:;''"()ঃ-]', '', 'g'),
    '\s+', ' ', 'g')), '')
$$;

-- -----------------------------------------------------------------------------
-- Historical (fuzzy) dates
-- -----------------------------------------------------------------------------
-- A fuzzy_date records exactly what is known and nothing more:
--   exact    (1920)            "in 1920"           (year, year+month or full date)
--   exact    (1920, 3, 5)      "5 March 1920"
--   about    (1880)            "around 1880"
--   before   (1900)            "before 1900"
--   after    (1947)            "after 1947"
--   between  (1880 .. 1885)    "between 1880 and 1885"
-- An unknown date is simply NULL. Month/day are never invented: a year-only
-- value keeps month and day NULL.

CREATE TYPE date_qualifier AS ENUM ('exact', 'about', 'before', 'after', 'between');

CREATE TYPE fuzzy_date_parts AS (
  qualifier date_qualifier,
  year      smallint,
  month     smallint,
  day       smallint,
  year_to   smallint,   -- end of range, only for 'between'
  month_to  smallint,
  day_to    smallint
);

-- Valid partial calendar date: year, year+month, or year+month+day.
CREATE FUNCTION partial_date_is_valid(y int, m int, d int) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN y IS NULL THEN m IS NULL AND d IS NULL
    WHEN y < 1000 OR y > 2200 THEN false
    WHEN m IS NULL THEN d IS NULL
    WHEN m < 1 OR m > 12 THEN false
    WHEN d IS NULL THEN true
    ELSE d >= 1 AND d <= extract(day FROM (make_date(y, m, 1) + interval '1 month - 1 day'))
  END
$$;

CREATE FUNCTION fuzzy_date_is_valid(v fuzzy_date_parts) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    -- every field empty = unknown date; behaves like NULL
    WHEN v.qualifier IS NULL AND v.year IS NULL AND v.month IS NULL AND v.day IS NULL
         AND v.year_to IS NULL AND v.month_to IS NULL AND v.day_to IS NULL THEN true
    WHEN v.qualifier IS NULL OR v.year IS NULL THEN false
    WHEN NOT partial_date_is_valid(v.year, v.month, v.day) THEN false
    WHEN v.qualifier = 'between' THEN
      v.year_to IS NOT NULL
      AND partial_date_is_valid(v.year_to, v.month_to, v.day_to)
      AND (v.year, coalesce(v.month, 1), coalesce(v.day, 1))
          <= (v.year_to, coalesce(v.month_to, 12), coalesce(v.day_to, 31))
    ELSE v.year_to IS NULL AND v.month_to IS NULL AND v.day_to IS NULL
  END
$$;

CREATE DOMAIN fuzzy_date AS fuzzy_date_parts
  CHECK (fuzzy_date_is_valid(VALUE));

COMMENT ON DOMAIN fuzzy_date IS
  'Historical date with explicit precision/uncertainty. NULL = unknown. Never stores invented month/day.';

-- Construct a fuzzy_date: make_fuzzy_date('about', 1880)
CREATE FUNCTION make_fuzzy_date(
  qualifier date_qualifier, year int,
  month int DEFAULT NULL, day int DEFAULT NULL,
  year_to int DEFAULT NULL, month_to int DEFAULT NULL, day_to int DEFAULT NULL
) RETURNS fuzzy_date
LANGUAGE sql IMMUTABLE AS $$
  SELECT ROW(qualifier, year, month, day, year_to, month_to, day_to)::fuzzy_date_parts::fuzzy_date
$$;

-- JSON interchange used by the API and change proposals:
--   {"qualifier":"about","year":1880}
CREATE FUNCTION fuzzy_date_from_jsonb(j jsonb) RETURNS fuzzy_date
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN j IS NULL OR jsonb_typeof(j) = 'null' THEN NULL
    ELSE jsonb_populate_record(NULL::fuzzy_date_parts, j)::fuzzy_date
  END
$$;

CREATE FUNCTION fuzzy_date_to_jsonb(v fuzzy_date_parts) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN v.year IS NULL THEN NULL ELSE jsonb_strip_nulls(to_jsonb(v)) END
$$;

-- Ordering key: the stated (start) date, with missing month/day treated as the
-- first. For sorting only, never for display.
CREATE FUNCTION fuzzy_date_sort_key(v fuzzy_date_parts) RETURNS date
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN v.year IS NULL THEN NULL
              ELSE make_date(v.year, coalesce(v.month, 1), coalesce(v.day, 1)) END
$$;

-- The span of real dates a fuzzy_date could refer to. 'about' means +/-10 years.
-- Used for sanity checks (death not before birth) and duplicate matching.
CREATE FUNCTION fuzzy_date_range(v fuzzy_date_parts) RETURNS daterange
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE
  start_lo date;
  start_hi date;  -- exclusive
  end_hi   date;  -- exclusive
BEGIN
  IF v.year IS NULL THEN
    RETURN NULL;
  END IF;
  start_lo := make_date(v.year, coalesce(v.month, 1), coalesce(v.day, 1));
  start_hi := CASE
    WHEN v.day   IS NOT NULL THEN start_lo + 1
    WHEN v.month IS NOT NULL THEN (start_lo + interval '1 month')::date
    ELSE make_date(v.year + 1, 1, 1)
  END;
  CASE v.qualifier
    WHEN 'exact'  THEN RETURN daterange(start_lo, start_hi);
    WHEN 'about'  THEN RETURN daterange(make_date(v.year - 10, 1, 1), make_date(v.year + 11, 1, 1));
    WHEN 'before' THEN RETURN daterange(NULL, start_lo);
    WHEN 'after'  THEN RETURN daterange(start_hi, NULL);
    WHEN 'between' THEN
      end_hi := CASE
        WHEN v.day_to   IS NOT NULL THEN make_date(v.year_to, v.month_to, v.day_to) + 1
        WHEN v.month_to IS NOT NULL THEN (make_date(v.year_to, v.month_to, 1) + interval '1 month')::date
        ELSE make_date(v.year_to + 1, 1, 1)
      END;
      RETURN daterange(start_lo, end_hi);
  END CASE;
  RETURN NULL;
END $$;

-- Could `earlier` plausibly be on or before `later`? Unknown dates never conflict.
CREATE FUNCTION fuzzy_dates_may_be_ordered(earlier fuzzy_date_parts, later fuzzy_date_parts)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN earlier.year IS NULL OR later.year IS NULL THEN true
    ELSE lower_inf(fuzzy_date_range(earlier))
      OR upper_inf(fuzzy_date_range(later))
      OR lower(fuzzy_date_range(earlier)) < upper(fuzzy_date_range(later))
  END
$$;

-- -----------------------------------------------------------------------------
-- Privacy levels (shared by genealogy, history and community content)
-- -----------------------------------------------------------------------------
--   public      visible without logging in (e.g. notable historical ancestors)
--   members     any verified village member
--   family      verified members of the record's families, plus managers/admins
--   restricted  the person themself, their family managers, and admins
CREATE TYPE privacy_level AS ENUM ('public', 'members', 'family', 'restricted');

-- -----------------------------------------------------------------------------
-- Audit log (append-only)
-- -----------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  -- No foreign keys: audit rows must survive deletion of whatever they describe.
  actor_user_id   uuid,
  action          text NOT NULL,          -- insert | update | delete | app-level verbs
  table_name      text NOT NULL,
  record_id       uuid,
  old_data        jsonb,
  new_data        jsonb,
  changed_fields  text[],
  proposal_id     uuid,
  request_id      text
);

CREATE INDEX audit_logs_record_idx   ON audit_logs (table_name, record_id, occurred_at DESC);
CREATE INDEX audit_logs_actor_idx    ON audit_logs (actor_user_id, occurred_at DESC);
CREATE INDEX audit_logs_proposal_idx ON audit_logs (proposal_id) WHERE proposal_id IS NOT NULL;
CREATE INDEX audit_logs_time_idx     ON audit_logs (occurred_at DESC);

CREATE FUNCTION audit_logs_block_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = 'VH900';
END $$;

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_block_mutation();

-- Generic row-level audit trigger. Attach with:
--   CREATE TRIGGER <t>_audit AFTER INSERT OR UPDATE OR DELETE ON <t>
--     FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE FUNCTION audit_row_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_j   jsonb;
  new_j   jsonb;
  changed text[];
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN old_j := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN new_j := to_jsonb(NEW); END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(k ORDER BY k) INTO changed
    FROM jsonb_object_keys(new_j) AS k
    WHERE k <> 'updated_at' AND new_j -> k IS DISTINCT FROM old_j -> k;
    IF changed IS NULL THEN
      RETURN NULL;  -- nothing meaningful changed
    END IF;
  END IF;

  INSERT INTO audit_logs (action, table_name, record_id, old_data, new_data,
                          changed_fields, actor_user_id, proposal_id, request_id)
  VALUES (lower(TG_OP), TG_TABLE_NAME, (coalesce(new_j, old_j) ->> 'id')::uuid,
          old_j, new_j, changed, app_current_user_id(), app_current_proposal_id(),
          nullif(current_setting('app.request_id', true), ''));
  RETURN NULL;
END $$;

SELECT app_enable_default_deny('audit_logs');
