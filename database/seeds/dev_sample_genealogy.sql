-- =============================================================================
-- FICTIONAL SAMPLE GENEALOGY, for development and testing only.
-- =============================================================================
-- None of these people, families or dates are real village history. Never load
-- this into production (scripts/seed.js refuses when NODE_ENV=production).
-- Every record carries research_notes = 'FICTIONAL SAMPLE DATA'.
--
-- Scenarios covered:
--   * Person with no known parents ............... Munshi Rahim Uddin (lineage A root)
--   * Two parents and multiple children ........... Abdul Karim (parents Rahim & Rahima)
--   * Three spouses, children from each ........... Abdul Karim + Ayesha / Fatema / Salma
--   * Concurrent marriages ........................ Fatema (1912-1952) and Salma (1925-1940)
--   * Ended marriages ............................. Ayesha (widowed 1910), Salma (divorced ~1940)
--   * Adoptive relationship ....................... Sultan, adopted by Karim & Fatema
--   * Only one parent known ....................... Fatema Begum (father Gani Sarkar only)
--   * Marriage between two lineages ............... Karim (lineage A) x Fatema (lineage B)
--   * One person in multiple family trees ......... Fatema: lineage B + married into A
--   * Repeated ancestor via two paths ............. Habib (parents are first cousins)
--   * Approximate dates ........................... about / between / before / year-only
--   * Six generations ............................. Rahim -> Karim -> Nurul -> Shafiqul -> Tanvir -> Ayan
--   * Living people (private by default) .......... Shafiqul's and later generations
--
-- Abdul Karim
-- ├── Wife 1: Ayesha Begum (widowed 1910)  ── Abdur Rahman, Rokeya Begum
-- ├── Wife 2: Fatema Begum                 ── Nurul Islam, Hasina Akter, Sultan Ahmed (adopted)
-- └── Wife 3: Salma Begum (divorced)       ── Kamal Hossain
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM people WHERE id = '10000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'sample genealogy is already loaded';
  END IF;
END $$;

-- Placeholder users (not linked to Supabase accounts; cannot log in).
INSERT INTO users (id, email, display_name_bn, display_name_en, role, membership_status, verified_at) VALUES
  ('90000000-0000-4000-8000-000000000001', 'admin@example.test',   'নমুনা প্রশাসক',      'Sample Admin',   'admin',  'verified', now()),
  ('90000000-0000-4000-8000-000000000003', 'member@example.test',  'নমুনা সদস্য',        'Sample Member',  'member', 'verified', now()),
  ('90000000-0000-4000-8000-000000000004', 'moderator@example.test', 'নমুনা মডারেটর',    'Sample Moderator', 'moderator', 'verified', now());

-- Attribute the seed's audit log rows to the sample admin.
SELECT set_config('app.user_id', '90000000-0000-4000-8000-000000000001', true);

