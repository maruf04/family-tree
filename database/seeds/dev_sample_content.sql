-- =============================================================================
-- FICTIONAL SAMPLE CONTENT for history, directory, community and affairs.
-- Development only. Load after dev_sample_genealogy.sql. Nothing here is real
-- village history; the village is called "নমুনা গ্রাম / Sample Village".
-- =============================================================================

SELECT set_config('app.user_id', '90000000-0000-4000-8000-000000000001', true);

-- Databases seeded before the moderator account existed get it here.
INSERT INTO users (id, email, display_name_bn, display_name_en, role, membership_status, verified_at) VALUES
  ('90000000-0000-4000-8000-000000000004', 'moderator@example.test', 'নমুনা মডারেটর', 'Sample Moderator', 'moderator', 'verified', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO village_profile (name_bn, name_en, tagline_bn, tagline_en, introduction_bn, introduction_en,
                             established, union_name, upazila, district, latitude, longitude) VALUES
  ('নমুনা গ্রাম', 'Sample Village',
   'শিকড়ের খোঁজে, একসাথে', 'Finding our roots, together',
   'এটি একটি কাল্পনিক নমুনা গ্রাম, যা শুধু প্ল্যাটফর্মটি দেখানোর জন্য তৈরি। আসল গ্রামের ইতিহাস, পরিবার ও ছবি এখানে যোগ করা হবে। নদীর ধারে সবুজ মাঠ, পুকুর আর বাড়ির উঠোনে বেড়ে ওঠা কয়েক প্রজন্মের গল্প সংরক্ষণ করাই এই প্ল্যাটফর্মের উদ্দেশ্য।',
   'This is a fictional sample village created only to demonstrate the platform. The real village''s history, families and photographs will be added here. The aim is to preserve the stories of generations who grew up among green fields, ponds and courtyards by the river.',
   make_fuzzy_date('about', 1820), 'নমুনা ইউনিয়ন', 'নমুনা উপজেলা', 'নমুনা জেলা', 24.250000, 89.920000);

INSERT INTO history_articles (category, title_bn, title_en, summary_bn, summary_en, body_bn, body_en, sort_order) VALUES
  ('origin', 'গ্রামের গোড়াপত্তন (নমুনা)', 'How the village began (sample)',
   'নদীর চরে কয়েকটি পরিবারের বসতি থেকে গ্রামের শুরু - একটি কাল্পনিক উদাহরণ।',
   'A fictional example: the village grew from a few families settling on a river char.',
   'আনুমানিক ১৮২০ সালের দিকে নদীর চরে কয়েকটি কৃষক পরিবার বসতি গড়ে তোলে - এটি একটি নমুনা লেখা। আসল ইতিহাস প্রবীণদের সাক্ষাৎকার, দলিল ও পারিবারিক নথি থেকে সংগ্রহ করে এখানে লেখা হবে, প্রতিটি তথ্যের সূত্রসহ।',
   'Around 1820 a few farming families settled on a river char - this is sample text. The real history will be gathered from interviews with elders, deeds and family records, and written here with a source for every claim.', 1),
  ('culture', 'নবান্ন ও পিঠা উৎসব (নমুনা)', 'Nabanna and the pitha festival (sample)',
   'হেমন্তে নতুন ধান ঘরে তোলার উৎসব।', 'The autumn festival of the new rice harvest.',
   'অগ্রহায়ণে নতুন ধান উঠলে বাড়িতে বাড়িতে পিঠা-পায়েস তৈরি হয়। এই অংশে গ্রামের নিজস্ব রীতি, গান ও খাবারের বর্ণনা যোগ করা যাবে।',
   'When the new rice is harvested in Agrahayan, every household makes pitha and payesh. This section can describe the village''s own customs, songs and food.', 2),
  ('lifestyle', 'উঠোন, পুকুর আর বাড়ি (নমুনা)', 'Courtyards, ponds and baris (sample)',
   'বাড়িকেন্দ্রিক যৌথ পরিবারের জীবনযাত্রা।', 'Life in the joint-family homestead.',
   'একটি বাড়িতে কয়েক ভাইয়ের পরিবার উঠোন ঘিরে বসবাস করত। পুকুর, গোলাঘর ও বৈঠকখানা ছিল দৈনন্দিন জীবনের কেন্দ্র।',
   'Several brothers'' families lived around one courtyard. The pond, granary and baithak-khana were the centre of daily life.', 3);

INSERT INTO historical_events (category, title_bn, title_en, description_bn, description_en, event_date, is_featured) VALUES
  ('founding', 'প্রথম বসতি (নমুনা)', 'First settlement (sample)',
   'নদীর চরে প্রথম কয়েকটি পরিবারের বসতি।', 'The first families settle on the river char.',
   make_fuzzy_date('about', 1820), true),
  ('religious', 'জামে মসজিদ প্রতিষ্ঠা (নমুনা)', 'Jame mosque founded (sample)', NULL, NULL,
   make_fuzzy_date('between', 1860, NULL, NULL, 1870), true),
  ('education', 'প্রথম পাঠশালা (নমুনা)', 'First village school (sample)', NULL, NULL,
   make_fuzzy_date('exact', 1912), true),
  ('war', 'মহান মুক্তিযুদ্ধ', 'Liberation War of Bangladesh',
   'গ্রামের মানুষের অভিজ্ঞতা সংগ্রহ করে এখানে যোগ করা হবে।', 'Villagers'' experiences will be collected and added here.',
   make_fuzzy_date('between', 1971, 3, 26, 1971, 12, 16), true),
  ('infrastructure', 'বিদ্যুৎ সংযোগ (নমুনা)', 'Electricity arrives (sample)', NULL, NULL,
   make_fuzzy_date('exact', 1998), true),
  ('infrastructure', 'পাকা রাস্তা ও সেতু (নমুনা)', 'Paved road and bridge (sample)', NULL, NULL,
   make_fuzzy_date('exact', 2016, 6), false);

INSERT INTO oral_histories (title_bn, title_en, narrator_person_id, interviewer, recorded_date, summary_bn, summary_en) VALUES
  ('দাদার মুখে শোনা গল্প (নমুনা)', 'Stories from grandfather (sample)',
   '10000000-0000-4000-8000-000000000028', 'নমুনা সাক্ষাৎকারগ্রহীতা', make_fuzzy_date('exact', 2024, 1),
   'পরিবারের তিন প্রজন্মের স্মৃতিচারণ - একটি কাল্পনিক উদাহরণ।', 'Memories of three generations of the family - a fictional example.');

INSERT INTO historical_documents (document_type, title_bn, title_en, description_bn, description_en, document_date, repository) VALUES
  ('land_deed', 'পুরোনো জমির দলিল (নমুনা)', 'Old land deed (sample)',
   'দলিলের স্ক্যান আপলোড করলে এখানে দেখা যাবে।', 'Upload a scan of the deed to show it here.',
   make_fuzzy_date('about', 1905), 'পারিবারিক সংগ্রহ');

-- Directory (coordinates around the sample village centre)
INSERT INTO places (id, place_type, name_bn, name_en, description_bn, latitude, longitude, family_id) VALUES
  ('50000000-0000-4000-8000-000000000001', 'mosque',    'নমুনা জামে মসজিদ',        'Sample Jame Mosque',        NULL, 24.2512, 89.9188, NULL),
  ('50000000-0000-4000-8000-000000000002', 'school',    'নমুনা সরকারি প্রাথমিক বিদ্যালয়', 'Sample Govt Primary School', NULL, 24.2489, 89.9221, NULL),
  ('50000000-0000-4000-8000-000000000003', 'market',    'নমুনা হাট (শনি ও মঙ্গলবার)', 'Sample Haat (Sat & Tue)',   NULL, 24.2530, 89.9245, NULL),
  ('50000000-0000-4000-8000-000000000004', 'homestead', 'নমুনা মুন্সী বাড়ি',       'Sample Munshi Bari',        NULL, 24.2471, 89.9172, '20000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000005', 'homestead', 'নমুনা সরকার বাড়ি',        'Sample Sarkar Bari',        NULL, 24.2458, 89.9230, '20000000-0000-4000-8000-000000000002'),
  ('50000000-0000-4000-8000-000000000006', 'pond',      'বড় পুকুর',               'Big Pond',                  NULL, 24.2495, 89.9195, NULL),
  ('50000000-0000-4000-8000-000000000007', 'graveyard', 'পারিবারিক কবরস্থান',       'Family graveyard',          NULL, 24.2465, 89.9150, NULL),
  ('50000000-0000-4000-8000-000000000008', 'health',    'কমিউনিটি ক্লিনিক',        'Community clinic',          NULL, 24.2520, 89.9262, NULL);

INSERT INTO institutions (institution_type, name_bn, name_en, description_bn, established, place_id) VALUES
  ('mosque', 'নমুনা জামে মসজিদ', 'Sample Jame Mosque', 'গ্রামের প্রধান মসজিদ।', make_fuzzy_date('between', 1860, NULL, NULL, 1870), '50000000-0000-4000-8000-000000000001'),
  ('primary_school', 'নমুনা সরকারি প্রাথমিক বিদ্যালয়', 'Sample Govt Primary School', NULL, make_fuzzy_date('exact', 1912), '50000000-0000-4000-8000-000000000002'),
  ('clinic', 'কমিউনিটি ক্লিনিক', 'Community clinic', NULL, make_fuzzy_date('exact', 2011), '50000000-0000-4000-8000-000000000008'),
  ('club', 'নমুনা যুব সংঘ', 'Sample Youth Club', 'খেলাধুলা ও সমাজসেবা।', make_fuzzy_date('exact', 1985), NULL);

INSERT INTO businesses (business_type, name_bn, name_en, description_bn, owner_person_id, opening_hours, place_id) VALUES
  ('grocery', 'নমুনা মুদি দোকান', 'Sample Grocery', 'চাল, ডাল, তেল, নিত্যপ্রয়োজনীয় পণ্য।', '10000000-0000-4000-8000-000000000030', 'সকাল ৭টা - রাত ১০টা', '50000000-0000-4000-8000-000000000003'),
  ('pharmacy', 'নমুনা ফার্মেসি', 'Sample Pharmacy', NULL, NULL, 'সকাল ৮টা - রাত ১১টা', '50000000-0000-4000-8000-000000000003'),
  ('fishery', 'বড় পুকুর মৎস্য খামার', 'Big Pond Fish Farm', NULL, '10000000-0000-4000-8000-000000000028', NULL, '50000000-0000-4000-8000-000000000006');

-- Community
INSERT INTO groups (id, name_bn, name_en, description_bn, created_by) VALUES
  ('60000000-0000-4000-8000-000000000001', 'প্রবাসী গ্রামবাসী', 'Villagers abroad', 'দেশের বাইরে থাকা গ্রামবাসীদের আড্ডা।', '90000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000002', 'কৃষি পরামর্শ', 'Farming advice', 'চাষাবাদ, বীজ ও সার নিয়ে আলোচনা।', '90000000-0000-4000-8000-000000000004');

INSERT INTO group_members (group_id, user_id, role) VALUES
  ('60000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000003', 'admin'),
  ('60000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000004', 'admin'),
  ('60000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000003', 'member');

INSERT INTO posts (id, author_id, post_type, title, body, price_bdt, created_at) VALUES
  ('70000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000003', 'discussion',
   'পুরোনো ছবি খুঁজছি', 'কারো কাছে কি আমাদের বাড়ির ১৯৬০-৭০ সালের কোনো ছবি আছে? পারিবারিক ইতিহাসে যোগ করতে চাই। (নমুনা পোস্ট)', NULL, now() - interval '2 hours'),
  ('70000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000004', 'achievement',
   'এসএসসিতে জিপিএ ৫!', 'আমাদের গ্রামের তিনজন শিক্ষার্থী এবার জিপিএ ৫ পেয়েছে। সবাইকে অভিনন্দন! (নমুনা পোস্ট)', NULL, now() - interval '1 day'),
  ('70000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000003', 'buy_sell',
   'গাভী বিক্রি হবে', 'দুধেল দেশি গাভী বিক্রি হবে। যোগাযোগ করুন। (নমুনা পোস্ট)', 85000, now() - interval '3 days'),
  ('70000000-0000-4000-8000-000000000004', '90000000-0000-4000-8000-000000000003', 'help_request',
   'রক্ত প্রয়োজন', 'জেলা হাসপাতালে বি+ রক্ত প্রয়োজন। (নমুনা পোস্ট)', NULL, now() - interval '5 days');

INSERT INTO comments (post_id, author_id, body) VALUES
  ('70000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000004', 'আমার নানার কাছে কয়েকটা আছে, স্ক্যান করে দেব।'),
  ('70000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000003', 'অভিনন্দন সবাইকে!');

INSERT INTO reactions (user_id, post_id, reaction) VALUES
  ('90000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000002', 'celebrate'),
  ('90000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002', 'love'),
  ('90000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000001', 'like');

INSERT INTO events (title_bn, title_en, description_bn, starts_at, ends_at, location_text, place_id, organizer_id) VALUES
  ('বার্ষিক ক্রীড়া প্রতিযোগিতা (নমুনা)', 'Annual sports day (sample)', 'বিদ্যালয় মাঠে সারাদিনের আয়োজন।',
   date_trunc('day', now()) + interval '12 days 9 hours', date_trunc('day', now()) + interval '12 days 17 hours',
   'বিদ্যালয় মাঠ', '50000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000004'),
  ('পারিবারিক ইতিহাস সংগ্রহ সভা (নমুনা)', 'Family history collection meeting (sample)', 'প্রবীণদের কাছ থেকে গল্প ও ছবি সংগ্রহ।',
   date_trunc('day', now()) + interval '20 days 16 hours', NULL,
   'নমুনা মুন্সী বাড়ি', '50000000-0000-4000-8000-000000000004', '90000000-0000-4000-8000-000000000001');

-- Affairs
INSERT INTO news_articles (category_id, title_bn, title_en, summary_bn, body_bn, author_id, status, is_featured, submitted_at, published_at, reviewed_by)
SELECT c.id, v.title_bn, v.title_en, v.summary_bn, v.body_bn, '90000000-0000-4000-8000-000000000004'::uuid,
       v.status::news_status, v.featured, now() - v.age, CASE WHEN v.status = 'published' THEN now() - v.age END,
       CASE WHEN v.status = 'published' THEN '90000000-0000-4000-8000-000000000001'::uuid END
FROM (VALUES
  ('infrastructure', 'নতুন কালভার্ট নির্মাণ শুরু (নমুনা)', 'Construction of new culvert begins (sample)',
   'বর্ষায় জলাবদ্ধতা কমাতে খালের ওপর কালভার্ট।', 'বর্ষাকালে পূর্বপাড়ার রাস্তায় পানি জমে থাকার সমস্যা সমাধানে খালের ওপর নতুন কালভার্ট নির্মাণ শুরু হয়েছে। (নমুনা সংবাদ)',
   'published', true, interval '1 day'),
  ('government', 'বয়স্ক ভাতার তালিকা হালনাগাদ (নমুনা)', 'Old-age allowance list updated (sample)',
   'ইউনিয়ন পরিষদে আবেদন জমা দেওয়া যাবে।', 'যোগ্য বয়স্ক নাগরিকরা ইউনিয়ন পরিষদে আবেদন জমা দিতে পারবেন। (নমুনা সংবাদ)',
   'published', false, interval '4 days'),
  ('problems', 'হাটের রাস্তায় খানাখন্দ (নমুনা)', 'Potholes on the market road (sample)',
   'মেরামতের দাবি গ্রামবাসীর।', 'হাটে যাওয়ার রাস্তায় বড় গর্ত তৈরি হয়েছে, দ্রুত মেরামতের দাবি জানিয়েছেন গ্রামবাসী। (নমুনা সংবাদ)',
   'published', false, interval '7 days'),
  ('local', 'পুকুর পরিষ্কার অভিযান (নমুনা)', 'Pond clean-up drive (sample)',
   'যুব সংঘের উদ্যোগ।', 'আগামী শুক্রবার যুব সংঘের উদ্যোগে বড় পুকুর পরিষ্কার করা হবে। (নমুনা, অনুমোদনের অপেক্ষায়)',
   'submitted', false, interval '3 hours')
) AS v (slug, title_bn, title_en, summary_bn, body_bn, status, featured, age)
JOIN news_categories c ON c.slug = v.slug;

INSERT INTO announcements (title_bn, title_en, body_bn, body_en, priority, expires_at) VALUES
  ('এটি একটি নমুনা প্ল্যাটফর্ম', 'This is a sample platform',
   'এখানে দেখানো সব গ্রাম, পরিবার ও ঘটনা কাল্পনিক। আসল তথ্য যোগ করার আগে নমুনা ডেটা মুছে ফেলা হবে।',
   'All villages, families and events shown here are fictional. Sample data will be removed before real data is added.',
   'important', now() + interval '365 days');
