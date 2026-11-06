// Fills DEV users that have no country with the real messy country/county values
// from the live Truth Map API, so the data-cleaning process can be tested.
//
//   node db-cleaning/dev/seed-dev-geo-test.js <pairs.json>     seed (backs up first)
//   node db-cleaning/dev/seed-dev-geo-test.js --restore         put the original values back
//
// <pairs.json> = [{country, county, n}] — every country/county combination from the
// API with its learner count. Each combination is used at least once; the remaining
// rows follow the real proportions. Only "user".country and "user".county change.
// "Unknown" countries and blank counties are stored as NULL (how a missing value looks).
//
// Safety: refuses to run unless POSTGRES_DATABASE contains "dev"; everything runs in
// one transaction; the original values are saved to tm_backup_user_geo first.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });
const { Client } = require('pg');

const BACKUP = 'tm_backup_user_geo';
const db = process.env.POSTGRES_DATABASE || '';
if (!/dev/i.test(db)) { console.error(`✗ Refusing: database "${db}" is not a dev database.`); process.exit(1); }

const client = new Client({
  host: process.env.POSTGRES_HOST, port: +(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: db,
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// largest-remainder allocation: every pair once, the rest proportional to n
function allocate(pairs, slots) {
  const base = pairs.map(p => ({ ...p, k: 1 }));
  let left = slots - base.length;
  if (left < 0) throw new Error(`${pairs.length} combinations don't fit in ${slots} rows`);
  const total = pairs.reduce((a, p) => a + p.n, 0);
  const share = base.map(p => ({ p, exact: (p.n / total) * left }));
  share.forEach(s => { const f = Math.floor(s.exact); s.p.k += f; left -= f; });
  share.sort((a, b) => (b.exact % 1) - (a.exact % 1)).slice(0, left).forEach(s => { s.p.k += 1; });
  return base;
}

(async () => {
  await client.connect();
  const q = (s, p) => client.query(s, p);
  try {
    if (process.argv[2] === '--restore') {
      const has = (await q(`select to_regclass('public.${BACKUP}') t`)).rows[0].t;
      if (!has) throw new Error('no backup table found, nothing to restore');
      await q('begin');
      const r = await q(`update "user" u set country=b.country, county=b.county, sub_county=b.sub_county from ${BACKUP} b where u.id=b.id`);
      await q('commit');
      console.log(`✓ Restored ${r.rowCount} users from ${BACKUP}. Drop it when happy: DROP TABLE ${BACKUP};`);
      return;
    }
    const file = process.argv[2];
    if (!file) throw new Error('usage: node db-cleaning/dev/seed-dev-geo-test.js <pairs.json> | --restore');
    const pairs = JSON.parse(fs.readFileSync(file, 'utf8'));

    await q('begin');
    if ((await q(`select to_regclass('public.${BACKUP}') t`)).rows[0].t) throw new Error(`${BACKUP} already exists: restore or drop it first`);
    const targets = (await q(`select id from "user" where country is null or trim(country)='' order by id`)).rows.map(r => r.id);
    await q(`create table ${BACKUP} as select id, country, county, sub_county, now() as backed_up_at from "user" where id = any($1)`, [targets]);

    const alloc = allocate(pairs, targets.length);
    const rows = alloc.flatMap(p => Array.from({ length: p.k }, () => [
      /^unknown$/i.test(String(p.country || '').trim()) ? null : p.country,
      p.county && String(p.county).trim() ? p.county : null,
    ]));
    // deterministic shuffle so values are spread across the id range
    let seed = 20261105; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }

    const ids = targets, countries = rows.map(r => r[0]), counties = rows.map(r => r[1]);
    const upd = await q(`update "user" u set country=s.country, county=s.county
                         from unnest($1::int[], $2::varchar[], $3::varchar[]) as s(id, country, county) where u.id=s.id`,
                        [ids, countries, counties]);
    if (upd.rowCount !== targets.length) throw new Error(`updated ${upd.rowCount}, expected ${targets.length}`);
    await q('commit');
    console.log(`✓ Backed up and updated ${upd.rowCount} users (${pairs.length} country/county combinations).`);
    console.log(`  Undo: node db-cleaning/dev/seed-dev-geo-test.js --restore`);
  } catch (e) {
    await q('rollback').catch(() => {});
    console.error('✗ Nothing changed:', e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
