/* One-time: applies supabase/part63-talent-hours.sql (role size on the
   talent side of an offer). Reads SUPABASE_DB_URL from .env.local. Safe to re-run. */
import fs from 'node:fs';
import pg from 'pg';
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const m = env.match(/^\s*SUPABASE_DB_URL\s*=\s*(.*)$/m);
if (!m) { console.error('No SUPABASE_DB_URL in .env.local'); process.exit(2); }
const conn = m[1].trim().replace(/^["']|["']$/g, '');
const sql = fs.readFileSync(new URL('../supabase/part63-talent-hours.sql', import.meta.url), 'utf8');
const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query(sql);
  const c = await client.query("select count(*)::int n from information_schema.columns where table_name='offers' and column_name='talent_hours'");
  const v = await client.query("select count(*)::int n from information_schema.columns where table_name='my_offer_talent' and column_name='talent_hours'");
  const leak = await client.query("select count(*)::int n from information_schema.columns where table_name='my_offer_client' and column_name='talent_hours'");
  console.log(`offers.talent_hours: ${c.rows[0].n ? 'present' : 'MISSING'}; talent view: ${v.rows[0].n ? 'yes' : 'no'}; client view: ${leak.rows[0].n ? 'LEAK' : 'not shown'}`);
  process.exit(c.rows[0].n && v.rows[0].n && !leak.rows[0].n ? 0 : 1);
} catch (e) { console.error('Migration failed:', e.message); process.exit(1); }
finally { try { await client.end(); } catch {} }
