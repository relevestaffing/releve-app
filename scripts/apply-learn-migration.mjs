/* One-time: applies supabase/part62-learn.sql (team trainings). Reads
   SUPABASE_DB_URL from .env.local. Safe to re-run. */
import fs from 'node:fs';
import pg from 'pg';
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const m = env.match(/^\s*SUPABASE_DB_URL\s*=\s*(.*)$/m);
if (!m) { console.error('No SUPABASE_DB_URL in .env.local'); process.exit(2); }
const conn = m[1].trim().replace(/^["']|["']$/g, '');
const sql = fs.readFileSync(new URL('../supabase/part62-learn.sql', import.meta.url), 'utf8');
const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query(sql);
  const t = await client.query("select count(*)::int n from information_schema.tables where table_name='team_trainings'");
  const p = await client.query("select count(*)::int n from pg_policies where tablename='team_trainings'");
  console.log(`team_trainings: ${t.rows[0].n === 1 ? 'present' : 'MISSING'}; policies: ${p.rows[0].n}`);
  process.exit(t.rows[0].n === 1 && p.rows[0].n >= 1 ? 0 : 1);
} catch (e) { console.error('Migration failed:', e.message); process.exit(1); }
finally { try { await client.end(); } catch {} }
