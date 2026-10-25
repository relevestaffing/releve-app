import Link from 'next/link';
import Files from '@/components/Files';
import { listDocuments } from '@/lib/documents';
import { redirect, notFound } from 'next/navigation';
import { currentProfile } from '@/lib/supabase/server';
import { listClients, getSearch, getSelfProfile, getAvailability } from '@/lib/store';
import { signatureOf, archetype } from '@/lib/data';
import { listInvoicesFor } from '@/lib/money';
import { listAllPlacements } from '@/lib/work';
import { getClientAgreement } from '@/lib/agreement';
import { money, INVOICE_STATUS } from '@/lib/money-public';
import { fmtDate, zoneLabel } from '@/lib/words';
import Shell from '@/components/Shell';

export const metadata = { title: 'Executive' };

export const dynamic = 'force-dynamic';

const AGREEMENT_WORDS: Record<string, string> = {
  not_started: 'Not started', submitted: 'Signed, with Relève to countersign',
  verified: 'Signed and filed', rejected: 'Needs another look'
};

/* The executive's record (Sage, 25 October 2026).
   ----------------------------------------------
   A talent has had a full file at /console/talent/[id] for weeks: their
   Signature, their verification, their pay, their placements. An executive,
   who is the one paying, had a row in a list and nothing else, so answering
   "where is this account up to" meant Billing, then Placements, then the
   Directory, and holding the three in your head. This is the one page. */
export default async function ExecutiveRecord({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin') redirect('/app');

  const clients = await listClients();
  const client = clients.find(c => c.key === id);
  if (!client) notFound();

  /* Nothing here is worth failing the page over: a record that shows the
     account with one empty card beats a record that will not open. */
  const [brief, sig, self, avail, invoices, places, agreement, docs] = await Promise.all([
    getSearch(id).catch(() => null),
    signatureOf(id, 'client').catch(() => null),
    getSelfProfile(id).catch(() => ({} as any)),
    getAvailability(id, '').catch(() => ({ timezone: null, windows: [] } as any)),
    listInvoicesFor(id).catch(() => []),
    listAllPlacements().catch(() => []),
    getClientAgreement(id).catch(() => null),
    listDocuments('person', id).catch(() => [])
  ]);

  const mine = places.filter(p => p.client_id === id);
  const live = mine.filter(p => !p.ended_on);
  const type = sig ? archetype((sig as any).scores, 'client') : null;

  const owedCents = invoices
    .filter(i => i.status === 'sent' || i.status === 'failed')
    .reduce((n, i) => n + i.amount_cents, 0);
  const paidCents = invoices
    .filter(i => i.status === 'paid')
    .reduce((n, i) => n + i.amount_cents, 0);
  const tone = (s: string) => INVOICE_STATUS.find(x => x.key === s)?.tone ?? '';
  const label = (s: string) => INVOICE_STATUS.find(x => x.key === s)?.label ?? s;

  return (
    <Shell profile={profile} active="/console/directory"
      title={client.full_name}
      crumb={client.org_name || 'Executive'}
      action={<Link className="btn sm ghost" href="/console/people">← Executives</Link>}>

      <div className="grid-3">
        <div className="card stat"><div className="eyebrow">Paid to date</div>
          <div className="score">{money(paidCents)}</div></div>
        <div className="card stat"><div className="eyebrow">Outstanding</div>
          <div className="score">{money(owedCents)}</div></div>
        <div className="card stat"><div className="eyebrow">In seat</div>
          <div className="score">{live.length}</div></div>
      </div>

      <div className="card">
        <div className="card-head"><h3>The account</h3>
          <span className={`pill ${client.signed_in ? 'good' : 'warn'}`}>
            <span className="dot" />{client.signed_in ? 'Signed in' : 'Not yet signed in'}</span></div>
        <dl className="kv">
          <dt>Company</dt><dd>{client.org_name || <span className="muted">Not given</span>}</dd>
          <dt>Email</dt><dd>{client.email}</dd>
          <dt>Timezone</dt><dd>{zoneLabel(avail?.timezone || client.timezone) || <span className="muted">Not given</span>}</dd>
          <dt>Signature</dt><dd>{type ? type.n : 'Not completed yet'}</dd>
          <dt>Agreement</dt><dd>{AGREEMENT_WORDS[agreement?.state ?? 'not_started'] ?? 'Not started'}</dd>
          <dt>Open role</dt><dd>{brief?.role_title || 'No brief written yet'}</dd>
        </dl>
        {self?.bio && <p className="small" style={{ marginTop: 14 }}>{self.bio}</p>}
      </div>

      <div className="card">
        <div className="card-head"><h3>Placements</h3>
          {mine.length > 0 && <span className="pill">{mine.length} on file</span>}</div>
        {mine.length === 0 ? (
          <div className="empty"><span className="tick" />
            <p className="small">Nobody placed yet.</p></div>
        ) : (
          <table className="data" style={{ boxShadow: 'none' }}>
            <thead><tr><th>Talent</th><th>Started</th><th>Status</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {mine.map(p => (
                <tr key={p.id}>
                  <td><b>{(p as any).talent_name ?? 'Talent'}</b></td>
                  <td className="small muted">{fmtDate(p.started_on)}</td>
                  <td><span className={`pill ${p.ended_on ? '' : 'good'}`}>
                    <span className="dot" />{p.ended_on ? `Ended ${fmtDate(p.ended_on)}` : 'Live'}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <Link className="btn sm ghost" href={`/console/placements/${p.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Files kind="person" ownerId={id} docs={docs} />

      <div className="card">
        <div className="card-head"><h3>Invoices</h3>
          {invoices.length > 0 && <span className="pill">{invoices.length} on file</span>}</div>
        {invoices.length === 0 ? (
          <div className="empty"><span className="tick" />
            <p className="small">Nothing invoiced yet.</p></div>
        ) : (
          <table className="data" style={{ boxShadow: 'none' }}>
            <thead><tr><th>Number</th><th>Issued</th><th className="amount">Amount</th><th>Status</th></tr></thead>
            <tbody>
              {invoices.map(i => (
                <tr key={i.id}>
                  <td className="small">{i.number ?? i.kind}</td>
                  <td className="small muted">{fmtDate(i.issued_on)}</td>
                  <td className="amount">{money(i.amount_cents)}</td>
                  <td><span className={`pill ${tone(i.status)}`}>
                    <span className="dot" />{label(i.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}
