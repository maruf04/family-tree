-- =============================================================================
-- 0011 One-bari site: managed accounts, spreadsheet import, Supabase hardening
-- =============================================================================

-- Accounts are created by admins/moderators with a username and a temporary
-- password that must be changed at first sign-in. Passwords live only in
-- Supabase Auth, never here.
ALTER TABLE users
  ADD COLUMN username citext UNIQUE,
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT users_username_format CHECK (username::text ~ '^[a-z0-9][a-z0-9._-]{2,29}$');

-- The code a person has in the family spreadsheet, so the same sheet can be
-- uploaded again without creating anyone twice.
ALTER TABLE people ADD COLUMN import_code text UNIQUE;

-- The site represents one bari; this is the village it belongs to.
ALTER TABLE village_profile
  ADD COLUMN village_name_bn text,
  ADD COLUMN village_name_en text;

-- The migration runner's own table is in the public schema too, so on Supabase
-- it would otherwise be reachable with the browser's key.
SELECT app_enable_default_deny('schema_migrations');

-- No function may depend on the caller's search_path:
--   * Supabase's auth service runs with search_path = auth, and deleting a
--     login there cascades into public.users (audit and guard triggers);
--   * pg_restore runs with an empty search_path, so without this a backup of
--     people, marriages and dates cannot be restored.
DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', f);
  END LOOP;
END $$;
