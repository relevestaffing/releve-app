/* One-time: creates the push_subscriptions table from supabase/part56-push.sql.
   Reads SUPABASE_DB_URL from .env.local and applies the SQL over a direct
   Postgres connection. Run once:  npm i pg --no-save && node scripts/apply-push-migration.mjs */
import fs from 'node:fs';
import pg from 'pg';

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const m = env.match(/^\s*SUPABASE_DB_URL\s*=\s*(.*)$/m);
if (!m) { console.error('No SUPABASE_DB_URL in .env.local'); process.exit(2); }
const conn = m[1].trim().replace(/^["']|["']$/g, '');
const sql = fs.readFileSync(new URL('../supabase/part56-push.sql', import.meta.url), 'utf8');

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query(sql);
  const r = await client.query("select count(*)::int as n from information_schema.tables where table_name = 'push_subscriptions'");
  console.log(r.rows[0].n ? '✓ Done. push_subscriptions table is ready.' : 'Ran, but the table was not found.');
} catch (e) {
  console.error('Migration failed:', e.message);
  process.exit(1);
} finally { try { await client.end(); } catch {} }
