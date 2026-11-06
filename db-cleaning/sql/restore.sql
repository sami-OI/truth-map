-- UNDO one run: puts back the values saved before it. In psql:
--   psql ... -v ON_ERROR_STOP=1 -v run_id=20261105-102410 -1 -f sql/restore.sql
-- (Other SQL tools: replace :'run_id' with the run_id in quotes and run inside BEGIN … COMMIT.)
UPDATE "user" u SET country = b.country, county = b.county, sub_county = b.sub_county,
                    city = b.city, other = b.other, updated_at = b.updated_at
FROM tm_clean_backup b WHERE b.run_id = :'run_id' AND u.id = b.id;
DELETE FROM tm_clean_backup WHERE run_id = :'run_id';
