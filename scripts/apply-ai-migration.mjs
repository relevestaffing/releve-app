/* One-time: creates the assistant's two tables from supabase/part57-ai.sql.
   Reads SUPABASE_DB_URL from .env.local and applies the SQL over a direct
   Postgres connection. Run once:  npm i pg --no-save && node scripts/apply-ai-migration.mjs */
import fs from 'node:fs';
import pg from 'pg';

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const m = env.match(/^\s*SUPABASE_DB_URL\s*=\s*(.*)$/m);
if (!m) { console.error('No SUPABASE_DB_URL in .env.local'); process.exit(2); }
const conn = m[1].trim().replace(/^["']|["']$/g, '');
const sql = fs.readFileSync(new URL('../supabase/part57-ai.sql', import.meta.url), 'utf8');

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query(sql);
  const r = await client.query("select count(*)::int as n from information_schema.tables where table_name in ('ai_messages','ai_actions')");
  console.log(r.rows[0].n === 2 ? '✓ Done. ai_messages and ai_actions are ready.' : 'Ran, but the tables were not both found.');
} catch (e) {
  console.error('Migration failed:', e.message);
  process.exit(1);
} finally { try { await client.end(); } catch {} }
