import { redirect } from 'next/navigation';
import { currentProfile, configured } from '@/lib/supabase/server';
import { getBench, archetype, dispositionLine } from '@/lib/data';
import Shell from '@/components/Shell';
import { Portrait } from '@/components/Viz';
import AddPerson from '@/components/AddPerson';
import { listPending, getAvailability } from '@/lib/store';
import { bookableIds } from '@/lib/store';
import { benchPay } from '@/lib/work';
import { money } from '@/lib/money-public';
import TableSearch from '@/components/TableSearch';

/* always read live data — never serve a cached copy of someone's account */
export const dynamic = 'force-dynamic';

export default async function Bench() {
  const profile = await currentProfile();
  if (!profile) redirect('/');
  if (profile.role !== 'admin' && configured()) redirect('/app');
  const bench = await getBench();
  const pending = await listPending();
  /* Someone with no availability looks ready and cannot be booked — surface it.
     One query for everybody, not one per person: the old version made a round
     trip per talent before the page could paint. */
  const bookable = await bookableIds(bench.map(t => t.id));
  /* Pay moved out of profiles into talent_pay; this column had been rendering
     a field that no longer exists, so it was blank for everyone. */
  const pay = await benchPay(bench.map(t => t.id));
  const unbookable = bench.filter(t => !bookable.has(t.id));

  return (
    <Shell profile={{ ...profile, role: 'admin' }} active="/console/bench" title="Talent Bench" crumb="Talent accounts">
      <div className="card">
        <div className="card-head"><h3>Every assessed profile</h3>
          <div className="row" style={{ gap: 10 }}>
            {bench.length > 5 && <TableSearch scope="bench-table" placeholder="Search the bench…" />}
            <span className="pill">{bench.length} on file</span>
            <AddPerson role="talent" /></div></div>
        {!bench.length ? (
          <div className="empty-card" style={{ padding: '34px 24px' }}>
            <div className="empty-mark" aria-hidden="true" />
            <h3>The bench is empty</h3>
            <p className="small">
              Add talent with the button above, or let them apply through the Careers
              page. Nobody appears here until they have completed their Talent
              Signature — an unassessed profile cannot be matched against anyone.
            </p>
          </div>
        ) : (
        <table className="data" id="bench-table">
          <thead><tr><th>Name</th><th>Role</th><th>Profile</th><th>Disposition</th><th>Validity</th><th style={{ textAlign: 'right' }}>We pay</th><th>Stage</th></tr></thead>
          <tbody>
            {bench.map(t => (
              <tr key={t.id}>
                <td><div className="row"><Portrait id={t.id} name={t.name} url={t.photo_url} />
                  <div><b>{t.name}</b><div className="small muted">{t.yrs} yrs · {t.loc}</div></div></div></td>
                <td className="small">{t.role}</td>
                <td><span className="pill">{archetype(t.scores, 'talent').n}</span></td>
                <td className="small muted">{dispositionLine(t.scores)}</td>
                <td><span className={`pill ${t.validity.verdict === 'Valid' ? 'good' : t.validity.verdict === 'Review' ? 'warn' : 'crit'}`}>
                  <span className="dot" />{t.validity.verdict}</span></td>
                <td className="amount">{pay[t.id] != null ? money(pay[t.id]! * 100) : <span className="muted">—</span>}</td>
                <td><span className={`pill ${t.stage === 'Placed' ? 'good' : t.stage === 'Vetted' ? '' : 'warn'}`}>
                  <span className="dot" />{t.stage}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
      {bench.length > 0 && (
      <div className="card">
        <div className="card-head"><h3>Validity detail</h3><span className="pill">Internal only</span></div>
        <p className="small muted" style={{ marginBottom: 8 }}>
          Clients see a verified badge and confidence bands. These numbers stay here.
        </p>
        <details className="more">
          <summary>Show the raw control measures</summary>
          <div className="inner">
        <table className="data">
          <thead><tr><th>Talent</th><th>Impression mgmt</th><th>Inconsistency</th><th>Extreme</th><th>Longest run</th><th>Median s/item</th><th>Flags</th></tr></thead>
          <tbody>
            {bench.map(t => (
              <tr key={t.id}>
                <td><b>{t.name}</b></td>
                <td className="num">{t.validity.im}</td>
                <td className="num">{t.validity.inconsistency}</td>
                <td className="small">{t.validity.extreme}%</td>
                <td className="small">{t.validity.straight}</td>
                <td className="small">{t.validity.medSec?.toFixed(1) ?? '—'}</td>
                <td className="small muted">{t.validity.flags.map(f => f.k).join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
          </div>
        </details>
      </div>
      )}
      {unbookable.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(140,74,63,.45)' }}>
          <div className="card-head"><h3>Assessed but not bookable</h3>
            <span className="pill crit"><span className="dot" />{unbookable.length}</span></div>
          <p className="small muted" style={{ marginBottom: 14 }}>
            These profiles are complete but have no availability set, so no executive can book them.
            Nudge them to their Availability page before releasing them to a client.
          </p>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {unbookable.map(t => <span className="pill warn" key={t.id}>{t.name}</span>)}
          </div>
        </div>
      )}
      {pending.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Added, not yet signed in</h3><span className="pill warn"><span className="dot" />{pending.length}</span></div>
          <p className="small muted" style={{ marginBottom: 16 }}>
            These records attach themselves the first time each person signs in with the email on file.
          </p>
          <table className="data">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Added as</th></tr></thead>
            <tbody>{pending.map((p: any) => (
              <tr key={p.id}><td><b>{p.full_name}</b></td><td className="small">{p.email}</td>
                <td className="small">{p.headline ?? p.org_name ?? '—'}</td>
                <td><span className="pill">{p.role}</span></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