INSERT INTO people (id, full_name_bn, full_name_en, sex, birth, death, living_status, occupation_bn, occupation_en, research_notes) VALUES
  -- Generation 1
  ('10000000-0000-4000-8000-000000000001', 'মুন্সী রহিম উদ্দিন', 'Munshi Rahim Uddin', 'male',
     make_fuzzy_date('about', 1850), make_fuzzy_date('about', 1915), 'deceased', 'কৃষক', 'Farmer', 'FICTIONAL SAMPLE DATA'),
  ('10000000-0000-4000-8000-000000000002', 'রহিমা খাতুন', 'Rahima Khatun', 'female',
     make_fuzzy_date('about', 1855), make_fuzzy_date('before', 1920), 'deceased', NULL, NULL, 'FICTIONAL SAMPLE DATA'),
  -- Generation 2
  ('10000000-0000-4000-8000-000000000003', 'আব্দুল করিম', 'Abdul Karim', 'male',
     make_fuzzy_date('about', 1880), make_fuzzy_date('exact', 1952, 8, 14), 'deceased', 'কৃষক ও ব্যবসায়ী', 'Farmer and trader', 'FICTIONAL SAMPLE DATA'),
  ('10000000-0000-4000-8000-000000000004', 'আব্দুল জব্বার', 'Abdul Jabbar', 'male',
     make_fuzzy_date('between', 1882, NULL, NULL, 1886), make_fuzzy_date('exact', 1960), 'deceased', NULL, NULL, 'FICTIONAL SAMPLE DATA'),
  ('10000000-0000-4000-8000-000000000005', 'জমিলা খাতুন', 'Jamila Khatun', 'female',
     make_fuzzy_date('about', 1888), NULL, 'deceased', NULL, NULL, 'FICTIONAL SAMPLE DATA'),
  -- Abdul Karim's wives (Fatema is 011, from lineage B)
  ('10000000-0000-4000-8000-000000000006', 'আয়েশা বেগম', 'Ayesha Begum', 'female',
     make_fuzzy_date('about', 1884), make_fuzzy_date('exact', 1910), 'deceased', NULL, NULL, 'FICTIONAL SAMPLE DATA'),
  ('10000000-0000-4000-8000-000000000007', 'সালমা বেগম', 'Salma Begum', 'female',
     make_fuzzy_date('about', 1905), NULL, 'deceased', NULL, NULL, 'FICTIONAL SAMPLE DATA'),
  -- Abdul Jabbar's wife
  ('10000000-0000-4000-8000-000000000008', 'কুলসুম বিবি', 'Kulsum Bibi', 'female',
     make_fuzzy_date('about', 1890), NULL, 'deceased', NULL, NULL, 'FICTIONAL SAMPLE DATA'),
  -- Lineage B
  ('10000000-0000-4000-8000-000000000010', 'গনি সরকার', 'Gani Sarkar', 'male',
     make_fuzzy_date('about', 1855), NULL, 'deceased', 'জোতদার', 'Landholder', 'FICTIONAL SAMPLE DATA'),
  ('10000000-0000-4000-8000-000000000011', 'ফাতেমা বেগম', 'Fatema Begum', 'female',
     make_fuzzy_date('exact', 1892, 3, 10), make_fuzzy_date('exact', 1970), 'deceased', NULL, NULL, 'FICTIONAL SAMPLE DATA'),
  -- Spouses who married into lineage A (no recorded parents)
  ('10000000-0000-4000-8000-000000000012', 'রুকসানা বেগম', 'Ruksana Begum', 'female',
     make_fuzzy_date('exact', 1922), make_fuzzy_date('exact', 1999), 'deceased', NULL, NULL, 'FICTIONAL SAMPLE DATA'),
  ('10000000-0000-4000-8000-000000000013', 'পারভীন আক্তার', 'Parveen Akter', 'female',
     make_fuzzy_date('exact', 1955), NULL, 'living', 'শিক্ষক', 'Teacher', 'FICTIONAL SAMPLE DATA'),
  ('10000000-0000-4000-8000-000000000014', 'নুসরাত জাহান', 'Nusrat Jahan', 'female',
     make_fuzzy_date('exact', 1987), NULL, 'living', NULL, NULL, 'FICTIONAL SAMPLE DATA'),
  -- Generation 3: Abdul Karim's children
  ('10000000-0000-4000-8000-000000000020', 'আব্দুর রহমান', 'Abdur Rahman', 'male',
     make_fuzzy_date('about', 1902), make_fuzzy_date('exact', 1975), 'deceased', NULL, NULL, 'FICTIONAL SAMPLE DATA'),
  ('10000000-0000-4000-8000-000000000021', 'রোকেয়া বেগম', 'Rokeya Begum', 'female',
     make_fuzzy_date('about', 1906), NULL, 'deceased', NULL, NULL, 'FICTIONAL SAMPLE DATA'),
  ('10000000-0000-4000-8000-000000000022', 'নুরুল ইসলাম', 'Nurul Islam', 'male',
     make_fuzzy_date('exact', 1915), make_fuzzy_date('exact', 1990, 1, 5), 'deceased', 'স্কুল শিক্ষক', 'School teacher', 'FICTIONAL SAMPLE DATA'),
  ('10000000-0000-4000-8000-000000000023', 'হাসিনা আক্তার', 'Hasina Akter', 'female',
     make_fuzzy_date('exact', 1918), NULL, 'deceased', NULL, NULL, 'FICTIONAL SAMPLE DATA'),
  ('10000000-0000-4000-8000-000000000024', 'সুলতান আহমেদ', 'Sultan Ahmed', 'male',
     make_fuzzy_date('about', 1920), make_fuzzy_date('exact', 1985), 'deceased', NULL, NULL, 'FICTIONAL SAMPLE DATA'),
  ('10000000-0000-4000-8000-000000000025', 'কামাল হোসেন', 'Kamal Hossain', 'male',
     make_fuzzy_date('exact', 1932), make_fuzzy_date('exact', 2010), 'deceased', NULL, NULL, 'FICTIONAL SAMPLE DATA'),
  -- Abdul Jabbar's daughter (first cousin of Abdur Rahman)
  ('10000000-0000-4000-8000-000000000026', 'মরিয়ম বেগম', 'Morium Begum', 'female',
     make_fuzzy_date('about', 1908), NULL, 'deceased', NULL, NULL, 'FICTIONAL SAMPLE DATA'),
  -- Generation 4
  ('10000000-0000-4000-8000-000000000027', 'হাবিব রহমান', 'Habib Rahman', 'male',
     make_fuzzy_date('exact', 1932), make_fuzzy_date('exact', 2001), 'deceased', NULL, NULL, 'FICTIONAL SAMPLE DATA'),
  ('10000000-0000-4000-8000-000000000028', 'শফিকুল ইসলাম', 'Shafiqul Islam', 'male',
     make_fuzzy_date('exact', 1948), NULL, 'living', 'কৃষি কর্মকর্তা', 'Agriculture officer', 'FICTIONAL SAMPLE DATA'),
  ('10000000-0000-4000-8000-000000000029', 'নাসিমা আক্তার', 'Nasima Akter', 'female',
     make_fuzzy_date('exact', 1951), NULL, 'living', NULL, NULL, 'FICTIONAL SAMPLE DATA'),
  -- Generation 5
  ('10000000-0000-4000-8000-000000000030', 'তানভীর ইসলাম', 'Tanvir Islam', 'male',
     make_fuzzy_date('exact', 1980), NULL, 'living', 'প্রকৌশলী', 'Engineer', 'FICTIONAL SAMPLE DATA'),
  ('10000000-0000-4000-8000-000000000031', 'ফারজানা ইসলাম', 'Farzana Islam', 'female',
     make_fuzzy_date('exact', 1984), NULL, 'living', NULL, NULL, 'FICTIONAL SAMPLE DATA'),
  -- Generation 6
  ('10000000-0000-4000-8000-000000000032', 'আয়ান ইসলাম', 'Ayan Islam', 'male',
     make_fuzzy_date('exact', 2015), NULL, 'living', NULL, NULL, 'FICTIONAL SAMPLE DATA');

