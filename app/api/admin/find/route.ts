import { NextResponse } from 'next/server';
import { currentProfile, configured } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { listProspects } from '@/lib/prospects';
import { DEMO_BENCH, DEMO_EXEC } from '@/lib/demo';

/* One search for the whole console (4 November 2026). Nona: going into the
   console "feels a little bit confusing... I have to search for stuff." Type
   a name, a company, an email or an invoice number and every match comes
   back as one row that opens the record: executives, talent, leads,
   placements and invoices. Admin only; read-only; at most a handful per kind. */

export type FindHit = { kind: 'Executive' | 'Talent' | 'Lead' | 'Placement' | 'Invoice'; label: string; sub: string; href: string };

const clean = (q: string) => q.replace(/[,()%*\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

export async function GET(req: Request) {
  const me = await currentProfile();
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  if (me.role !== 'admin') return NextResponse.json({ error: 'not allowed' }, { status: 403 });
  const q = clean(new URL(req.url).searchParams.get('q') || '');
  if (q.length < 2) return NextResponse.json({ hits: [] });
  const needle = q.toLowerCase();
  const has = (...v: (string | null | undefined)[]) => v.some(x => (x || '').toLowerCase().includes(needle));

  if (!configured()) {
    const hits: FindHit[] = [];
    if (has(DEMO_EXEC.name, DEMO_EXEC.org)) hits.push({ kind: 'Executive', label: DEMO_EXEC.name, sub: DEMO_EXEC.org, href: '/console/people' });
    DEMO_BENCH.filter(t => has(t.name, t.role, t.loc)).slice(0, 6)
      .forEach(t => hits.push({ kind: 'Talent', label: t.name, sub: `${t.role} · ${t.loc}`, href: `/console/talent/${t.id}` }));
    (await listProspects()).filter(p => has(p.full_name, p.org_name, p.email)).slice(0, 6)
      .forEach(p => hits.push({ kind: 'Lead', label: p.full_name, sub: p.org_name || p.email, href: `/console/lead/${p.id}` }));
    return NextResponse.json({ hits });
  }

  const sb = adminClient();
  const like = `%${q}%`;
  const hits: FindHit[] = [];
  const [people, leads, invoicesByNumber] = await Promise.all([
    sb.from('profiles').select('id, full_name, email, role, org_name, headline')
      .in('role', ['client', 'talent'])
      .or(`full_name.ilike.${like},email.ilike.${like},org_name.ilike.${like}`).limit(10),
    sb.from('prospects').select('id, full_name, email, org_name, stage')
      .or(`full_name.ilike.${like},email.ilike.${like},org_name.ilike.${like}`).limit(6),
    sb.from('invoices').select('id, number, client_id, amount_cents, status').ilike('number', like).limit(5)
  ]);

  const ppl = people.data || [];
  ppl.forEach(p => hits.push(p.role === 'client'
    ? { kind: 'Executive', label: p.full_name || p.email, sub: p.org_name || p.email, href: `/console/executive/${p.id}` }
    : { kind: 'Talent', label: p.full_name || p.email, sub: p.headline || p.email, href: `/console/talent/${p.id}` }));
  (leads.data || []).forEach(p => hits.push({ kind: 'Lead', label: p.full_name, sub: p.org_name || p.email, href: `/console/lead/${p.id}` }));

  /* The placements and invoices of the people found, so "Marsh" finds her
     placement and her invoices as well as her. */
  const ids = ppl.map(p => p.id);
  const nameOf = new Map(ppl.map(p => [p.id, p.full_name || p.email]));
  if (ids.length) {
    const idList = ids.join(',');
    const [pl, inv] = await Promise.all([
      sb.from('placements').select('id, client_id, talent_id, ended_on')
        .or(`client_id.in.(${idList}),talent_id.in.(${idList})`).is('ended_on', null).limit(6),
      sb.from('invoices').select('id, number, client_id, amount_cents, status').in('client_id', ids)
        .order('issued_on', { ascending: false }).limit(5)
    ]);
    const others = [...new Set((pl.data || []).flatMap(p => [p.client_id, p.talent_id]).filter(id => !nameOf.has(id)))];
    if (others.length) {
      const { data } = await sb.from('profiles').select('id, full_name, email').in('id', others);
      (data || []).forEach(p => nameOf.set(p.id, p.full_name || p.email));
    }
    (pl.data || []).forEach(p => hits.push({ kind: 'Placement', label: `${nameOf.get(p.client_id) ?? 'Executive'} and ${nameOf.get(p.talent_id) ?? 'talent'}`, sub: 'Live placement', href: `/console/placements/${p.id}` }));
    const seen = new Set((invoicesByNumber.data || []).map(i => i.id));
    (inv.data || []).filter(i => !seen.has(i.id)).forEach(i => (invoicesByNumber.data || []).push(i));
  }
  (invoicesByNumber.data || []).slice(0, 6).forEach(i => hits.push({
    kind: 'Invoice', label: i.number || 'Draft invoice',
    sub: `${nameOf.get(i.client_id) ?? ''}${nameOf.has(i.client_id) ? ' · ' : ''}$${Math.round(i.amount_cents / 100).toLocaleString('en-US')} · ${i.status}`,
    href: `/console/money/invoice/${i.id}`
  }));
  return NextResponse.json({ hits });
}
