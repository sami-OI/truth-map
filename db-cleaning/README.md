# Truth Map: clean the country / county data in production

This package fixes the location fields people typed when they registered, for example
`BUSIA` → `Busia`, a school name in "county" → `UK` + its county, and "Community Lead Trainer"
in "county" → moved to `other`. It has been tested on the dev database.

**What it changes:** only `"user".country`, `county`, `sub_county`, `city`, `other` and `updated_at`.
It never deletes a user. Text that leaves country/county is added to `other`, never thrown away.
Before any row changes, its old values are copied to a new table `tm_clean_backup`, so every run can be undone.

## What's in the folder

| File | What it is |
| --- | --- |
| `clean-country-county.js` | The runner (Node.js). Dry run by default. |
| `sql/clean-country-county.sql` | All the rules. The runner uses it; it can also be run with psql. |
| `sql/check-after.sql` | Checks to run after applying. |
| `sql/restore.sql` | Undo a run with psql. |
| `.env.example` | Template for the database connection. |
| `package.json` | Installs the two libraries the runner needs (`pg`, `dotenv`). |
| `dev/seed-dev-geo-test.js` | Dev only: fills the dev database with realistic messy values to test the cleaning. Refuses any database whose name doesn't contain "dev". Not in the hand-off zip. |

## What you need

- Access to the production PostgreSQL database with a user that can **UPDATE `"user"`** and **CREATE a table in `public`** (for `tm_clean_backup`).
- **Either** Node.js 18+ (option A, recommended) **or** `psql` (option B).
- About 10 minutes. The run itself takes seconds.

## Step 0. Take a normal backup first

Independent of the script's own backup, save the table:

```bash
pg_dump -h <host> -U <user> -d <database> -t '"user"' > user_before_clean.sql
```

Note the number of users so you can compare afterwards:

```sql
SELECT count(*) FROM "user";
```

---

## Option A: Node.js (recommended)

### 1. Set up (once)

```bash
cd db-cleaning
npm install
cp .env.example .env
```

(Inside the full repo you can skip this: the script uses the root `node_modules` and `.env`.)

Open `.env` and fill in the **production** connection. Don't share or commit this file.

### 2. Dry run (changes nothing)

```bash
node clean-country-county.js
```

It runs everything inside a transaction, prints a report, then **rolls back**. Check:

- the database name on the first line is production;
- "Rows changed" and the per-rule counts look sensible (dev has only 920 test users, so production will show many more, likely thousands);
- the "Changes" list: old value → new value for every kind of change;
- "Still without a country": values no rule covers. Send this list back so we can add rules.

Send the dry-run output to Sami before applying:

```bash
node clean-country-county.js > dry-run.txt
```

### 3. Apply

```bash
node clean-country-county.js --apply --confirm=<production database name>
```

`--confirm` must be exactly the name of the database you are connected to, otherwise it refuses.
At the end it prints **`run_id`** and the undo command. **Write the run_id down.**

### 4. Check

```bash
node clean-country-county.js              # run again: "Rows changed" must now be 0
node clean-country-county.js --runs       # lists the run and how many rows it backed up
```

Then run `sql/check-after.sql` (see "Checks" below).

### Undo, if anything is wrong

```bash
node clean-country-county.js --restore=<run_id> --confirm=<production database name>
```

---

## Option B: psql only

```bash
# connection for the commands below
export PGHOST=<host> PGPORT=5432 PGUSER=<user> PGDATABASE=<database> PGSSLMODE=require
export PGPASSWORD='<password>'

# 1. dry run: runs everything, shows the counts, then rolls back
psql -v ON_ERROR_STOP=1 -c 'BEGIN' -f sql/clean-country-county.sql -c 'ROLLBACK'

# 2. apply: the same, but COMMIT. Note the run_id in the result.
psql -v ON_ERROR_STOP=1 -c 'BEGIN' -f sql/clean-country-county.sql -c 'COMMIT'

# undo, if needed
psql -v ON_ERROR_STOP=1 -v run_id=<run_id> -1 -f sql/restore.sql
```

With psql you only get the counts, not the detailed "Changes" list. Use `check-after.sql` for the details.
If a statement fails, `ON_ERROR_STOP` stops and the transaction is not committed. Nothing changes.

---

## Checks (both options)

```bash
psql -v run_id=<run_id> -f sql/check-after.sql
```

In another SQL tool (DBeaver, pgAdmin…), replace `:'run_id'` with the run_id in quotes, e.g. `'20261105-102410'`.

| Check | Good result |
| --- | --- |
| 1. `backup_rows` | Same as "Rows changed" in the report |
| 2. `users_total` | Same as before the run. Nothing is deleted. |
| 3. Old text not kept | Only spelling fixes (`BUSIA` → `Busia`, `SYAIA` → `Siaya`), school-name variants, `Sweden`, swapped fields (`SIAYA` / `KENYA` → `Kenya` / `Siaya`) and empty words (`N/A`, `None`, `Other`, `Kenya`) |
| 4. Side by side | Spot-check a few rows of each rule |

Finally, open the Truth Map dashboard: UK should appear as a country, Kenya counties should no
longer appear twice (`BUSIA` and `Busia`), and "Unknown" should be smaller.

Keep `tm_clean_backup` for a couple of weeks. When everyone is happy: `DROP TABLE tm_clean_backup;`

## The rules, in short

| Rule | When | Result |
| --- | --- | --- |
| A | Country empty/"Unknown", a UK school in county | Country `UK`, county = the school's county/borough, school → `other` |
| B | Country empty/"Unknown", "TEST" / "county" / "Registered using personal email" in county | County cleared, text → `other`. "Sweden" → country `Sweden` |
| C | A role/organisation in country (Hub Trainer, ICT Authority, Kilimo_Hakika, Ruru), or a Kenyan county in country | Country `Kenya`, original → `other` / correct county |
| D | Kenya, county variants and sub-counties | Official county name (as in `geo_regions`); sub-county → `sub_county` if empty |
| E | Malaysia / Ecuador school in county | County = state/province, town → `city` if empty, school → `other` |
| F | A role, organisation, class name ("Form 1", "1 CEKAP"), phone number or "N/A" in county | County cleared, text → `other` ("N/A", "None", "Other" are just cleared) |

## Good to know

- **Safe to run twice.** A second run changes 0 rows.
- **One transaction.** Either everything is saved or nothing is.
- New users who register while it runs are not affected.
- `tm_clean_backup` holds the old values of changed rows (location text and `other` only, no passwords or emails). Treat it like the user table.
- Questions or anything unexpected in the dry run: stop and ask Sami before applying.
