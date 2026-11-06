-- ════════════════════════════════════════════════════════════════════════════
-- Truth Map: clean "user".country / county / sub_county / other   (PostgreSQL)
--
-- Run it INSIDE A TRANSACTION, dev first, then production (from the db-cleaning folder):
--   node clean-country-county.js              → dry run: report only, rolls back
--   node clean-country-county.js --apply --confirm=<database name>
--   or psql:  psql -v ON_ERROR_STOP=1 -c "BEGIN" -f sql/clean-country-county.sql -c "COMMIT"
--
-- Safe to re-run: rows already clean are not touched. Every changed row is first
-- copied to tm_clean_backup (with a run_id), so a run can be undone:
--   node clean-country-county.js --restore=<run_id> --confirm=<database name>
--
-- Rules (agreed November 2026):
--   A. Country "Unknown"/empty + a UK school in county  → country UK, county = the school's
--      county / London borough (UK map boundary names), school name → other
--   B. Country "Unknown"/empty + placeholder in county   → county cleared, text → other;
--      "Sweden" in county → country Sweden
--   C. A role / organisation in country                   → country Kenya, original → other
--   D. Kenya: county variants, sub-counties and typos     → official county (geo_regions
--      spelling); a sub-county moves to sub_county when that is empty
--   E. Malaysia / Ecuador: a school in county            → county = state / province,
--      town → city (when city is empty), school name → other
--   F. Any country: a role, organisation, class name or "N/A" in county → county cleared,
--      text → other (empty words like N/A are just cleared)
-- "other" is appended to ("a; b"), never overwritten, and never gets the same text twice.
-- ════════════════════════════════════════════════════════════════════════════

