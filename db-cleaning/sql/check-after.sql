-- Run AFTER the cleaning. In psql:  psql ... -v run_id=20261105-102410 -f sql/check-after.sql
-- (Other SQL tools: replace :'run_id' with the run_id in quotes, e.g. '20261105-102410'.)

-- 1. Rows changed by this run (must equal "Rows changed" in the report)
SELECT count(*) AS backup_rows FROM tm_clean_backup WHERE run_id = :'run_id';

-- 2. Users in total (must be the same number as before the run)
SELECT count(*) AS users_total FROM "user";

-- 3. Old text that is not kept word for word in the new county / sub_county / city / other.
--    Expected only: spelling fixes (BUSIA → Busia, SYAIA → Siaya), school-name variants,
--    "Sweden" (moved to country), and empty words (N/A, None, Other, Kenya).
SELECT b.rules, b.country AS old_country, b.county AS old_county, u.country, u.county, count(*) AS n
FROM tm_clean_backup b JOIN "user" u USING (id)
WHERE b.run_id = :'run_id' AND b.county IS NOT NULL
  AND position(lower(regexp_replace(b.county, '\s+', ' ', 'g'))
               IN lower(regexp_replace(concat_ws(' ', u.county, u.sub_county, u.city, u.other), '\s+', ' ', 'g'))) = 0
GROUP BY 1, 2, 3, 4, 5 ORDER BY 1, n DESC;

-- 4. Old and new side by side (first 200 rows)
SELECT b.id, b.rules, b.country AS old_country, u.country, b.county AS old_county, u.county,
       u.sub_county, u.city, b.other AS old_other, u.other
FROM tm_clean_backup b JOIN "user" u USING (id)
WHERE b.run_id = :'run_id' ORDER BY b.rules, b.county LIMIT 200;