-- Marriages (spouse1_order / spouse2_order = "nth wife / nth husband" for that spouse)
INSERT INTO marriages (id, spouse1_id, spouse2_id, status, start_date, end_date, spouse1_order, spouse2_order) VALUES
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
     'widowed', make_fuzzy_date('about', 1875), NULL, 1, 1),
  -- Abdul Karim's three marriages
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000006',
     'widowed', make_fuzzy_date('about', 1900), make_fuzzy_date('exact', 1910), 1, 1),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000011',
     'widowed', make_fuzzy_date('exact', 1912), make_fuzzy_date('exact', 1952, 8, 14), 2, 1),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007',
     'divorced', make_fuzzy_date('between', 1925, NULL, NULL, 1930), make_fuzzy_date('about', 1940), 3, 1),
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000008',
     'widowed', NULL, NULL, 1, 1),
  -- First-cousin marriage
  ('30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000026',
     'widowed', make_fuzzy_date('about', 1928), NULL, 1, 1),
  ('30000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000012',
     'widowed', make_fuzzy_date('exact', 1944), make_fuzzy_date('exact', 1990, 1, 5), 1, 1),
  ('30000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000028', '10000000-0000-4000-8000-000000000013',
     'ongoing', make_fuzzy_date('exact', 1976), NULL, 1, 1),
  ('30000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000030', '10000000-0000-4000-8000-000000000014',
     'ongoing', make_fuzzy_date('exact', 2012, 2), NULL, 1, 1);

