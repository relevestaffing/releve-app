/* One-time: applies supabase/part61-studio.sql (Audit Studio + 90-Day Plan
   Studio). Reads SUPABASE_DB_URL from .env.local. Safe to re-run. */
import fs from 'node:fs';
import pg from 'pg';
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const m = env.match(/^\s*SUPABASE_DB_URL\s*=\s*(.*)$/m);
if (!m) { console.error('No SUPABASE_DB_URL in .env.local'); process.exit(2); }
const conn = m[1].trim().replace(/^["']|["']$/g, '');
const sql = fs.readFileSync(new URL('../supabase/part61-studio.sql', import.meta.url), 'utf8');
const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query(sql);
  const a = await client.query("select column_name from information_schema.columns where table_name='lead_audits' and column_name in ('chat','state','error','email')");
  const p = await client.query("select count(*)::int n from information_schema.tables where table_name='success_plans'");
  console.log(`lead_audits new columns: ${a.rows.length}/4; success_plans table: ${p.rows[0].n === 1 ? 'present' : 'MISSING'}`);
  process.exit(a.rows.length === 4 && p.rows[0].n === 1 ? 0 : 1);
} catch (e) { console.error('Migration failed:', e.message); process.exit(1); }
finally { try { await client.end(); } catch {} }
