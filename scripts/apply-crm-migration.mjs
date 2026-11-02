/* One-time: creates the Directory history (part 59) from
   supabase/part59-crm-activity.sql. Reads SUPABASE_DB_URL from .env.local and
   applies the SQL over a direct Postgres connection. Run once:
   npm i pg --no-save && node scripts/apply-crm-migration.mjs */
import fs from 'node:fs';
import pg from 'pg';

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const m = env.match(/^\s*SUPABASE_DB_URL\s*=\s*(.*)$/m);
if (!m) { console.error('No SUPABASE_DB_URL in .env.local'); process.exit(2); }
const conn = m[1].trim().replace(/^["']|["']$/g, '');
const sql = fs.readFileSync(new URL('../supabase/part59-crm-activity.sql', import.meta.url), 'utf8');

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query(sql);
  const r = await client.query("select count(*)::int as n from information_schema.tables where table_name = 'crm_activity'");
  const c = await client.query("select count(*)::int as n from information_schema.columns where table_name = 'prospects' and column_name = 'stage_changed_at'");
  console.log(r.rows[0].n === 1 && c.rows[0].n === 1
    ? '✓ Done. The Directory history is ready: crm_activity, and leads now know how long they have sat in a stage.'
    : 'Ran, but crm_activity or stage_changed_at was not found.');
} catch (e) {
  console.error('Migration failed:', e.message);
  process.exit(1);
} finally { try { await client.end(); } catch {} }