-- ── helpers (temporary: they disappear when the session ends) ────────────────
CREATE OR REPLACE FUNCTION pg_temp.tm_norm(t text) RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT lower(btrim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g'))) $$;

CREATE OR REPLACE FUNCTION pg_temp.tm_append(cur text, add text) RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT CASE
     WHEN add IS NULL OR btrim(add) = '' THEN cur
     WHEN cur IS NULL OR btrim(cur) = '' THEN btrim(add)
     WHEN position(lower(btrim(add)) IN lower(cur)) > 0 THEN cur
     ELSE cur || '; ' || btrim(add) END $$;

-- ── A. UK schools: typed value → (UK area, school name for "other") ──────────
CREATE TEMP TABLE tm_map_uk (raw_key text PRIMARY KEY, area text, school text) ON COMMIT DROP;
INSERT INTO tm_map_uk (raw_key, area, school) VALUES
  ('gretton school',                     'Cambridgeshire',                    'Gretton School'),
  ('ripplevale school',                  'Kent',                              'Ripplevale School'),
  ('ripplevale school rochester',        'Medway',                            'Ripplevale School Rochester'),
  ('riverston school',                   'Greenwich',                         'Riverston School'),
  ('riverstons school',                  'Greenwich',                         'Riverston School'),
  ('yarrow heights school',              'Southampton',                       'Yarrow Heights School'),
  ('abingdon house school',              'Westminster',                       'Abingdon House School'),
  ('abingdon house senior school',       'Westminster',                       'Abingdon House School'),
  ('abingdon house school purley',       'Croydon',                           'Abingdon House School Purley'),
  ('ahs purley school',                  'Croydon',                           'Abingdon House School Purley'),
  ('ahsl purley school',                 'Croydon',                           'Abingdon House School Purley'),
  ('bredon school',                      'Worcestershire',                    'Bredon School'),
  ('the holmewood school',               'Barnet',                            'The Holmewood School'),
  ('holmewood school',                   'Barnet',                            'The Holmewood School'),
  ('the holmewood school london',        'Barnet',                            'The Holmewood School'),
  ('burlington house school',            'Hammersmith and Fulham',            'Burlington House School'),
  ('dovecote school',                    'Somerset',                          'Dovecote School'),
  ('heathermount school',                'Windsor and Maidenhead',            'Heathermount School'),
  ('wilds lodge school',                 'Rutland',                           'Wilds Lodge School'),
  ('quorn hall school',                  'Leicestershire',                    'Quorn Hall School'),
  ('leith hill school',                  'Surrey',                            'Leith Hill School'),
  ('life skills enterprise school',      'Kent',                              'Life Skills Enterprise'),
  ('life skills enterprise',             'Kent',                              'Life Skills Enterprise'),
  ('lifeskills enterprise school',       'Kent',                              'Life Skills Enterprise'),
  ('life skills manor school',           'Kent',                              'Life Skills Manor'),
  ('life skills manor school for autism','Kent',                              'Life Skills Manor'),
  ('chelsea hall school',                'Wandsworth',                        'Chelsea Hall School'),
  ('the white house school',             'Bournemouth, Christchurch and Poole','The White House School'),
  ('the lion works school',              'Bournemouth, Christchurch and Poole','The Lion Works School'),
  ('hardwick house school',              'Leicestershire',                    'Hardwick House School'),
  ('light years education',              'Hampshire',                         'Light Years School'),
  ('anstey manor school',                'Hampshire',                         'Anstey Manor School'),
  ('cavendish education',                NULL,                                'Cavendish Education'),   -- the school group: UK, area unknown
  -- shorter spellings seen in the data
  ('yarrow heights',                     'Southampton',                       'Yarrow Heights School'),
  ('ripplevale rochester',               'Medway',                            'Ripplevale School Rochester'),
  ('abingdon house purley',              'Croydon',                           'Abingdon House School Purley'),
  ('bhs tooting',                        'Wandsworth',                        'BHS Tooting');           -- Tooting is in Wandsworth

-- ── E. schools typed as the county, country already right → (state/province, town) ──
--   county = first-level region (Malaysian state, Ecuadorian province); town → city if city is empty
CREATE TEMP TABLE tm_map_school (country_key text, raw_key text, county text, city text, school text,
                                 PRIMARY KEY (country_key, raw_key)) ON COMMIT DROP;
INSERT INTO tm_map_school VALUES
  ('malaysia', 'la salle school',     'Selangor',  'Klang',        'La Salle School'),
  ('malaysia', 'la salle',            'Selangor',  'Klang',        'La Salle School'),
  ('malaysia', 'smk la salle',        'Selangor',  'Klang',        'La Salle School'),
  ('malaysia', 'smk st anthony',      'Perak',     'Teluk Intan',  'SMK St Anthony'),
  ('malaysia', 'st anthony school',   'Perak',     'Teluk Intan',  'SMK St Anthony'),
  ('malaysia', 'smk st francis',      'Melaka',    'Malacca City', 'SMK St Francis'),
  ('malaysia', 'st francis school',   'Melaka',    'Malacca City', 'SMK St Francis'),
  ('ecuador',  'usfq - universidad san francisco de quito', 'Pichincha', 'Quito', 'USFQ - Universidad San Francisco de Quito');

-- ── F. not-a-place values typed as the county (any country) ─────────────────
--   to_other = keep the text in "other" (false for empty words like N/A, None, Other)
--   new_county / new_country = only where the text itself says where the person is
CREATE TEMP TABLE tm_map_nonplace (raw_key text PRIMARY KEY, to_other boolean, new_county text, new_country text) ON COMMIT DROP;
INSERT INTO tm_map_nonplace VALUES
  -- roles
  ('community lead trainer', true, NULL, NULL),
  ('british council - expert level trainer', true, NULL, NULL),
  ('chief officer, ict at the county government of busia', true, 'Busia', NULL),
  ('teacher', true, NULL, NULL),
  ('self employed', true, NULL, NULL),
  ('postgraduate', true, NULL, NULL),
  -- organisations
  ('british council', true, NULL, NULL), ('british council -', true, NULL, NULL),
  ('next step foundation', true, NULL, NULL), ('eldohub', true, NULL, NULL), ('ngao inclusive hub', true, NULL, NULL),
  ('apdk', true, NULL, NULL), ('elevateai', true, NULL, NULL), ('grajoan enterprise', true, NULL, NULL),
  ('lish ai labs', true, NULL, NULL), ('mcdn', true, NULL, NULL), ('sidp', true, NULL, NULL),
  ('tech4 inclusion africa', true, NULL, NULL), ('urevents and studios', true, NULL, NULL),
  ('actip', true, NULL, NULL), ('little star events', true, NULL, NULL), ('ict', true, NULL, NULL),
  ('walter sisulu university', true, NULL, NULL), ('tshwane university of technology', true, NULL, NULL),
  ('iie’s varsity college', true, NULL, NULL), ('iie''s varsity college', true, NULL, NULL),
  ('stadio higher education', true, NULL, NULL), ('university of kwazulu-natal', true, NULL, NULL),
  ('unisa', true, NULL, NULL), ('yovate beauty academy international', true, NULL, NULL),
  -- empty words: just cleared
  ('n/a', false, NULL, NULL), ('none', false, NULL, NULL), ('non', false, NULL, NULL), ('other', false, NULL, NULL),
  -- the country typed as the county
  ('kenya', false, NULL, 'Kenya');

-- ── C. not-a-country values typed as the country ────────────────────────────
--   county_mode: 'set' = use new_county · 'keep' = keep the typed county · 'clear' = empty it
CREATE TEMP TABLE tm_map_country (raw_key text PRIMARY KEY, new_country text, new_county text, county_mode text) ON COMMIT DROP;
INSERT INTO tm_map_country VALUES
  ('hub trainer or staff member', 'Kenya', 'Nakuru',       'set'),
  ('ict authority',               'Kenya', 'Nairobi City', 'set'),
  ('kilimo_hakika',               'Kenya', NULL,           'keep'),   -- keeps TURKANA (rule D fixes the spelling)
  ('ruru',                        'Kenya', NULL,           'clear');  -- "Riri" moves to other

-- ── D. Kenya: typed county / sub-county → (official county, sub-county) ─────
CREATE TEMP TABLE tm_map_ke (raw_key text PRIMARY KEY, county text, sub_county text) ON COMMIT DROP;
INSERT INTO tm_map_ke VALUES
  ('busia','Busia',NULL), ('teso south','Busia','Teso South'), ('nambale','Busia','Nambale'), ('teso north','Busia','Teso North'),
  ('butula','Busia','Butula'), ('bunyala','Busia','Bunyala'), ('samia','Busia','Samia'), ('funyula','Busia','Funyula'), ('teso central','Busia','Teso Central'),
  ('turkana','Turkana',NULL), ('turkana west','Turkana','Turkana West'), ('turkana central','Turkana','Turkana Central'), ('turkana south','Turkana','Turkana South'),
  ('turkana east','Turkana','Turkana East'), ('turkana north','Turkana','Turkana North'), ('loima','Turkana','Loima'),
  ('mandera','Mandera',NULL), ('mandera east','Mandera','Mandera East'), ('mandera south','Mandera','Mandera South'), ('mandera north','Mandera','Mandera North'),
  ('mandera west','Mandera','Mandera West'), ('banisa','Mandera','Banissa'), ('banissa','Mandera','Banissa'), ('kutulo','Mandera','Kutulo'),
  ('mandera central','Mandera','Mandera Central'), ('lafey','Mandera','Lafey'),
  ('wajir','Wajir',NULL), ('wajir east','Wajir','Wajir East'), ('eldas','Wajir','Eldas'), ('tarbaj','Wajir','Tarbaj'),
  ('wajir north','Wajir','Wajir North'), ('wajir south','Wajir','Wajir South'), ('wajir west','Wajir','Wajir West'),
  ('garissa','Garissa',NULL), ('garissa township','Garissa','Garissa Township'), ('dadaab','Garissa','Dadaab'), ('fafi','Garissa','Fafi'),
  ('balambala','Garissa','Balambala'), ('ijara','Garissa','Ijara'),
  ('siaya','Siaya',NULL), ('syaia','Siaya',NULL), ('siaya county resident','Siaya',NULL), ('bondo','Siaya','Bondo'), ('gem','Siaya','Gem'),
  ('alego usonga','Siaya','Alego Usonga'), ('rarieda','Siaya','Rarieda'), ('ugenya','Siaya','Ugenya'), ('ugunja','Siaya','Ugunja'),
  ('samburu','Samburu',NULL), ('samburu east','Samburu','Samburu East'), ('samburu north','Samburu','Samburu North'),
  ('isiolo','Isiolo',NULL), ('isiolo north','Isiolo','Isiolo North'), ('isiolo south','Isiolo','Isiolo South'), ('garbatulla','Isiolo','Garbatulla'),
  ('elgeyo/marakwet','Elgeyo/Marakwet',NULL), ('elgeyo-marakwet','Elgeyo/Marakwet',NULL), ('elgeyo marakwet','Elgeyo/Marakwet',NULL),
  ('elgeomarakwet','Elgeyo/Marakwet',NULL), ('keiyo north','Elgeyo/Marakwet','Keiyo North'), ('keiyo south','Elgeyo/Marakwet','Keiyo South'),
  ('marakwet east','Elgeyo/Marakwet','Marakwet East'), ('marakwet west','Elgeyo/Marakwet','Marakwet West'),
  ('marsabit','Marsabit',NULL), ('north horr','Marsabit','North Horr'), ('laisamis','Marsabit','Laisamis'), ('saku','Marsabit','Saku'),
  ('nairobi','Nairobi City',NULL), ('nairobi city','Nairobi City',NULL), ('nairobi city county','Nairobi City',NULL),
  ('nairobits','Nairobi City',NULL),   -- an organisation in Nairobi: "Nairobits" also goes to other
  ('kisumu','Kisumu',NULL),
  ('tana river','Tana River',NULL), ('garsen','Tana River','Garsen'), ('galole','Tana River','Galole'), ('tana delta','Tana River','Tana Delta'),
  ('nakuru','Nakuru',NULL);

-- ── working copy: rules run here first, "user" is only updated at the end ───
CREATE TEMP TABLE tm_work ON COMMIT DROP AS
  SELECT id, country, county, sub_county, city, other,
         country AS o_country, county AS o_county, sub_county AS o_sub_county, city AS o_city, other AS o_other,
         ''::text AS rules
  FROM "user";
CREATE INDEX ON tm_work (id);

-- A. UK schools under an unknown country
UPDATE tm_work w SET country = 'UK', county = m.area, other = pg_temp.tm_append(w.other, m.school), rules = rules || 'A '
FROM tm_map_uk m
WHERE pg_temp.tm_norm(w.country) IN ('', 'unknown') AND pg_temp.tm_norm(w.county) = m.raw_key;

-- B. placeholders under an unknown country
UPDATE tm_work w SET other = pg_temp.tm_append(w.other, w.county), county = NULL, rules = rules || 'B '
WHERE pg_temp.tm_norm(w.country) IN ('', 'unknown')
  AND pg_temp.tm_norm(w.county) IN ('registered using personal email', 'county', 'test');
UPDATE tm_work w SET country = 'Sweden', county = NULL, rules = rules || 'B '
WHERE pg_temp.tm_norm(w.country) IN ('', 'unknown') AND pg_temp.tm_norm(w.county) = 'sweden';

-- E. schools typed as the county (Malaysia, Ecuador)
UPDATE tm_work w SET
    county = m.county,
    city   = CASE WHEN w.city IS NULL OR btrim(w.city) = '' THEN m.city ELSE w.city END,
    other  = pg_temp.tm_append(w.other, m.school),
    rules  = rules || 'E '
FROM tm_map_school m
WHERE pg_temp.tm_norm(w.country) = m.country_key AND pg_temp.tm_norm(w.county) = m.raw_key;

-- C. roles / organisations typed as the country
UPDATE tm_work w SET
    other   = pg_temp.tm_append(pg_temp.tm_append(w.other, w.country), CASE WHEN m.county_mode = 'clear' THEN w.county END),
    county  = CASE m.county_mode WHEN 'set' THEN m.new_county WHEN 'clear' THEN NULL ELSE w.county END,
    country = m.new_country,
    rules   = rules || 'C '
FROM tm_map_country m
WHERE pg_temp.tm_norm(w.country) = m.raw_key;

-- C. a Kenyan county typed as the country ("SIAYA" / "KENYA", "Wajir" / "Mandera") →
--    country Kenya; the county becomes the typed county, or the country text if county
--    is empty / "Kenya" / the same. Rule D then fixes the spelling.
UPDATE tm_work w SET
    other   = CASE WHEN pg_temp.tm_norm(w.county) NOT IN ('', 'kenya', pg_temp.tm_norm(w.country))
                   THEN pg_temp.tm_append(w.other, w.country) ELSE w.other END,
    county  = CASE WHEN pg_temp.tm_norm(w.county) IN ('', 'kenya') THEN w.country ELSE w.county END,
    country = 'Kenya',
    rules   = rules || 'C '
FROM tm_map_ke m
WHERE pg_temp.tm_norm(w.country) = m.raw_key AND m.sub_county IS NULL;

-- F. not-a-place values in county → other (runs after C, so C's own counties win)
UPDATE tm_work w SET
    other   = CASE WHEN m.to_other THEN pg_temp.tm_append(w.other, w.county) ELSE w.other END,
    county  = m.new_county,
    country = CASE WHEN m.new_country IS NOT NULL AND pg_temp.tm_norm(w.country) IN ('', 'unknown')
                   THEN m.new_country ELSE w.country END,
    rules   = rules || 'F '
FROM tm_map_nonplace m
WHERE pg_temp.tm_norm(w.county) = m.raw_key;

-- F. a phone number typed as the county (only digits, spaces, + or -) → other
UPDATE tm_work w SET other = pg_temp.tm_append(w.other, w.county), county = NULL, rules = rules || 'F '
WHERE btrim(coalesce(w.county, '')) ~ '^\+?[0-9][0-9 -]{7,}$';

-- F. class / year names (Malaysia "Form 1", "1 CEKAP"; India "Year 2") → other
UPDATE tm_work w SET other = pg_temp.tm_append(w.other, w.county), county = NULL, rules = rules || 'F '
WHERE pg_temp.tm_norm(w.county) ~ '^(form [0-9]+|year [0-9]+|[0-9]+ (cekap|etika|luhur|usaha))$';

-- D. Kenyan county variants → official county (+ sub-county)
UPDATE tm_work w SET
    other      = CASE WHEN pg_temp.tm_norm(w.county) = 'nairobits' THEN pg_temp.tm_append(w.other, 'Nairobits') ELSE w.other END,
    sub_county = CASE WHEN m.sub_county IS NOT NULL AND (w.sub_county IS NULL OR btrim(w.sub_county) = '') THEN m.sub_county ELSE w.sub_county END,
    county     = m.county,
    rules      = rules || 'D '
FROM tm_map_ke m
WHERE pg_temp.tm_norm(w.country) = 'kenya' AND pg_temp.tm_norm(w.county) = m.raw_key
  AND (w.county IS DISTINCT FROM m.county
       OR (m.sub_county IS NOT NULL AND (w.sub_county IS NULL OR btrim(w.sub_county) = ''))
       OR pg_temp.tm_norm(w.county) = 'nairobits');

-- ── back up, then apply only the rows that actually change ──────────────────
CREATE TABLE IF NOT EXISTS tm_clean_backup (
  run_id text NOT NULL, id integer NOT NULL,
  country varchar, county varchar, sub_county varchar, other varchar, updated_at timestamptz,
  rules text, backed_up_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tm_clean_backup ADD COLUMN IF NOT EXISTS city varchar;

CREATE TEMP TABLE tm_changed ON COMMIT DROP AS
  SELECT * FROM tm_work
  WHERE country IS DISTINCT FROM o_country OR county IS DISTINCT FROM o_county
     OR sub_county IS DISTINCT FROM o_sub_county OR city IS DISTINCT FROM o_city
     OR other IS DISTINCT FROM o_other;

INSERT INTO tm_clean_backup (run_id, id, country, county, sub_county, city, other, updated_at, rules)
SELECT to_char(now(), 'YYYYMMDD-HH24MISS'), u.id, u.country, u.county, u.sub_county, u.city, u.other, u.updated_at, btrim(c.rules)
FROM "user" u JOIN tm_changed c ON c.id = u.id;

UPDATE "user" u SET country = c.country, county = c.county, sub_county = c.sub_county, city = c.city,
                    other = c.other, updated_at = now()
FROM tm_changed c WHERE u.id = c.id;

-- ── report (shown by psql; the Node runner prints its own) ──────────────────
SELECT to_char(now(), 'YYYYMMDD-HH24MISS') AS run_id,
       count(*) AS rows_changed,
       count(*) FILTER (WHERE rules LIKE '%A%') AS a_uk_schools,
       count(*) FILTER (WHERE rules LIKE '%B%') AS b_placeholders,
       count(*) FILTER (WHERE rules LIKE '%C%') AS c_country_not_a_country,
       count(*) FILTER (WHERE rules LIKE '%D%') AS d_kenya_counties,
       count(*) FILTER (WHERE rules LIKE '%E%') AS e_schools_with_country,
       count(*) FILTER (WHERE rules LIKE '%F%') AS f_not_a_place
FROM tm_changed;