-- Parent-child edges: each child is linked to its ACTUAL parents only.
INSERT INTO parent_child (parent_id, child_id, relationship_type)
SELECT p::uuid, c::uuid, t::parent_child_type FROM (VALUES
  -- Rahim & Rahima -> Karim, Jabbar, Jamila
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'biological'),
  ('10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'biological'),
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'biological'),
  ('10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'biological'),
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'biological'),
  ('10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000005', 'biological'),
  -- Gani Sarkar -> Fatema (mother unknown)
  ('10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000011', 'biological'),
  -- Karim & Ayesha -> Abdur Rahman, Rokeya
  ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000020', 'biological'),
  ('10000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000020', 'biological'),
  ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000021', 'biological'),
  ('10000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000021', 'biological'),
  -- Karim & Fatema -> Nurul, Hasina; Sultan adopted
  ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000022', 'biological'),
  ('10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000022', 'biological'),
  ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000023', 'biological'),
  ('10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000023', 'biological'),
  ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000024', 'adoptive'),
  ('10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000024', 'adoptive'),
  -- Karim & Salma -> Kamal
  ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000025', 'biological'),
  ('10000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000025', 'biological'),
  -- Jabbar & Kulsum -> Morium
  ('10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000026', 'biological'),
  ('10000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000026', 'biological'),
  -- Abdur Rahman & Morium (first cousins) -> Habib
  ('10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000027', 'biological'),
  ('10000000-0000-4000-8000-000000000026', '10000000-0000-4000-8000-000000000027', 'biological'),
  -- Nurul & Ruksana -> Shafiqul, Nasima
  ('10000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000028', 'biological'),
  ('10000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000028', 'biological'),
  ('10000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000029', 'biological'),
  ('10000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000029', 'biological'),
  -- Shafiqul & Parveen -> Tanvir, Farzana
  ('10000000-0000-4000-8000-000000000028', '10000000-0000-4000-8000-000000000030', 'biological'),
  ('10000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000030', 'biological'),
  ('10000000-0000-4000-8000-000000000028', '10000000-0000-4000-8000-000000000031', 'biological'),
  ('10000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000031', 'biological'),
  -- Tanvir & Nusrat -> Ayan
  ('10000000-0000-4000-8000-000000000030', '10000000-0000-4000-8000-000000000032', 'biological'),
  ('10000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000032', 'biological')
) AS v (p, c, t);

-- Lineages. Fatema's lineage (B) is inserted first so it becomes her primary family.
INSERT INTO families (id, name_bn, name_en, homestead_name_bn, homestead_name_en, root_person_id, description_en) VALUES
  ('20000000-0000-4000-8000-000000000002', 'নমুনা সরকার বংশ', 'Sample Sarkar Lineage', 'নমুনা সরকার বাড়ি', 'Sample Sarkar Bari',
     '10000000-0000-4000-8000-000000000010', 'Fictional sample lineage for development.'),
  ('20000000-0000-4000-8000-000000000001', 'নমুনা মুন্সী বংশ', 'Sample Munshi Lineage', 'নমুনা মুন্সী বাড়ি', 'Sample Munshi Bari',
     '10000000-0000-4000-8000-000000000001', 'Fictional sample lineage for development.');

-- Memberships (roots were added automatically by trigger).
INSERT INTO family_members (family_id, person_id, membership_type, is_primary)
SELECT f::uuid, p::uuid, t::family_membership_type, prim FROM (VALUES
  -- Lineage B
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000011', 'lineage',  true),
  -- Lineage A: born into it
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'lineage',  true),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'lineage',  true),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'lineage',  true),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000020', 'lineage',  true),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000021', 'lineage',  true),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000022', 'lineage',  true),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000023', 'lineage',  true),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000025', 'lineage',  true),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000026', 'lineage',  true),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000027', 'lineage',  true),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000028', 'lineage',  true),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000029', 'lineage',  true),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000030', 'lineage',  true),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000031', 'lineage',  true),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000032', 'lineage',  true),
  -- Adopted into lineage A
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000024', 'adoption', true),
  -- Married into lineage A (Fatema keeps lineage B as primary)
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'marriage', true),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006', 'marriage', true),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000007', 'marriage', true),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000008', 'marriage', true),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000011', 'marriage', false),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000012', 'marriage', true),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000013', 'marriage', true),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000014', 'marriage', true)
) AS v (f, p, t, prim);

-- A sample citation.
INSERT INTO sources (id, source_type, title_bn, title_en, author, informant_person_id, source_date) VALUES
  ('40000000-0000-4000-8000-000000000001', 'oral_history',
   'নমুনা সাক্ষাৎকার: শফিকুল ইসলাম', 'Sample interview: Shafiqul Islam', 'Sample interviewer',
   '10000000-0000-4000-8000-000000000028', make_fuzzy_date('exact', 2024, 1));

INSERT INTO source_links (source_id, person_id, claim, citation_detail) VALUES
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'marriages',
   'Fictional sample citation, 00:12:30');
