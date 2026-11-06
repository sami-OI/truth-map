// Cleans "user".country / county / sub_county / other with the rules in
// sql/clean-country-county.sql. Works on dev and production.
//
//   node clean-country-county.js                                   dry run (default): report, nothing saved
//   node clean-country-county.js --apply --confirm=<database>      apply and commit
//   node clean-country-county.js --restore=<run_id> --confirm=<database>   undo one run
//   node clean-country-county.js --runs                            list past runs
//
//   --env=<file>   read the connection from another env file, e.g. --env=.env.production
//                  (needs POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD,
//                   POSTGRES_DATABASE, optional POSTGRES_SSL=true)
//
// Safety: everything runs in ONE transaction. A dry run always rolls back. --apply and
// --restore only run when --confirm names the database you are connected to. Before any
// row changes, its old values are copied to tm_clean_backup with the run_id.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const arg = (name) => {
  const a = process.argv.find(x => x === `--${name}` || x.startsWith(`--${name}=`));
  return a === undefined ? undefined : (a.includes('=') ? a.slice(a.indexOf('=') + 1) : true);
};
// .env next to this script (hand-off folder) or in the project root
const envFile = arg('env') || [path.join(__dirname, '.env'), path.join(__dirname, '..', '.env')].find(f => fs.existsSync(f)) || '.env';
require('dotenv').config({ path: path.resolve(envFile), quiet: true });

const db = process.env.POSTGRES_DATABASE || '';
const SQL = fs.readFileSync(path.join(__dirname, 'sql', 'clean-country-county.sql'), 'utf8');
const apply = !!arg('apply'), restore = arg('restore'), runs = !!arg('runs');

function needConfirm() {
  if (arg('confirm') !== db) {
    console.error(`✗ Add --confirm=${db} to change database "${db}" on ${process.env.POSTGRES_HOST}.`);
    process.exit(1);
  }
}
if (apply || restore) needConfirm();

const client = new Client({
  host: process.env.POSTGRES_HOST, port: +(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: db,
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
const show = (v) => (v === null || v === undefined ? '∅' : `"${v}"`);

(async () => {
  await client.connect();
  const q = (s, p) => client.query(s, p);
  console.log(`Database: ${db} on ${process.env.POSTGRES_HOST}\n`);
  try {
    if (runs) {
      const has = (await q(`select to_regclass('public.tm_clean_backup') t`)).rows[0].t;
      if (!has) return console.log('No runs yet.');
      const r = await q(`select run_id, count(*) n, min(backed_up_at) at from tm_clean_backup group by run_id order by run_id`);
      r.rows.forEach(x => console.log(`  ${x.run_id}  ${String(x.n).padStart(6)} rows  ${x.at.toISOString()}`));
      return;
    }

    if (restore) {
      await q('begin');
      const r = await q(`update "user" u set country=b.country, county=b.county, sub_county=b.sub_county,
                                             city=b.city,
                                             other=b.other, updated_at=b.updated_at
                         from tm_clean_backup b where b.run_id=$1 and u.id=b.id`, [restore]);
      if (!r.rowCount) throw new Error(`no backup rows for run_id ${restore} (see --runs)`);
      await q(`delete from tm_clean_backup where run_id=$1`, [restore]);
      await q('commit');
      return console.log(`✓ Restored ${r.rowCount} users from run ${restore}.`);
    }

    await q('begin');
    const results = [].concat(await q(SQL));
    const rep = results[results.length - 1].rows[0];

    console.log(`${apply ? 'APPLY' : 'DRY RUN'}  run_id ${rep.run_id}`);
    console.log(`  Rows changed                        ${rep.rows_changed}`);
    console.log(`  A  UK schools → UK + county          ${rep.a_uk_schools}`);
    console.log(`  B  placeholders cleared              ${rep.b_placeholders}`);
    console.log(`  C  role/organisation in country      ${rep.c_country_not_a_country}`);
    console.log(`  D  Kenya county names fixed          ${rep.d_kenya_counties}`);
    console.log(`  E  schools → state/province + city   ${rep.e_schools_with_country}`);
    console.log(`  F  not a place → other               ${rep.f_not_a_place}`);

    const t = await q(`select o_country, o_county, country, county, sub_county, city, other, count(*) n
                       from tm_changed group by 1,2,3,4,5,6,7 order by n desc, 2`);
    console.log(`\nChanges (old country / county → new country / county / sub_county / city | other):`);
    t.rows.forEach(r => console.log(`  ${String(r.n).padStart(5)}  ${show(r.o_country)} / ${show(r.o_county)}  →  ` +
      `${show(r.country)} / ${show(r.county)} / ${show(r.sub_county)} / ${show(r.city)}  | ${show(r.other)}`));

    const left = await q(`select coalesce(county,'∅') county, count(*) n from "user"
                          where coalesce(lower(trim(country)),'') in ('','unknown') group by 1 order by n desc limit 15`);
    console.log(`\nStill without a country after this run (top 15 counties, not covered by the rules):`);
    left.rows.forEach(r => console.log(`  ${String(r.n).padStart(5)}  ${r.county}`));

    if (apply) {
      await q('commit');
      console.log(`\n✓ Saved. Undo with: node clean-country-county.js --restore=${rep.run_id} --confirm=${db}`);
    } else {
      await q('rollback');
      console.log(`\nDry run: nothing was saved. To apply: node clean-country-county.js --apply --confirm=${db}`);
    }
  } catch (e) {
    await q('rollback').catch(() => {});
    console.error('✗ Nothing changed:', e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
